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

function publicUser(user) {
  if (!user) return null;
  const permissionOverrides = normalizePermissionOverrides(user.permissionOverrides);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissionOverrides,
    effectivePermissions: getEffectivePermissions({ ...user, permissionOverrides }),
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
    internal: input.internal || {},
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

class JsonStaffStore {
  constructor(dataDir) {
    this.kind = "json";
    this.dataDir = dataDir;
    this.usersPath = path.join(dataDir, "staff-users.json");
    this.ordersPath = path.join(dataDir, "staff-orders.json");
    this.auditPath = path.join(dataDir, "staff-audit-log.jsonl");
    mkdirSync(dataDir, { recursive: true });
  }

  storage() {
    return { users: "json", orders: "json", audit: "jsonl" };
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
    return { users: "postgres", orders: "postgres", audit: "postgres" };
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
}

export class StaffStore {
  static async create(config) {
    if (config.database?.url) return PgStaffStore.create(config);
    return new JsonStaffStore(config.dataDir);
  }
}
