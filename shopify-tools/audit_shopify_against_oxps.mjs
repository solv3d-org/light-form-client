import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseCsv } from "./shopify-csv-adapter.mjs";

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

const LEGACY_BODY_FIELDS = ["source row", ...SOURCE_HEADERS];
const DEFAULT_OUTPUT_DIR = ".shopify-audit";
const DEFAULT_API_VERSION = "2026-04";
const VARIANT_PAGE_SIZE = 100;
const INVENTORY_LEVEL_PAGE_SIZE = 20;

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

const VARIANTS_QUERY = `
  query ProductVariantsAudit($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        sku
        price
        barcode
        selectedOptions {
          name
          value
        }
        product {
          id
          handle
          title
          vendor
          productType
          status
          tags
          descriptionHtml
        }
        inventoryItem {
          id
          sku
          tracked
          inventoryLevels(first: ${INVENTORY_LEVEL_PAGE_SIZE}) {
            pageInfo {
              hasNextPage
            }
            nodes {
              id
              isActive
              location {
                id
                name
              }
              quantities(names: ["available", "on_hand"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

function usage() {
  return `usage: node shopify-tools/audit_shopify_against_oxps.mjs [--oxps shopify-data/file.oxps | --csv shopify-data/file_items.csv] [--location "Location Name"] [--include-placeholders] [--output-dir .shopify-audit]

env:
  SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
  SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
  SHOPIFY_API_VERSION=2026-04

required Admin API scopes:
  read_products
  read_inventory
  read_locations
`;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1] || "";

  return "";
}

function hasArg(name) {
  return process.argv.includes(name);
}

function normalizeStoreDomain(domain) {
  return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
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

function deriveType(code) {
  const withoutPrefix = code.replace(/^[+\s]+/, "").trim();
  return withoutPrefix.split(/[\s/]+/)[0] || "Legacy";
}

function inventoryQuantity(whse) {
  if (whse <= 0) return 0;
  return Math.floor(whse);
}

function isDeadStock(values) {
  return ["whse", "rlf", "imm", "export price", "retail price", "w. sale price"].every(
    (field) => normalizeNumber(values[field]) === 0
  );
}

function hasCategorySentinel(values) {
  return ["whse", "rlf", "imm"].some((field) => normalizeNumber(values[field]) === 100000);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

async function writeCsv(filePath, rows) {
  await writeFile(filePath, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`, "utf8");
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]*>/g, "")).trim();
}

function parseLegacyBody(descriptionHtml) {
  const out = new Map();
  const html = String(descriptionHtml ?? "");
  const rowRe = /<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match = rowRe.exec(html);
  while (match) {
    out.set(stripTags(match[1]).toLowerCase(), stripTags(match[2]));
    match = rowRe.exec(html);
  }
  return out;
}

function quantityMap(level) {
  const out = {};
  for (const quantity of level?.quantities || []) {
    out[quantity.name] = quantity.quantity;
  }
  return out;
}

function onHandForVariant(variant, locationName) {
  const levels = variant.inventoryItem?.inventoryLevels?.nodes || [];
  const matched = locationName ? levels.filter((level) => level.location?.name === locationName) : levels;
  return matched.reduce((sum, level) => sum + Number(quantityMap(level).on_hand || 0), 0);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
      }
    });
  });
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadLocalRows({ oxpsPath, csvPath, outputDir, includePlaceholders }) {
  let inputCsv = csvPath;
  if (!inputCsv) {
    inputCsv = path.join(outputDir, "oxps_items.csv");
    await runCommand("python3", ["shopify-tools/oxps_inventory_to_csv.py", oxpsPath, inputCsv, "--include-source"]);
  }

  const rows = parseCsv(await readFile(inputCsv, "utf8"));
  if (rows.length < 2) throw new Error(`${inputCsv} must include headers and data rows.`);

  const [rawHeaders, ...dataRows] = rows;
  const headers = rawHeaders.map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header));
  for (const header of SOURCE_HEADERS) {
    if (!headers.includes(header)) throw new Error(`${inputCsv} missing header: ${header}`);
  }

  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const seenHandles = new Map();
  const expected = [];
  const excluded = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    const rowNumber = index + 2;
    const values = Object.fromEntries(SOURCE_HEADERS.map((header) => [header, String(row[indexes[header]] ?? "").trim()]));
    const blankCrestar = !values.code && values.vendor === "CRESTAR";
    const sentinel = hasCategorySentinel(values);
    const reason = blankCrestar ? "blank-code-crestar-report-artifact" : sentinel ? "sentinel-100000-placeholder" : "";

    if (reason && !includePlaceholders) {
      excluded.push({ rowNumber, reason, values });
      continue;
    }

    const whse = normalizeNumber(values.whse);
    const retailPrice = normalizeNumber(values["retail price"]);
    const deadStock = isDeadStock(values);
    const title = values.description || values.code || `Legacy item ${rowNumber}`;
    const baseHandle = buildBaseHandle(values.code || title, rowNumber);
    const handle = getUniqueHandle(baseHandle, seenHandles);
    const tags = ["legacy-import", `legacy-type-${deriveType(values.code).toLowerCase()}`];

    if (deadStock) tags.push("legacy-dead-stock");
    if (retailPrice <= 0 && !deadStock) tags.push("legacy-zero-retail");
    if (whse < 0) tags.push("legacy-negative-whse");
    if (Math.abs(whse - Math.trunc(whse)) > 1e-9) tags.push("legacy-fractional-whse");

    expected.push({
      rowNumber,
      handle,
      sku: values.code,
      title,
      vendor: values.vendor,
      productType: deriveType(values.code),
      variantPrice: formatDecimal(values["retail price"]),
      inventoryQuantity: inventoryQuantity(whse),
      published: !(deadStock || retailPrice <= 0 || whse < 0),
      tags,
      values
    });
  }

  return { inputCsv, expected, excluded };
}

