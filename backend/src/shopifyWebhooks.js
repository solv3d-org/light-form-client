import crypto from "node:crypto";
import { HttpError } from "./http.js";
import { fetchProductCatalogRecords } from "./shopifyAdmin.js";

const PRODUCT_REFRESH_TOPICS = new Set(["products/create", "products/update"]);
const PRODUCT_DELETE_TOPICS = new Set(["products/delete"]);
const INVENTORY_TOPICS = new Set(["inventory_levels/update"]);
const ORDER_TOPICS = new Set(["orders/create", "orders/updated", "orders/cancelled", "orders/paid", "orders/fulfilled"]);

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "", "base64");
  const rightBuffer = Buffer.from(right || "", "base64");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyShopifyWebhook(config, rawBody, hmacHeader) {
  const secret = config.shopify.webhookSecret || config.shopify.clientSecret;
  if (!secret) throw new HttpError(500, "SHOPIFY_WEBHOOK_SECRET or SHOPIFY_CLIENT_SECRET is required.");
  if (!hmacHeader) throw new HttpError(401, "Missing Shopify webhook HMAC.");
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  if (!timingSafeEqual(digest, hmacHeader)) throw new HttpError(401, "Invalid Shopify webhook HMAC.");
}

function productGid(id) {
  const match = String(id || "").match(/(\d+)$/);
  return match ? `gid://shopify/Product/${match[1]}` : String(id || "");
}

function inventoryItemGid(id) {
  const match = String(id || "").match(/(\d+)$/);
  return match ? `gid://shopify/InventoryItem/${match[1]}` : String(id || "");
}

function matchingOrderId(order, payloadId) {
  const value = String(payloadId || "");
  return order.shopifyOrderId && (order.shopifyOrderId === value || order.shopifyOrderId.endsWith(`/${value}`));
}

async function processProductWebhook({ config, store, payload, topic }) {
  if (PRODUCT_REFRESH_TOPICS.has(topic)) {
    const records = await fetchProductCatalogRecords(config, productGid(payload.admin_graphql_api_id || payload.id));
    return { cacheRows: await store.upsertShopifyCatalog(records) };
  }
  if (PRODUCT_DELETE_TOPICS.has(topic)) {
    return { deletedRows: await store.deleteShopifyCatalogProduct(productGid(payload.admin_graphql_api_id || payload.id)) };
  }
  return {};
}

async function processInventoryWebhook({ store, payload }) {
  const inventoryItemId = inventoryItemGid(payload.inventory_item_id);
  return {
    cacheRows: await store.updateShopifyInventoryItem(inventoryItemId, {
      available: Number(payload.available ?? 0),
      onHand: Number(payload.available ?? 0)
    })
  };
}

async function processOrderWebhook({ store, payload, topic }) {
  const orders = await store.listOrders();
  const match = orders.find((order) => matchingOrderId(order, payload.admin_graphql_api_id || payload.id));
  if (!match) return { matched: false };

  const patch = {
    shopifyOrderId: String(payload.admin_graphql_api_id || payload.id),
    updatedAt: new Date().toISOString()
  };
  if (topic === "orders/cancelled") {
    patch.status = "canceled";
    patch.canceledAt = payload.cancelled_at || new Date().toISOString();
  }
  if (topic === "orders/fulfilled") patch.completedAt = payload.updated_at || new Date().toISOString();
  if (topic === "orders/paid") patch.status = "completed";
  return { matched: true, order: await store.updateOrder(match.id, patch, null) };
}

export async function processShopifyWebhook({ config, store, headers, rawBody }) {
  verifyShopifyWebhook(config, rawBody, headers["x-shopify-hmac-sha256"]);
  const topic = String(headers["x-shopify-topic"] || "").toLowerCase();
  const webhookId = String(headers["x-shopify-webhook-id"] || "");
  if (!topic) throw new HttpError(400, "Missing Shopify webhook topic.");
  if (!webhookId) throw new HttpError(400, "Missing Shopify webhook id.");

  const payload = JSON.parse(rawBody.toString("utf8") || "{}");
  const recorded = await store.recordWebhookEvent({
    webhookId,
    eventId: String(headers["x-shopify-event-id"] || ""),
    topic,
    shopDomain: String(headers["x-shopify-shop-domain"] || ""),
    apiVersion: String(headers["x-shopify-api-version"] || ""),
    payload
  });
  if (recorded.duplicate) return { duplicate: true, topic };

  try {
    let result = {};
    if (PRODUCT_REFRESH_TOPICS.has(topic) || PRODUCT_DELETE_TOPICS.has(topic)) {
      result = await processProductWebhook({ config, store, payload, topic });
    } else if (INVENTORY_TOPICS.has(topic)) {
      result = await processInventoryWebhook({ store, payload });
    } else if (ORDER_TOPICS.has(topic)) {
      result = await processOrderWebhook({ store, payload, topic });
    }
    await store.updateWebhookEvent(webhookId, { status: "processed", processedAt: new Date().toISOString() });
    await store.appendAudit("shopify.webhook", null, { topic, webhookId, result });
    return { duplicate: false, topic, result };
  } catch (error) {
    await store.updateWebhookEvent(webhookId, {
      status: "failed",
      error: error.message,
      processedAt: new Date().toISOString()
    });
    throw error;
  }
}
