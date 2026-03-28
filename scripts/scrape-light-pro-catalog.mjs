import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_ENDPOINT = "https://light-pro.com/wp-json/wc/store/v1/products";
const OUTPUT_RELATIVE_PATH = "../src/data/lightProCatalog.js";
const ASSET_OUTPUT_DIRECTORY = "../public/light-pro-catalog";
const ASSET_PUBLIC_PATH = "/light-pro-catalog";
const PAGE_SIZE = 100;
const FEATURED_COUNT = 12;
const IMAGE_DOWNLOAD_CONCURRENCY = 8;
const SOURCE_SITE = "https://light-pro.com/shop/";
const SINGAPORE_TIMEZONE = "Asia/Singapore";
const KNOWN_FIELDS = [
  "Model",
  "Description",
  "Dimension (mm)",
  "Color",
  "Lamp Included",
  "Lamp",
  "Material",
  "Mounting Type",
  "Optional Accessory"
];

if (typeof fetch !== "function") {
  throw new Error("This script requires a Node.js runtime with global fetch support.");
}

async function fetchCatalogPage(pageNumber) {
  const requestUrl = new URL(CATALOG_ENDPOINT);
  requestUrl.searchParams.set("per_page", String(PAGE_SIZE));
  requestUrl.searchParams.set("page", String(pageNumber));
  requestUrl.searchParams.set("orderby", "date");
  requestUrl.searchParams.set("order", "desc");

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "light-form-catalog-sync/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed for page ${pageNumber}: ${response.status} ${response.statusText}`);
  }

  const totalPages = Number(response.headers.get("x-wp-totalpages") || "1");
  const totalProducts = Number(response.headers.get("x-wp-total") || "0");
  const items = await response.json();

  return { items, totalPages, totalProducts };
}

async function fetchAllProducts() {
  const firstPage = await fetchCatalogPage(1);
  const remainingPages = Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) => index + 2);

  const subsequentResults = await Promise.all(remainingPages.map((pageNumber) => fetchCatalogPage(pageNumber)));
  const products = [firstPage, ...subsequentResults].flatMap((page) => page.items);

  return { products, totalProducts: firstPage.totalProducts };
}

