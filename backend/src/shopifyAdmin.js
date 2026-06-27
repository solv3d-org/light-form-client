import crypto from "node:crypto";
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
        compareAtPrice
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

const ORDERS_QUERY = `
  query StaffOrders($first: Int!, $query: String) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        email
        createdAt
        updatedAt
        closedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        sourceName
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          displayName
          email
        }
        lineItems(first: 25) {
          nodes {
            id
            title
            quantity
            sku
            variant {
              id
              sku
            }
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

const ORDER_BY_ID_QUERY = `
  query StaffOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      createdAt
      updatedAt
      closedAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      sourceName
      currentTotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      customer {
        id
        displayName
        email
      }
      lineItems(first: 25) {
        nodes {
          id
          title
          quantity
          sku
          variant {
            id
            sku
          }
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          discountedUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_CREATE_MUTATION = `
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        handle
        vendor
        productType
        status
        variants(first: 1) {
          nodes {
            id
            title
            sku
            price
            inventoryItem {
              id
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        handle
        vendor
        productType
        status
        variants(first: 1) {
          nodes {
            id
            title
            sku
            price
            inventoryItem {
              id
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
  mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        title
        sku
        price
        inventoryItem {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_SET_QUANTITIES_MUTATION = `
  mutation InventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        createdAt
        reason
        referenceDocumentUri
        changes {
          name
          delta
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SHOPIFY_CATALOG_BULK_QUERY = `
{
  productVariants {
    edges {
      node {
        id
        title
        sku
        price
        compareAtPrice
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
            edges {
              node {
                id
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
  }
}
`;

const BULK_OPERATION_RUN_QUERY_MUTATION = `
  mutation BulkOperationRunQuery($query: String!, $groupObjects: Boolean!) {
    bulkOperationRunQuery(query: $query, groupObjects: $groupObjects) {
      bulkOperation {
        id
        status
        type
        objectCount
        url
        partialDataUrl
        createdAt
        completedAt
        errorCode
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CURRENT_BULK_OPERATION_QUERY = `
  query CurrentBulkOperation {
    currentBulkOperation(type: QUERY) {
      id
      status
      type
      objectCount
      url
      partialDataUrl
      createdAt
      completedAt
      errorCode
    }
  }
`;

const WEBHOOK_SUBSCRIPTION_CREATE_MUTATION = `
  mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
      webhookSubscription {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `
  query ProductById($id: ID!) {
    product(id: $id) {
      id
      handle
      title
      vendor
      productType
      status
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
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
                id
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

function cleanStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numericShopifyId(id, label) {
  const match = String(id || "").match(/(\d+)$/);
  if (!match) throw new HttpError(400, `${label} must be a Shopify numeric ID or gid.`);
  return Number(match[1]);
}

function shopifyGid(type, id) {
  const value = String(id || "");
  if (value.startsWith("gid://shopify/")) return value;
  const match = value.match(/(\d+)$/);
  if (!match) throw new HttpError(400, `${type} id must be a Shopify numeric ID or gid.`);
  return `gid://shopify/${type}/${match[1]}`;
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

function normalizeMoney(value, label) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, `${label} invalid.`);
  return amount;
}

function normalizeLineDescription(value) {
  const description = String(value || "").trim();
  if (!description) return undefined;
  return [{ name: "Description", value: description.slice(0, 255) }];
}

function normalizeLineDiscount(item) {
  const basePrice = normalizeMoney(item.price, "line item price");
  const overridePrice = normalizeMoney(item.priceOverride ?? item.unitPrice, "line item price override");
  const manualDiscount = normalizeDiscount(item.appliedDiscount);
  if (overridePrice == null) return manualDiscount;
  if (basePrice == null) throw new HttpError(400, "line item price required for price override.");
  if (overridePrice > basePrice) throw new HttpError(400, "line item price override cannot exceed catalog price.");
  const overrideAmount = basePrice - overridePrice;
  if (overrideAmount <= 0) return manualDiscount;
  if (manualDiscount) throw new HttpError(400, "line item cannot combine price override and applied discount.");
  return {
    title: "Staff price override",
    description: "In-store price override",
    value_type: "fixed_amount",
    value: String(overrideAmount)
  };
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

function assertUserErrors(container, label) {
  const userErrors = container?.userErrors || [];
  if (userErrors.length) throw new HttpError(400, label, userErrors);
}

function variantToCatalogRecord(variant) {
  const levels = variant.inventoryItem?.inventoryLevels?.nodes || variant.inventoryItem?.inventoryLevels?.edges?.map((edge) => edge.node) || [];
  const quantities = levels.flatMap((level) => level.quantities || []);
  const available = quantities
    .filter((quantity) => quantity.name === "available")
    .reduce((sum, quantity) => sum + Number(quantity.quantity || 0), 0);
  const onHand = quantities
    .filter((quantity) => quantity.name === "on_hand")
    .reduce((sum, quantity) => sum + Number(quantity.quantity || 0), 0);
  return {
    variantId: variant.id,
    productId: variant.product?.id || "",
    inventoryItemId: variant.inventoryItem?.id || "",
    handle: variant.product?.handle || "",
    title: variant.product?.title || variant.title || "",
    vendor: variant.product?.vendor || "",
    productType: variant.product?.productType || "",
    status: variant.product?.status || "ACTIVE",
    sku: variant.sku || variant.inventoryItem?.sku || "",
    barcode: variant.barcode || "",
    price: variant.price || "",
    compareAtPrice: variant.compareAtPrice || "",
    imageUrl: "",
    imageAlt: "",
    inventory: {
      tracked: Boolean(variant.inventoryItem?.tracked),
      available,
      onHand,
      levels
    },
    product: variant.product || {},
    updatedAt: new Date().toISOString()
  };
}

function normalizeProductStatus(status) {
  const normalized = String(status || "ACTIVE").toUpperCase();
  return ["ACTIVE", "ARCHIVED", "DRAFT"].includes(normalized) ? normalized : "ACTIVE";
}

function productInput(input, id = undefined) {
  if (!id && !input.title) throw new HttpError(400, "Product title required.");
  return cleanObject({
    id,
    title: input.title,
    handle: input.handle,
    descriptionHtml: input.bodyHtml,
    vendor: input.vendor,
    productType: input.productType,
    tags: input.tags == null ? undefined : cleanStringList(input.tags),
    status: normalizeProductStatus(input.status)
  });
}

function variantInput(input, variantId) {
  const next = cleanObject({
    id: variantId,
    barcode: input.barcode == null ? undefined : String(input.barcode),
    price: input.price == null || input.price === "" ? undefined : String(input.price),
    compareAtPrice: input.compareAtPrice == null || input.compareAtPrice === "" ? undefined : String(input.compareAtPrice),
    inventoryItem: input.sku == null ? undefined : { sku: String(input.sku) }
  });
  return Object.keys(next).length > 1 ? next : null;
}

function normalizeLineItems(input) {
  if (!Array.isArray(input) || !input.length) throw new HttpError(400, "lineItems required.");
  return input.map((item) => {
    const quantity = Number(item.quantity || 1);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new HttpError(400, "line item quantity invalid.");
    return cleanObject({
      variant_id: numericShopifyId(item.variantId, "variantId"),
      quantity,
      properties: normalizeLineDescription(item.description),
      applied_discount: normalizeLineDiscount(item)
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

export async function fetchProductCatalogRecords(config, productId) {
  const data = await shopifyAdminGraphql(config, PRODUCT_BY_ID_QUERY, {
    id: shopifyGid("Product", productId)
  });
  const product = data.product;
  if (!product) return [];
  return (product.variants?.nodes || []).map((variant) => variantToCatalogRecord({
    ...variant,
    product: variant.product || product
  }));
}

export async function startCatalogBulkOperation(config) {
  const data = await shopifyAdminGraphql(config, BULK_OPERATION_RUN_QUERY_MUTATION, {
    query: SHOPIFY_CATALOG_BULK_QUERY,
    groupObjects: false
  });
  assertUserErrors(data.bulkOperationRunQuery, "Shopify bulk operation start failed.");
  return data.bulkOperationRunQuery.bulkOperation;
}

export async function getCatalogBulkOperation(config) {
  const data = await shopifyAdminGraphql(config, CURRENT_BULK_OPERATION_QUERY);
  return data.currentBulkOperation;
}

export async function downloadBulkJsonl(url) {
  if (!url) throw new HttpError(400, "Bulk operation URL is not available.");
  const response = await fetch(url);
  if (!response.ok) throw new HttpError(response.status, "Shopify bulk result download failed.");
  return response.text();
}

export function parseCatalogBulkJsonl(text) {
  const variants = new Map();
  const inventoryItemToVariant = new Map();
  const levelsByInventoryItem = new Map();

  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    if (String(item.id || "").includes("/ProductVariant/")) {
      variants.set(item.id, item);
      if (item.inventoryItem?.id) inventoryItemToVariant.set(item.inventoryItem.id, item.id);
      continue;
    }
    if (String(item.id || "").includes("/InventoryLevel/") && item.__parentId) {
      const levels = levelsByInventoryItem.get(item.__parentId) || [];
      levels.push(item);
      levelsByInventoryItem.set(item.__parentId, levels);
    }
  }

  for (const [inventoryItemId, levels] of levelsByInventoryItem.entries()) {
    const variantId = inventoryItemToVariant.get(inventoryItemId);
    const variant = variants.get(variantId);
    if (variant?.inventoryItem) {
      variant.inventoryItem.inventoryLevels = { nodes: levels };
    }
  }

  return [...variants.values()].map(variantToCatalogRecord);
}

export async function registerWebhookSubscriptions(config, topics, callbackUrl) {
  const results = [];
  for (const topic of topics) {
    const data = await shopifyAdminGraphql(config, WEBHOOK_SUBSCRIPTION_CREATE_MUTATION, {
      topic,
      subscription: {
        uri: callbackUrl,
        format: "JSON"
      }
    });
    assertUserErrors(data.webhookSubscriptionCreate, `Shopify webhook registration failed for ${topic}.`);
    results.push(data.webhookSubscriptionCreate.webhookSubscription);
  }
  return results;
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
        inventoryItemId: variant.inventoryItem?.id || "",
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

export async function listShopifyOrders(config, { status = "", first = 50 } = {}) {
  const safeFirst = Math.max(1, Math.min(Number(first) || 50, 100));
  const query = status === "completed" ? "status:closed" : status === "pending" ? "status:open" : "status:any";
  const data = await shopifyAdminGraphql(config, ORDERS_QUERY, {
    first: safeFirst,
    query
  });
  return data.orders.nodes.map(summarizeShopifyOrder).filter((order) => !status || order.status === status);
}

export async function getShopifyOrder(config, orderId) {
  const data = await shopifyAdminGraphql(config, ORDER_BY_ID_QUERY, {
    id: shopifyGid("Order", orderId)
  });
  return summarizeShopifyOrder(data.order);
}

export async function createProduct(config, input) {
  const data = await shopifyAdminGraphql(config, PRODUCT_CREATE_MUTATION, {
    product: productInput(input)
  });
  assertUserErrors(data.productCreate, "Shopify product create failed.");

  const product = data.productCreate.product;
  const variant = product?.variants?.nodes?.[0];
  if (!variant?.id) throw new HttpError(502, "Shopify product create returned no default variant.");
  const update = variantInput(input, variant?.id);
  if (product?.id && update) {
    await updateProductVariant(config, product.id, update);
  }
  if (input.onHand != null && variant?.inventoryItem?.id) {
    await setInventoryOnHand(config, {
      inventoryItemId: variant.inventoryItem.id,
      locationId: input.locationId || config.catalog?.shopifyLocationId,
      onHand: input.onHand
    });
  }

  return product;
}

export async function updateProduct(config, productId, input) {
  const data = await shopifyAdminGraphql(config, PRODUCT_UPDATE_MUTATION, {
    product: productInput(input, productId)
  });
  assertUserErrors(data.productUpdate, "Shopify product update failed.");

  const product = data.productUpdate.product;
  const variantId = input.variantId || input.shopifyVariantId || product?.variants?.nodes?.[0]?.id;
  const update = variantInput(input, variantId);
  if (product?.id && update) {
    await updateProductVariant(config, product.id, update);
  }
  if (input.onHand != null) {
    const inventoryItemId = input.inventoryItemId || product?.variants?.nodes?.[0]?.inventoryItem?.id;
    await setInventoryOnHand(config, {
      inventoryItemId,
      locationId: input.locationId || config.catalog?.shopifyLocationId,
      onHand: input.onHand
    });
  }

  return product;
}

export async function archiveProduct(config, productId) {
  return updateProduct(config, productId, { status: "ARCHIVED" });
}

export async function updateProductVariant(config, productId, input) {
  if (!productId) throw new HttpError(400, "productId required.");
  if (!input?.id) throw new HttpError(400, "variant id required.");

  const data = await shopifyAdminGraphql(config, PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
    productId,
    variants: [input]
  });
  assertUserErrors(data.productVariantsBulkUpdate, "Shopify variant update failed.");
  return data.productVariantsBulkUpdate.productVariants?.[0] || null;
}

export async function setInventoryOnHand(config, input) {
  const locationId = input.locationId || config.catalog?.shopifyLocationId;
  const quantity = Number(input.onHand);
  if (!input.inventoryItemId) throw new HttpError(400, "inventoryItemId required.");
  if (!locationId) throw new HttpError(500, "SHOPIFY_LOCATION_ID required for inventory writes.");
  if (!Number.isInteger(quantity) || quantity < 0) throw new HttpError(400, "onHand must be a non-negative integer.");

  const data = await shopifyAdminGraphql(config, INVENTORY_SET_QUANTITIES_MUTATION, {
    input: {
      name: "on_hand",
      reason: "correction",
      referenceDocumentUri: `staff-ims://inventory-set/${crypto.randomUUID()}`,
      quantities: [
        {
          inventoryItemId: input.inventoryItemId,
          locationId,
          quantity
        }
      ]
    },
    idempotencyKey: crypto.randomUUID()
  });
  assertUserErrors(data.inventorySetQuantities, "Shopify inventory update failed.");
  return data.inventorySetQuantities.inventoryAdjustmentGroup;
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

export function summarizeShopifyOrder(order) {
  if (!order) return null;
  const numericId = numericShopifyId(order.id, "orderId");
  const total = order.currentTotalPriceSet?.shopMoney?.amount || "";
  const status = order.cancelledAt || order.closedAt || order.displayFulfillmentStatus === "FULFILLED" ? "completed" : "pending";
  return {
    id: `shopify-order-${numericId}`,
    source: "shopify-order",
    status,
    shopifyOrderId: order.id,
    shopifyOrderName: order.name || "",
    customer: {
      email: order.email || order.customer?.email || "",
      name: order.customer?.displayName || "",
      customerId: order.customer?.id || ""
    },
    fulfillment: {
      type: "online",
      financialStatus: order.displayFinancialStatus || "",
      fulfillmentStatus: order.displayFulfillmentStatus || ""
    },
    internal: {
      sourceName: order.sourceName || "web",
      totalPrice: total,
      lineItems: (order.lineItems?.nodes || []).map((item) => ({
        id: item.id,
        variantId: item.variant?.id || "",
        title: item.title || "",
        sku: item.sku || item.variant?.sku || "",
        quantity: item.quantity || 1,
        price: item.discountedUnitPriceSet?.shopMoney?.amount || item.originalUnitPriceSet?.shopMoney?.amount || ""
      }))
    },
    hiddenFromCustomer: false,
    createdBy: null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    completedAt: order.closedAt || null,
    canceledAt: order.cancelledAt || null
  };
}
