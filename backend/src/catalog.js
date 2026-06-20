import { HttpError } from "./http.js";
import {
  archiveProduct,
  completeDraftOrder,
  createDraftOrder,
  createProduct,
  deleteDraftOrder,
  getDraftOrder,
  searchInventory,
  sendDraftOrderInvoice,
  setInventoryOnHand,
  updateProduct
} from "./shopifyAdmin.js";

function shopifyVariantToProduct(variant) {
  return {
    id: variant.product?.id || variant.id,
    source: "shopify",
    handle: variant.product?.handle || "",
    title: variant.product?.title || variant.title,
    bodyHtml: "",
    vendor: variant.product?.vendor || "",
    productType: variant.product?.productType || "",
    tags: "",
    status: variant.product?.status || "ACTIVE",
    sku: variant.sku || "",
    price: variant.price || "",
    compareAtPrice: variant.compareAtPrice || "",
    barcode: variant.barcode || "",
    imageUrl: "",
    imageAlt: "",
    inventory: variant.inventory || { tracked: false, available: 0, onHand: 0, levels: [] },
    shopifyProductId: variant.product?.id || "",
    shopifyVariantId: variant.id || "",
    inventoryItemId: variant.inventoryItemId || variant.inventory?.inventoryItemId || ""
  };
}

function productToVariant(record) {
  return {
    id: record.shopifyVariantId || record.id,
    numericId: "",
    title: "Default Title",
    sku: record.sku,
    barcode: record.barcode || "",
    price: record.price,
    product: {
      id: record.shopifyProductId || record.id,
      handle: record.handle,
      title: record.title,
      vendor: record.vendor,
      productType: record.productType,
      status: record.status
    },
    inventory: record.inventory,
    catalogProduct: record
  };
}

export class ShopifyCatalogProvider {
  constructor(config, store = null) {
    this.config = config;
    this.store = store;
  }

  async searchProducts(input = {}) {
    if (this.store?.shopifyCatalogCacheCount && (await this.store.shopifyCatalogCacheCount()) > 0) {
      return this.store.searchShopifyCatalog(input);
    }
    return (await searchInventory(this.config, input)).map(shopifyVariantToProduct);
  }

  async searchInventory(input = {}) {
    if (this.store?.shopifyCatalogCacheCount && (await this.store.shopifyCatalogCacheCount()) > 0) {
      return (await this.store.searchShopifyCatalog(input)).map(productToVariant);
    }
    return searchInventory(this.config, input);
  }

  async createProduct(input) {
    const product = await createProduct(this.config, input);
    const variant = product?.variants?.nodes?.[0] || {};
    const record = shopifyVariantToProduct({
      id: variant.id || product?.id,
      sku: variant.sku || input.sku || "",
      price: variant.price || input.price || "",
      product,
      inventory: { tracked: true, available: Number(input.onHand || 0), onHand: Number(input.onHand || 0), levels: [] }
    });
    await this.store?.upsertShopifyCatalog?.([record]);
    return record;
  }

  async updateProduct(id, input) {
    const product = await updateProduct(this.config, id, input);
    const variant = product?.variants?.nodes?.[0] || {};
    const record = shopifyVariantToProduct({
      id: variant.id || input.variantId || id,
      sku: variant.sku || input.sku || "",
      price: variant.price || input.price || "",
      product,
      inventory: { tracked: true, available: Number(input.onHand || 0), onHand: Number(input.onHand || 0), levels: [] }
    });
    await this.store?.upsertShopifyCatalog?.([record]);
    return record;
  }

  async archiveProduct(id) {
    return archiveProduct(this.config, id);
  }

  async setInventoryOnHand(input) {
    return setInventoryOnHand(this.config, input);
  }

  async createDraftOrder(input) {
    return createDraftOrder(this.config, input);
  }

  async getDraftOrder(draftOrderId) {
    return getDraftOrder(this.config, draftOrderId);
  }

  async sendDraftOrderInvoice(draftOrderId, input) {
    return sendDraftOrderInvoice(this.config, draftOrderId, input);
  }

  async completeDraftOrder(draftOrderId, input) {
    return completeDraftOrder(this.config, draftOrderId, input);
  }

  async deleteDraftOrder(draftOrderId) {
    return deleteDraftOrder(this.config, draftOrderId);
  }
}

export function createCatalogProvider(config, store = null) {
  if (config.catalog?.source !== "shopify") throw new HttpError(500, "Shopify catalog source required.");
  return new ShopifyCatalogProvider(config, store);
}
