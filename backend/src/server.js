import { createServer } from "node:http";
import { URL } from "node:url";
import { verifyPassword, createSessionToken, verifySessionToken } from "./auth.js";
import { getConfig, assertRuntimeConfig, isShopifyAdminConfigured } from "./config.js";
import { HttpError, getBearerToken, getCorsHeaders, readJson, sendError, sendJson } from "./http.js";
import { getEffectivePermissions, getRolePermissions, hasPermission, normalizePermissionOverrides, PERMISSIONS, ROLES } from "./rbac.js";
import { StaffStore } from "./store.js";
import {
  completeDraftOrder,
  createDraftOrder,
  deleteDraftOrder,
  getDraftOrder,
  searchInventory,
  sendDraftOrderInvoice,
  summarizeDraftOrder
} from "./shopifyAdmin.js";

const config = getConfig();
assertRuntimeConfig(config);

const store = new StaffStore(config.dataDir);
const bootstrappedUser = store.ensureBootstrapAdmin(config);

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
    const user = store.findUserById(session.sub);
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

function auditRequest({ route, req, url, user, status, elapsedMs, error = null }) {
  if (!user || url.pathname === "/api/audit") return;
  store.appendAudit(error ? "api.request_failed" : "api.request", user, {
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
    shopifyConfigured: isShopifyAdminConfigured(config),
    users: store.listUsers().length
  })),

  route("POST", "/api/auth/login", { auth: false }, async ({ body }) => {
    const user = store.findUserByEmail(body.email);
    if (!user || !user.active || !verifyPassword(body.password || "", user.passwordHash)) {
      throw new HttpError(401, "Invalid email or password.");
    }
    store.appendAudit("auth.login", user, { email: user.email });
    return {
      token: createSessionToken(user, config),
      staff: publicUser(user)
    };
  }),

  route("GET", "/api/auth/me", {}, async ({ user }) => ({ staff: publicUser(user) })),

  route("GET", "/api/staff/users", { permission: "user:manage" }, async () => ({ users: store.listUsers() })),

  route("GET", "/api/staff/permissions", { permission: "user:manage" }, async () => ({
    roles: ROLES,
    permissions: PERMISSIONS,
    rolePermissions: rolePermissionMap()
  })),

  route("POST", "/api/staff/users", { permission: "user:manage" }, async ({ body, user }) => {
    try {
      return { staff: store.createUser(body, user) };
    } catch (error) {
      throw mapStoreError(error);
    }
  }),

  route("PATCH", "/api/staff/users/:id", { permission: "user:manage" }, async ({ params, body, user }) => {
    if (params.id === user.id) assertSelfUpdateAllowed(user, body);

    try {
      return { staff: store.updateUser(params.id, body, user) };
    } catch (error) {
      throw mapStoreError(error);
    }
  }),

  route("GET", "/api/inventory/search", { permission: "inventory:read" }, async ({ url }) => ({
    variants: await searchInventory(config, {
      query: url.searchParams.get("q") || "",
      first: url.searchParams.get("first") || 25
    })
  })),

  route("POST", "/api/inventory/search", { permission: "inventory:read" }, async ({ body }) => ({
    variants: await searchInventory(config, body)
  })),

  route("GET", "/api/orders", { permission: "order:read" }, async ({ url }) => ({
    orders: store.listOrders(url.searchParams.get("status") || "")
  })),

  route("GET", "/api/orders/:id", { permission: "order:read" }, async ({ params }) => {
    const order = store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    return {
      order,
      shopifyDraftOrder: summarizeDraftOrder(await getDraftOrder(config, order.shopifyDraftOrderId))
    };
  }),

  route("POST", "/api/orders/draft", { permission: "order:create" }, async ({ body, user }) => {
    assertDiscountAccess(user, body);
    assertCostAccess(user, body.internal);
    const draftOrder = await createDraftOrder(config, body);
    const order = store.createOrderRecord({ draftOrder, input: body, actor: user });
    return {
      order,
      shopifyDraftOrder: summarizeDraftOrder(draftOrder)
    };
  }),

  route("PATCH", "/api/orders/:id", { permission: "order:update" }, async ({ params, body, user }) => {
    assertCostAccess(user, body.internal);
    const current = store.findOrder(params.id);
    if (!current) throw new HttpError(404, "Order record not found.");
    return {
      order: store.updateOrder(params.id, {
        fulfillment: body.fulfillment || current.fulfillment,
        internal: body.internal || current.internal
      }, user)
    };
  }),

  route("POST", "/api/orders/:id/send-invoice", { permission: "invoice:send" }, async ({ params, body, user }) => {
    const order = store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    const draftOrder = await sendDraftOrderInvoice(config, order.shopifyDraftOrderId, body);
    return {
      order: store.updateOrder(order.id, { invoiceSentAt: new Date().toISOString() }, user),
      shopifyDraftOrder: summarizeDraftOrder(draftOrder)
    };
  }),

  route("POST", "/api/orders/:id/complete", { permission: "order:complete" }, async ({ params, body, user }) => {
    const order = store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    const draftOrder = await completeDraftOrder(config, order.shopifyDraftOrderId, {
      paymentPending: body.paymentPending === true
    });
    return {
      order: store.updateOrder(order.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        shopifyOrderId: draftOrder.order_id ? String(draftOrder.order_id) : order.shopifyOrderId
      }, user),
      shopifyDraftOrder: summarizeDraftOrder(draftOrder)
    };
  }),

  route("POST", "/api/orders/:id/cancel", { permission: "order:cancel" }, async ({ params, user }) => {
    const order = store.findOrder(params.id);
    if (!order) throw new HttpError(404, "Order record not found.");
    await deleteDraftOrder(config, order.shopifyDraftOrderId);
    return {
      order: store.updateOrder(order.id, {
        status: "canceled",
        canceledAt: new Date().toISOString()
      }, user)
    };
  }),

  route("GET", "/api/audit", { permission: "audit:read" }, async ({ url }) => ({
    entries: store.listAudit({
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
    auditRequest({ route: found.route, req, url, user, status: 200, elapsedMs });
    return sendJson(res, 200, payload, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error.status || 500;
    const elapsedMs = Date.now() - started;
    logRequest({ ...context, status, elapsedMs, error });
    auditRequest({ ...context, status, elapsedMs, error });
    if (error.status && !(error instanceof HttpError)) {
      return sendError(res, new HttpError(error.status, error.message), corsHeaders);
    }
    return sendError(res, error, corsHeaders);
  }
}

const server = createServer(handleRequest);
server.listen(config.port, () => {
  console.log(`[backend] listening url=http://localhost:${config.port} dataDir=${config.dataDir}`);
});
