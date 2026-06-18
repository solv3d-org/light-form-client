import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { processShopifyWebhook } from "../src/shopifyWebhooks.js";

function hmac(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

function testStore() {
  const events = new Map();
  return {
    inventoryCalls: [],
    audits: [],
    async recordWebhookEvent(event) {
      if (events.has(event.webhookId)) return { duplicate: true, event: events.get(event.webhookId) };
      const record = { ...event, status: "received" };
      events.set(event.webhookId, record);
      return { duplicate: false, event: record };
    },
    async updateWebhookEvent(webhookId, patch) {
      const next = { ...events.get(webhookId), ...patch };
      events.set(webhookId, next);
      return next;
    },
    async updateShopifyInventoryItem(id, patch) {
      this.inventoryCalls.push({ id, patch });
      return 1;
    },
    async listOrders() {
      return [];
    },
    async appendAudit(action, actor, details) {
      this.audits.push({ action, actor, details });
    }
  };
}

test("Shopify webhook verifies HMAC, records, and patches inventory cache", async () => {
  const secret = "test_secret";
  const rawBody = Buffer.from(JSON.stringify({ inventory_item_id: 123, available: 7 }));
  const store = testStore();

  const result = await processShopifyWebhook({
    config: { shopify: { webhookSecret: secret } },
    store,
    rawBody,
    headers: {
      "x-shopify-hmac-sha256": hmac(secret, rawBody),
      "x-shopify-topic": "inventory_levels/update",
      "x-shopify-webhook-id": "hook-1",
      "x-shopify-shop-domain": "example.myshopify.com"
    }
  });

  assert.equal(result.duplicate, false);
  assert.equal(store.inventoryCalls[0].id, "gid://shopify/InventoryItem/123");
  assert.equal(store.inventoryCalls[0].patch.available, 7);
  assert.equal(store.audits[0].action, "shopify.webhook");
});

test("Shopify webhook rejects invalid HMAC before recording", async () => {
  await assert.rejects(
    () =>
      processShopifyWebhook({
        config: { shopify: { webhookSecret: "test_secret" } },
        store: testStore(),
        rawBody: Buffer.from("{}"),
        headers: {
          "x-shopify-hmac-sha256": hmac("wrong", Buffer.from("{}")),
          "x-shopify-topic": "inventory_levels/update",
          "x-shopify-webhook-id": "hook-1"
        }
      }),
    /Invalid Shopify webhook HMAC/
  );
});

test("Shopify webhook duplicates return success without reprocessing", async () => {
  const secret = "test_secret";
  const rawBody = Buffer.from(JSON.stringify({ inventory_item_id: 123, available: 7 }));
  const store = testStore();
  const headers = {
    "x-shopify-hmac-sha256": hmac(secret, rawBody),
    "x-shopify-topic": "inventory_levels/update",
    "x-shopify-webhook-id": "hook-1"
  };

  await processShopifyWebhook({ config: { shopify: { webhookSecret: secret } }, store, rawBody, headers });
  const duplicate = await processShopifyWebhook({ config: { shopify: { webhookSecret: secret } }, store, rawBody, headers });

  assert.equal(duplicate.duplicate, true);
  assert.equal(store.inventoryCalls.length, 1);
});
