import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { hashPassword } from "./auth.js";
import { getEffectivePermissions, normalizePermissionOverrides, normalizeRole } from "./rbac.js";

function nowIso() {
  return new Date().toISOString();
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

export class StaffStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.usersPath = path.join(dataDir, "staff-users.json");
    this.ordersPath = path.join(dataDir, "staff-orders.json");
    this.auditPath = path.join(dataDir, "staff-audit-log.jsonl");
    mkdirSync(dataDir, { recursive: true });
  }

  listUsers() {
    return readJsonFile(this.usersPath, []).map(publicUser);
  }

  readUsers() {
    return readJsonFile(this.usersPath, []);
  }

  saveUsers(users) {
    writeJsonFile(this.usersPath, users);
  }

  findUserByEmail(email) {
    return this.readUsers().find((user) => user.email === normalizeEmail(email)) || null;
  }

  findUserById(id) {
    return this.readUsers().find((user) => user.id === id) || null;
  }

  createUser(input, actor = null) {
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    if (!email || !email.includes("@")) throw new Error("Valid email required.");
    if (!role) throw new Error("Valid role required.");

    const users = this.readUsers();
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
    this.saveUsers(users);
    this.appendAudit("staff_user.created", actor, {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissionOverrides: user.permissionOverrides
    });
    return publicUser(user);
  }

  updateUser(id, input, actor = null) {
    const users = this.readUsers();
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
    this.saveUsers(users);
    this.appendAudit("staff_user.updated", actor, {
      userId: nextUser.id,
      email: nextUser.email,
      role: nextUser.role,
      active: nextUser.active,
      permissionOverrides: normalizePermissionOverrides(nextUser.permissionOverrides)
    });
    return publicUser(nextUser);
  }

  ensureBootstrapAdmin(config) {
    const users = this.readUsers();
    if (users.length) return null;
    if (!config.bootstrapAdmin.email || !config.bootstrapAdmin.password) return null;

    return this.createUser({
      email: config.bootstrapAdmin.email,
      password: config.bootstrapAdmin.password,
      name: config.bootstrapAdmin.name,
      role: "admin"
    });
  }

  readOrders() {
    return readJsonFile(this.ordersPath, []);
  }

  saveOrders(orders) {
    writeJsonFile(this.ordersPath, orders);
  }

  listOrders(status = "") {
    const orders = this.readOrders();
    return status ? orders.filter((order) => order.status === status) : orders;
  }

  findOrder(id) {
    return this.readOrders().find((order) => order.id === id || order.shopifyDraftOrderId === id) || null;
  }

  createOrderRecord({ draftOrder, input, actor }) {
    const orders = this.readOrders();
    const record = {
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

    orders.push(record);
    this.saveOrders(orders);
    this.appendAudit("order.created", actor, { orderId: record.id, shopifyDraftOrderId: record.shopifyDraftOrderId });
    return record;
  }

  updateOrder(id, patch, actor = null) {
    const orders = this.readOrders();
    const index = orders.findIndex((order) => order.id === id || order.shopifyDraftOrderId === id);
    if (index === -1) throw new Error("Order record not found.");

    const nextOrder = {
      ...orders[index],
      ...patch,
      updatedAt: nowIso()
    };
    orders[index] = nextOrder;
    this.saveOrders(orders);
    this.appendAudit("order.updated", actor, { orderId: nextOrder.id, status: nextOrder.status });
    return nextOrder;
  }

  listAudit({ limit = 100, action = "", actorId = "" } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return readJsonLines(this.auditPath, boundedLimit * 2)
      .filter((entry) => !action || entry.action === action)
      .filter((entry) => !actorId || entry.actor?.id === actorId)
      .slice(0, boundedLimit);
  }

  appendAudit(action, actor, details = {}) {
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
