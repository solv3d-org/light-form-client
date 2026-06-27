import { createServer } from "node:http";
import { URL } from "node:url";
import { verifyPassword, createSessionToken, verifySessionToken } from "./auth.js";
import { getConfig, assertRuntimeConfig, isShopifyAdminConfigured } from "./config.js";
import { HttpError, getBearerToken, getCorsHeaders, readJson, readRawBody, sendError, sendJson } from "./http.js";
import { getEffectivePermissions, getRolePermissions, hasPermission, normalizePermissionOverrides, PERMISSIONS, ROLES } from "./rbac.js";
import { StaffStore } from "./store.js";
import { createCatalogProvider } from "./catalog.js";
import {
  downloadBulkJsonl,
  getCatalogBulkOperation,
  parseCatalogBulkJsonl,
  startCatalogBulkOperation,
  summarizeDraftOrder
} from "./shopifyAdmin.js";
import { processShopifyWebhook } from "./shopifyWebhooks.js";

const config = getConfig();
assertRuntimeConfig(config);

const store = await StaffStore.create(config);
const catalogProvider = createCatalogProvider(config, store);
const bootstrappedUser = await store.ensureBootstrapAdmin(config);

if (bootstrappedUser) {
  console.log(`[backend] bootstrapped admin email=${bootstrappedUser.email}`);
}

function publicUser(user) {
  const permissionOverrides = normalizePermissionOverrides(user.permissionOverrides);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissionOverrides,
    effectivePermissions: getEffectivePermissions({ ...user, permissionOverrides }),
    active: user.active
  };
}

function matchPattern(pattern, pathname) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;

  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(":")) {
      params[expected[index].slice(1)] = decodeURIComponent(actual[index]);
      continue;
    }
    if (expected[index] !== actual[index]) return null;
  }
  return params;
}

function route(method, pattern, options, handler) {
  return { method, pattern, options, handler };
}

async function requireUser(req) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, "Authentication required.");

  try {
    const session = verifySessionToken(token, config);
    const user = await store.findUserById(session.sub);
    if (!user || !user.active) throw new Error("Inactive staff user.");
    return user;
  } catch (error) {
    throw new HttpError(401, error.message);
  }
}

function requirePermission(user, permission) {
  if (!permission) return;
  if (!hasPermission(user, permission)) throw new HttpError(403, "Forbidden.");
}

function assertDiscountAccess(user, body) {
  const hasDiscount = Boolean(body.appliedDiscount || body.lineItems?.some((item) => item.appliedDiscount));
  if (hasDiscount && !hasPermission(user, "discount:apply")) throw new HttpError(403, "Discount permission required.");
}

function assertPriceOverrideAccess(user, body) {
  const hasOverride = Boolean(body.lineItems?.some((item) => item.priceOverride || item.unitPrice));
  if (hasOverride && !hasPermission(user, "price:override")) throw new HttpError(403, "Price override permission required.");
}

function assertLineDescriptionAccess(user, body) {
  const hasDescription = Boolean(body.lineItems?.some((item) => item.description));
  if (hasDescription && !hasPermission(user, "line:describe")) throw new HttpError(403, "Line description permission required.");
}

function assertCostAccess(user, internal) {
  const costKeys = ["costPrice", "grossMargin", "supplierCost", "discountFloor"];
  if (costKeys.some((key) => internal && Object.prototype.hasOwnProperty.call(internal, key)) && !hasPermission(user, "cost:write")) {
    throw new HttpError(403, "Cost-field permission required.");
  }
}

function rolePermissionMap() {
  return Object.fromEntries(ROLES.map((role) => [role, getRolePermissions(role)]));
}

function assertSelfUpdateAllowed(currentUser, nextInput) {
  const nextUser = {
    ...currentUser,
    role: nextInput.role ?? currentUser.role,
    permissionOverrides: nextInput.permissionOverrides ?? currentUser.permissionOverrides,
    active: nextInput.active ?? currentUser.active
  };
  if (nextUser.active === false || nextUser.role !== "admin" || !hasPermission(nextUser, "user:manage") || !hasPermission(nextUser, "audit:read")) {
    throw new HttpError(400, "Admins cannot remove their own admin access.");
  }
}

function logRequest({ req, url, user, status, elapsedMs, error = null }) {
  const actor = user ? `${user.email}:${user.role}` : "anonymous";
  const suffix = error ? ` error="${error.message}"` : "";
  console.log(`[api] ${req.method} ${url.pathname} status=${status} actor=${actor} ms=${elapsedMs}${suffix}`);
}

async function auditRequest({ route, req, url, user, status, elapsedMs, error = null }) {
  if (!user || url.pathname === "/api/audit") return;
  await store.appendAudit(error ? "api.request_failed" : "api.request", user, {
    method: req.method,
    path: url.pathname,
    permission: route?.options?.permission || "",
    status,
    elapsedMs,
    error: error?.message || ""
  });
}

function mapStoreError(error) {
  if (error.message.includes("already exists")) return new HttpError(409, error.message);
  return new HttpError(400, error.message);
}

