import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { hashPassword } from "./auth.js";
import { getEffectivePermissions, normalizePermissionOverrides, normalizeRole } from "./rbac.js";

const { Pool } = pg;

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function readJsonFile(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmpPath, filePath);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCuration(input = {}) {
  const normalizeItems = (value) => {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
      .map((item) => ({
        productId: String(item.productId || item.id || "").trim(),
        handle: String(item.handle || "").trim(),
        title: String(item.title || "").trim(),
        sku: String(item.sku || "").trim(),
        imageUrl: String(item.imageUrl || "").trim()
      }))
      .filter((item) => item.productId && !seen.has(item.productId) && seen.add(item.productId));
  };
  const legacyItems = normalizeItems(input.items);
  const homeItems = (Array.isArray(input.homeItems) ? input.homeItems : legacyItems)
    .map((item) => ({
      productId: String(item.productId || item.id || "").trim(),
      handle: String(item.handle || "").trim(),
      title: String(item.title || "").trim(),
      sku: String(item.sku || "").trim(),
      imageUrl: String(item.imageUrl || "").trim()
    }))
    .filter(Boolean);
  const shopItems = (Array.isArray(input.shopItems) ? input.shopItems : legacyItems)
    .map((item) => ({
      productId: String(item.productId || item.id || "").trim(),
      handle: String(item.handle || "").trim(),
      title: String(item.title || "").trim(),
      sku: String(item.sku || "").trim(),
      imageUrl: String(item.imageUrl || "").trim()
    }))
    .filter(Boolean);
  return {
    homeItems: normalizeItems(homeItems),
    shopItems: normalizeItems(shopItems),
    updatedAt: input.updatedAt || null,
    updatedBy: input.updatedBy || null
  };
}

function publicUser(user) {
  if (!user) return null;
  const permissionOverrides = normalizePermissionOverrides(user.permissionOverrides);
  const role = normalizeRole(user.role);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    permissionOverrides,
    effectivePermissions: getEffectivePermissions({ ...user, role, permissionOverrides }),
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function readJsonLines(filePath, limit) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  return lines
    .slice(Math.max(0, lines.length - limit))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

function createOrderRecordData({ draftOrder, input, actor }) {
  const lineItems = Array.isArray(input.lineItems)
    ? input.lineItems.map((item) => ({
        variantId: item.variantId || "",
        title: item.title || "",
        sku: item.sku || "",
        quantity: item.quantity || 1,
        price: item.price || "",
        priceOverride: item.priceOverride || item.unitPrice || "",
        description: item.description || "",
        appliedDiscount: item.appliedDiscount || null
      }))
    : [];
  return {
    id: crypto.randomUUID(),
    status: "pending",
    shopifyDraftOrderId: String(draftOrder.id),
    shopifyDraftOrderName: draftOrder.name || "",
    shopifyInvoiceUrl: draftOrder.invoice_url || "",
    shopifyOrderId: draftOrder.order_id ? String(draftOrder.order_id) : "",
    customer: {
      email: input.email || "",
      customerId: input.customerId || ""
    },
    fulfillment: input.fulfillment || { type: "pickup" },
    internal: {
      ...(input.internal || {}),
      lineItems
    },
    hiddenFromCustomer: true,
    createdBy: publicUser(actor),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    invoiceSentAt: null,
    completedAt: null,
    canceledAt: null
  };
}

function normalizeDbUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissionOverrides: row.permission_overrides || { allow: [], deny: [] },
    active: row.active,
    passwordHash: row.password_hash,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function normalizeDbOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    shopifyDraftOrderId: row.shopify_draft_order_id,
    shopifyDraftOrderName: row.shopify_draft_order_name || "",
    shopifyInvoiceUrl: row.shopify_invoice_url || "",
    shopifyOrderId: row.shopify_order_id || "",
    customer: row.customer || {},
    fulfillment: row.fulfillment || {},
    internal: row.internal || {},
    hiddenFromCustomer: row.hidden_from_customer,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    invoiceSentAt: toIso(row.invoice_sent_at),
    completedAt: toIso(row.completed_at),
    canceledAt: toIso(row.canceled_at)
  };
}

function normalizeDbAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    action: row.action,
    actor: row.actor,
    details: row.details || {},
    createdAt: toIso(row.created_at)
  };
}

function normalizeDbWebhookEvent(row) {
  if (!row) return null;
  return {
    webhookId: row.webhook_id,
    eventId: row.event_id || "",
    topic: row.topic,
    shopDomain: row.shop_domain || "",
    apiVersion: row.api_version || "",
    status: row.status,
    error: row.error || "",
    payload: row.payload || {},
    receivedAt: toIso(row.received_at),
    processedAt: toIso(row.processed_at)
  };
}

