import test from "node:test";
import assert from "node:assert/strict";
import { getEffectivePermissions, hasPermission, normalizePermissionOverrides } from "../src/rbac.js";

test("staff can create and complete orders", () => {
  assert.equal(hasPermission("staff", "order:create"), true);
  assert.equal(hasPermission("staff", "order:complete"), true);
  assert.equal(hasPermission("staff", "user:manage"), false);
});

test("legacy operator maps to staff permissions", () => {
  assert.equal(hasPermission("operator", "order:create"), true);
  assert.equal(hasPermission("operator", "discount:apply"), false);
});

test("pm has all non-admin-management permissions", () => {
  assert.equal(hasPermission("pm", "inventory:adjust"), true);
  assert.equal(hasPermission("pm", "price:override"), true);
  assert.equal(hasPermission("pm", "cost:write"), true);
  assert.equal(hasPermission("pm", "storefront:curate"), true);
  assert.equal(hasPermission("pm", "sync:manage"), false);
  assert.equal(hasPermission("pm", "user:manage"), false);
  assert.equal(hasPermission("pm", "audit:read"), false);
});

test("admin has wildcard access", () => {
  assert.equal(hasPermission("admin", "user:manage"), true);
  assert.equal(hasPermission("admin", "cost:write"), true);
  assert.equal(hasPermission("admin", "price:override"), true);
  assert.equal(hasPermission("admin", "line:describe"), true);
});

test("user permission overrides can allow or deny role permissions", () => {
  const user = {
    role: "staff",
    permissionOverrides: {
      allow: ["discount:apply"],
      deny: ["order:complete"]
    }
  };
  assert.equal(hasPermission(user, "discount:apply"), true);
  assert.equal(hasPermission(user, "order:complete"), false);
  assert.equal(hasPermission(user, "order:create"), true);
});

test("permission overrides drop unknown permissions", () => {
  assert.deepEqual(normalizePermissionOverrides({ allow: ["order:read", "bad"], deny: ["audit:read"] }), {
    allow: ["order:read"],
    deny: ["audit:read"]
  });
});

test("effective permissions are sorted and include overrides", () => {
  assert.deepEqual(getEffectivePermissions({ role: "staff", permissionOverrides: { allow: ["discount:apply"] } }), [
    "discount:apply",
    "inventory:read",
    "invoice:send",
    "order:complete",
    "order:create",
    "order:read",
    "order:update"
  ]);
});
