# Shopify Migration Handoff

## Current Store

- Store domain: `26gcsf-0y.myshopify.com`
- Admin URL: `https://admin.shopify.com/store/26gcsf-0y`
- Storefront is password-protected as of the last check.
- Use `2026-04` unless there is a deliberate Shopify API upgrade.

Do not use `26gcsf-0y-myshopify.com`. It does not resolve. The valid Shopify host is `26gcsf-0y.myshopify.com`.

## Secret Handling

- `.env.local` is local-only and ignored by git.
- Never commit `.env.local`, Shopify client secrets, Admin tokens, or Storefront tokens.
- The Dev Dashboard client secret used during setup was visible during this work. Rotate it before pushing or sharing repo history.

Required local env for remote audit with the current Dev Dashboard flow:

```sh
SHOPIFY_STORE_DOMAIN=26gcsf-0y.myshopify.com
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_API_VERSION=2026-04
```

Legacy/admin-created custom apps can use this instead:

```sh
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
```

Required Admin API scopes:

```txt
read_products
read_inventory
read_locations
```

## 2026 Shopify Auth Flow

New Shopify Dev Dashboard apps do not show an Admin API access token after install. The generic post-install app page is expected and is not where the token appears.

For Dev Dashboard apps:

1. Open `dev.shopify.com/dashboard`.
2. Open the app.
3. Go to `Settings`.
4. Copy `Client ID`.
5. Reveal/copy `Secret`.
6. Add them to `.env.local` as `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.
7. Leave `SHOPIFY_ADMIN_ACCESS_TOKEN` blank unless using an older admin-created custom app.

The audit script exchanges Client ID/Secret for a short-lived access token with Shopify's client credentials grant.

## Data Layout

Relevant source/import data lives in `shopify-data/`:

```txt
shopify-data/file.oxps
shopify-data/file_items.csv
shopify-data/file_items_shopify_product_preserved.csv
shopify-data/file_items_shopify_inventory_preserved.csv
shopify-data/file_items_shopify_preserved_excluded.csv
shopify-data/file_items_shopify_preserved_report.json
```

Relevant migration tools live in `shopify-tools/`:

```txt
shopify-tools/oxps_inventory_to_csv.py
shopify-tools/build_shopify_preserved_import_csvs.mjs
shopify-tools/audit_shopify_against_oxps.mjs
shopify-tools/shopify-csv-adapter.mjs
shopify-tools/read_all_csv_rows.html
```

Obsolete first-pass root files were removed:

```txt
file_items_shopify_import.csv
file_items_shopify_import_report.json
file_items_shopify_inventory_import.csv
```

## Product/Inventory Import Order

Import products first. Inventory import cannot create products or variants; it only updates inventory for existing SKUs.

Current usable files:

```txt
Product import:
shopify-data/file_items_shopify_product_preserved.csv

