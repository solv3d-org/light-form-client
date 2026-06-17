# Light + Form

Full-stack monorepo for the Light + Form storefront and Staff IMS backend.

## Local

```sh
npm install
npm run dev
```

Root `npm run dev` starts the Hydrogen storefront and `backend/src/server.js`. `make dev`, `make dev-web`, and `make dev-backend` wrap the same commands.

Copy `.env.example` to `.env.local` and set `PUBLIC_STORE_DOMAIN`, `PUBLIC_STOREFRONT_API_TOKEN`, and `SESSION_SECRET` to load Shopify products and cart checkout. The Hydrogen storefront fails fast if Storefront env is missing in dev or production.

Backend config lives in `backend/.env.local`; copy `backend/.env.example` if needed.
Set backend `STAFF_CATALOG_SOURCE=csv` for local MVP CRUD against working CSV copies, or `STAFF_CATALOG_SOURCE=shopify` for live Shopify Admin CRUD.
Set backend `DATABASE_URL` to store IMS-only staff users, staff orders, and audit entries in Postgres.
Run `npm run shopify:preflight` before live mode; it is read-only.

## Staff IMS

- `/staff` signs in against the backend with `Authorization: Bearer <token>`.
- Admin users can create/disable staff, edit roles, customize per-user permission overrides, and view audit activity.
- Role presets live in `backend/src/rbac.js`; per-user overrides are stored in `backend/data/staff-users.json`.
- Staff activity is appended to `backend/data/staff-audit-log.jsonl` and exposed to admins through `/api/audit`.

## Shopify Flow

- Hydrogen uses Storefront API `2026-04`.
- Cart IDs persist in the Hydrogen session cookie.
- Checkout redirects to Shopify hosted checkout through cart `checkoutUrl`.
- Admin API credentials live in `backend/.env.local` and must not use `PUBLIC_`.
- Staff IMS UI is available at `/staff` and calls `PUBLIC_STAFF_API_BASE_URL`.
- Universal diagnostics are available at `/health`.

## CSV Migration

See `backend/docs/shopify-migration.md` for Shopify migration handoff, data locations, auth flow, import order, and audit interpretation.

Run Admin/migration scripts from the repo root:

```sh
npm run shopify:audit-csv -- path/to/products.csv
npm run shopify:import-products -- path/to/products.csv
npm run shopify:import-products -- path/to/products.csv --commit
```

`shopify:import-products` writes `.shopify-import/products.productCreate.jsonl`. The `--commit` path validates Admin env and stops before mutation until the final CSV schema is locked.
