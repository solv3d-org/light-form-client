const LIST_KEYS = {
  wishlist: "lightform:wishlist"
};

export function productListKey(listName) {
  return LIST_KEYS[listName] || LIST_KEYS.wishlist;
}

export function compactProduct(product) {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    model: product.model,
    category: product.category,
    priceLabel: product.priceLabel,
    image: product.image,
    imageAlt: product.imageAlt,
    imageData: product.imageData,
    sourceUrl: product.sourceUrl,
    availableForSale: product.availableForSale,
    checkoutEnabled: product.checkoutEnabled,
    shopifyVariantId: product.shopifyVariantId,
    dataSource: product.dataSource
  };
}

export function readProductList(listName) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(productListKey(listName)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeProductList(listName, items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(productListKey(listName), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("lightform:product-list", { detail: { listName } }));
}

export function toggleProductInList(listName, product) {
  const items = readProductList(listName);
  const exists = items.some((item) => item.id === product.id);
  const next = exists ? items.filter((item) => item.id !== product.id) : [compactProduct(product), ...items];
  writeProductList(listName, next);
  return !exists;
}

export function isProductInList(listName, productId) {
  return readProductList(listName).some((item) => item.id === productId);
}
