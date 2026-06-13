import { HttpError } from "./http.js";
import { isShopifyAdminConfigured } from "./config.js";

const SHOPIFY_REST_POLL_LIMIT = 8;
const SHOPIFY_REST_POLL_DEFAULT_MS = 1000;
const SHOPIFY_TOKEN_CACHE_SKEW_MS = 30_000;
const SHOPIFY_TOKEN_DEFAULT_TTL_SECONDS = 300;
const shopifyTokenCache = new Map();

const PRODUCT_VARIANTS_QUERY = `
  query StaffInventorySearch($first: Int!, $query: String) {
    productVariants(first: $first, query: $query) {
      nodes {
        id
        title
        sku
        price
        barcode
        product {
          id
          handle
          title
          vendor
          productType
          status
        }
        inventoryItem {
          id
          sku
          tracked
          inventoryLevels(first: 10) {
            nodes {
              location {
                id
                name
              }
              quantities(names: ["available", "on_hand"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

function assertShopifyConfig(config) {
  if (!isShopifyAdminConfigured(config)) throw new HttpError(500, "Shopify Admin API is not configured.");
}

function shopifyTokenCacheKey(config) {
  return `${config.shopify.storeDomain}|${config.shopify.clientId}`;
}

async function requestClientCredentialsToken(config) {
  const shop = config.shopify.storeDomain.replace(/\.myshopify\.com$/, "");
  const response = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.shopify.clientId,
      client_secret: config.shopify.clientSecret
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || response.statusText;
    throw new HttpError(response.status, "Shopify token request failed.", detail);
  }
  if (!payload?.access_token) throw new HttpError(502, "Shopify token response missing access_token.");
  const ttlSeconds = Number(payload.expires_in || SHOPIFY_TOKEN_DEFAULT_TTL_SECONDS);
  return {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, ttlSeconds) * 1000
  };
}

export async function getShopifyAccessToken(config) {
  assertShopifyConfig(config);
  if (config.shopify.adminAccessToken) return config.shopify.adminAccessToken;

  const cacheKey = shopifyTokenCacheKey(config);
  const cached = shopifyTokenCache.get(cacheKey);
  if (cached && cached.expiresAt - SHOPIFY_TOKEN_CACHE_SKEW_MS > Date.now()) return cached.token;

  const token = await requestClientCredentialsToken(config);
  shopifyTokenCache.set(cacheKey, token);
  return token.token;
}

function cleanObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}

function numericShopifyId(id, label) {
  const match = String(id || "").match(/(\d+)$/);
  if (!match) throw new HttpError(400, `${label} must be a Shopify numeric ID or gid.`);
  return Number(match[1]);
}

function normalizeDiscount(input) {
  if (!input) return undefined;
  const valueType = input.valueType || input.value_type;
  if (!["fixed_amount", "percentage"].includes(valueType)) throw new HttpError(400, "Discount valueType invalid.");
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new HttpError(400, "Discount value invalid.");
  return cleanObject({
    title: input.title || "Staff discount",
    description: input.description || "",
    value_type: valueType,
    value: String(value),
    amount: input.amount == null ? undefined : String(input.amount)
  });
}

function normalizeAddress(input) {
  if (!input) return undefined;
  return cleanObject({
    first_name: input.firstName,
    last_name: input.lastName,
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    province: input.province,
    country: input.country,
    zip: input.zip,
    phone: input.phone
  });
}

function normalizeFulfillment(input) {
  const fulfillment = input || {};
  const type = fulfillment.type || "pickup";
  if (!["pickup", "delivery"].includes(type)) throw new HttpError(400, "fulfillment.type must be pickup or delivery.");
  if (type === "delivery" && !fulfillment.dateTba && !fulfillment.deliveryDate) {
    throw new HttpError(400, "Delivery requires a date or Date TBA.");
  }
  if (type === "delivery" && !fulfillment.dateTba && fulfillment.deliveryDate && Number.isNaN(Date.parse(fulfillment.deliveryDate))) {
    throw new HttpError(400, "fulfillment.deliveryDate must be a date or omitted when dateTba is true.");
  }
  return {
    type,
    deliveryDate: fulfillment.deliveryDate || "",
    dateTba: Boolean(fulfillment.dateTba)
  };
}

function normalizeLineItems(input) {
  if (!Array.isArray(input) || !input.length) throw new HttpError(400, "lineItems required.");
  return input.map((item) => {
    const quantity = Number(item.quantity || 1);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new HttpError(400, "line item quantity invalid.");
    return cleanObject({
      variant_id: numericShopifyId(item.variantId, "variantId"),
      quantity,
      applied_discount: normalizeDiscount(item.appliedDiscount)
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRetryDelayMs(response) {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader != null && Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  return SHOPIFY_REST_POLL_DEFAULT_MS;
}

async function parseRestPayload(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(response.status, "Shopify Admin REST returned non-JSON.", text.slice(0, 500));
  }
}

async function requestRestUrl(config, url, { method = "GET", body = undefined, accessToken } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  if (response.status === 202 && response.headers.get("location")) {
    const pollUrl = new URL(response.headers.get("location"), `https://${config.shopify.storeDomain}`).toString();
    return pollRestUrl(pollUrl, getRetryDelayMs(response), accessToken);
  }

  const payload = await parseRestPayload(response);

  if (!response.ok) {
    throw new HttpError(response.status, "Shopify Admin REST request failed.", payload.errors || payload);
  }

  return payload;
}