Inventory import:
shopify-data/file_items_shopify_inventory_preserved.csv
```

Use Shopify's product importer for the product CSV. Use Shopify's inventory importer for the inventory CSV.

The inventory CSV intentionally has blank `Location`. The user requested removing the template location. If Shopify requires a location at import time, fill the exact Shopify location name in that column before import or rebuild with a location-aware script.

## CSV Cleanup Decisions

Source rows:

```txt
shopify-data/file_items.csv: 22,497 rows
importable rows: 22,481
excluded rows: 16
```

Excluded rows:

- 1 blank-code `CRESTAR` report artifact.
- 15 category/header placeholder rows where `whse`, `rlf`, or `imm` equals `100000`.

Rows with all stock/price fields zero/blank were kept, not deleted. They are represented as draft/unpublished product rows.

Preserved fields embedded in `Body (HTML)`:

```txt
source row
code
description
vendor
whse
rlf
imm
export price
retail price
w. sale price
```

Shopify handle behavior:

- `Handle` is generated from legacy `code`.
- Handles are lowercase URL-safe slugs.
- Leading `+` is stripped.
- Spaces/slashes/special chars become hyphens or are transliterated/removed.
- Duplicate handles get numeric suffixes.
- Each current row is treated as one standalone single-variant product.

Inventory quantity behavior:

- `whse` is the starting inventory quantity.
- Negative `whse` becomes `0`.
- Fractional `whse` is floored.

## Rebuild Preserved Import CSVs

Run from repo root:

```sh
node shopify-tools/build_shopify_preserved_import_csvs.mjs
```

Expected report shape:

```txt
sourceRows: 22497
productRows: 22481
inventoryRows: 22481
excludedRows: 16
draftUnpublishedRows: 6193
duplicateHandlesResolved: 9
missingTitleFallbackRows: 9
```

Outputs:

```txt
shopify-data/file_items_shopify_product_preserved.csv
shopify-data/file_items_shopify_inventory_preserved.csv
shopify-data/file_items_shopify_preserved_excluded.csv
shopify-data/file_items_shopify_preserved_report.json
```

## Remote Audit

Run from repo root after `.env.local` is configured:

```sh
set -a; source .env.local; set +a
npm run shopify:audit-remote -- --csv shopify-data/file_items.csv
```

Outputs:

```txt
.shopify-audit/summary.json
.shopify-audit/missing-local-in-shopify.csv
.shopify-audit/shopify-mismatches.csv
.shopify-audit/extra-shopify-variants.csv
.shopify-audit/duplicate-remote-keys.csv
.shopify-audit/truncated-inventory-levels.csv
.shopify-audit/excluded-local-rows.csv
```

Last successful audit:

```txt
generatedAt: 2026-06-13T08:55:40.615Z
remoteProducts: 4186
remoteVariants: 4186
localRowsCompared: 22481
localRowsExcluded: 16
missingLocalInShopify: 18295
mismatchRows: 2124
extraShopifyVariants: 0
duplicateRemoteKeys: 0
truncatedInventoryItems: 0
```

Interpretation:

- All `4,186` remote Shopify SKUs existed in the local CSV.
- `18,295` local SKUs had not yet been imported to Shopify.
- No extra Shopify SKUs were found outside the local CSV.
- No duplicate remote SKUs/handles were found.
- No inventory level truncation was detected.

Mismatch breakdown from the last audit:

```txt
vendor: 2113
price: 11
```

Vendor mismatches:

```txt
local Vendor = blank
remote Shopify Vendor = sandbox
```

These are not missing products. They are field differences for matched SKUs.

Price mismatches are rounding noise where local has 3 decimals and Shopify has 2 decimals. Max observed delta:

```txt
0.004
```

Example:

```txt
A102 CL6115/27W: local 135.514, Shopify 135.51
```

## Common Failure Modes

`401 Unauthorized`:

- `SHOPIFY_ADMIN_ACCESS_TOKEN` is wrong, stale, or for another store.
- Client ID/Secret was pasted into `SHOPIFY_ADMIN_ACCESS_TOKEN`.
- App is not installed on `26gcsf-0y.myshopify.com`.
- App scopes are missing.

Fix for current Dev Dashboard apps:

- Blank `SHOPIFY_ADMIN_ACCESS_TOKEN`.
- Set `SHOPIFY_CLIENT_ID`.
- Set `SHOPIFY_CLIENT_SECRET`.
- Confirm the app and store are in the same Shopify organization.

`shop_not_permitted` during token exchange:

- App and dev store are not in the same Shopify organization.
- Store was created outside the Dev Dashboard org.
- Wrong store domain/subdomain in `.env.local`.

Wrong domain:

- Use `26gcsf-0y.myshopify.com`.
- Do not use `26gcsf-0y-myshopify.com`.

## Next Recommended Actions

1. Rotate the Dev Dashboard client secret before pushing or sharing repo history.
2. Decide whether remote `Vendor=sandbox` should be normalized to blank/local vendor or left as-is.
3. Treat 2-decimal Shopify price rounding as acceptable unless accounting requires exact 3-decimal preservation.
4. Import remaining products before inventory updates.
5. If inventory import requires location, confirm exact Shopify location name and rebuild/fill inventory CSV.