function normalizeDbCatalogRow(row) {
  if (!row) return null;
  return {
    id: row.product_id || row.variant_id,
    source: "shopify-cache",
    handle: row.handle || "",
    title: row.title || "",
    bodyHtml: "",
    vendor: row.vendor || "",
    productType: row.product_type || "",
    tags: "",
    status: row.status || "ACTIVE",
    sku: row.sku || "",
    price: row.price || "",
    compareAtPrice: row.compare_at_price || "",
    barcode: row.barcode || "",
    imageUrl: row.image_url || "",
    imageAlt: row.image_alt || "",
    inventory: row.inventory || { tracked: false, available: 0, onHand: 0, levels: [] },
    shopifyProductId: row.product_id || "",
    shopifyVariantId: row.variant_id || "",
    inventoryItemId: row.inventory_item_id || "",
    product: row.product || {},
    updatedAt: toIso(row.updated_at)
  };
}

function catalogRecordFromVariant(variant) {
  if (variant.shopifyVariantId) {
    return {
      variantId: variant.shopifyVariantId,
      productId: variant.shopifyProductId || variant.id || "",
      inventoryItemId: variant.inventoryItemId || "",
      handle: variant.handle || "",
      title: variant.title || "",
      vendor: variant.vendor || "",
      productType: variant.productType || "",
      status: variant.status || "ACTIVE",
      sku: variant.sku || "",
      barcode: variant.barcode || "",
      price: variant.price || "",
      compareAtPrice: variant.compareAtPrice || "",
      imageUrl: variant.imageUrl || "",
      imageAlt: variant.imageAlt || variant.title || "",
      inventory: variant.inventory || { tracked: false, available: 0, onHand: 0, levels: [] },
      product: variant.product || {},
      updatedAt: nowIso()
    };
  }
  const product = variant.product || {};
  const image = variant.image || product.featuredImage || product.image || {};
  const quantities = variant.inventory?.quantities || [];
  const inventory = variant.inventory || {
    tracked: Boolean(variant.inventoryItem?.tracked),
    available: quantities.find((item) => item.name === "available")?.quantity || 0,
    onHand: quantities.find((item) => item.name === "on_hand")?.quantity || 0,
    levels: variant.inventoryItem?.inventoryLevels?.nodes || []
  };
  return {
    variantId: variant.id || variant.variantId || "",
    productId: product.id || variant.productId || "",
    inventoryItemId: variant.inventoryItemId || variant.inventoryItem?.id || "",
    handle: product.handle || "",
    title: product.title || variant.title || "",
    vendor: product.vendor || "",
    productType: product.productType || "",
    status: product.status || "ACTIVE",
    sku: variant.sku || variant.inventoryItem?.sku || "",
    barcode: variant.barcode || "",
    price: variant.price || "",
    compareAtPrice: variant.compareAtPrice || "",
    imageUrl: image.url || "",
    imageAlt: image.altText || product.title || "",
    inventory,
    product,
    updatedAt: nowIso()
  };
}

function orderParams(order) {
  return [
    order.id,
    order.status,
    order.shopifyDraftOrderId,
    order.shopifyDraftOrderName,
    order.shopifyInvoiceUrl,
    order.shopifyOrderId,
    JSON.stringify(order.customer || {}),
    JSON.stringify(order.fulfillment || {}),
    JSON.stringify(order.internal || {}),
    order.hiddenFromCustomer !== false,
    JSON.stringify(order.createdBy || null),
    order.createdAt,
    order.updatedAt,
    order.invoiceSentAt,
    order.completedAt,
    order.canceledAt
  ];
}

function catalogParams(record) {
  return [
    record.variantId,
    record.productId,
    record.inventoryItemId,
    record.handle,
    record.title,
    record.vendor,
    record.productType,
    record.status,
    record.sku,
    record.barcode,
    record.price,
    record.compareAtPrice,
    record.imageUrl,
    record.imageAlt,
    JSON.stringify(record.inventory || {}),
    JSON.stringify(record.product || {}),
    record.updatedAt || nowIso()
  ];
}

class JsonStaffStore {
  constructor(dataDir) {
    this.kind = "json";
    this.dataDir = dataDir;
    this.usersPath = path.join(dataDir, "staff-users.json");
    this.ordersPath = path.join(dataDir, "staff-orders.json");
    this.auditPath = path.join(dataDir, "staff-audit-log.jsonl");
    this.webhooksPath = path.join(dataDir, "shopify-webhook-events.jsonl");
    this.catalogCachePath = path.join(dataDir, "shopify-catalog-cache.json");
    this.storefrontCurationPath = path.join(dataDir, "storefront-curation.json");
    mkdirSync(dataDir, { recursive: true });
  }

