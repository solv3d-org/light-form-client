# Light + Form Client

React/Vite storefront prepared for Shopify Storefront API.

## Local

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set the `VITE_SHOPIFY_*` values to load Shopify products and cart checkout. Without those values, the app uses the bundled preview catalog and disables checkout.

## Shopify Flow

- Browser uses Storefront API `2026-04`.
- Cart IDs persist in `localStorage`.
- Checkout redirects to Shopify hosted checkout through cart `checkoutUrl`.
- Admin API credentials live in `../light-form-backend` and must not use `VITE_`.
- Staff IMS UI is available at `/staff` and calls `VITE_STAFF_API_BASE_URL`.

## CSV Migration

See `../light-form-backend/docs/shopify-migration.md` for Shopify migration handoff, data locations, auth flow, import order, and audit interpretation.

Run Admin/migration scripts from `../light-form-backend`:

```sh
cd ../light-form-backend
npm run shopify:audit-csv -- path/to/products.csv
npm run shopify:import-products -- path/to/products.csv
npm run shopify:import-products -- path/to/products.csv --commit
```

`shopify:import-products` writes `.shopify-import/products.productCreate.jsonl`. The `--commit` path validates Admin env and stops before mutation until the final CSV schema is locked.
