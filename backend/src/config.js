import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_SHOPIFY_API_VERSION = "2026-04";
export const DEFAULT_STAFF_CATALOG_SOURCE = "csv";
export const STAFF_CATALOG_SOURCES = new Set(["csv", "shopify"]);

const PLACEHOLDER_VALUES = new Set([
  "your-store.myshopify.com",
  "shpat_your_admin_token",
  "your_dev_dashboard_client_id",
  "your_dev_dashboard_client_secret",
  "replace_with_at_least_32_chars"
]);

function unquote(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadEnv(cwd = process.cwd()) {
  for (const filename of [".env", ".env.local"]) {
    const filePath = path.join(cwd, filename);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] != null) continue;
      process.env[match[1]] = unquote(match[2]);
    }
  }
}

export function normalizeStoreDomain(domain) {
  return String(domain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function getConfig(cwd = process.cwd()) {
  loadEnv(cwd);

  const staffCatalogSource = process.env.STAFF_CATALOG_SOURCE || DEFAULT_STAFF_CATALOG_SOURCE;

  return {
    cwd,
    port: Number(process.env.PORT || 8787),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173",
    dataDir: process.env.DATA_DIR || path.join(cwd, "data"),
    catalog: {
      source: staffCatalogSource,
      productsCsvBaseline:
        process.env.STAFF_PRODUCTS_CSV_BASELINE ||
        path.join(cwd, "shopify-data", "file_items_shopify_product_preserved_13_june_2026.csv"),
      inventoryCsvBaseline:
        process.env.STAFF_INVENTORY_CSV_BASELINE ||
        path.join(cwd, "shopify-data", "file_items_shopify_inventory_preserved_13_june_2026.csv"),
      productsCsvWorking: process.env.STAFF_PRODUCTS_CSV_WORKING || path.join(cwd, "data", "local-shopify-products.csv"),
      inventoryCsvWorking: process.env.STAFF_INVENTORY_CSV_WORKING || path.join(cwd, "data", "local-shopify-inventory.csv"),
      shopifyLocationId: process.env.SHOPIFY_LOCATION_ID || ""
    },
    shopify: {
      storeDomain: normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN || ""),
      adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "",
      clientId: process.env.SHOPIFY_CLIENT_ID || "",
      clientSecret: process.env.SHOPIFY_CLIENT_SECRET || "",
      apiVersion: process.env.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION
    },
    auth: {
      jwtSecret: process.env.STAFF_JWT_SECRET || "",
      sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 28800)
    },
    bootstrapAdmin: {
      email: process.env.BOOTSTRAP_ADMIN_EMAIL || "",
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
      name: process.env.BOOTSTRAP_ADMIN_NAME || "Admin"
    }
  };
}

export function isShopifyAdminConfigured(config) {
  const shopify = config.shopify || config;
  const hasAdminToken = shopify.adminAccessToken && !PLACEHOLDER_VALUES.has(shopify.adminAccessToken);
  const hasClientCredentials =
    shopify.clientId &&
    shopify.clientSecret &&
    !PLACEHOLDER_VALUES.has(shopify.clientId) &&
    !PLACEHOLDER_VALUES.has(shopify.clientSecret);
  return Boolean(
    shopify.storeDomain &&
      shopify.apiVersion &&
      !PLACEHOLDER_VALUES.has(shopify.storeDomain) &&
      (hasAdminToken || hasClientCredentials)
  );
}

export function assertRuntimeConfig(config) {
  const missing = [];

  if (!Number.isFinite(config.port) || config.port <= 0) missing.push("PORT");
  if (!STAFF_CATALOG_SOURCES.has(config.catalog?.source)) missing.push("STAFF_CATALOG_SOURCE");
  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32 || PLACEHOLDER_VALUES.has(config.auth.jwtSecret)) {
    missing.push("STAFF_JWT_SECRET");
  }
  if (config.catalog?.source === "shopify" && !isShopifyAdminConfigured(config)) {
    missing.push("SHOPIFY_STORE_DOMAIN/SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET/SHOPIFY_API_VERSION");
  }
  if (config.catalog?.source === "shopify" && !config.catalog?.shopifyLocationId) {
    missing.push("SHOPIFY_LOCATION_ID");
  }

  if (missing.length) {
    throw new Error(`Missing backend config: ${missing.join(", ")}`);
  }
}