const routes = [
  route("GET", "/health", { auth: false }, async () => ({
    ok: true,
    service: "staff-ims-api",
    catalogSource: config.catalog.source,
    shopifyConfigured: isShopifyAdminConfigured(config),
    commerceMode: "shopify-admin",
    storage: {
      ...store.storage(),
      catalog: "shopify-admin"
    },
    webhooks: {
      configured: Boolean(config.shopify.webhookSecret || config.shopify.clientSecret),
      endpoint: "/webhooks/shopify",
      publicBaseUrl: config.shopify.webhookPublicBaseUrl
    },
    sync: {
      shopifyCatalogCacheRows: await store.shopifyCatalogCacheCount(),
      bulkOperation: isShopifyAdminConfigured(config) ? await getCatalogBulkOperation(config).catch((error) => ({ error: error.message })) : null
    },
    users: (await store.listUsers()).length,
    timestamp: new Date().toISOString()
  })),

  route("POST", "/api/auth/login", { auth: false }, async ({ body }) => {
    const user = await store.findUserByEmail(body.email);
    if (!user || !user.active || !verifyPassword(body.password || "", user.passwordHash)) {
      throw new HttpError(401, "Invalid email or password.");
    }
    await store.appendAudit("auth.login", user, { email: user.email });
    return {
      token: createSessionToken(user, config),
      staff: publicUser(user)
    };
  }),

  route("GET", "/api/auth/me", {}, async ({ user }) => ({ staff: publicUser(user) })),

  route("GET", "/api/staff/users", { permission: "user:manage" }, async () => ({ users: await store.listUsers() })),

  route("GET", "/api/staff/permissions", { permission: "user:manage" }, async () => ({
    roles: ROLES,
    permissions: PERMISSIONS,
    rolePermissions: rolePermissionMap()
  })),

  route("GET", "/api/storefront/curation", { auth: false }, async () => ({
    curation: await store.getStorefrontCuration()
  })),

  route("PATCH", "/api/storefront/curation", { permission: "storefront:curate" }, async ({ body, user }) => ({
    curation: await store.saveStorefrontCuration(body, user)
  })),

  route("POST", "/api/staff/users", { permission: "user:manage" }, async ({ body, user }) => {
    try {
      return { staff: await store.createUser(body, user) };
    } catch (error) {
      throw mapStoreError(error);
    }
  }),

  route("PATCH", "/api/staff/users/:id", { permission: "user:manage" }, async ({ params, body, user }) => {
    if (params.id === user.id) assertSelfUpdateAllowed(user, body);

    try {
      return { staff: await store.updateUser(params.id, body, user) };
    } catch (error) {
      throw mapStoreError(error);
    }
  }),

  route("GET", "/api/inventory/search", { permission: "inventory:read" }, async ({ url }) => ({
    variants: await catalogProvider.searchInventory({
      query: url.searchParams.get("q") || "",
      first: url.searchParams.get("first") || 25
    })
  })),

  route("POST", "/api/inventory/search", { permission: "inventory:read" }, async ({ body }) => ({
    variants: await catalogProvider.searchInventory(body)
  })),

  route("POST", "/api/inventory/set-on-hand", { permission: "inventory:adjust" }, async ({ body }) => ({
    product: await catalogProvider.setInventoryOnHand(body)
  })),

  route("GET", "/api/products/search", { permission: "inventory:read" }, async ({ url }) => ({
    products: await catalogProvider.searchProducts({
      query: url.searchParams.get("q") || "",
      first: url.searchParams.get("first") || 25
    })
  })),

  route("PATCH", "/api/products/:id", { permission: "inventory:adjust" }, async ({ params, body }) => ({
    product: await catalogProvider.updateProduct(params.id, body)
  })),

  route("DELETE", "/api/products/:id", { permission: "inventory:adjust" }, async ({ params }) => ({
    product: await catalogProvider.archiveProduct(params.id)
  })),

  route("POST", "/api/sync/shopify/bulk/start", { permission: "sync:manage" }, async () => ({
    bulkOperation: await startCatalogBulkOperation(config)
  })),

  route("GET", "/api/sync/shopify/bulk/status", { permission: "sync:manage" }, async () => ({
    bulkOperation: await getCatalogBulkOperation(config),
    cacheRows: await store.shopifyCatalogCacheCount()
  })),

  route("POST", "/api/sync/shopify/bulk/import", { permission: "sync:manage" }, async () => {
    const bulkOperation = await getCatalogBulkOperation(config);
    if (!bulkOperation?.url) throw new HttpError(409, "No completed Shopify bulk result URL is available.");
    const records = parseCatalogBulkJsonl(await downloadBulkJsonl(bulkOperation.url));
    return {
      bulkOperation,
      importedRows: await store.upsertShopifyCatalog(records),
      parsedRows: records.length
    };
  }),

  route("GET", "/api/orders", { permission: "order:read" }, async ({ url }) => ({
    orders: await store.listOrders(url.searchParams.get("status") || "")
  })),

  route("GET", "/api/orders/:id", { permission: "order:read" }, async ({ params }) => {
    const order = await store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    return {
      order,
      shopifyDraftOrder: summarizeDraftOrder(await catalogProvider.getDraftOrder(order.shopifyDraftOrderId))
    };
  }),

  route("POST", "/api/orders/draft", { permission: "order:create" }, async ({ body, user }) => {
    assertDiscountAccess(user, body);
    assertPriceOverrideAccess(user, body);
    assertLineDescriptionAccess(user, body);
    assertCostAccess(user, body.internal);
    const draftOrder = await catalogProvider.createDraftOrder(body);
    const order = await store.createOrderRecord({ draftOrder, input: body, actor: user });
    return {
      order,
      shopifyDraftOrder: summarizeDraftOrder(draftOrder)
    };
  }),

  route("PATCH", "/api/orders/:id", { permission: "order:update" }, async ({ params, body, user }) => {
    assertCostAccess(user, body.internal);
    const current = await store.findOrder(params.id);
    if (!current) throw new HttpError(404, "Order record not found.");
    return {
      order: await store.updateOrder(params.id, {
        fulfillment: body.fulfillment || current.fulfillment,
        internal: body.internal || current.internal
      }, user)
    };
  }),

  route("POST", "/api/orders/:id/send-invoice", { permission: "invoice:send" }, async ({ params, body, user }) => {
    const order = await store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    const draftOrder = await catalogProvider.sendDraftOrderInvoice(order.shopifyDraftOrderId, body);
    return {
      order: await store.updateOrder(order.id, { invoiceSentAt: new Date().toISOString() }, user),
      shopifyDraftOrder: summarizeDraftOrder(draftOrder)
    };
  }),

  route("POST", "/api/orders/:id/complete", { permission: "order:complete" }, async ({ params, body, user }) => {
    const order = await store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    const draftOrder = await catalogProvider.completeDraftOrder(order.shopifyDraftOrderId, {
      paymentPending: body.paymentPending === true
    });
    return {
      order: await store.updateOrder(order.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        shopifyOrderId: draftOrder.order_id ? String(draftOrder.order_id) : order.shopifyOrderId
      }, user),
      shopifyDraftOrder: summarizeDraftOrder(draftOrder)
    };
  }),

  route("POST", "/api/orders/:id/cancel", { permission: "order:cancel" }, async ({ params, user }) => {
    const order = await store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    await catalogProvider.deleteDraftOrder(order.shopifyDraftOrderId);
    return {
      order: await store.updateOrder(order.id, {
        status: "canceled",
        canceledAt: new Date().toISOString()
      }, user)
    };
  }),

  route("GET", "/api/audit", { permission: "audit:read" }, async ({ url }) => ({
    entries: await store.listAudit({
      limit: url.searchParams.get("limit") || 100,
      action: url.searchParams.get("action") || "",
      actorId: url.searchParams.get("actorId") || ""
    })
  }))
];