  storage() {
    return { users: "json", orders: "json", audit: "jsonl", shopifyCatalogCache: "json", storefrontCuration: "json", webhooks: "jsonl" };
  }

  async listUsers() {
    return readJsonFile(this.usersPath, []).map(publicUser);
  }

  async readUsers() {
    return readJsonFile(this.usersPath, []);
  }

  async saveUsers(users) {
    writeJsonFile(this.usersPath, users);
  }

  async findUserByEmail(email) {
    return (await this.readUsers()).find((user) => user.email === normalizeEmail(email)) || null;
  }

  async findUserById(id) {
    return (await this.readUsers()).find((user) => user.id === id) || null;
  }

  async createUser(input, actor = null) {
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    if (!email || !email.includes("@")) throw new Error("Valid email required.");
    if (!role) throw new Error("Valid role required.");

    const users = await this.readUsers();
    if (users.some((user) => user.email === email)) throw new Error("Staff user already exists.");

    const user = {
      id: crypto.randomUUID(),
      email,
      name: String(input.name || email).trim(),
      role,
      permissionOverrides: normalizePermissionOverrides(input.permissionOverrides),
      active: input.active !== false,
      passwordHash: hashPassword(input.password),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    users.push(user);
    await this.saveUsers(users);
    await this.appendAudit("staff_user.created", actor, {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissionOverrides: user.permissionOverrides
    });
    return publicUser(user);
  }

  async updateUser(id, input, actor = null) {
    const users = await this.readUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index === -1) throw new Error("Staff user not found.");

    const nextUser = { ...users[index] };
    if (input.name != null) nextUser.name = String(input.name).trim();
    if (input.role != null) {
      const role = normalizeRole(input.role);
      if (!role) throw new Error("Valid role required.");
      nextUser.role = role;
    }
    if (input.permissionOverrides != null) {
      nextUser.permissionOverrides = normalizePermissionOverrides(input.permissionOverrides);
    }
    if (input.active != null) nextUser.active = Boolean(input.active);
    if (input.password) nextUser.passwordHash = hashPassword(input.password);
    nextUser.updatedAt = nowIso();

    users[index] = nextUser;
    await this.saveUsers(users);
    await this.appendAudit("staff_user.updated", actor, {
      userId: nextUser.id,
      email: nextUser.email,
      role: nextUser.role,
      active: nextUser.active,
      permissionOverrides: normalizePermissionOverrides(nextUser.permissionOverrides)
    });
    return publicUser(nextUser);
  }

  async ensureBootstrapAdmin(config) {
    if ((await this.readUsers()).length) return null;
    if (!config.bootstrapAdmin.email || !config.bootstrapAdmin.password) return null;
    return this.createUser({
      email: config.bootstrapAdmin.email,
      password: config.bootstrapAdmin.password,
      name: config.bootstrapAdmin.name,
      role: "admin"
    });
  }

  async readOrders() {
    return readJsonFile(this.ordersPath, []);
  }

  async saveOrders(orders) {
    writeJsonFile(this.ordersPath, orders);
  }

  async listOrders(status = "") {
    const orders = await this.readOrders();
    return status ? orders.filter((order) => order.status === status) : orders;
  }

  async findOrder(id) {
    return (await this.readOrders()).find((order) => order.id === id || order.shopifyDraftOrderId === id) || null;
  }

  async createOrderRecord({ draftOrder, input, actor }) {
    const orders = await this.readOrders();
    const record = createOrderRecordData({ draftOrder, input, actor });
    orders.push(record);
    await this.saveOrders(orders);
    await this.appendAudit("order.created", actor, { orderId: record.id, shopifyDraftOrderId: record.shopifyDraftOrderId });
    return record;
  }

  async updateOrder(id, patch, actor = null) {
    const orders = await this.readOrders();
    const index = orders.findIndex((order) => order.id === id || order.shopifyDraftOrderId === id);
    if (index === -1) throw new Error("Order record not found.");

    const nextOrder = {
      ...orders[index],
      ...patch,
      updatedAt: nowIso()
    };
    orders[index] = nextOrder;
    await this.saveOrders(orders);
    await this.appendAudit("order.updated", actor, { orderId: nextOrder.id, status: nextOrder.status });
    return nextOrder;
  }

  async listAudit({ limit = 100, action = "", actorId = "" } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return readJsonLines(this.auditPath, boundedLimit * 2)
      .filter((entry) => !action || entry.action === action)
      .filter((entry) => !actorId || entry.actor?.id === actorId)
      .slice(0, boundedLimit);
  }

