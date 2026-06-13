import fs from "node:fs/promises";
import { parseCsv } from "./shopify-csv-adapter.mjs";

const SOURCE = "file_items.csv";
const PRODUCT_OUTPUT = "file_items_shopify_product_preserved.csv";
const INVENTORY_OUTPUT = "file_items_shopify_inventory_preserved.csv";
const EXCLUDED_OUTPUT = "file_items_shopify_preserved_excluded.csv";
const REPORT_OUTPUT = "file_items_shopify_preserved_report.json";
const DEFAULT_INVENTORY_TEMPLATE = "/Users/gongahkia/Downloads/inventory_bin_new_on_hand_template.csv";

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

const PRODUCT_HEADERS = [
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

const FALLBACK_INVENTORY_HEADERS = [
  "Handle",
  "Title",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "SKU",
  "HS Code",
  "COO",
  "Location",
  "Bin name",
  "Incoming (not editable)",
  "Unavailable (not editable)",
  "Committed (not editable)",
  "Available (not editable)",
  "On hand (current)",
  "On hand (new)"
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

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1] || "";

  return "";
}

function normalizeNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`Invalid numeric value: ${text}`);
  return Math.abs(number) < 1e-9 ? 0 : number;
}

function formatDecimal(value) {
  const number = normalizeNumber(value);
  if (number === 0) return "0";
  return number.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 10 });
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function writeCsv(path, rows) {
  return fs.writeFile(path, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`, "utf8");
}

function isDeadStock(values) {
  return ["whse", "rlf", "imm", "export price", "retail price", "w. sale price"].every(
    (field) => normalizeNumber(values[field]) === 0
  );
}

function hasCategorySentinel(values) {
  return ["whse", "rlf", "imm"].some((field) => normalizeNumber(values[field]) === 100000);
}

function inventoryQuantity(whse) {
  if (whse <= 0) return "0";
  return String(Math.floor(whse));
}

function deriveType(code) {
  const withoutPrefix = code.replace(/^[+\s]+/, "").trim();
  return withoutPrefix.split(/[\s/]+/)[0] || "Legacy";
}

function buildBodyHtml(values, rowNumber) {
  const rows = [
    ["source row", rowNumber],
    ["code", values.code],
    ["description", values.description],
    ["vendor", values.vendor],
    ["whse", values.whse],
    ["rlf", values.rlf],
    ["imm", values.imm],
    ["export price", values["export price"]],
    ["retail price", values["retail price"]],
    ["w. sale price", values["w. sale price"]]
  ];

  return [
    values.description ? `<p>${htmlEscape(values.description)}</p>` : "",
    "<table>",
    "<tbody>",
    ...rows.map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`),
    "</tbody>",
    "</table>"
  ]
    .filter(Boolean)
    .join("");
}

async function loadInventoryTemplate() {
  const templatePath = getArgValue("--inventory-template") || DEFAULT_INVENTORY_TEMPLATE;

  try {
    const templateRows = parseCsv(await fs.readFile(templatePath, "utf8"));
    const [headers] = templateRows;
    return { headers };
  } catch {
    return { headers: FALLBACK_INVENTORY_HEADERS };
  }
}

const sourceRows = parseCsv(await fs.readFile(SOURCE, "utf8"));
if (sourceRows.length < 2) throw new Error(`${SOURCE} must include headers and data rows.`);

const [headers, ...dataRows] = sourceRows;
for (const header of SOURCE_HEADERS) {
  if (!headers.includes(header)) throw new Error(`Missing source header: ${header}`);
}

const { headers: inventoryHeaders } = await loadInventoryTemplate();

const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
const seenHandles = new Map();
const productRows = [PRODUCT_HEADERS];
const inventoryRows = [inventoryHeaders];
const excludedRows = [["reason", "source row", ...SOURCE_HEADERS]];
const report = {
  source: SOURCE,
  productOutput: PRODUCT_OUTPUT,
  inventoryOutput: INVENTORY_OUTPUT,
  excludedOutput: EXCLUDED_OUTPUT,
  sourceRows: dataRows.length,
  productRows: 0,
  inventoryRows: 0,
  excludedRows: 0,
  removedBlankCrestarRows: 0,
  removedCategoryRows: 0,
  draftUnpublishedRows: 0,
  duplicateHandlesResolved: 0,
  missingTitleFallbackRows: 0,
  preservedInBodyHtml: ["source row", ...SOURCE_HEADERS],
  inventoryLocation: ""
};

for (let index = 0; index < dataRows.length; index += 1) {
  const row = dataRows[index];
  const rowNumber = index + 2;
  const values = Object.fromEntries(SOURCE_HEADERS.map((header) => [header, String(row[indexes[header]] ?? "").trim()]));
  const blankCrestar = !values.code && values.vendor === "CRESTAR";
  const categorySentinel = hasCategorySentinel(values);

  if (blankCrestar || categorySentinel) {
    const reason = blankCrestar ? "blank-code-crestar-report-artifact" : "sentinel-100000-placeholder";
    excludedRows.push([reason, rowNumber, ...SOURCE_HEADERS.map((header) => values[header])]);
    report.excludedRows += 1;
    if (blankCrestar) report.removedBlankCrestarRows += 1;
    if (categorySentinel) report.removedCategoryRows += 1;
    continue;
  }

  const whse = normalizeNumber(values.whse);
  const retailPrice = normalizeNumber(values["retail price"]);
  const deadStock = isDeadStock(values);
  const title = values.description || values.code || `Legacy item ${rowNumber}`;
  const baseHandle = buildBaseHandle(values.code || title, rowNumber);
  const handle = getUniqueHandle(baseHandle, seenHandles);
  const handleCount = seenHandles.get(baseHandle) || 1;
  const tags = ["legacy-import", `legacy-type-${deriveType(values.code).toLowerCase()}`];
  const shouldPublish = !(deadStock || retailPrice <= 0 || whse < 0);

  if (handleCount > 1) {
    tags.push("legacy-duplicate-handle");
    report.duplicateHandlesResolved += 1;
  }
  if (!values.description) {
    tags.push("legacy-missing-title");
    report.missingTitleFallbackRows += 1;
  }
  if (deadStock) tags.push("legacy-dead-stock");
  if (retailPrice <= 0 && !deadStock) tags.push("legacy-zero-retail");
  if (whse < 0) tags.push("legacy-negative-whse");
  if (Math.abs(whse - Math.trunc(whse)) > 1e-9) tags.push("legacy-fractional-whse");
  if (!shouldPublish) report.draftUnpublishedRows += 1;

  const quantity = inventoryQuantity(whse);
  productRows.push([
    handle,
    title,
    buildBodyHtml(values, rowNumber),
    values.vendor,
    deriveType(values.code),
    tags.join(", "),
    shouldPublish ? "true" : "false",
    "Title",
    "Default Title",
    "",
    "",
    "",
    "",
    values.code,
    "0",
    "shopify",
    quantity,
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

  inventoryRows.push([
    handle,
    title,
    "Title",
    "Default Title",
    "",
    "",
    "",
    "",
    values.code,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    quantity
  ]);
}

report.productRows = productRows.length - 1;
report.inventoryRows = inventoryRows.length - 1;

await writeCsv(PRODUCT_OUTPUT, productRows);
await writeCsv(INVENTORY_OUTPUT, inventoryRows);
await writeCsv(EXCLUDED_OUTPUT, excludedRows);
await fs.writeFile(REPORT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
