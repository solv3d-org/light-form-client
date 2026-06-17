export const DEFAULT_SHOPIFY_API_VERSION = "2026-04";

const SHOPIFY_PLACEHOLDER_VALUES = new Set([
  "",
  "your-store.myshopify.com",
  "your_storefront_public_token",
  "placeholder.myshopify.com",
  "placeholder"
]);

export function normalizeStoreDomain(domain = "") {
  return String(domain)
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();
}

function readRuntimeEnv(env = {}) {
  return { ...process.env, ...env };
}

export function getRuntimeShopifyConfig(env = {}) {
  const source = readRuntimeEnv(env);
  const storeDomain = normalizeStoreDomain(
    source.PUBLIC_STORE_DOMAIN || source.SHOPIFY_STORE_DOMAIN || ""
  );
  const storefrontAccessToken =
    source.PUBLIC_STOREFRONT_API_TOKEN || source.SHOPIFY_STOREFRONT_ACCESS_TOKEN || "";
  const apiVersion = source.PUBLIC_STOREFRONT_API_VERSION || source.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION;
  const checkoutDomain = normalizeStoreDomain(source.PUBLIC_CHECKOUT_DOMAIN || storeDomain);

  return {
    storeDomain,
    storefrontAccessToken,
    apiVersion,
    checkoutDomain
  };
}

export function isShopifyConfigured(config) {
  return Boolean(
    config?.storeDomain &&
      config?.storefrontAccessToken &&
      config?.apiVersion &&
      !SHOPIFY_PLACEHOLDER_VALUES.has(config.storeDomain) &&
      !SHOPIFY_PLACEHOLDER_VALUES.has(config.storefrontAccessToken)
  );
}

export function getStaffApiBaseUrl(env = {}) {
  const source = readRuntimeEnv(env);
  return String(source.PUBLIC_STAFF_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
}

export function getHydrogenRuntime(env = {}) {
  const source = readRuntimeEnv(env);
  const shopifyConfig = getRuntimeShopifyConfig(source);
  const shopifyConfigured = isShopifyConfigured(shopifyConfig);
  const isProduction = process.env.NODE_ENV === "production";

  if (!shopifyConfigured) {
    throw new Error("PUBLIC_STORE_DOMAIN and PUBLIC_STOREFRONT_API_TOKEN are required for the Hydrogen storefront.");
  }

  if (isProduction && !source.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return {
    env: {
      ...source,
      SESSION_SECRET: source.SESSION_SECRET || "dev-session-secret",
      PUBLIC_STORE_DOMAIN: shopifyConfig.storeDomain,
      PUBLIC_STOREFRONT_API_TOKEN: shopifyConfig.storefrontAccessToken,
      PUBLIC_STOREFRONT_ID: source.PUBLIC_STOREFRONT_ID || "",
      PUBLIC_CHECKOUT_DOMAIN: shopifyConfig.checkoutDomain || shopifyConfig.storeDomain
    },
    shopifyConfig,
    shopifyConfigured,
    staffApiBaseUrl: getStaffApiBaseUrl(source)
  };
}

export function getShopifyProductUrl(handle, config) {
  if (!config?.storeDomain || !handle) return "";
  return `https://${config.storeDomain}/products/${handle}`;
}
