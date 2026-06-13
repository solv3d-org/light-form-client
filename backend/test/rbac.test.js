import test from "node:test";
import assert from "node:assert/strict";
import { getEffectivePermissions, hasPermission, normalizePermissionOverrides } from "../src/rbac.js";

test("operator can create and complete orders", () => {
  assert.equal(hasPermission("operator", "order:create"), true);
  assert.equal(hasPermission("operator", "order:complete"), true);
  assert.equal(hasPermission("operator", "user:manage"), false);
});

test("admin has wildcard access", () => {
  assert.equal(hasPermission("admin", "user:manage"), true);
  assert.equal(hasPermission("admin", "cost:write"), true);
});

test("user permission overrides can allow or deny role permissions", () => {
  const user = {
    role: "operator",
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
  assert.deepEqual(getEffectivePermissions({ role: "viewer", permissionOverrides: { allow: ["invoice:send"] } }), [
    "inventory:read",
    "invoice:send",
    "order:read"
  ]);
});
