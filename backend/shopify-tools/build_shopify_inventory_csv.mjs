import fs from "node:fs/promises";
import { parseCsv } from "./shopify-csv-adapter.mjs";

const INPUT = "shopify-data/file_items_shopify_import.csv";
const OUTPUT = "shopify-data/file_items_shopify_inventory_import.csv";

const INVENTORY_HEADERS = [
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

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1] || "";

  return "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function requiredCell(row, indexes, header, rowNumber) {
  const value = String(row[indexes[header]] ?? "").trim();
  if (!value) throw new Error(`Missing ${header} at row ${rowNumber}`);
  return value;
}

function optionalCell(row, indexes, header) {
  return String(row[indexes[header]] ?? "").trim();
}

const location = getArgValue("--location") || process.env.SHOPIFY_LOCATION || "";
const outputPath = getArgValue("--output") || OUTPUT;
if (!location.trim()) {
  throw new Error('Missing location. Usage: node shopify-tools/build_shopify_inventory_csv.mjs --location "Exact Shopify Location Name"');
}

const sourceText = await fs.readFile(INPUT, "utf8");
const rows = parseCsv(sourceText);
if (rows.length < 2) throw new Error(`${INPUT} must include headers and data rows.`);

const [headers, ...dataRows] = rows;
const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
for (const header of ["Handle", "Title", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Inventory Qty"]) {
  if (!(header in indexes)) throw new Error(`Missing source header: ${header}`);
}

const outputRows = [INVENTORY_HEADERS];
for (let index = 0; index < dataRows.length; index += 1) {
  const row = dataRows[index];
  const rowNumber = index + 2;
  outputRows.push([
    requiredCell(row, indexes, "Handle", rowNumber),
    requiredCell(row, indexes, "Title", rowNumber),
    requiredCell(row, indexes, "Option1 Name", rowNumber),
    requiredCell(row, indexes, "Option1 Value", rowNumber),
    optionalCell(row, indexes, "Option2 Name"),
    optionalCell(row, indexes, "Option2 Value"),
    optionalCell(row, indexes, "Option3 Name"),
    optionalCell(row, indexes, "Option3 Value"),
    requiredCell(row, indexes, "Variant SKU", rowNumber),
    "",
    "",
    location.trim(),
    "",
    "",
    "",
    "",
    "",
    "",
    requiredCell(row, indexes, "Variant Inventory Qty", rowNumber)
  ]);
}

const csv = `${outputRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
await fs.writeFile(outputPath, csv, "utf8");
console.log(
  JSON.stringify(
    {
      input: INPUT,
      output: outputPath,
      rows: outputRows.length - 1,
      location: location.trim(),
      notes: [
        "Use this file only in Shopify Products > Inventory > Import.",
        "Products and variants must already exist in Shopify from the product CSV import.",
        "On hand (current) is intentionally blank; On hand (new) sets inventory without stale-current validation."
      ]
    },
    null,
    2
  )
);
