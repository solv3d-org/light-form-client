# Light + Form Backend

Staff IMS API for the Light + Form frontend. Admin API credentials stay here; the public frontend keeps using Storefront API only.

## Local

```sh
cp .env.example .env.local
npm run dev
```

The first start bootstraps one admin if `data/staff-users.json` is empty and `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` are set.

Set `STAFF_CATALOG_SOURCE=shopify`; staff catalog operations use the Shopify Admin API.

Set `DATABASE_URL` to use Postgres for IMS-only data: staff users, RBAC overrides, staff order records, and audit entries. Without `DATABASE_URL`, local development uses `data/staff-users.json`, `data/staff-orders.json`, and `data/staff-audit-log.jsonl`.

Set `SHOPIFY_LOCATION_ID=gid://shopify/Location/...` and run `npm run shopify:preflight` from the repo root. The preflight performs read-only schema/location checks and does not create or update Shopify products.

Set `SHOPIFY_WEBHOOK_SECRET` or `SHOPIFY_CLIENT_SECRET` for `/webhooks/shopify` HMAC verification. Set `WEBHOOK_PUBLIC_BASE_URL=https://...` and run `npm run shopify:register-webhooks` to create Shopify webhook subscriptions.

Run `npm run shopify:bulk-sync -- start`, then `status`, then `import` to seed the IMS Shopify catalog cache from Admin bulk operations.

## Roles

| Role | Access |
| --- | --- |
| `admin` | All permissions |
| `pm` | All permissions except Manage Shopify sync, Manage staff, and Read audit log |
| `staff` | Staff cart, draft order, invoice, complete order |

Admins can add per-user permission overrides from `/staff`. Overrides are stored as `permissionOverrides.allow` and `permissionOverrides.deny` in `data/staff-users.json`.

## Staff IMS API

All protected routes use `Authorization: Bearer <token>`.

```sh
GET /health
POST /api/auth/login
GET /api/auth/me
GET /api/staff/users
GET /api/staff/permissions
POST /api/staff/users
PATCH /api/staff/users/:id
GET /api/storefront/curation
PATCH /api/storefront/curation # { homeItems: [...], shopItems: [...] }
GET /api/audit?limit=100
GET /api/inventory/search?q=sku-or-title
POST /api/inventory/set-on-hand
GET /api/products/search?q=sku-or-title
PATCH /api/products/:id
DELETE /api/products/:id
POST /api/sync/shopify/bulk/start
GET /api/sync/shopify/bulk/status
POST /api/sync/shopify/bulk/import
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
- Staff interactions append to Postgres when `DATABASE_URL` is set, otherwise `data/staff-audit-log.jsonl`.
- Admins can inspect audit entries in `/staff` or call `GET /api/audit`.

## Customer Visibility

- Public client uses Storefront API only.
- Staff IMS uses this backend and Admin API only.
- Cost, margin, supplier, bin, approval, and ops notes are not requested by the Storefront catalog.
- If these fields are later stored in Shopify metafields, keep Storefront access disabled.

## Shopify

Uses Admin GraphQL for product search/CRUD and inventory writes. Uses Admin REST DraftOrder endpoints for draft orders, invoices, and completion.

Required Admin scopes: `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_draft_orders`, `write_draft_orders`.

Webhook endpoint: `POST /webhooks/shopify`. It verifies Shopify HMAC before parsing JSON, deduplicates by `X-Shopify-Webhook-Id`, records events, and refreshes IMS cache/order state where applicable.
