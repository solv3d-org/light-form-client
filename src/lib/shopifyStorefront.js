import { getSelectedProductOptions } from "@shopify/hydrogen";
import { catalogMetadata as fallbackMetadata, products as fallbackProducts } from "../data/products";
import { getShopifyProductUrl } from "./shopifyConfig";

const PRODUCT_PAGE_SIZE = 100;
const FEATURED_COUNT = 12;
const MONEY_FORMATTER_CACHE = new Map();

const MONEY_FRAGMENT = `#graphql
  fragment MoneyFields on MoneyV2 {
    amount
    currencyCode
  }
`;

const IMAGE_FRAGMENT = `#graphql
  fragment ImageFields on Image {
    id
    url
    altText
    width
    height
  }
`;

const PRODUCT_CARD_FRAGMENT = `#graphql
  fragment ProductCardFields on Product {
    id
    title
    handle
    description
    vendor
    productType
    availableForSale
    featuredImage {
      ...ImageFields
    }
    images(first: 1) {
      nodes {
        ...ImageFields
      }
    }
    collections(first: 1) {
      nodes {
        title
      }
    }
    priceRange {
      minVariantPrice {
        ...MoneyFields
      }
      maxVariantPrice {
        ...MoneyFields
      }
    }
    compareAtPriceRange {
      minVariantPrice {
        ...MoneyFields
      }
      maxVariantPrice {
        ...MoneyFields
      }
    }
    variants(first: 25) {
      nodes {
        id
        title
        sku
        availableForSale
        image {
          ...ImageFields
        }
        price {
          ...MoneyFields
        }
        compareAtPrice {
          ...MoneyFields
        }
        selectedOptions {
          name
          value
        }
      }
    }
  }
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
`;

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariantFields on ProductVariant {
    id
    title
    sku
    availableForSale
    image {
      ...ImageFields
    }
    price {
      ...MoneyFields
    }
    compareAtPrice {
      ...MoneyFields
    }
    selectedOptions {
      name
      value
    }
    product {
      id
      title
      handle
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!, $after: String, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    products(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...ProductCardFields
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
`;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      vendor
      handle
      description
      descriptionHtml
      productType
      availableForSale
      encodedVariantExistence
      encodedVariantAvailability
      featuredImage {
        ...ImageFields
      }
      images(first: 10) {
        nodes {
          ...ImageFields
        }
      }
      collections(first: 1) {
        nodes {
          title
        }
      }
      priceRange {
        minVariantPrice {
          ...MoneyFields
        }
        maxVariantPrice {
          ...MoneyFields
        }
      }
      compareAtPriceRange {
        minVariantPrice {
          ...MoneyFields
        }
        maxVariantPrice {
          ...MoneyFields
        }
      }
      options {
        name
        optionValues {
          name
          firstSelectableVariant {
            ...ProductVariantFields
          }
          swatch {
            color
            image {
              previewImage {
                url
              }
            }
          }
        }
      }
      selectedOrFirstAvailableVariant(
        selectedOptions: $selectedOptions
        ignoreUnknownOptions: true
        caseInsensitiveMatch: true
      ) {
        ...ProductVariantFields
      }
      adjacentVariants(selectedOptions: $selectedOptions) {
        ...ProductVariantFields
      }
      variants(first: 50) {
        nodes {
          ...ProductVariantFields
        }
      }
      seo {
        description
        title
      }
    }
  }
  ${MONEY_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${PRODUCT_VARIANT_FRAGMENT}
`;

export function formatMoney(money) {
  if (!money || money.amount == null || !money.currencyCode) return "Price on request";

  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return "Price on request";

  const cacheKey = `en-SG:${money.currencyCode}`;
  const formatter =
    MONEY_FORMATTER_CACHE.get(cacheKey) ||
    new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: money.currencyCode
    });

  MONEY_FORMATTER_CACHE.set(cacheKey, formatter);
  return formatter.format(amount);
}

export function formatPriceRange(priceRange) {
  const min = priceRange?.minVariantPrice;
  const max = priceRange?.maxVariantPrice;
  if (!min || !max) return "Price on request";
  if (min.amount === max.amount && min.currencyCode === max.currencyCode) return formatMoney(min);
  return `${formatMoney(min)} - ${formatMoney(max)}`;
}

function selectVariant(product) {
  const variants = product.variants?.nodes || [];
  return product.selectedOrFirstAvailableVariant || variants.find((variant) => variant.availableForSale) || variants[0] || null;
}

function selectImage(product, variant) {
  return variant?.image || product.featuredImage || product.images?.nodes?.[0] || null;
}

export function normalizeShopifyProduct(product, index = 0, config, variantOverride) {
  const variant = variantOverride || selectVariant(product);
  const image = selectImage(product, variant);
  const category = product.productType || product.collections?.nodes?.[0]?.title || "Lighting";
  const availableForSale = Boolean(product.availableForSale && variant?.availableForSale);

  return {
    id: product.id,
    title: product.title,
    model: variant?.sku || product.handle,
    category,
    priceLabel: formatPriceRange(product.priceRange),
    image: image?.url || "",
    imageAlt: image?.altText || product.title,
    imageData: image ? { ...image, altText: image.altText || product.title } : null,
    featured: index < FEATURED_COUNT,
    sourceUrl: getShopifyProductUrl(product.handle, config),
    handle: product.handle,
    shopifyProductId: product.id,
    shopifyVariantId: variant?.id || "",
    availableForSale,
    checkoutEnabled: availableForSale && Boolean(variant?.id),
    priceRange: product.priceRange,
    compareAtPriceRange: product.compareAtPriceRange,
    price: variant?.price || null,
    compareAtPrice: variant?.compareAtPrice || null,
    selectedVariant: variant,
    dataSource: "shopify"
  };
}

function getFallbackHandle(product) {
  if (product.handle) return product.handle;

  try {
    const pathname = new URL(product.sourceUrl).pathname;
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || product.id;
  } catch {
    return product.id;
  }
}

export function getFallbackCatalog() {
  return {
    products: fallbackProducts.map((product) => ({
      ...product,
      handle: getFallbackHandle(product),
      availableForSale: false,
      checkoutEnabled: false,
      dataSource: "fallback"
    })),
    catalogMetadata: {
      ...fallbackMetadata,
      sourceLabel: "Preview catalog",
      mode: "fallback"
    },
    catalogStatus: "fallback"
  };
}

export async function loadCatalog(context) {
  if (!context.shopifyConfigured) return getFallbackCatalog();

  const products = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await context.storefront.query(PRODUCTS_QUERY, {
      cache: context.storefront.CacheShort(),
      variables: { first: PRODUCT_PAGE_SIZE, after }
    });
    const connection = data.products;
    products.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }

  const normalizedProducts = products.map((product, index) =>
    normalizeShopifyProduct(product, index, context.shopifyConfig)
  );
  const now = new Date();

  return {
    products: normalizedProducts,
    catalogMetadata: {
      sourceUrl: `https://${context.shopifyConfig.storeDomain}`,
      sourceLabel: "Shopify catalog",
      mode: "shopify",
      syncedAt: now.toISOString(),
      syncedLabel: new Intl.DateTimeFormat("en-SG", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Singapore"
      }).format(now),
      productCount: normalizedProducts.length,
      featuredCount: Math.min(FEATURED_COUNT, normalizedProducts.length)
    },
    catalogStatus: "ready"
  };
}

export async function loadProduct(context, handle, request) {
  if (!context.shopifyConfigured) {
    const catalog = getFallbackCatalog();
    const product = catalog.products.find((item) => item.handle === handle || item.id === handle);
    if (!product) throw new Response(null, { status: 404 });
    return {
      title: product.title,
      product,
      shopifyProduct: null,
      storeDomain: "",
      shopifyConfigured: false
    };
  }

  const data = await context.storefront.query(PRODUCT_QUERY, {
    cache: context.storefront.CacheShort(),
    variables: {
      handle,
      selectedOptions: getSelectedProductOptions(request)
    }
  });
  const product = data.product;
  if (!product?.id) throw new Response(null, { status: 404 });

  return {
    title: product.seo?.title || product.title,
    product: normalizeShopifyProduct(product, 0, context.shopifyConfig, product.selectedOrFirstAvailableVariant),
    shopifyProduct: product,
    storeDomain: context.shopifyConfig.storeDomain,
    shopifyConfigured: true
  };
}
