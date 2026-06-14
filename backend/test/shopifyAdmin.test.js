import test from "node:test";
import assert from "node:assert/strict";
import { archiveProduct, createDraftOrder, createProduct, setInventoryOnHand, shopifyAdminRest } from "../src/shopifyAdmin.js";

const config = {
  shopify: {
    storeDomain: "example.myshopify.com",
    adminAccessToken: "shpat_test_token",
    apiVersion: "2026-04"
  }
};

test("delivery draft orders require a date or Date TBA", async () => {
  await assert.rejects(
    () =>
      createDraftOrder(config, {
        email: "customer@example.com",
        lineItems: [{ variantId: "gid://shopify/ProductVariant/123", quantity: 1 }],
        fulfillment: { type: "delivery", dateTba: false }
      }),
    /Delivery requires/
  );
});

test("Shopify REST 202 responses are polled", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) {
      return new Response("", {
        status: 202,
        headers: {
          location: "/poll/draft-order",
          "retry-after": "0"
        }
      });
    }

    return new Response(JSON.stringify({ draft_order: { id: 1 } }), { status: 200 });
  };

  try {
    const payload = await shopifyAdminRest(config, "/draft_orders.json", { method: "POST", body: { draft_order: {} } });
    assert.equal(payload.draft_order.id, 1);
    assert.equal(calls[1], "https://example.myshopify.com/poll/draft-order");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shopify REST can use client credentials token", async () => {
  const originalFetch = globalThis.fetch;
  const clientConfig = {
    shopify: {
      storeDomain: "client-test.myshopify.com",
      adminAccessToken: "",
      clientId: "client_id",
      clientSecret: "client_secret",
      apiVersion: "2026-04"
    }
  };
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).endsWith("/admin/oauth/access_token")) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("grant_type"), "client_credentials");
      assert.equal(body.get("client_id"), "client_id");
      assert.equal(body.get("client_secret"), "client_secret");
      return new Response(JSON.stringify({ access_token: "client_token", expires_in: 120 }), { status: 200 });
    }

    assert.equal(options.headers["X-Shopify-Access-Token"], "client_token");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const payload = await shopifyAdminRest(clientConfig, "/shop.json");
    assert.equal(payload.ok, true);
    assert.deepEqual(calls, [
      "https://client-test.myshopify.com/admin/oauth/access_token",
      "https://client-test.myshopify.com/admin/api/2026-04/shop.json"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shopify product create sends product, variant, and inventory mutations", async () => {
  const originalFetch = globalThis.fetch;
  const operations = [];

  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), "https://example.myshopify.com/admin/api/2026-04/graphql.json");
    const body = JSON.parse(options.body);
    operations.push(body);

    if (body.query.includes("ProductCreate")) {
      assert.equal(body.variables.product.title, "Lamp");
      assert.equal(body.variables.product.handle, "lamp");
      return new Response(
        JSON.stringify({
          data: {
            productCreate: {
              product: {
                id: "gid://shopify/Product/1",
                title: "Lamp",
                handle: "lamp",
                variants: {
                  nodes: [{ id: "gid://shopify/ProductVariant/2", sku: "", price: "0", inventoryItem: { id: "gid://shopify/InventoryItem/3" } }]
                }
              },
              userErrors: []
            }
          }
        }),
        { status: 200 }
      );
    }

    if (body.query.includes("ProductVariantsBulkUpdate")) {
      assert.equal(body.variables.productId, "gid://shopify/Product/1");
      assert.equal(body.variables.variants[0].price, "55");
      assert.deepEqual(body.variables.variants[0].inventoryItem, { sku: "SKU-1" });
      return new Response(JSON.stringify({ data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [] } } }), { status: 200 });
    }

    assert.equal(body.variables.input.quantities[0].quantity, 7);
    assert.equal(body.variables.input.quantities[0].locationId, "gid://shopify/Location/9");
    assert.match(body.variables.idempotencyKey, /^[0-9a-f-]{36}$/);
    assert.match(body.variables.input.referenceDocumentUri, /^staff-ims:\/\/inventory-set\//);
    assert.match(body.query, /@idempotent/);
    return new Response(
      JSON.stringify({ data: { inventorySetQuantities: { inventoryAdjustmentGroup: { createdAt: "now", reason: "correction" }, userErrors: [] } } }),
      { status: 200 }
    );
  };

  try {
    await createProduct(
      { ...config, catalog: { shopifyLocationId: "gid://shopify/Location/9" } },
      { title: "Lamp", handle: "lamp", sku: "SKU-1", price: "55", onHand: 7 }
    );
    assert.equal(operations.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shopify archive product sets status archived", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    assert.equal(body.variables.product.id, "gid://shopify/Product/1");
    assert.equal(body.variables.product.status, "ARCHIVED");
    return new Response(
      JSON.stringify({
        data: {
          productUpdate: {
            product: { id: "gid://shopify/Product/1", title: "Lamp", handle: "lamp", variants: { nodes: [] } },
            userErrors: []
          }
        }
      }),
      { status: 200 }
    );
  };

  try {
    await archiveProduct(config, "gid://shopify/Product/1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shopify product create fails clearly without a default variant", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          productCreate: {
            product: {
              id: "gid://shopify/Product/1",
              title: "Lamp",
              handle: "lamp",
              variants: { nodes: [] }
            },
            userErrors: []
          }
        }
      }),
      { status: 200 }
    );

  try {
    await assert.rejects(() => createProduct(config, { title: "Lamp", handle: "lamp", sku: "SKU-1" }), /no default variant/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shopify inventory set requires an inventory item and location", async () => {
  await assert.rejects(() => setInventoryOnHand(config, { onHand: 1 }), /inventoryItemId required/);
  await assert.rejects(() => setInventoryOnHand(config, { inventoryItemId: "gid://shopify/InventoryItem/1", onHand: 1 }), /SHOPIFY_LOCATION_ID/);
});
