import test from "node:test";
import assert from "node:assert/strict";
import { hasPermission } from "../src/rbac.js";

test("operator can create and complete orders", () => {
  assert.equal(hasPermission("operator", "order:create"), true);
  assert.equal(hasPermission("operator", "order:complete"), true);
  assert.equal(hasPermission("operator", "user:manage"), false);
});

test("admin has wildcard access", () => {
  assert.equal(hasPermission("admin", "user:manage"), true);
  assert.equal(hasPermission("admin", "cost:write"), true);
});