async function shopifyGraphql({ endpoint, token, query, variables }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Shopify Admin API failed: ${response.status} ${response.statusText}`);
  if (payload?.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload;
}

async function fetchRemoteVariants({ storeDomain, token, apiVersion }) {
  const endpoint = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
  const variants = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const payload = await shopifyGraphql({
      endpoint,
      token,
      query: VARIANTS_QUERY,
      variables: { first: VARIANT_PAGE_SIZE, after }
    });
    const connection = payload.data.productVariants;
    if (!connection) throw new Error("Shopify response did not include productVariants.");
    variants.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;

    const throttle = payload.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < 150) {
      const waitMs = Math.ceil(((250 - throttle.currentlyAvailable) / throttle.restoreRate) * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(waitMs, 500), 5000)));
    }
  }

  return variants;
}

function addMismatch(rows, local, remote, field, localValue, remoteValue, note = "") {
  rows.push([
    local.sku,
    local.handle,
    local.rowNumber,
    remote?.id || "",
    remote?.product?.handle || "",
    field,
    localValue,
    remoteValue,
    note
  ]);
}

function compare({ expected, excluded, remoteVariants, locationName }) {
  const remoteBySku = new Map();
  const remoteSkuCounts = new Map();
  const remoteByHandle = new Map();
  const remoteHandleCounts = new Map();

  for (const variant of remoteVariants) {
    const sku = String(variant.sku || "").trim();
    const handle = String(variant.product?.handle || "").trim();
    if (sku) {
      if (!remoteBySku.has(sku)) remoteBySku.set(sku, variant);
      remoteSkuCounts.set(sku, (remoteSkuCounts.get(sku) || 0) + 1);
    }
    if (handle) {
      if (!remoteByHandle.has(handle)) remoteByHandle.set(handle, variant);
      remoteHandleCounts.set(handle, (remoteHandleCounts.get(handle) || 0) + 1);
    }
  }

  const expectedSkuSet = new Set(expected.map((row) => row.sku).filter(Boolean));
  const missing = [["sku", "handle", "source row", "title", "reason", "remote handle match"]];
  const mismatches = [["sku", "handle", "source row", "remote variant id", "remote handle", "field", "local", "remote", "note"]];
  const duplicates = [["kind", "key", "count"]];
  const extras = [["remote sku", "remote handle", "remote title", "remote product title", "remote product status"]];
  const inventoryTruncated = [["sku", "handle", "inventory item id", "note"]];

  for (const [sku, count] of remoteSkuCounts) {
    if (count > 1) duplicates.push(["sku", sku, count]);
  }
  for (const [handle, count] of remoteHandleCounts) {
    if (count > 1) duplicates.push(["handle", handle, count]);
  }

  for (const local of expected) {
    const remote = remoteBySku.get(local.sku);
    if (!remote) {
      missing.push([
        local.sku,
        local.handle,
        local.rowNumber,
        local.title,
        "no remote variant with matching SKU",
        remoteByHandle.has(local.handle) ? "yes" : "no"
      ]);
      continue;
    }

    if (remote.product?.handle !== local.handle) {
      addMismatch(mismatches, local, remote, "handle", local.handle, remote.product?.handle || "");
    }
    if (remote.product?.title !== local.title) {
      addMismatch(mismatches, local, remote, "title", local.title, remote.product?.title || "");
    }
    if ((remote.product?.vendor || "") !== local.vendor) {
      addMismatch(mismatches, local, remote, "vendor", local.vendor, remote.product?.vendor || "");
    }
    if ((remote.product?.productType || "") !== local.productType) {
      addMismatch(mismatches, local, remote, "type", local.productType, remote.product?.productType || "");
    }
    if (Number(remote.price) !== Number(local.variantPrice)) {
      addMismatch(mismatches, local, remote, "price", local.variantPrice, remote.price || "");
    }

    const selectedOption = remote.selectedOptions?.[0]?.value || "";
    if (selectedOption !== "Default Title") {
      addMismatch(mismatches, local, remote, "option1 value", "Default Title", selectedOption);
    }

    const remoteTags = new Set(remote.product?.tags || []);
    for (const tag of ["legacy-import"]) {
      if (!remoteTags.has(tag)) addMismatch(mismatches, local, remote, `missing tag ${tag}`, tag, "");
    }

    const remoteOnHand = onHandForVariant(remote, locationName);
    if (remoteOnHand !== local.inventoryQuantity) {
      addMismatch(
        mismatches,
        local,
        remote,
        locationName ? `on_hand inventory at ${locationName}` : "on_hand inventory total",
        local.inventoryQuantity,
        remoteOnHand
      );
    }

    if (remote.inventoryItem?.inventoryLevels?.pageInfo?.hasNextPage) {
      inventoryTruncated.push([
        local.sku,
        local.handle,
        remote.inventoryItem.id,
        `only first ${INVENTORY_LEVEL_PAGE_SIZE} inventory levels fetched`
      ]);
    }

    const legacyBody = parseLegacyBody(remote.product?.descriptionHtml || "");
    for (const field of LEGACY_BODY_FIELDS) {
      const localValue = field === "source row" ? String(local.rowNumber) : local.values[field];
      if (!legacyBody.has(field)) {
        addMismatch(mismatches, local, remote, `body legacy ${field}`, localValue, "", "missing legacy field");
      } else if (legacyBody.get(field) !== String(localValue ?? "")) {
        addMismatch(mismatches, local, remote, `body legacy ${field}`, localValue, legacyBody.get(field));
      }
    }
  }

  for (const variant of remoteVariants) {
    const sku = String(variant.sku || "").trim();
    if (!sku || expectedSkuSet.has(sku)) continue;
    extras.push([sku, variant.product?.handle || "", variant.title || "", variant.product?.title || "", variant.product?.status || ""]);
  }

  const excludedRows = [["source row", "reason", ...SOURCE_HEADERS]];
  for (const item of excluded) {
    excludedRows.push([item.rowNumber, item.reason, ...SOURCE_HEADERS.map((header) => item.values[header])]);
  }

  return { missing, mismatches, duplicates, extras, inventoryTruncated, excludedRows };
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    console.log(usage());
    return;
  }

  const outputDir = getArgValue("--output-dir") || DEFAULT_OUTPUT_DIR;
  const oxpsPath = getArgValue("--oxps") || "shopify-data/file.oxps";
  const csvPath = getArgValue("--csv");
  const locationName = getArgValue("--location") || "";
  const includePlaceholders = hasArg("--include-placeholders");
  const storeDomain = normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN || "");
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
  const apiVersion = process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION;

  if (!storeDomain || !token) {
    throw new Error(`Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN.\n${usage()}`);
  }

  if (!csvPath && !(await pathExists(oxpsPath))) {
    throw new Error(`Missing ${oxpsPath}. Pass --csv shopify-data/file_items.csv to audit from an existing CSV.`);
  }

  await mkdir(outputDir, { recursive: true });

  const local = await loadLocalRows({ oxpsPath, csvPath, outputDir, includePlaceholders });
  console.log(`Loaded ${local.expected.length} local importable rows from ${local.inputCsv}.`);
  if (local.excluded.length) console.log(`Excluded ${local.excluded.length} placeholder/artifact rows.`);

  const remoteVariants = await fetchRemoteVariants({ storeDomain, token, apiVersion });
  const remoteProductCount = new Set(remoteVariants.map((variant) => variant.product?.id).filter(Boolean)).size;
  console.log(`Fetched ${remoteVariants.length} remote Shopify variants across ${remoteProductCount} products.`);

  const result = compare({ expected: local.expected, excluded: local.excluded, remoteVariants, locationName });
  await writeCsv(path.join(outputDir, "missing-local-in-shopify.csv"), result.missing);
  await writeCsv(path.join(outputDir, "shopify-mismatches.csv"), result.mismatches);
  await writeCsv(path.join(outputDir, "extra-shopify-variants.csv"), result.extras);
  await writeCsv(path.join(outputDir, "duplicate-remote-keys.csv"), result.duplicates);
  await writeCsv(path.join(outputDir, "truncated-inventory-levels.csv"), result.inventoryTruncated);
  await writeCsv(path.join(outputDir, "excluded-local-rows.csv"), result.excludedRows);

  const summary = {
    generatedAt: new Date().toISOString(),
    storeDomain,
    apiVersion,
    source: local.inputCsv,
    locationFilter: locationName || null,
    localRowsCompared: local.expected.length,
    localRowsExcluded: local.excluded.length,
    remoteProducts: remoteProductCount,
    remoteVariants: remoteVariants.length,
    missingLocalInShopify: result.missing.length - 1,
    mismatchRows: result.mismatches.length - 1,
    extraShopifyVariants: result.extras.length - 1,
    duplicateRemoteKeys: result.duplicates.length - 1,
    truncatedInventoryItems: result.inventoryTruncated.length - 1,
    outputs: {
      missing: path.join(outputDir, "missing-local-in-shopify.csv"),
      mismatches: path.join(outputDir, "shopify-mismatches.csv"),
      extraRemote: path.join(outputDir, "extra-shopify-variants.csv"),
      duplicates: path.join(outputDir, "duplicate-remote-keys.csv"),
      truncatedInventory: path.join(outputDir, "truncated-inventory-levels.csv"),
      excludedLocal: path.join(outputDir, "excluded-local-rows.csv")
    }
  };

  await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
