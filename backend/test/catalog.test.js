import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../src/http.js";
import { ShopifyCatalogProvider, createCatalogProvider } from "../src/catalog.js";

test("catalog provider requires Shopify source", () => {
  assert.throws(() => createCatalogProvider({ catalog: { source: "csv" } }), HttpError);
});

test("catalog provider creates Shopify provider", () => {
  const provider = createCatalogProvider({ catalog: { source: "shopify" } });
  assert.equal(provider instanceof ShopifyCatalogProvider, true);
});
