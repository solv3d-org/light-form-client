import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CsvCatalogProvider, parseCsv } from "../src/catalog.js";

const PRODUCT_CSV = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text
lamp-one,Lamp One,<p>Lamp One</p>,Vendor,ACC,legacy,true,Title,Default Title,,,,,SKU-1,0,shopify,5,deny,manual,25,,true,true,,,
`;

const INVENTORY_CSV = `Handle,Title,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,SKU,HS Code,COO,Location,Bin name,Incoming (not editable),Unavailable (not editable),Committed (not editable),Available (not editable),On hand (current),On hand (new)
lamp-one,Lamp One,Title,Default Title,,,,,SKU-1,,,,,,,,,,5
`;

async function csvConfig() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "light-form-catalog-"));
  const productBaseline = path.join(dir, "product_baseline.csv");
  const inventoryBaseline = path.join(dir, "inventory_baseline.csv");
  await writeFile(productBaseline, PRODUCT_CSV, "utf8");
  await writeFile(inventoryBaseline, INVENTORY_CSV, "utf8");
  return {
    dir,
    productBaseline,
    inventoryBaseline,
    config: {
      catalog: {
        source: "csv",
        productsCsvBaseline: productBaseline,
        inventoryCsvBaseline: inventoryBaseline,
        productsCsvWorking: path.join(dir, "working-products.csv"),
        inventoryCsvWorking: path.join(dir, "working-inventory.csv")
      }
    }
  };
}

test("CSV provider creates working copies without mutating baselines", async () => {
  const setup = await csvConfig();
  const provider = new CsvCatalogProvider(setup.config);

  const results = await provider.searchProducts({ query: "sku-1" });

  assert.equal(results.length, 1);
  assert.equal(results[0].inventory.onHand, 5);
  assert.equal(existsSync(setup.config.catalog.productsCsvWorking), true);
  assert.equal(await readFile(setup.productBaseline, "utf8"), PRODUCT_CSV);
  assert.equal(await readFile(setup.inventoryBaseline, "utf8"), INVENTORY_CSV);
});

test("CSV provider CRUD writes only working CSVs", async () => {
  const setup = await csvConfig();
  const provider = new CsvCatalogProvider(setup.config);

  const created = await provider.createProduct({
    title: "New Lamp",
    handle: "new-lamp",
    sku: "SKU-2",
    price: "40",
    onHand: "8"
  });
  assert.equal(created.handle, "new-lamp");

  const updated = await provider.updateProduct(created.id, { title: "New Lamp Updated", price: "45", onHand: "9" });
  assert.equal(updated.title, "New Lamp Updated");
  assert.equal(updated.inventory.onHand, 9);

  await provider.archiveProduct(updated.id);
  const afterArchive = await provider.searchProducts({ query: "new-lamp" });
  assert.equal(afterArchive.length, 0);

  const workingRows = parseCsv(await readFile(setup.config.catalog.productsCsvWorking, "utf8"));
  assert.equal(workingRows.some((row) => row.includes("New Lamp Updated")), true);
  assert.equal(await readFile(setup.productBaseline, "utf8"), PRODUCT_CSV);
});

test("CSV provider set-on-hand and local draft order stay local", async () => {
  const setup = await csvConfig();
  const provider = new CsvCatalogProvider(setup.config);

  const product = await provider.setInventoryOnHand({ sku: "SKU-1", onHand: "12" });
  assert.equal(product.inventory.onHand, 12);

  const draft = await provider.createDraftOrder({
    email: "customer@example.com",
    lineItems: [{ variantId: "csv:lamp-one", quantity: 2 }]
  });
  assert.match(draft.id, /^csv-draft:/);
  assert.equal(draft.email, "customer@example.com");

  const completed = await provider.completeDraftOrder(draft.id);
  assert.match(completed.order_id, /^csv-order:/);
});
