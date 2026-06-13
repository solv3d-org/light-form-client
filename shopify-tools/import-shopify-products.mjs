import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCsvProducts, summarizeCsvProducts, toProductCreateJsonl } from "./shopify-csv-adapter.mjs";

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--"));
const shouldCommit = args.includes("--commit");
const outputDirectory = path.resolve(process.cwd(), ".shopify-import");
const outputPath = path.join(outputDirectory, "products.productCreate.jsonl");

if (!inputPath) {
  console.error("usage: npm run shopify:import-products -- path/to/products.csv [--commit]");
  process.exit(1);
}

const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || "";
const adminAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-04";
const absoluteInputPath = path.resolve(process.cwd(), inputPath);

try {
  const { products } = await loadCsvProducts(absoluteInputPath);
  const summary = summarizeCsvProducts(products);

  if (summary.invalidRows > 0) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${toProductCreateJsonl(products)}\n`, "utf8");

  console.log(`Generated ${path.relative(process.cwd(), outputPath)} from ${products.length} rows.`);

  if (!shouldCommit) {
    console.log("Dry run only. Re-run with --commit after reviewing JSONL and env.");
    process.exit(0);
  }

  if (!storeDomain || !adminAccessToken) {
    throw new Error("SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN are required for --commit.");
  }

  console.log(`Ready for Shopify Admin bulk import at ${storeDomain} using API ${apiVersion}.`);
  console.log("Upload/run bulkOperationRunMutation with mutation productCreate($input: ProductInput!).");
  console.log("This scaffold intentionally stops before network mutation until the final CSV schema is locked.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
