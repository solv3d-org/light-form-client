import { getConfig } from "../src/config.js";
import { downloadBulkJsonl, getCatalogBulkOperation, parseCatalogBulkJsonl, startCatalogBulkOperation } from "../src/shopifyAdmin.js";
import { StaffStore } from "../src/store.js";

const action = process.argv[2] || "status";
const config = getConfig();

async function main() {
  if (action === "start") {
    console.log(JSON.stringify({ ok: true, bulkOperation: await startCatalogBulkOperation(config) }, null, 2));
    return;
  }

  if (action === "status") {
    console.log(JSON.stringify({ ok: true, bulkOperation: await getCatalogBulkOperation(config) }, null, 2));
    return;
  }

  if (action === "import") {
    const bulkOperation = await getCatalogBulkOperation(config);
    if (!bulkOperation?.url) throw new Error("No completed Shopify bulk result URL is available.");
    const records = parseCatalogBulkJsonl(await downloadBulkJsonl(bulkOperation.url));
    const store = await StaffStore.create(config);
    console.log(JSON.stringify({
      ok: true,
      bulkOperation,
      parsedRows: records.length,
      importedRows: await store.upsertShopifyCatalog(records)
    }, null, 2));
    return;
  }

  throw new Error("Usage: npm run shopify:bulk-sync -- start|status|import");
}

main().catch((error) => {
  console.error(`bulk sync failed: ${error.message}`);
  process.exit(1);
});
