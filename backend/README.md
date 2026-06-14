# Light + Form Backend

Staff IMS API for the Light + Form frontend. Admin API credentials stay here; the public frontend keeps using Storefront API only.

## Local

```sh
cp .env.example .env.local
npm run dev
```

The first start bootstraps one admin if `data/staff-users.json` is empty and `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` are set.

Set `STAFF_CATALOG_SOURCE=csv` for MVP/local testing or `STAFF_CATALOG_SOURCE=shopify` for live Admin API mode. CSV mode copies the dated preserved snapshots into `data/local-shopify-products.csv` and `data/local-shopify-inventory.csv` if those working files are missing, then mutates only the working copies.

Before switching to `STAFF_CATALOG_SOURCE=shopify`, set `SHOPIFY_LOCATION_ID=gid://shopify/Location/...` and run `npm run shopify:preflight` from the repo root. The preflight performs read-only schema/location checks and does not create or update Shopify products.

## Roles

| Role | Access |
| --- | --- |
| `viewer` | Read inventory and orders |
| `operator` | Staff cart, draft order, invoice, complete order |
| `manager` | Operator + discounts, cancel orders, reserved inventory-adjust permission |
| `admin` | All permissions, staff users, audit log, cost/internal fields |

Admins can add per-user permission overrides from `/staff`. Overrides are stored as `permissionOverrides.allow` and `permissionOverrides.deny` in `data/staff-users.json`.

## Staff IMS API

All protected routes use `Authorization: Bearer <token>`.

```sh
POST /api/auth/login
GET /api/auth/me
GET /api/staff/users
GET /api/staff/permissions
POST /api/staff/users
PATCH /api/staff/users/:id
GET /api/audit?limit=100
GET /api/inventory/search?q=sku-or-title
POST /api/inventory/set-on-hand
GET /api/products/search?q=sku-or-title
POST /api/products
PATCH /api/products/:id
DELETE /api/products/:id
POST /api/orders/draft
GET /api/orders?status=pending
GET /api/orders?status=completed
GET /api/orders/:id
PATCH /api/orders/:id
POST /api/orders/:id/send-invoice
POST /api/orders/:id/complete
POST /api/orders/:id/cancel
```

Draft order payload:

```json
{
  "email": "customer@example.com",
  "lineItems": [{ "variantId": "gid://shopify/ProductVariant/123", "quantity": 1 }],
  "fulfillment": { "type": "delivery", "deliveryDate": "2026-06-20", "dateTba": false },
  "shippingAddress": { "firstName": "A", "lastName": "Customer", "address1": "1 Road", "city": "Singapore", "country": "Singapore", "zip": "000000" },
  "internal": { "supplier": "hidden from customer", "stockroomBin": "A1" }
}
```

Customer-hidden fields live in local `data/staff-orders.json`, not public frontend data.

## Logging

- Server requests log one `[api]` line with method, path, status, actor, and latency.
- Staff interactions append to `data/staff-audit-log.jsonl`.
- Admins can inspect audit entries in `/staff` or call `GET /api/audit`.

## Customer Visibility

- Public client uses Storefront API only.
- Staff IMS uses this backend and Admin API only.
- Cost, margin, supplier, bin, approval, and ops notes are not requested by the Storefront catalog.
- If these fields are later stored in Shopify metafields, keep Storefront access disabled.

## Shopify

Uses Admin GraphQL for product search/CRUD and inventory writes. Uses Admin REST DraftOrder endpoints for draft orders, invoices, and completion.

Required Admin scopes: `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_draft_orders`, `write_draft_orders`.
