import { catalogMetadata as fallbackMetadata, products as fallbackProducts } from "../data/products";
import { getShopifyProductUrl, getStorefrontEndpoint, isShopifyConfigured, shopifyConfig } from "./shopifyConfig";

const PRODUCT_PAGE_SIZE = 100;
const CART_LINE_PAGE_SIZE = 100;
const FEATURED_COUNT = 12;

const MONEY_FORMATTER_CACHE = new Map();

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  vendor
  productType
  availableForSale
  featuredImage {
    url
    altText
  }
  images(first: 1) {
    nodes {
      url
      altText
    }
  }
  collections(first: 1) {
    nodes {
      title
    }
  }
  priceRange {
    minVariantPrice {
      amount
      currencyCode
    }
    maxVariantPrice {
      amount
      currencyCode
    }
  }
  variants(first: 25) {
    nodes {
      id
      title
      sku
      availableForSale
      image {
        url
        altText
      }
      price {
        amount
        currencyCode
      }
      selectedOptions {
        name
        value
      }
    }
  }
`;

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
  }
  lines(first: ${CART_LINE_PAGE_SIZE}) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          sku
          availableForSale
          image {
            url
            altText
          }
          price {
            amount
            currencyCode
          }
          product {
            id
            title
            handle
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${PRODUCT_FIELDS}
      }
    }
  }
`;

const CART_QUERY = `
  query Cart($id: ID!) {
    cart(id: $id) {
      ${CART_FIELDS}
    }
  }
`;

const CART_CREATE_MUTATION = `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        ${CART_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ${CART_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
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
  return variants.find((variant) => variant.availableForSale) || variants[0] || null;
}

export function normalizeShopifyProduct(product, index) {
  const variant = selectVariant(product);
  const image = product.featuredImage || product.images?.nodes?.[0] || variant?.image || null;
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
    featured: index < FEATURED_COUNT,
    sourceUrl: getShopifyProductUrl(product.handle),
    handle: product.handle,
    shopifyProductId: product.id,
    shopifyVariantId: variant?.id || "",
    availableForSale,
    checkoutEnabled: availableForSale && Boolean(variant?.id),
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

export function normalizeCart(cart) {
  if (!cart) return null;

  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity || 0,
    subtotalLabel: formatMoney(cart.cost?.subtotalAmount),
    totalLabel: formatMoney(cart.cost?.totalAmount),
    lines: (cart.lines?.nodes || []).map((line) => {
      const merchandise = line.merchandise || {};
      const product = merchandise.product || {};
      const image = merchandise.image || {};

      return {
        id: line.id,
        quantity: line.quantity,
        title: product.title || merchandise.title || "Product",
        variantTitle: merchandise.title === "Default Title" ? "" : merchandise.title,
        sku: merchandise.sku || "",
        productUrl: getShopifyProductUrl(product.handle),
        image: image.url || "",
        imageAlt: image.altText || product.title || merchandise.title || "Product",
        lineTotalLabel: formatMoney(line.cost?.totalAmount),
        availableForSale: Boolean(merchandise.availableForSale)
      };
    })
  };
}

export async function shopifyStorefrontRequest(query, variables = {}, config = shopifyConfig) {
  if (!isShopifyConfigured(config)) {
    throw new Error("Shopify Storefront API is not configured.");
  }

  const response = await fetch(getStorefrontEndpoint(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": config.storefrontAccessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Shopify Storefront request failed: ${response.status} ${response.statusText}`);
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data;
}

function assertNoUserErrors(container, label) {
  const userErrors = container?.userErrors || [];
  if (userErrors.length) {
    throw new Error(`${label}: ${userErrors.map((error) => error.message).join("; ")}`);
  }
}

export async function fetchShopifyCatalog(config = shopifyConfig) {
  const products = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyStorefrontRequest(PRODUCTS_QUERY, { first: PRODUCT_PAGE_SIZE, after }, config);
    const connection = data.products;
    products.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }

  const normalizedProducts = products.map(normalizeShopifyProduct);
  const now = new Date();

  return {
    products: normalizedProducts,
    catalogMetadata: {
      sourceUrl: `https://${config.storeDomain}`,
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
    }
  };
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
    }
  };
}

export async function fetchCart(cartId) {
  const data = await shopifyStorefrontRequest(CART_QUERY, { id: cartId });
  return normalizeCart(data.cart);
}

export async function createCart(variantId, quantity = 1) {
  const data = await shopifyStorefrontRequest(CART_CREATE_MUTATION, {
    input: {
      lines: [
        {
          merchandiseId: variantId,
          quantity
        }
      ]
    }
  });

  assertNoUserErrors(data.cartCreate, "Cart create failed");
  return normalizeCart(data.cartCreate.cart);
}

export async function addCartLine(cartId, variantId, quantity = 1) {
  const data = await shopifyStorefrontRequest(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: [
      {
        merchandiseId: variantId,
        quantity
      }
    ]
  });

  assertNoUserErrors(data.cartLinesAdd, "Cart update failed");
  return normalizeCart(data.cartLinesAdd.cart);
}

export async function updateCartLine(cartId, lineId, quantity) {
  const data = await shopifyStorefrontRequest(CART_LINES_UPDATE_MUTATION, {
    cartId,
    lines: [
      {
        id: lineId,
        quantity
      }
    ]
  });

  assertNoUserErrors(data.cartLinesUpdate, "Cart line update failed");
  return normalizeCart(data.cartLinesUpdate.cart);
}

export async function removeCartLine(cartId, lineId) {
  const data = await shopifyStorefrontRequest(CART_LINES_REMOVE_MUTATION, {
    cartId,
    lineIds: [lineId]
  });

  assertNoUserErrors(data.cartLinesRemove, "Cart line removal failed");
  return normalizeCart(data.cartLinesRemove.cart);
}
