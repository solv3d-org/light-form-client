import test from "node:test";
import assert from "node:assert/strict";
import { createDraftOrder, shopifyAdminRest } from "../src/shopifyAdmin.js";

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
