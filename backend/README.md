# Light + Form Backend

Staff IMS API for the Light + Form frontend. Admin API credentials stay here; the public frontend keeps using Storefront API only.

## Local

```sh
cp .env.example .env
npm run dev
```

The first start bootstraps one admin if `data/staff-users.json` is empty and `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` are set.

## Roles

| Role | Access |
| --- | --- |
| `viewer` | Read inventory and orders |
| `operator` | Staff cart, draft order, invoice, complete order |
| `manager` | Operator + discounts, cancel orders, inventory-adjust boundary |
| `admin` | All permissions, staff users, cost/internal fields |

## Staff IMS API

All protected routes use `Authorization: Bearer <token>`.

```sh
POST /api/auth/login
GET /api/auth/me
GET /api/staff/users
POST /api/staff/users
PATCH /api/staff/users/:id
GET /api/inventory/search?q=sku-or-title
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

## Customer Visibility

- Public client uses Storefront API only.
- Staff IMS uses this backend and Admin API only.
- Cost, margin, supplier, bin, approval, and ops notes are not requested by the Storefront catalog.
- If these fields are later stored in Shopify metafields, keep Storefront access disabled.

## Shopify

Uses Admin GraphQL for inventory search and Admin REST DraftOrder endpoints for draft orders, invoices, and completion.

Required Admin scopes: `read_products`, `read_inventory`, `read_draft_orders`, `write_draft_orders`.