  async appendAudit(action, actor, details = {}) {
    appendFileSync(
      this.auditPath,
      `${JSON.stringify({
        id: crypto.randomUUID(),
        action,
        actor: publicUser(actor),
        details,
        createdAt: nowIso()
      })}\n`
    );
  }

  async recordWebhookEvent(event) {
    const existing = readJsonLines(this.webhooksPath, 100000).find((entry) => entry.webhookId === event.webhookId);
    if (existing) return { duplicate: true, event: existing };
    const record = {
      webhookId: event.webhookId,
      eventId: event.eventId || "",
      topic: event.topic,
      shopDomain: event.shopDomain || "",
      apiVersion: event.apiVersion || "",
      status: "received",
      error: "",
      payload: event.payload || {},
      receivedAt: nowIso(),
      processedAt: null
    };
    appendFileSync(this.webhooksPath, `${JSON.stringify(record)}\n`);
    return { duplicate: false, event: record };
  }

  async updateWebhookEvent(webhookId, patch) {
    const entries = readJsonLines(this.webhooksPath, 100000).reverse();
    const index = entries.findIndex((entry) => entry.webhookId === webhookId);
    if (index === -1) return null;
    entries[index] = { ...entries[index], ...patch };
    writeFileSync(this.webhooksPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    return entries[index];
  }

  async upsertShopifyCatalog(records = []) {
    const current = readJsonFile(this.catalogCachePath, []);
    const byVariant = new Map(current.map((record) => [record.shopifyVariantId || record.variantId, record]));
    for (const input of records) {
      const record = input.variantId ? input : catalogRecordFromVariant(input);
      if (!record.variantId) continue;
      byVariant.set(record.variantId, normalizeDbCatalogRow({
        variant_id: record.variantId,
        product_id: record.productId,
        inventory_item_id: record.inventoryItemId,
        handle: record.handle,
        title: record.title,
        vendor: record.vendor,
        product_type: record.productType,
        status: record.status,
        sku: record.sku,
        barcode: record.barcode,
        price: record.price,
        compare_at_price: record.compareAtPrice,
        image_url: record.imageUrl,
        image_alt: record.imageAlt,
        inventory: record.inventory,
        product: record.product,
        updated_at: record.updatedAt || nowIso()
      }));
    }
    const next = [...byVariant.values()];
    writeJsonFile(this.catalogCachePath, next);
    return next.length;
  }

  async searchShopifyCatalog({ query = "", first = 25 } = {}) {
    const limit = Math.max(1, Math.min(Number(first) || 25, 100));
    const needle = String(query || "").toLowerCase();
    return readJsonFile(this.catalogCachePath, [])
      .filter((record) => {
        if (!needle) return true;
        return [record.title, record.handle, record.sku, record.vendor, record.productType, record.barcode]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, limit);
  }

  async shopifyCatalogCacheCount() {
    return readJsonFile(this.catalogCachePath, []).length;
  }

  async getStorefrontCuration() {
    return normalizeCuration(readJsonFile(this.storefrontCurationPath, { items: [] }));
  }

  async saveStorefrontCuration(input, actor = null) {
    const curation = normalizeCuration({
      homeItems: input.homeItems,
      shopItems: input.shopItems,
      updatedAt: nowIso(),
      updatedBy: publicUser(actor)
    });
    writeJsonFile(this.storefrontCurationPath, curation);
    await this.appendAudit("storefront_curation.updated", actor, {
      homeItemCount: curation.homeItems.length,
      shopItemCount: curation.shopItems.length
    });
    return curation;
  }

  async deleteShopifyCatalogProduct(productId) {
    const gid = String(productId || "");
    const numeric = gid.match(/(\d+)$/)?.[1] || gid;
    const current = readJsonFile(this.catalogCachePath, []);
    const next = current.filter((record) => {
      const recordId = record.shopifyProductId || record.productId || "";
      return recordId !== gid && !recordId.endsWith(`/${numeric}`) && recordId !== numeric;
    });
    writeJsonFile(this.catalogCachePath, next);
    return current.length - next.length;
  }

  async updateShopifyInventoryItem(inventoryItemId, patch = {}) {
    const gid = String(inventoryItemId || "");
    const numeric = gid.match(/(\d+)$/)?.[1] || gid;
    const records = readJsonFile(this.catalogCachePath, []);
    let count = 0;
    for (const record of records) {
      const recordId = record.inventoryItemId || "";
      if (recordId !== gid && !recordId.endsWith(`/${numeric}`) && recordId !== numeric) continue;
      record.inventory = {
        ...(record.inventory || {}),
        available: patch.available ?? record.inventory?.available ?? 0,
        onHand: patch.onHand ?? patch.available ?? record.inventory?.onHand ?? 0,
        levels: patch.levels || record.inventory?.levels || []
      };
      record.updatedAt = nowIso();
      count += 1;
    }
    writeJsonFile(this.catalogCachePath, records);
    return count;
  }
}

class PgStaffStore {
  constructor(pool) {
    this.kind = "postgres";
    this.pool = pool;
  }

  static async create(config) {
    const pool = new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: config.database.sslRejectUnauthorized } : undefined
    });
    const store = new PgStaffStore(pool);
    await store.migrate();
    return store;
  }

  storage() {
    return { users: "postgres", orders: "postgres", audit: "postgres", shopifyCatalogCache: "postgres", storefrontCuration: "postgres", webhooks: "postgres" };
  }

  async migrate() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS staff_users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        name text NOT NULL,
        role text NOT NULL,
        permission_overrides jsonb NOT NULL DEFAULT '{"allow":[],"deny":[]}'::jsonb,
        active boolean NOT NULL DEFAULT true,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      );

      CREATE TABLE IF NOT EXISTS staff_orders (
        id text PRIMARY KEY,
        status text NOT NULL,
        shopify_draft_order_id text NOT NULL,
        shopify_draft_order_name text NOT NULL DEFAULT '',
        shopify_invoice_url text NOT NULL DEFAULT '',
        shopify_order_id text NOT NULL DEFAULT '',
        customer jsonb NOT NULL DEFAULT '{}'::jsonb,
        fulfillment jsonb NOT NULL DEFAULT '{}'::jsonb,
        internal jsonb NOT NULL DEFAULT '{}'::jsonb,
        hidden_from_customer boolean NOT NULL DEFAULT true,
        created_by jsonb,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        invoice_sent_at timestamptz,
        completed_at timestamptz,
        canceled_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS staff_orders_status_idx ON staff_orders(status);
      CREATE INDEX IF NOT EXISTS staff_orders_draft_order_idx ON staff_orders(shopify_draft_order_id);

      CREATE TABLE IF NOT EXISTS staff_audit_entries (
        id text PRIMARY KEY,
        action text NOT NULL,
        actor jsonb,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL
      );

      CREATE INDEX IF NOT EXISTS staff_audit_created_at_idx ON staff_audit_entries(created_at DESC);
      CREATE INDEX IF NOT EXISTS staff_audit_action_idx ON staff_audit_entries(action);

      CREATE TABLE IF NOT EXISTS shopify_webhook_events (
        webhook_id text PRIMARY KEY,
        event_id text NOT NULL DEFAULT '',
        topic text NOT NULL,
        shop_domain text NOT NULL DEFAULT '',
        api_version text NOT NULL DEFAULT '',
        status text NOT NULL,
        error text NOT NULL DEFAULT '',
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        received_at timestamptz NOT NULL,
        processed_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS shopify_webhook_events_topic_idx ON shopify_webhook_events(topic);
      CREATE INDEX IF NOT EXISTS shopify_webhook_events_received_at_idx ON shopify_webhook_events(received_at DESC);

      CREATE TABLE IF NOT EXISTS shopify_catalog_cache (
        variant_id text PRIMARY KEY,
        product_id text NOT NULL DEFAULT '',
        inventory_item_id text NOT NULL DEFAULT '',
        handle text NOT NULL DEFAULT '',
        title text NOT NULL DEFAULT '',
        vendor text NOT NULL DEFAULT '',
        product_type text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT '',
        sku text NOT NULL DEFAULT '',
        barcode text NOT NULL DEFAULT '',
        price text NOT NULL DEFAULT '',
        compare_at_price text NOT NULL DEFAULT '',
        image_url text NOT NULL DEFAULT '',
        image_alt text NOT NULL DEFAULT '',
        inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
        product jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL
      );

      CREATE INDEX IF NOT EXISTS shopify_catalog_cache_product_idx ON shopify_catalog_cache(product_id);
      CREATE INDEX IF NOT EXISTS shopify_catalog_cache_inventory_item_idx ON shopify_catalog_cache(inventory_item_id);
      CREATE INDEX IF NOT EXISTS shopify_catalog_cache_search_idx ON shopify_catalog_cache USING gin (
        to_tsvector('simple', title || ' ' || handle || ' ' || sku || ' ' || vendor || ' ' || product_type || ' ' || barcode)
      );

      CREATE TABLE IF NOT EXISTS storefront_curation (
        id text PRIMARY KEY,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_by jsonb,
        updated_at timestamptz NOT NULL
      );
    `);
  }

  async listUsers() {
    const result = await this.pool.query("SELECT * FROM staff_users ORDER BY created_at ASC");
    return result.rows.map(normalizeDbUser).map(publicUser);
  }

  async findUserByEmail(email) {
    const result = await this.pool.query("SELECT * FROM staff_users WHERE email = $1 LIMIT 1", [normalizeEmail(email)]);
    return normalizeDbUser(result.rows[0]);
  }

  async findUserById(id) {
    const result = await this.pool.query("SELECT * FROM staff_users WHERE id = $1 LIMIT 1", [id]);
    return normalizeDbUser(result.rows[0]);
  }

  async createUser(input, actor = null) {
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    if (!email || !email.includes("@")) throw new Error("Valid email required.");
    if (!role) throw new Error("Valid role required.");

    const user = {
      id: crypto.randomUUID(),
      email,
      name: String(input.name || email).trim(),
      role,
      permissionOverrides: normalizePermissionOverrides(input.permissionOverrides),
      active: input.active !== false,
      passwordHash: hashPassword(input.password),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    try {
      const result = await this.pool.query(
        `INSERT INTO staff_users (
          id, email, name, role, permission_overrides, active, password_hash, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          user.id,
          user.email,
          user.name,
          user.role,
          JSON.stringify(user.permissionOverrides),
          user.active,
          user.passwordHash,
          user.createdAt,
          user.updatedAt
        ]
      );
      const saved = normalizeDbUser(result.rows[0]);
      await this.appendAudit("staff_user.created", actor, {
        userId: saved.id,
        email: saved.email,
        role: saved.role,
        permissionOverrides: saved.permissionOverrides
      });
      return publicUser(saved);
    } catch (error) {
      if (error.code === "23505") throw new Error("Staff user already exists.");
      throw error;
    }
  }

  async updateUser(id, input, actor = null) {
    const current = await this.findUserById(id);
    if (!current) throw new Error("Staff user not found.");

    const nextUser = { ...current };
    if (input.name != null) nextUser.name = String(input.name).trim();
    if (input.role != null) {
      const role = normalizeRole(input.role);
      if (!role) throw new Error("Valid role required.");
      nextUser.role = role;
    }
    if (input.permissionOverrides != null) nextUser.permissionOverrides = normalizePermissionOverrides(input.permissionOverrides);
    if (input.active != null) nextUser.active = Boolean(input.active);
    if (input.password) nextUser.passwordHash = hashPassword(input.password);
    nextUser.updatedAt = nowIso();

    const result = await this.pool.query(
      `UPDATE staff_users
       SET name = $2, role = $3, permission_overrides = $4, active = $5, password_hash = $6, updated_at = $7
       WHERE id = $1
       RETURNING *`,
      [
        nextUser.id,
        nextUser.name,
        nextUser.role,
        JSON.stringify(nextUser.permissionOverrides),
        nextUser.active,
        nextUser.passwordHash,
        nextUser.updatedAt
      ]
    );
    const saved = normalizeDbUser(result.rows[0]);
    await this.appendAudit("staff_user.updated", actor, {
      userId: saved.id,
      email: saved.email,
      role: saved.role,
      active: saved.active,
      permissionOverrides: saved.permissionOverrides
    });
    return publicUser(saved);
  }

  async ensureBootstrapAdmin(config) {
    const result = await this.pool.query("SELECT count(*)::int AS count FROM staff_users");
    if (result.rows[0]?.count) return null;
    if (!config.bootstrapAdmin.email || !config.bootstrapAdmin.password) return null;
    return this.createUser({
      email: config.bootstrapAdmin.email,
      password: config.bootstrapAdmin.password,
      name: config.bootstrapAdmin.name,
      role: "admin"
    });
  }

  async listOrders(status = "") {
    const result = status
      ? await this.pool.query("SELECT * FROM staff_orders WHERE status = $1 ORDER BY created_at DESC", [status])
      : await this.pool.query("SELECT * FROM staff_orders ORDER BY created_at DESC");
    return result.rows.map(normalizeDbOrder);
  }

  async findOrder(id) {
    const result = await this.pool.query(
      "SELECT * FROM staff_orders WHERE id = $1 OR shopify_draft_order_id = $1 LIMIT 1",
      [id]
    );
    return normalizeDbOrder(result.rows[0]);
  }

  async createOrderRecord({ draftOrder, input, actor }) {
    const record = createOrderRecordData({ draftOrder, input, actor });
    await this.pool.query(
      `INSERT INTO staff_orders (
        id, status, shopify_draft_order_id, shopify_draft_order_name, shopify_invoice_url,
        shopify_order_id, customer, fulfillment, internal, hidden_from_customer, created_by,
        created_at, updated_at, invoice_sent_at, completed_at, canceled_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      orderParams(record)
    );
    await this.appendAudit("order.created", actor, { orderId: record.id, shopifyDraftOrderId: record.shopifyDraftOrderId });
    return record;
  }

  async updateOrder(id, patch, actor = null) {
    const current = await this.findOrder(id);
    if (!current) throw new Error("Order record not found.");
    const nextOrder = {
      ...current,
      ...patch,
      updatedAt: nowIso()
    };
    const result = await this.pool.query(
      `UPDATE staff_orders
       SET status = $2, shopify_draft_order_id = $3, shopify_draft_order_name = $4,
           shopify_invoice_url = $5, shopify_order_id = $6, customer = $7,
           fulfillment = $8, internal = $9, hidden_from_customer = $10, created_by = $11,
           created_at = $12, updated_at = $13, invoice_sent_at = $14, completed_at = $15, canceled_at = $16
       WHERE id = $1 OR shopify_draft_order_id = $1
       RETURNING *`,
      orderParams(nextOrder)
    );
    const saved = normalizeDbOrder(result.rows[0]);
    await this.appendAudit("order.updated", actor, { orderId: saved.id, status: saved.status });
    return saved;
  }

  async listAudit({ limit = 100, action = "", actorId = "" } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const params = [boundedLimit];
    const filters = [];
    if (action) {
      params.push(action);
      filters.push(`action = $${params.length}`);
    }
    if (actorId) {
      params.push(actorId);
      filters.push(`actor->>'id' = $${params.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT * FROM staff_audit_entries ${where} ORDER BY created_at DESC LIMIT $1`,
      params
    );
    return result.rows.map(normalizeDbAudit);
  }

  async appendAudit(action, actor, details = {}) {
    await this.pool.query(
      `INSERT INTO staff_audit_entries (id, action, actor, details, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), action, JSON.stringify(publicUser(actor)), JSON.stringify(details || {}), nowIso()]
    );
  }

  async recordWebhookEvent(event) {
    const record = {
      webhookId: event.webhookId,
      eventId: event.eventId || "",
      topic: event.topic,
      shopDomain: event.shopDomain || "",
      apiVersion: event.apiVersion || "",
      status: "received",
      error: "",
      payload: event.payload || {},
      receivedAt: nowIso(),
      processedAt: null
    };
    const result = await this.pool.query(
      `INSERT INTO shopify_webhook_events (
        webhook_id, event_id, topic, shop_domain, api_version, status, error, payload, received_at, processed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (webhook_id) DO NOTHING
      RETURNING *`,
      [
        record.webhookId,
        record.eventId,
        record.topic,
        record.shopDomain,
        record.apiVersion,
        record.status,
        record.error,
        JSON.stringify(record.payload),
        record.receivedAt,
        record.processedAt
      ]
    );
    if (result.rows[0]) return { duplicate: false, event: normalizeDbWebhookEvent(result.rows[0]) };
    const existing = await this.pool.query("SELECT * FROM shopify_webhook_events WHERE webhook_id = $1", [record.webhookId]);
    return { duplicate: true, event: normalizeDbWebhookEvent(existing.rows[0]) };
  }

  async updateWebhookEvent(webhookId, patch) {
    const result = await this.pool.query(
      `UPDATE shopify_webhook_events
       SET status = COALESCE($2, status), error = COALESCE($3, error), processed_at = COALESCE($4, processed_at)
       WHERE webhook_id = $1
       RETURNING *`,
      [webhookId, patch.status || null, patch.error || null, patch.processedAt || null]
    );
    return normalizeDbWebhookEvent(result.rows[0]);
  }

  async upsertShopifyCatalog(records = []) {
    let count = 0;
    for (const input of records) {
      const record = input.variantId ? input : catalogRecordFromVariant(input);
      if (!record.variantId) continue;
      await this.pool.query(
        `INSERT INTO shopify_catalog_cache (
          variant_id, product_id, inventory_item_id, handle, title, vendor, product_type, status,
          sku, barcode, price, compare_at_price, image_url, image_alt, inventory, product, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (variant_id) DO UPDATE SET
          product_id = EXCLUDED.product_id,
          inventory_item_id = EXCLUDED.inventory_item_id,
          handle = EXCLUDED.handle,
          title = EXCLUDED.title,
          vendor = EXCLUDED.vendor,
          product_type = EXCLUDED.product_type,
          status = EXCLUDED.status,
          sku = EXCLUDED.sku,
          barcode = EXCLUDED.barcode,
          price = EXCLUDED.price,
          compare_at_price = EXCLUDED.compare_at_price,
          image_url = EXCLUDED.image_url,
          image_alt = EXCLUDED.image_alt,
          inventory = EXCLUDED.inventory,
          product = EXCLUDED.product,
          updated_at = EXCLUDED.updated_at`,
        catalogParams(record)
      );
      count += 1;
    }
    return count;
  }

  async searchShopifyCatalog({ query = "", first = 25 } = {}) {
    const limit = Math.max(1, Math.min(Number(first) || 25, 100));
    const needle = String(query || "").trim();
    const result = needle
      ? await this.pool.query(
          `SELECT * FROM shopify_catalog_cache
           WHERE to_tsvector('simple', title || ' ' || handle || ' ' || sku || ' ' || vendor || ' ' || product_type || ' ' || barcode)
             @@ plainto_tsquery('simple', $1)
           ORDER BY title ASC
           LIMIT $2`,
          [needle, limit]
        )
      : await this.pool.query("SELECT * FROM shopify_catalog_cache ORDER BY title ASC LIMIT $1", [limit]);
    return result.rows.map(normalizeDbCatalogRow);
  }

  async shopifyCatalogCacheCount() {
    const result = await this.pool.query("SELECT count(*)::int AS count FROM shopify_catalog_cache");
    return result.rows[0]?.count || 0;
  }

  async getStorefrontCuration() {
    const result = await this.pool.query("SELECT * FROM storefront_curation WHERE id = 'default' LIMIT 1");
    return normalizeCuration({
      homeItems: result.rows[0]?.items?.homeItems || result.rows[0]?.items || [],
      shopItems: result.rows[0]?.items?.shopItems || result.rows[0]?.items || [],
      updatedAt: toIso(result.rows[0]?.updated_at),
      updatedBy: result.rows[0]?.updated_by || null
    });
  }

  async saveStorefrontCuration(input, actor = null) {
    const curation = normalizeCuration({
      homeItems: input.homeItems,
      shopItems: input.shopItems,
      updatedAt: nowIso(),
      updatedBy: publicUser(actor)
    });
    const result = await this.pool.query(
      `INSERT INTO storefront_curation (id, items, updated_by, updated_at)
       VALUES ('default', $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET items = EXCLUDED.items, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [JSON.stringify({ homeItems: curation.homeItems, shopItems: curation.shopItems }), JSON.stringify(curation.updatedBy), curation.updatedAt]
    );
    const saved = normalizeCuration({
      homeItems: result.rows[0].items?.homeItems || result.rows[0].items || [],
      shopItems: result.rows[0].items?.shopItems || result.rows[0].items || [],
      updatedAt: toIso(result.rows[0].updated_at),
      updatedBy: result.rows[0].updated_by
    });
    await this.appendAudit("storefront_curation.updated", actor, {
      homeItemCount: saved.homeItems.length,
      shopItemCount: saved.shopItems.length
    });
    return saved;
  }

  async deleteShopifyCatalogProduct(productId) {
    const gid = String(productId || "");
    const numeric = gid.match(/(\d+)$/)?.[1] || gid;
    const result = await this.pool.query(
      "DELETE FROM shopify_catalog_cache WHERE product_id = $1 OR product_id = $2 OR product_id LIKE $3",
      [gid, numeric, `%/${numeric}`]
    );
    return result.rowCount || 0;
  }

  async updateShopifyInventoryItem(inventoryItemId, patch = {}) {
    const gid = String(inventoryItemId || "");
    const numeric = gid.match(/(\d+)$/)?.[1] || gid;
    const result = await this.pool.query(
      `UPDATE shopify_catalog_cache
       SET inventory = jsonb_set(
             jsonb_set(
               COALESCE(inventory, '{}'::jsonb),
               '{available}',
               to_jsonb($4::int),
               true
             ),
             '{onHand}',
             to_jsonb($5::int),
             true
           ),
           updated_at = $6
       WHERE inventory_item_id = $1 OR inventory_item_id = $2 OR inventory_item_id LIKE $3`,
      [
        gid,
        numeric,
        `%/${numeric}`,
        Number(patch.available ?? patch.onHand ?? 0),
        Number(patch.onHand ?? patch.available ?? 0),
        nowIso()
      ]
    );
    return result.rowCount || 0;
  }
}

export class StaffStore {
  static async create(config) {
    if (config.database?.url) return PgStaffStore.create(config);
    return new JsonStaffStore(config.dataDir);
  }
}