async function pollRestUrl(location, initialDelayMs, accessToken) {
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt < SHOPIFY_REST_POLL_LIMIT; attempt += 1) {
    await sleep(delayMs);

    const response = await fetch(location, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      }
    });

    if (response.status === 202) {
      delayMs = getRetryDelayMs(response);
      continue;
    }

    const payload = await parseRestPayload(response);
    if (!response.ok) {
      throw new HttpError(response.status, "Shopify Admin REST polling failed.", payload.errors || payload);
    }
    return payload;
  }

  throw new HttpError(504, "Shopify Admin REST polling timed out.");
}

export async function shopifyAdminRest(config, resourcePath, { method = "GET", body = undefined, query = undefined } = {}) {
  assertShopifyConfig(config);

  const url = new URL(`https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}${resourcePath}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }

  const accessToken = await getShopifyAccessToken(config);
  return requestRestUrl(config, url, { method, body, accessToken });
}

export async function shopifyAdminGraphql(config, query, variables = {}) {
  assertShopifyConfig(config);
  const accessToken = await getShopifyAccessToken(config);

  const response = await fetch(`https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(response.status, "Shopify Admin GraphQL request failed.", payload);
  if (payload?.errors?.length) throw new HttpError(502, "Shopify Admin GraphQL returned errors.", payload.errors);
  return payload.data;
}

export async function searchInventory(config, { query = "", first = 25 } = {}) {
  const safeFirst = Math.max(1, Math.min(Number(first) || 25, 100));
  const data = await shopifyAdminGraphql(config, PRODUCT_VARIANTS_QUERY, {
    first: safeFirst,
    query: query ? String(query) : null
  });

  return data.productVariants.nodes.map((variant) => {
    const levels = variant.inventoryItem?.inventoryLevels?.nodes || [];
    const quantities = levels.flatMap((level) => level.quantities || []);
    const available = quantities
      .filter((quantity) => quantity.name === "available")
      .reduce((sum, quantity) => sum + Number(quantity.quantity || 0), 0);
    const onHand = quantities
      .filter((quantity) => quantity.name === "on_hand")
      .reduce((sum, quantity) => sum + Number(quantity.quantity || 0), 0);

    return {
      id: variant.id,
      numericId: numericShopifyId(variant.id, "variantId"),
      title: variant.title,
      sku: variant.sku || variant.inventoryItem?.sku || "",
      barcode: variant.barcode || "",
      price: variant.price,
      product: variant.product,
      inventory: {
        tracked: Boolean(variant.inventoryItem?.tracked),
        available,
        onHand,
        levels: levels.map((level) => ({
          locationId: level.location.id,
          locationName: level.location.name,
          quantities: level.quantities
        }))
      }
    };
  });
}

export async function createDraftOrder(config, input) {
  const fulfillment = normalizeFulfillment(input.fulfillment);
  const draftOrder = cleanObject({
    email: input.email,
    customer_id: input.customerId ? numericShopifyId(input.customerId, "customerId") : undefined,
    use_customer_default_address: input.useCustomerDefaultAddress === true,
    line_items: normalizeLineItems(input.lineItems),
    shipping_address: fulfillment.type === "delivery" ? normalizeAddress(input.shippingAddress) : undefined,
    tags: ["staff-ims", `staff-${fulfillment.type}`].join(", "),
    note: input.customerNote || undefined,
    applied_discount: normalizeDiscount(input.appliedDiscount)
  });

  const payload = await shopifyAdminRest(config, "/draft_orders.json", {
    method: "POST",
    body: { draft_order: draftOrder }
  });
  return payload.draft_order;
}

export async function getDraftOrder(config, draftOrderId) {
  const payload = await shopifyAdminRest(config, `/draft_orders/${numericShopifyId(draftOrderId, "draftOrderId")}.json`);
  return payload.draft_order;
}

export async function sendDraftOrderInvoice(config, draftOrderId, input = {}) {
  const invoice = cleanObject({
    to: input.to,
    from: input.from,
    bcc: input.bcc,
    subject: input.subject,
    custom_message: input.message
  });
  const body = Object.keys(invoice).length ? { draft_order_invoice: invoice } : {};
  const payload = await shopifyAdminRest(config, `/draft_orders/${numericShopifyId(draftOrderId, "draftOrderId")}/send_invoice.json`, {
    method: "POST",
    body
  });
  return payload.draft_order || payload;
}

export async function completeDraftOrder(config, draftOrderId, { paymentPending = false } = {}) {
  const payload = await shopifyAdminRest(config, `/draft_orders/${numericShopifyId(draftOrderId, "draftOrderId")}/complete.json`, {
    method: "PUT",
    query: paymentPending ? { payment_pending: "true" } : undefined
  });
  return payload.draft_order;
}

export async function deleteDraftOrder(config, draftOrderId) {
  await shopifyAdminRest(config, `/draft_orders/${numericShopifyId(draftOrderId, "draftOrderId")}.json`, {
    method: "DELETE"
  });
  return { deleted: true };
}

export function summarizeDraftOrder(draftOrder) {
  if (!draftOrder) return null;
  return {
    id: String(draftOrder.id),
    name: draftOrder.name || "",
    status: draftOrder.status || "",
    invoiceUrl: draftOrder.invoice_url || "",
    orderId: draftOrder.order_id ? String(draftOrder.order_id) : "",
    email: draftOrder.email || "",
    totalPrice: draftOrder.total_price || "",
    subtotalPrice: draftOrder.subtotal_price || "",
    lineItems: (draftOrder.line_items || []).map((item) => ({
      id: String(item.id),
      variantId: item.variant_id ? String(item.variant_id) : "",
      title: item.title || item.name || "",
      quantity: item.quantity,
      price: item.price || ""
    }))
  };
}
