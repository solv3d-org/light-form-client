import { readFile } from "node:fs/promises";

export const REQUIRED_CANONICAL_FIELDS = ["title", "handle", "price"];

export const FIELD_ALIASES = {
  title: ["title", "product title", "name", "product_name"],
  handle: ["handle", "slug", "product handle", "product_handle"],
  descriptionHtml: ["description", "description html", "body", "body_html"],
  vendor: ["vendor", "brand"],
  productType: ["product type", "type", "category", "product_type"],
  status: ["status"],
  sku: ["sku", "variant sku", "model"],
  price: ["price", "variant price"],
  compareAtPrice: ["compare at price", "compare_at_price", "variant compare at price"],
  option1Name: ["option1 name", "option 1 name"],
  option1Value: ["option1 value", "option 1 value"],
  imageUrl: ["image", "image url", "image src", "image_url", "src"]
};

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

  return rows.filter((currentRow) => currentRow.some((value) => value.trim()));
}

export function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstValue(row, headerLookup, aliases) {
  for (const alias of aliases) {
    const index = headerLookup.get(normalizeHeader(alias));
    if (index == null) continue;
    const value = row[index]?.trim();
    if (value) return value;
  }
  return "";
}

export function mapRowToProduct(row, headers, rowNumber) {
  const headerLookup = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const product = { sourceRowNumber: rowNumber };

  Object.entries(FIELD_ALIASES).forEach(([fieldName, aliases]) => {
    product[fieldName] = firstValue(row, headerLookup, aliases);
  });

  if (!product.status) product.status = "DRAFT";
  if (!product.option1Name && product.option1Value) product.option1Name = "Title";
  if (!product.option1Value) product.option1Value = "Default Title";

  return product;
}

export function validateProductRecord(product) {
  const errors = [];

  REQUIRED_CANONICAL_FIELDS.forEach((fieldName) => {
    if (!product[fieldName]) errors.push(`missing ${fieldName}`);
  });

  const price = Number(product.price);
  if (product.price && (!Number.isFinite(price) || price < 0)) {
    errors.push("invalid price");
  }

  if (product.imageUrl && !/^https?:\/\//.test(product.imageUrl)) {
    errors.push("imageUrl must be http(s)");
  }

  return errors;
}

export async function loadCsvProducts(filePath) {
  const text = await readFile(filePath, "utf8");
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one product row.");
  }

  const [headers, ...dataRows] = rows;
  const products = dataRows.map((row, index) => mapRowToProduct(row, headers, index + 2));

  return { headers, products };
}

export function summarizeCsvProducts(products) {
  const invalidRecords = products
    .map((product) => ({
      row: product.sourceRowNumber,
      errors: validateProductRecord(product)
    }))
    .filter((record) => record.errors.length);

  return {
    totalRows: products.length,
    validRows: products.length - invalidRecords.length,
    invalidRows: invalidRecords.length,
    invalidRecords
  };
}

export function toProductCreateJsonl(products) {
  return products
    .map((product) =>
      JSON.stringify({
        input: {
          title: product.title,
          handle: product.handle,
          descriptionHtml: product.descriptionHtml || undefined,
          vendor: product.vendor || undefined,
          productType: product.productType || undefined,
          status: product.status || "DRAFT"
        }
      })
    )
    .join("\n");
}