async function fetchBinary(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/*",
      "User-Agent": "light-form-catalog-sync/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Image request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return {
    contentType: response.headers.get("content-type") || "",
    buffer: Buffer.from(await response.arrayBuffer())
  };
}

function stripHtml(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(text = "") {
  const namedEntities = {
    amp: "&",
    apos: "'",
    nbsp: " ",
    quot: "\"",
    lt: "<",
    gt: ">",
    ndash: "-",
    mdash: "-",
    hellip: "...",
    ldquo: "\"",
    rdquo: "\"",
    lsquo: "'",
    rsquo: "'",
    trade: "TM",
    reg: "(R)",
    copy: "(C)",
    times: "x"
  };

  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name.toLowerCase()] ?? entity);
}

function cleanText(text = "") {
  return decodeHtmlEntities(stripHtml(text))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function extractFields(shortDescription = "") {
  const flattened = decodeHtmlEntities(stripHtml(shortDescription))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!flattened) {
    return {};
  }

  const fieldPattern = new RegExp(`(?:^|\\n)(${KNOWN_FIELDS.map(escapeForRegex).join("|")}):\\s*`, "g");
  const matches = Array.from(flattened.matchAll(fieldPattern));
  const fields = {};

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : flattened.length;
    fields[match[1]] = flattened
      .slice(start, end)
      .replace(/\s+/g, " ")
      .trim();
  });

  return fields;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatPrice(prices) {
  if (!prices) {
    return "Price on request";
  }

  const formatter = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: prices.currency_code || "SGD"
  });

  const divisor = 10 ** (prices.currency_minor_unit ?? 2);
  const minAmount = Number(prices.price_range?.min_amount ?? prices.price ?? 0) / divisor;
  const maxAmount = Number(prices.price_range?.max_amount ?? prices.price ?? 0) / divisor;

  if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount)) {
    return "Price on request";
  }

  return minAmount === maxAmount
    ? formatter.format(minAmount)
    : `${formatter.format(minAmount)} - ${formatter.format(maxAmount)}`;
}

function selectImage(images = []) {
  return images[0]?.thumbnail || images[0]?.src || "";
}

function getImageExtension(imageUrl, contentType = "") {
  const pathname = new URL(imageUrl).pathname;
  const rawExtension = path.extname(pathname).toLowerCase();
  const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);

  if (supportedExtensions.has(rawExtension)) {
    return rawExtension;
  }

  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("avif")) return ".avif";
  if (contentType.includes("svg")) return ".svg";
  return ".jpg";
}

async function downloadCatalogImage(imageUrl, productId, assetDirectoryPath) {
  if (!imageUrl) {
    return "";
  }

  try {
    const { buffer, contentType } = await fetchBinary(imageUrl);
    const extension = getImageExtension(imageUrl, contentType);
    const filename = `${productId}${extension}`;
    const absoluteFilePath = path.join(assetDirectoryPath, filename);

    await writeFile(absoluteFilePath, buffer);

    return `${ASSET_PUBLIC_PATH}/${filename}`;
  } catch (error) {
    console.warn(`Falling back to remote image for product ${productId}:`, error.message);
    return imageUrl;
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function normalizeProduct(product, index, assetDirectoryPath) {
  const fields = extractFields(product.short_description);
  const title = cleanText(product.name) || fields.Model || `Light-Pro product ${product.id}`;
  const model = cleanText(fields.Model || product.slug || String(product.id));
  const category = cleanText(product.categories?.[0]?.name || "Lighting");
  const localImagePath = await downloadCatalogImage(selectImage(product.images), product.id, assetDirectoryPath);

  return {
    id: String(product.id),
    title,
    model,
    category,
    priceLabel: formatPrice(product.prices),
    image: localImagePath,
    featured: index < FEATURED_COUNT,
    sourceUrl: product.permalink
  };
}

function buildCatalogModule(products, totalProducts) {
  const now = new Date();
  const metadata = {
    sourceUrl: SOURCE_SITE,
    syncedAt: now.toISOString(),
    syncedLabel: new Intl.DateTimeFormat("en-SG", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: SINGAPORE_TIMEZONE
    }).format(now),
    productCount: totalProducts || products.length,
    featuredCount: Math.min(FEATURED_COUNT, products.length)
  };

  return `// Generated by scripts/scrape-light-pro-catalog.mjs. Do not edit manually.
export const catalogMetadata = ${JSON.stringify(metadata, null, 2)};

export const products = ${JSON.stringify(products, null, 2)};
`;
}

async function main() {
  const { products: rawProducts, totalProducts } = await fetchAllProducts();
  const outputDirectory = path.dirname(fileURLToPath(new URL(OUTPUT_RELATIVE_PATH, import.meta.url)));
  const outputFile = fileURLToPath(new URL(OUTPUT_RELATIVE_PATH, import.meta.url));
  const assetDirectoryPath = fileURLToPath(new URL(ASSET_OUTPUT_DIRECTORY, import.meta.url));

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(assetDirectoryPath, { recursive: true });

  const normalizedProducts = await mapWithConcurrency(rawProducts, IMAGE_DOWNLOAD_CONCURRENCY, (product, index) =>
    normalizeProduct(product, index, assetDirectoryPath)
  );
  const moduleContents = buildCatalogModule(normalizedProducts, totalProducts);

  await writeFile(outputFile, moduleContents, "utf8");

  console.log(`Synced ${normalizedProducts.length} products from ${SOURCE_SITE}`);
  console.log(`Downloaded ${normalizedProducts.filter((product) => product.image.startsWith(ASSET_PUBLIC_PATH)).length} images`);
  console.log(`Generated ${path.relative(process.cwd(), outputFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