async function handleRequest(req, res) {
  const corsHeaders = getCorsHeaders(req, config);
  if (req.method === "OPTIONS") return sendJson(res, 204, null, corsHeaders);

  const started = Date.now();
  let context = { req, url: new URL(req.url || "/", `http://${req.headers.host || "localhost"}`), route: null, user: null };
  try {
    const url = context.url;
    if (req.method === "POST" && url.pathname === "/webhooks/shopify") {
      const rawBody = await readRawBody(req, 5_000_000);
      const payload = await processShopifyWebhook({ config, store, headers: req.headers, rawBody });
      const elapsedMs = Date.now() - started;
      logRequest({ req, url, user: null, status: 200, elapsedMs });
      return sendJson(res, 200, payload);
    }

    const found = routes
      .map((candidate) => ({ route: candidate, params: matchPattern(candidate.pattern, url.pathname) }))
      .find((candidate) => candidate.route.method === req.method && candidate.params);

    if (!found) throw new HttpError(404, "Not found.");

    const body = await readJson(req);
    const user = found.route.options.auth === false ? null : await requireUser(req);
    context = { req, url, route: found.route, user };
    requirePermission(user, found.route.options.permission);

    const payload = await found.route.handler({
      req,
      res,
      url,
      params: found.params,
      body,
      user
    });

    const elapsedMs = Date.now() - started;
    logRequest({ req, url, user, status: 200, elapsedMs });
    await auditRequest({ route: found.route, req, url, user, status: 200, elapsedMs });
    return sendJson(res, 200, payload, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error.status || 500;
    const elapsedMs = Date.now() - started;
    logRequest({ ...context, status, elapsedMs, error });
    await auditRequest({ ...context, status, elapsedMs, error });
    if (error.status && !(error instanceof HttpError)) {
      return sendError(res, new HttpError(error.status, error.message), corsHeaders);
    }
    return sendError(res, error, corsHeaders);
  }
}

const server = createServer(handleRequest);
server.listen(config.port, "0.0.0.0", () => {
  console.log(`[backend] listening url=http://localhost:${config.port} dataDir=${config.dataDir}`);
});
