import path from "node:path";
import { loadCsvProducts, summarizeCsvProducts } from "./shopify-csv-adapter.mjs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("usage: npm run shopify:audit-csv -- path/to/products.csv");
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), filePath);

try {
  const { headers, products } = await loadCsvProducts(absolutePath);
  const summary = summarizeCsvProducts(products);

  console.log(
    JSON.stringify(
      {
        file: absolutePath,
        headers,
        ...summary
      },
      null,
      2
    )
  );

  if (summary.invalidRows > 0) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
