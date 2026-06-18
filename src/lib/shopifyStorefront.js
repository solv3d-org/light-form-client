import { getPaginationVariables, getSelectedProductOptions } from "@shopify/hydrogen";
import { getShopifyProductUrl } from "./shopifyConfig";

const SHOP_PAGE_SIZE = 24;
const HOME_PRODUCT_LIMIT = 100;
const CATALOG_PRODUCT_LIMIT = 100;
const FEATURED_COUNT = 12;
const MONEY_FORMATTER_CACHE = new Map();
const DEFAULT_COLLECTION_HANDLE = "all";

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

const SHOP_SORT_OPTIONS = new Set(["CREATED", "TITLE", "PRICE", "BEST_SELLING"]);

const PRODUCTS_QUERY = `#graphql
  query Products(
    $after: String
    $country: CountryCode
    $first: Int!
    $language: LanguageCode
    $query: String
    $reverse: Boolean!
    $sortKey: ProductSortKeys!
  )
  @inContext(country: $country, language: $language) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
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

const COLLECTION_PRODUCTS_QUERY = `#graphql
  query CollectionProducts(
    $country: CountryCode
    $endCursor: String
    $filters: [ProductFilter!]
    $first: Int
    $handle: String!
    $language: LanguageCode
    $last: Int
    $reverse: Boolean!
    $sortKey: ProductCollectionSortKeys!
    $startCursor: String
  )
  @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      title
      handle
      products(
        first: $first
        last: $last
        before: $startCursor
        after: $endCursor
        filters: $filters
        sortKey: $sortKey
        reverse: $reverse
      ) {
        filters {
          id
          label
          type
          values {
            id
            label
            count
            input
          }
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          startCursor
          endCursor
        }
        nodes {
          ...ProductCardFields
        }
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

function parseFilterInput(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanSearchParams(searchParams) {
  const params = new URLSearchParams(searchParams);
  params.delete("cursor");
  params.delete("direction");
  params.delete("index");
  return params.toString();
}

function readShopFilters(request) {
  if (!request) {
    return {
      search: "",
      availability: "all",
      sort: "newest",
      query: "",
      productFilters: [],
      selectedFilterInputs: [],
      priceMin: "",
      priceMax: "",
      sortKey: "CREATED_AT",
      collectionSortKey: "CREATED",
      reverse: true,
      baseQueryString: ""
    };
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get("q") || "").trim();
  const availability = url.searchParams.get("availability") || "all";
  const sort = url.searchParams.get("sort") || "newest";
  const priceMin = (url.searchParams.get("price_min") || "").trim();
  const priceMax = (url.searchParams.get("price_max") || "").trim();
  const selectedFilterInputs = url.searchParams.getAll("filter").map((value) => value.trim()).filter(Boolean);
  const productFilters = selectedFilterInputs.map(parseFilterInput).filter(Boolean);
  if (availability === "available") productFilters.push({ available: true });
  if (availability === "sold-out") productFilters.push({ available: false });
  const price = {};
  if (priceMin && Number.isFinite(Number(priceMin))) price.min = Number(priceMin);
  if (priceMax && Number.isFinite(Number(priceMax))) price.max = Number(priceMax);
  if (price.min != null || price.max != null) productFilters.push({ price });

  const queryTerms = [];
  if (search) queryTerms.push(search);
  if (availability === "available") queryTerms.push("available_for_sale:true");
  if (availability === "sold-out") queryTerms.push("available_for_sale:false");

  const sortMap = {
    newest: { sortKey: "CREATED_AT", collectionSortKey: "CREATED", reverse: true },
    "title-asc": { sortKey: "TITLE", reverse: false },
    "price-asc": { sortKey: "PRICE", reverse: false },
    "price-desc": { sortKey: "PRICE", reverse: true },
    "best-selling": { sortKey: "BEST_SELLING", reverse: false }
  };
  const sortConfig = sortMap[sort] || sortMap.newest;
  const collectionSortKey = SHOP_SORT_OPTIONS.has(sortConfig.collectionSortKey || sortConfig.sortKey)
    ? sortConfig.collectionSortKey || sortConfig.sortKey
    : "CREATED";

  return {
    search,
    availability,
    sort,
    query: queryTerms.join(" "),
    productFilters,
    selectedFilterInputs,
    priceMin,
    priceMax,
    sortKey: sortConfig.sortKey,
    collectionSortKey,
    reverse: sortConfig.reverse,
    baseQueryString: cleanSearchParams(url.searchParams)
  };
}

function collectionHandle(context) {
  return context.env?.PUBLIC_SHOP_COLLECTION_HANDLE || DEFAULT_COLLECTION_HANDLE;
}

function normalizeProductConnection(connection, context) {
  const products = connection?.nodes || [];
  return {
    connection: {
      ...connection,
      nodes: products.map((product, index) => normalizeShopifyProduct(product, index, context.shopifyConfig))
    },
    products: products.map((product, index) => normalizeShopifyProduct(product, index, context.shopifyConfig))
  };
}

export async function loadShopCatalog(context, request) {
  const filters = readShopFilters(request);
  const paginationVariables = getPaginationVariables(request, { pageBy: SHOP_PAGE_SIZE });
  const handle = collectionHandle(context);
  const data = await context.storefront.query(COLLECTION_PRODUCTS_QUERY, {
    cache: context.storefront.CacheShort(),
    variables: {
      ...paginationVariables,
      handle,
      filters: filters.productFilters,
      sortKey: filters.collectionSortKey,
      reverse: filters.reverse
    }
  });
  if (!data.collection) throw new Response(`Shop collection not found: ${handle}`, { status: 404 });

  const normalized = normalizeProductConnection(data.collection.products, context);
  const now = new Date();
  return {
    products: normalized.products,
    productConnection: normalized.connection,
    availableFilters: data.collection.products.filters || [],
    catalogMetadata: {
      sourceUrl: `https://${context.shopifyConfig.storeDomain}/collections/${data.collection.handle}`,
      sourceLabel: data.collection.title || "Shopify collection",
      mode: "shopify-collection",
      collection: { id: data.collection.id, handle: data.collection.handle, title: data.collection.title },
      filters,
      syncedAt: now.toISOString(),
      syncedLabel: new Intl.DateTimeFormat("en-SG", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Singapore"
      }).format(now),
      productCount: normalized.products.length,
      featuredCount: Math.min(FEATURED_COUNT, normalized.products.length)
    },
    catalogStatus: "ready"
  };
}

export async function loadCatalog(context, request) {
  const filters = readShopFilters(request);
  const products = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage && products.length < HOME_PRODUCT_LIMIT) {
    const first = Math.min(CATALOG_PRODUCT_LIMIT, HOME_PRODUCT_LIMIT - products.length);
    const data = await context.storefront.query(PRODUCTS_QUERY, {
      cache: context.storefront.CacheShort(),
      variables: {
        first,
        after,
        query: filters.query || null,
        sortKey: filters.sortKey,
        reverse: filters.reverse
      }
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
      filters,
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
