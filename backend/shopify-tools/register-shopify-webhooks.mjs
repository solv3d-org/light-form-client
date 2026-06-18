import { getConfig } from "../src/config.js";
import { registerWebhookSubscriptions } from "../src/shopifyAdmin.js";

const DEFAULT_TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_PAID",
  "ORDERS_FULFILLED"
];

try {
  const config = getConfig();
  if (!config.shopify.webhookPublicBaseUrl) throw new Error("WEBHOOK_PUBLIC_BASE_URL is required.");
  const callbackUrl = `${config.shopify.webhookPublicBaseUrl}/webhooks/shopify`;
  const topics = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TOPICS;
  const subscriptions = await registerWebhookSubscriptions(config, topics, callbackUrl);
  console.log(JSON.stringify({ ok: true, callbackUrl, subscriptions }, null, 2));
} catch (error) {
  console.error(`webhook registration failed: ${error.message}`);
  process.exit(1);
}
