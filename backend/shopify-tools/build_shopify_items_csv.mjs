import fs from "node:fs/promises";
import { parseCsv } from "./shopify-csv-adapter.mjs";

const INPUT = "shopify-data/file_items.csv";
const OUTPUT = "shopify-data/file_items_shopify_import.csv";
const REPORT = "shopify-data/file_items_shopify_import_report.json";

const SOURCE_HEADERS = [
  "code",
  "description",
  "vendor",
  "whse",
  "rlf",
  "imm",
  "export price",
  "retail price",
  "w. sale price"
];

const SHOPIFY_HEADERS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare-at Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Alt Text"
];

const TRANSLITERATIONS = new Map(
  Object.entries({
    "Æ": "AE",
    "æ": "ae",
    "Ð": "D",
    "ð": "d",
    "Ł": "L",
    "ł": "l",
    "Ø": "O",
    "ø": "o",
    "Œ": "OE",
    "œ": "oe",
    "Þ": "Th",
    "þ": "th",
    "ß": "ss"
  })
);

function normalizeNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid numeric value: ${text}`);
  }
  return Math.abs(number) < 1e-9 ? 0 : number;
}

function formatDecimal(value) {
  const number = normalizeNumber(value);
  if (number === 0) return "0";
  return number.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 10
  });
}

function transliterate(value) {
  return Array.from(value, (char) => TRANSLITERATIONS.get(char) || char).join("");
}

function buildBaseHandle(code, rowNumber) {
  const cleaned = transliterate(code)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[+\s]+/, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || `legacy-item-${rowNumber}`;
}

function getUniqueHandle(baseHandle, seenHandles) {
  const count = seenHandles.get(baseHandle) || 0;
  seenHandles.set(baseHandle, count + 1);
  return count === 0 ? baseHandle : `${baseHandle}-${count + 1}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function isDeadStock(values) {
  return ["whse", "rlf", "imm", "export price", "retail price", "w. sale price"].every(
    (field) => normalizeNumber(values[field]) === 0
  );
}

function hasCategorySentinel(values) {
  return ["whse", "rlf", "imm"].some((field) => normalizeNumber(values[field]) === 100000);
}

function statusFor({ deadStock, retailPrice, whse }) {
  if (deadStock || retailPrice <= 0 || whse < 0) return "draft";
  return "active";
}

function inventoryQuantity(whse) {
  if (whse <= 0) return "0";
  return String(Math.floor(whse));
}

const sourceText = await fs.readFile(INPUT, "utf8");
const rows = parseCsv(sourceText);
if (rows.length < 2) throw new Error("CSV must include headers and data rows.");

const [headers, ...dataRows] = rows;
for (const header of SOURCE_HEADERS) {
  if (!headers.includes(header)) throw new Error(`Missing source header: ${header}`);
}

const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
const seenHandles = new Map();
const outputRows = [SHOPIFY_HEADERS];
const report = {
  input: INPUT,
  output: OUTPUT,
  inputRows: dataRows.length,
  outputRows: 0,
  removedBlankCrestarRows: 0,
  removedCategoryRows: 0,
  draftDeadStockRows: 0,
  draftZeroRetailRows: 0,
  draftNegativeWhseRows: 0,
  fractionalWhseRows: 0,
  duplicateHandlesResolved: 0,
  missingTitleFallbackRows: 0,
  notes: [
    "Original shopify-data/file_items.csv was not modified.",
    "Handle is generated from code, URL-safe, and unique per row.",
    "Dead stock rows were kept but set Published=false.",
    "Inventory quantity uses nonnegative floor(whse).",
    "Native Shopify import rejected cost/status/metafield columns, so export price, rlf, imm, wholesale price, raw whse, and Status are intentionally excluded from this first import CSV."
  ]
};

for (let index = 0; index < dataRows.length; index += 1) {
  const row = dataRows[index];
  const rowNumber = index + 2;
  const values = Object.fromEntries(SOURCE_HEADERS.map((header) => [header, String(row[indexes[header]] ?? "").trim()]));
  const code = values.code;
  const vendor = values.vendor;

  if (!code && vendor === "CRESTAR") {
    report.removedBlankCrestarRows += 1;
    continue;
  }

  if (hasCategorySentinel(values)) {
    report.removedCategoryRows += 1;
    continue;
  }

  const whse = normalizeNumber(values.whse);
  const retailPrice = normalizeNumber(values["retail price"]);
  const deadStock = isDeadStock(values);
  const title = values.description || code || `Legacy item ${rowNumber}`;
  const baseHandle = buildBaseHandle(code || title, rowNumber);
  const handle = getUniqueHandle(baseHandle, seenHandles);
  const handleCount = seenHandles.get(baseHandle) || 1;
  const tags = ["legacy-import"];

  if (handleCount > 1) {
    report.duplicateHandlesResolved += 1;
    tags.push("legacy-duplicate-handle");
  }
  if (!values.description) {
    report.missingTitleFallbackRows += 1;
    tags.push("legacy-missing-title");
  }
  if (deadStock) {
    report.draftDeadStockRows += 1;
    tags.push("legacy-dead-stock");
  }
  if (retailPrice <= 0 && !deadStock) {
    report.draftZeroRetailRows += 1;
    tags.push("legacy-zero-retail");
  }
  if (whse < 0) {
    report.draftNegativeWhseRows += 1;
    tags.push("legacy-negative-whse");
  }
  if (Math.abs(whse - Math.trunc(whse)) > 1e-9) {
    report.fractionalWhseRows += 1;
    tags.push("legacy-fractional-whse");
  }

  const status = statusFor({ deadStock, retailPrice, whse });
  outputRows.push([
    handle,
    title,
    "",
    values.vendor,
    "",
    tags.join(", "),
    status === "active" ? "true" : "false",
    "Default Title",
    "Default Title",
    "",
    "",
    "",
    "",
    code,
    "0",
    "shopify",
    inventoryQuantity(whse),
    "deny",
    "manual",
    formatDecimal(values["retail price"]),
    "",
    "true",
    "true",
    "",
    "",
    ""
  ]);
}

report.outputRows = outputRows.length - 1;

const csv = `${outputRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
await fs.writeFile(OUTPUT, csv, "utf8");
await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
