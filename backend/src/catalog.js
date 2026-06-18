import { copyFile, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { HttpError } from "./http.js";
import {
  archiveProduct,
  completeDraftOrder,
  createDraftOrder,
  createProduct,
  deleteDraftOrder,
  getDraftOrder,
  searchInventory,
  sendDraftOrderInvoice,
  setInventoryOnHand,
  updateProduct
} from "./shopifyAdmin.js";

const MAX_SEARCH_FIRST = 100;
const PRODUCT_ID_PREFIX = "csv:";
const CSV_LOCK_TIMEOUT_MS = 5000;
const CSV_LOCK_RETRY_MS = 25;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];
    if (char === "\"" && inQuotes && nextChar === "\"") {
      field += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((current) => current.some((value) => value.trim()));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function stringifyCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function headerMap(headers) {
  return new Map(headers.map((header, index) => [header.trim().toLowerCase(), index]));
}

function getCell(row, headers, name) {
  const index = headers.get(name.toLowerCase());
  return index == null ? "" : String(row[index] || "").trim();
}

function setCell(row, headers, name, value) {
  const index = headers.get(name.toLowerCase());
  if (index == null) return;
  while (row.length <= index) row.push("");
  row[index] = value == null ? "" : String(value);
}

function numberCell(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatus(value) {
  const status = String(value || "ACTIVE").toUpperCase();
  return ["ACTIVE", "ARCHIVED", "DRAFT"].includes(status) ? status : "ACTIVE";
}

function publishedFromStatus(status) {
  return normalizeStatus(status) === "ARCHIVED" ? "false" : "true";
}

function statusFromPublished(value) {
  return String(value).toLowerCase() === "false" ? "ARCHIVED" : "ACTIVE";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function csvId(handle) {
  return `${PRODUCT_ID_PREFIX}${handle}`;
}

function handleFromId(id) {
  const value = String(id || "");
  return value.startsWith(PRODUCT_ID_PREFIX) ? value.slice(PRODUCT_ID_PREFIX.length) : value;
}

function matchesQuery(record, query) {
  if (!query) return true;
  const haystack = [record.title, record.handle, record.sku, record.vendor, record.productType, record.barcode]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

async function readCsvFile(filePath) {
  const rows = parseCsv(await readFile(filePath, "utf8"));
  if (rows.length < 1) throw new HttpError(500, `CSV missing header: ${filePath}`);
  return { headers: rows[0], rows: rows.slice(1) };
}

async function writeCsvFile(filePath, headers, rows) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, stringifyCsv([headers, ...rows]), "utf8");
  await rename(tempPath, filePath);
}

async function withFileLock(lockPath, callback) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + CSV_LOCK_TIMEOUT_MS;
  let handle = null;

  while (!handle) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`, "utf8");
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) {
        throw new HttpError(423, "CSV catalog is locked by another write.");
      }
      await delay(CSV_LOCK_RETRY_MS);
    }
  }

  try {
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

function productRecord(productRow, productHeaders, inventoryRow, inventoryHeaders) {
  const handle = getCell(productRow, productHeaders, "Handle");
  const sku = getCell(productRow, productHeaders, "Variant SKU") || getCell(inventoryRow || [], inventoryHeaders, "SKU");
  const onHand =
    getCell(inventoryRow || [], inventoryHeaders, "On hand (new)") ||
    getCell(productRow, productHeaders, "Variant Inventory Qty");
  const status = statusFromPublished(getCell(productRow, productHeaders, "Published"));
  return {
    id: csvId(handle),
    source: "csv",
    handle,
    title: getCell(productRow, productHeaders, "Title"),
    bodyHtml: getCell(productRow, productHeaders, "Body (HTML)"),
    vendor: getCell(productRow, productHeaders, "Vendor"),
    productType: getCell(productRow, productHeaders, "Type"),
    tags: getCell(productRow, productHeaders, "Tags"),
    status,
    sku,
    price: getCell(productRow, productHeaders, "Variant Price"),
    compareAtPrice: getCell(productRow, productHeaders, "Variant Compare-at Price"),
    barcode: getCell(productRow, productHeaders, "Variant Barcode"),
    imageUrl: getCell(productRow, productHeaders, "Image Src"),
    imageAlt: getCell(productRow, productHeaders, "Image Alt Text"),
    inventory: {
      tracked: getCell(productRow, productHeaders, "Variant Inventory Tracker") === "shopify",
      available: numberCell(onHand),
      onHand: numberCell(onHand),
      levels: []
    },
    shopifyProductId: "",
    shopifyVariantId: "",
    inventoryItemId: ""
  };
}

function productToVariant(record) {
  return {
    id: record.shopifyVariantId || record.id,
    numericId: "",
    title: "Default Title",
    sku: record.sku,
    barcode: record.barcode || "",
    price: record.price,
    product: {
      id: record.shopifyProductId || record.id,
      handle: record.handle,
      title: record.title,
      vendor: record.vendor,
      productType: record.productType,
      status: record.status
    },
    inventory: record.inventory,
    catalogProduct: record
  };
}

function shopifyVariantToProduct(variant) {
  return {
    id: variant.product?.id || variant.id,
    source: "shopify",
    handle: variant.product?.handle || "",
    title: variant.product?.title || variant.title,
    bodyHtml: "",
    vendor: variant.product?.vendor || "",
    productType: variant.product?.productType || "",
    tags: "",
    status: variant.product?.status || "ACTIVE",
    sku: variant.sku || "",
    price: variant.price || "",
    compareAtPrice: "",
    barcode: variant.barcode || "",
    imageUrl: "",
    imageAlt: "",
    inventory: variant.inventory || { tracked: false, available: 0, onHand: 0, levels: [] },
    shopifyProductId: variant.product?.id || "",
    shopifyVariantId: variant.id || "",
    inventoryItemId: variant.inventoryItemId || variant.inventory?.inventoryItemId || ""
  };
}

function normalizeFirst(first) {
  return Math.max(1, Math.min(Number(first) || 25, MAX_SEARCH_FIRST));
}

export class CsvCatalogProvider {
  constructor(config) {
    this.config = config;
  }

  async ensureWorkingCopies() {
    const { productsCsvBaseline, inventoryCsvBaseline, productsCsvWorking, inventoryCsvWorking } = this.config.catalog;
    if (!existsSync(productsCsvBaseline)) throw new HttpError(500, `Missing products CSV baseline: ${productsCsvBaseline}`);
    if (!existsSync(inventoryCsvBaseline)) throw new HttpError(500, `Missing inventory CSV baseline: ${inventoryCsvBaseline}`);
    await mkdir(path.dirname(productsCsvWorking), { recursive: true });
    await mkdir(path.dirname(inventoryCsvWorking), { recursive: true });
    if (!existsSync(productsCsvWorking)) await copyFile(productsCsvBaseline, productsCsvWorking);
    if (!existsSync(inventoryCsvWorking)) await copyFile(inventoryCsvBaseline, inventoryCsvWorking);
  }

  async loadTables() {
    await this.ensureWorkingCopies();
    const productTable = await readCsvFile(this.config.catalog.productsCsvWorking);
    const inventoryTable = await readCsvFile(this.config.catalog.inventoryCsvWorking);
    return {
      productHeaders: productTable.headers,
      productRows: productTable.rows,
      productMap: headerMap(productTable.headers),
      inventoryHeaders: inventoryTable.headers,
      inventoryRows: inventoryTable.rows,
      inventoryMap: headerMap(inventoryTable.headers)
    };
  }

  inventoryByHandleAndSku(inventoryRows, inventoryMap) {
    const lookup = new Map();
    for (const row of inventoryRows) {
      const handle = getCell(row, inventoryMap, "Handle");
      const sku = getCell(row, inventoryMap, "SKU");
      lookup.set(`${handle}\n${sku}`, row);
      if (handle && !lookup.has(handle)) lookup.set(handle, row);
    }
    return lookup;
  }

  recordsFromTables(tables) {
    const inventoryLookup = this.inventoryByHandleAndSku(tables.inventoryRows, tables.inventoryMap);
    return tables.productRows
      .map((row) => {
        const handle = getCell(row, tables.productMap, "Handle");
        const sku = getCell(row, tables.productMap, "Variant SKU");
        return productRecord(row, tables.productMap, inventoryLookup.get(`${handle}\n${sku}`) || inventoryLookup.get(handle), tables.inventoryMap);
      })
      .filter((record) => record.handle && record.status !== "ARCHIVED");
  }

  async searchProducts({ query = "", first = 25 } = {}) {
    const records = this.recordsFromTables(await this.loadTables())
      .filter((record) => matchesQuery(record, query))
      .slice(0, normalizeFirst(first));
    return records;
  }

  async searchInventory(input = {}) {
    return (await this.searchProducts(input)).map(productToVariant);
  }

  findProductIndex(tables, id) {
    const handle = handleFromId(id);
    return tables.productRows.findIndex((row) => getCell(row, tables.productMap, "Handle") === handle || getCell(row, tables.productMap, "Variant SKU") === id);
  }

  findInventoryIndex(tables, record) {
    return tables.inventoryRows.findIndex((row) => {
      const handle = getCell(row, tables.inventoryMap, "Handle");
      const sku = getCell(row, tables.inventoryMap, "SKU");
      return (record.handle && handle === record.handle) || (record.sku && sku === record.sku);
    });
  }

  async writeTables(tables) {
    await writeCsvFile(this.config.catalog.productsCsvWorking, tables.productHeaders, tables.productRows);
    await writeCsvFile(this.config.catalog.inventoryCsvWorking, tables.inventoryHeaders, tables.inventoryRows);
  }

  async mutateTables(mutator) {
    await this.ensureWorkingCopies();
    const lockPath = path.join(path.dirname(this.config.catalog.productsCsvWorking), "local-shopify-catalog.lock");
    return withFileLock(lockPath, async () => {
      const tables = await this.loadTables();
      const result = await mutator(tables);
      await this.writeTables(tables);
      return result;
    });
  }

  async createProduct(input) {
    return this.mutateTables(async (tables) => {
      const handle = input.handle ? slugify(input.handle) : slugify(input.title);
      if (!handle) throw new HttpError(400, "Product handle required.");
      if (!input.title) throw new HttpError(400, "Product title required.");
      if (tables.productRows.some((row) => getCell(row, tables.productMap, "Handle") === handle)) {
        throw new HttpError(409, "Product handle already exists.");
      }

      const sku = String(input.sku || handle).trim();
      const productRow = Array(tables.productHeaders.length).fill("");
      setCell(productRow, tables.productMap, "Handle", handle);
      setCell(productRow, tables.productMap, "Title", input.title);
      setCell(productRow, tables.productMap, "Body (HTML)", input.bodyHtml || `<p>${input.title}</p>`);
      setCell(productRow, tables.productMap, "Vendor", input.vendor || "");
      setCell(productRow, tables.productMap, "Type", input.productType || "");
      setCell(productRow, tables.productMap, "Tags", input.tags || "staff-local");
      setCell(productRow, tables.productMap, "Published", publishedFromStatus(input.status));
      setCell(productRow, tables.productMap, "Option1 Name", "Title");
      setCell(productRow, tables.productMap, "Option1 Value", "Default Title");
      setCell(productRow, tables.productMap, "Variant SKU", sku);
      setCell(productRow, tables.productMap, "Variant Inventory Tracker", "shopify");
      setCell(productRow, tables.productMap, "Variant Inventory Qty", input.onHand ?? 0);
      setCell(productRow, tables.productMap, "Variant Inventory Policy", "deny");
      setCell(productRow, tables.productMap, "Variant Fulfillment Service", "manual");
      setCell(productRow, tables.productMap, "Variant Price", input.price ?? 0);
      setCell(productRow, tables.productMap, "Variant Compare-at Price", input.compareAtPrice || "");
      setCell(productRow, tables.productMap, "Variant Requires Shipping", "true");
      setCell(productRow, tables.productMap, "Variant Taxable", "true");
      setCell(productRow, tables.productMap, "Variant Barcode", input.barcode || "");
      setCell(productRow, tables.productMap, "Image Src", input.imageUrl || "");
      setCell(productRow, tables.productMap, "Image Alt Text", input.imageAlt || input.title);
      tables.productRows.push(productRow);

      const inventoryRow = Array(tables.inventoryHeaders.length).fill("");
      setCell(inventoryRow, tables.inventoryMap, "Handle", handle);
      setCell(inventoryRow, tables.inventoryMap, "Title", input.title);
      setCell(inventoryRow, tables.inventoryMap, "Option1 Name", "Title");
      setCell(inventoryRow, tables.inventoryMap, "Option1 Value", "Default Title");
      setCell(inventoryRow, tables.inventoryMap, "SKU", sku);
      setCell(inventoryRow, tables.inventoryMap, "On hand (new)", input.onHand ?? 0);
      tables.inventoryRows.push(inventoryRow);

      return productRecord(productRow, tables.productMap, inventoryRow, tables.inventoryMap);
    });
  }

  async updateProduct(id, input) {
    return this.mutateTables(async (tables) => {
      const index = this.findProductIndex(tables, id);
      if (index === -1) throw new HttpError(404, "Product not found.");

      const productRow = tables.productRows[index];
      const before = productRecord(productRow, tables.productMap, null, tables.inventoryMap);
      const inventoryIndex = this.findInventoryIndex(tables, before);
      const inventoryRow = inventoryIndex === -1 ? null : tables.inventoryRows[inventoryIndex];
      const nextHandle = input.handle ? slugify(input.handle) : before.handle;
      const nextSku = input.sku == null ? before.sku : String(input.sku).trim();

      if (nextHandle !== before.handle && tables.productRows.some((row, rowIndex) => rowIndex !== index && getCell(row, tables.productMap, "Handle") === nextHandle)) {
        throw new HttpError(409, "Product handle already exists.");
      }

      if (input.title != null) setCell(productRow, tables.productMap, "Title", input.title);
      if (input.handle != null) setCell(productRow, tables.productMap, "Handle", nextHandle);
      if (input.bodyHtml != null) setCell(productRow, tables.productMap, "Body (HTML)", input.bodyHtml);
      if (input.vendor != null) setCell(productRow, tables.productMap, "Vendor", input.vendor);
      if (input.productType != null) setCell(productRow, tables.productMap, "Type", input.productType);
      if (input.tags != null) setCell(productRow, tables.productMap, "Tags", input.tags);
      if (input.status != null) setCell(productRow, tables.productMap, "Published", publishedFromStatus(input.status));
      if (input.sku != null) setCell(productRow, tables.productMap, "Variant SKU", nextSku);
      if (input.price != null) setCell(productRow, tables.productMap, "Variant Price", input.price);
      if (input.compareAtPrice != null) setCell(productRow, tables.productMap, "Variant Compare-at Price", input.compareAtPrice);
      if (input.barcode != null) setCell(productRow, tables.productMap, "Variant Barcode", input.barcode);
      if (input.imageUrl != null) setCell(productRow, tables.productMap, "Image Src", input.imageUrl);
      if (input.imageAlt != null) setCell(productRow, tables.productMap, "Image Alt Text", input.imageAlt);
      if (input.onHand != null) setCell(productRow, tables.productMap, "Variant Inventory Qty", input.onHand);

      if (inventoryRow) {
        if (input.handle != null) setCell(inventoryRow, tables.inventoryMap, "Handle", nextHandle);
        if (input.title != null) setCell(inventoryRow, tables.inventoryMap, "Title", input.title);
        if (input.sku != null) setCell(inventoryRow, tables.inventoryMap, "SKU", nextSku);
        if (input.onHand != null) setCell(inventoryRow, tables.inventoryMap, "On hand (new)", input.onHand);
      }

      return productRecord(productRow, tables.productMap, inventoryRow, tables.inventoryMap);
    });
  }

  async archiveProduct(id) {
    return this.updateProduct(id, { status: "ARCHIVED" });
  }

  async setInventoryOnHand(input) {
    const id = input.id || input.variantId || input.sku;
    const onHand = Number(input.onHand);
    if (!Number.isInteger(onHand) || onHand < 0) throw new HttpError(400, "onHand must be a non-negative integer.");
    return this.updateProduct(id, { onHand });
  }

  async createDraftOrder(input) {
    if (!Array.isArray(input.lineItems) || !input.lineItems.length) throw new HttpError(400, "lineItems required.");
    return {
      id: `csv-draft:${crypto.randomUUID()}`,
      name: `CSV-${Date.now()}`,
      status: "open",
      invoice_url: "",
      order_id: "",
      email: input.email || "",
      total_price: "",
      subtotal_price: "",
      line_items: input.lineItems.map((item, index) => ({
        id: index + 1,
        variant_id: item.variantId,
        title: item.title || item.variantId,
        quantity: Number(item.quantity || 1),
        price: item.price || ""
      }))
    };
  }

  async getDraftOrder(draftOrderId) {
    return { id: draftOrderId, name: draftOrderId, status: "open", line_items: [] };
  }

  async sendDraftOrderInvoice(draftOrderId) {
    return { id: draftOrderId, name: draftOrderId, status: "invoice_sent" };
  }

  async completeDraftOrder(draftOrderId) {
    return { id: draftOrderId, name: draftOrderId, status: "completed", order_id: `csv-order:${crypto.randomUUID()}` };
  }

  async deleteDraftOrder(draftOrderId) {
    return { id: draftOrderId, name: draftOrderId, status: "canceled" };
  }
}

export class ShopifyCatalogProvider {
  constructor(config, store = null) {
    this.config = config;
    this.store = store;
  }

  async searchProducts(input = {}) {
    if (this.store?.shopifyCatalogCacheCount && (await this.store.shopifyCatalogCacheCount()) > 0) {
      return this.store.searchShopifyCatalog(input);
    }
    return (await searchInventory(this.config, input)).map(shopifyVariantToProduct);
  }

  async searchInventory(input = {}) {
    if (this.store?.shopifyCatalogCacheCount && (await this.store.shopifyCatalogCacheCount()) > 0) {
      return (await this.store.searchShopifyCatalog(input)).map(productToVariant);
    }
    return searchInventory(this.config, input);
  }

  async createProduct(input) {
    const product = await createProduct(this.config, input);
    const record = shopifyVariantToProduct({
      id: product?.variants?.nodes?.[0]?.id || product?.id,
      sku: product?.variants?.nodes?.[0]?.sku || input.sku || "",
      price: product?.variants?.nodes?.[0]?.price || input.price || "",
      product,
      inventory: { tracked: true, available: Number(input.onHand || 0), onHand: Number(input.onHand || 0), levels: [] }
    });
    await this.store?.upsertShopifyCatalog?.([record]);
    return record;
  }

  async updateProduct(id, input) {
    const product = await updateProduct(this.config, id, input);
    const record = shopifyVariantToProduct({
      id: product?.variants?.nodes?.[0]?.id || input.variantId || id,
      sku: product?.variants?.nodes?.[0]?.sku || input.sku || "",
      price: product?.variants?.nodes?.[0]?.price || input.price || "",
      product,
      inventory: { tracked: true, available: Number(input.onHand || 0), onHand: Number(input.onHand || 0), levels: [] }
    });
    await this.store?.upsertShopifyCatalog?.([record]);
    return record;
  }

  async archiveProduct(id) {
    return archiveProduct(this.config, id);
  }

  async setInventoryOnHand(input) {
    return setInventoryOnHand(this.config, input);
  }

  async createDraftOrder(input) {
    return createDraftOrder(this.config, input);
  }

  async getDraftOrder(draftOrderId) {
    return getDraftOrder(this.config, draftOrderId);
  }

  async sendDraftOrderInvoice(draftOrderId, input) {
    return sendDraftOrderInvoice(this.config, draftOrderId, input);
  }

  async completeDraftOrder(draftOrderId, input) {
    return completeDraftOrder(this.config, draftOrderId, input);
  }

  async deleteDraftOrder(draftOrderId) {
    return deleteDraftOrder(this.config, draftOrderId);
  }
}

export function createCatalogProvider(config, store = null) {
  return config.catalog?.source === "shopify" ? new ShopifyCatalogProvider(config, store) : new CsvCatalogProvider(config);
}
