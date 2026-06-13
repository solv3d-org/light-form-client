export const DEFAULT_SHOPIFY_API_VERSION = "2026-04";

const SHOPIFY_PLACEHOLDER_VALUES = new Set(["your-store.myshopify.com", "your_storefront_public_token"]);

export const shopifyConfig = {
  storeDomain: normalizeStoreDomain(import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || ""),
  storefrontAccessToken: import.meta.env.VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN || "",
  apiVersion: import.meta.env.VITE_SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION
};

export function normalizeStoreDomain(domain) {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function isShopifyConfigured(config = shopifyConfig) {
  return Boolean(
    config.storeDomain &&
      config.storefrontAccessToken &&
      config.apiVersion &&
      !SHOPIFY_PLACEHOLDER_VALUES.has(config.storeDomain) &&
      !SHOPIFY_PLACEHOLDER_VALUES.has(config.storefrontAccessToken)
  );
}

export function getStorefrontEndpoint(config = shopifyConfig) {
  if (!isShopifyConfigured(config)) return "";
  return `https://${config.storeDomain}/api/${config.apiVersion}/graphql.json`;
}

export function getShopifyProductUrl(handle, config = shopifyConfig) {
  if (!config.storeDomain || !handle) return "";
  return `https://${config.storeDomain}/products/${handle}`;
}
