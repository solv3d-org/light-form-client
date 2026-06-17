# Repo Summary

Light + Form is a two-service app:

- Customer storefront: Hydrogen + React Router SSR.
- Staff IMS backend: Node service on `:8787`.
- Universal diagnostics: `/health`.

## Customer Frontend

- Uses Shopify Hydrogen.
- Uses Shopify Storefront API for customer catalog, cart, variant, and checkout data.
- Routes live in `app/routes`.
- Shared UI/components live in `src`.
- Cart is a Hydrogen cart stored by session cookie.
- Checkout redirects to Shopify hosted checkout through `cart.checkoutUrl`.
- Product images/prices/variants use Hydrogen helpers/components where available.
- Shopify Storefront env is required in dev and production.

Required frontend env:

```sh
SESSION_SECRET=...
PUBLIC_STORE_DOMAIN=...
PUBLIC_STOREFRONT_API_TOKEN=...
PUBLIC_STOREFRONT_API_VERSION=2026-04
PUBLIC_STAFF_API_BASE_URL=http://localhost:8787
```

## Staff IMS

- `/staff` is still a frontend route, but it calls the backend service.
- Staff browser code does not call Shopify directly.
- Staff auth, RBAC, audit log, internal order records, supplier/bin/ops notes, and cost fields are local backend concerns.
- Set `DATABASE_URL` to store IMS-only staff users, RBAC overrides, staff order records, and audit entries in Postgres.
- Without `DATABASE_URL`, local development stores IMS-only data in JSON/JSONL files under `data/`.
- Backend source mode is controlled by `STAFF_CATALOG_SOURCE`.

When `STAFF_CATALOG_SOURCE=csv`:

- Product/inventory/order workflows use local CSV/JSON data.
- Shopify Admin API is not touched.
- This is the default local/dev mode.

When `STAFF_CATALOG_SOURCE=shopify`:

- Backend uses Shopify Admin API for product search/CRUD/archive.
- Backend uses Shopify Admin API for inventory on-hand writes.
- Backend uses Shopify Admin REST DraftOrder endpoints for draft order create, invoice, complete, and cancel.
- `SHOPIFY_LOCATION_ID` is required for inventory writes.

Required backend Shopify env for live mode:

```sh
STAFF_CATALOG_SOURCE=shopify
SHOPIFY_STORE_DOMAIN=...
SHOPIFY_ADMIN_ACCESS_TOKEN=...
# or SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET
SHOPIFY_API_VERSION=2026-04
SHOPIFY_LOCATION_ID=gid://shopify/Location/...
STAFF_JWT_SECRET=...
DATABASE_URL=postgres://...
```

## API Boundary

- Customer frontend uses Storefront API.
- Staff backend uses Admin API.
- Staff frontend calls only the Staff IMS backend.
- Admin credentials stay backend-only.
- Public Storefront token is the only Shopify token exposed to the customer frontend.

## Commands

```sh
npm run dev          # Hydrogen frontend + backend
npm run dev:web      # Hydrogen frontend only
npm run dev:backend  # backend only
npm run build        # Hydrogen build
npm run check        # Hydrogen build + backend syntax check
npm test             # backend tests
```
