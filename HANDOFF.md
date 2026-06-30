# Handoff TODO

- Remove the static scraped catalog artifact before business handoff: `src/data/lightProCatalog.js`, `src/data/products.js`, `public/light-pro-catalog/`, and `scripts/scrape-light-pro-catalog.mjs`. Active storefront catalog paths should remain Shopify-backed.
- Create a Shopify navigation menu with handle `shop-categories` for the shop category rail. Link menu items to Shopify collections; set `PUBLIC_SHOP_CATEGORY_MENU_HANDLE` only if a different handle is used.
