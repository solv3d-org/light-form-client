import test from "node:test";
import assert from "node:assert/strict";
import { assertRuntimeConfig } from "../src/config.js";

function baseConfig(source) {
  return {
    port: 8787,
    catalog: { source },
    auth: { jwtSecret: "0123456789abcdef0123456789abcdef" },
    shopify: {
      storeDomain: "",
      adminAccessToken: "",
      clientId: "",
      clientSecret: "",
      apiVersion: "2026-04"
    }
  };
}

test("invalid catalog source fails runtime config", () => {
  assert.throws(() => assertRuntimeConfig(baseConfig("bad")), /STAFF_CATALOG_SOURCE/);
});

test("shopify catalog source requires Shopify Admin credentials", () => {
  assert.throws(() => assertRuntimeConfig(baseConfig("shopify")), /SHOPIFY_STORE_DOMAIN/);
});

test("shopify catalog source requires a location for inventory writes", () => {
  const config = baseConfig("shopify");
  config.shopify = {
    storeDomain: "example.myshopify.com",
    adminAccessToken: "shpat_token",
    clientId: "",
    clientSecret: "",
    apiVersion: "2026-04"
  };
  assert.throws(() => assertRuntimeConfig(config), /SHOPIFY_LOCATION_ID/);
});
