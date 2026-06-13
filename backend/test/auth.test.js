import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "../src/auth.js";

test("password hashing verifies valid passwords only", () => {
  const hash = hashPassword("valid-password");
  assert.equal(verifyPassword("valid-password", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("session token round trips", () => {
  const config = { auth: { jwtSecret: "0123456789abcdef0123456789abcdef", sessionTtlSeconds: 60 } };
  const user = { id: "u1", email: "a@example.com", name: "A", role: "admin" };
  const token = createSessionToken(user, config);
  const payload = verifySessionToken(token, config);
  assert.equal(payload.sub, user.id);
  assert.equal(payload.role, "admin");
});
