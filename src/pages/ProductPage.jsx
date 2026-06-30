import {
  CartForm,
  getAdjacentAndFirstAvailableVariants,
  getProductOptions,
  ShopPayButton,
  useOptimisticVariant,
  useSelectedOptionInUrlParam
} from "@shopify/hydrogen";
import { Link, useNavigate } from "react-router";
import { normalizeShopifyProduct } from "../lib/shopifyStorefront";
import { useCartDrawer } from "../context/CartDrawerContext";
import { ShoppingBagIcon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import ProductImage from "../components/ProductImage";
import ProductPrice from "../components/ProductPrice";
import ProductUtilityButtons from "../components/ProductUtilityButtons";

function getCartError(fetcher) {
  const error = fetcher.data?.errors?.[0];
  return error?.message || "";
}

function FallbackProductDetail({ product }) {
  return (
    <main>
      <section className="page-hero">
        <div className="site-shell product-detail-grid">
          <div className="product-detail-media">
            <ProductImage src={product.image} alt={product.imageAlt || product.title} image={product.imageData} />
          </div>
          <div className="product-detail-copy">
            <p className="page-kicker">
              {product.category} · Model {product.model}
            </p>
            <h1>{product.title}</h1>
            <ProductPrice product={product} />
            <ProductUtilityButtons product={product} />
            <div className="hero-actions">
              {product.sourceUrl && (
                <a className="button-primary" href={product.sourceUrl} target="_blank" rel="noreferrer">
                  View product
                </a>
              )}
              <Link className="button-secondary" to="/shop">
                Back to shop
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProductOptions({ productOptions }) {
  const navigate = useNavigate();

  return (
    <div className="product-option-groups">
      {productOptions.map((option) => {
        if (option.optionValues.length <= 1) return null;

        return (
          <div className="product-option-group" key={option.name}>
            <p className="product-option-name">{option.name}</p>
            <div className="product-option-values">
              {option.optionValues.map((value) => {
                const className = `product-option-value${value.selected ? " is-active" : ""}`;
                const swatchImage = value.swatch?.image?.previewImage?.url;
                const swatchColor = value.swatch?.color;
                const label = swatchImage || swatchColor ? (
                  <span
                    className="product-option-swatch"
                    aria-label={value.name}
                    style={{ backgroundColor: swatchColor || "transparent" }}
                  >
                    {swatchImage && <img src={swatchImage} alt={value.name} />}
                  </span>
                ) : (
                  value.name
                );

                if (value.isDifferentProduct) {
                  return (
                    <Link
                      className={className}
                      key={`${option.name}-${value.name}`}
                      preventScrollReset
                      replace
                      to={`/products/${value.handle}?${value.variantUriQuery}`}
                    >
                      {label}
                    </Link>
                  );
                }

                return (
                  <button
                    className={className}
                    type="button"
                    key={`${option.name}-${value.name}`}
                    disabled={!value.exists || !value.available}
                    aria-disabled={!value.available}
                    onClick={() => {
                      if (!value.selected) {
                        navigate(`?${value.variantUriQuery}`, {
                          replace: true,
                          preventScrollReset: true
                        });
                      }
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShopifyProductDetail({ shopifyProduct, storeDomain }) {
  const { openCart } = useCartDrawer();
  const shopPayStoreDomain = storeDomain ? (storeDomain.startsWith("http") ? storeDomain : `https://${storeDomain}`) : "";
  const selectedVariant = useOptimisticVariant(
    shopifyProduct.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(shopifyProduct)
  );
  useSelectedOptionInUrlParam(selectedVariant?.selectedOptions || []);

  const productOptions = getProductOptions({
    ...shopifyProduct,
    selectedOrFirstAvailableVariant: selectedVariant
  });
  const product = normalizeShopifyProduct(shopifyProduct, 0, { storeDomain }, selectedVariant);
  const canAddToCart = selectedVariant?.availableForSale && selectedVariant?.id;
  const images = shopifyProduct.images?.nodes?.length ? shopifyProduct.images.nodes : [shopifyProduct.featuredImage].filter(Boolean);
  const specs = [
    ["SKU", selectedVariant?.sku],
    ["Vendor", shopifyProduct.vendor],
    ["Type", shopifyProduct.productType],
    ["Category", shopifyProduct.collections?.nodes?.[0]?.title],
    ["Variant", selectedVariant?.title && selectedVariant.title !== "Default Title" ? selectedVariant.title : ""],
    [
      "Options",
      selectedVariant?.selectedOptions
        ?.filter((option) => option.value !== "Default Title")
        .map((option) => `${option.name}: ${option.value}`)
        .join(", ")
    ],
    ["Availability", canAddToCart ? "Available" : "Unavailable"]
  ].filter(([, value]) => value);
  const relatedSeen = new Set();
  const relatedProducts = (shopifyProduct.collections?.nodes || [])
    .flatMap((collection) => collection.products?.nodes || [])
    .filter((related) => {
      if (related.id === shopifyProduct.id || relatedSeen.has(related.id)) return false;
      relatedSeen.add(related.id);
      return true;
    })
    .slice(0, 4)
    .map((related, index) => normalizeShopifyProduct(related, index, { storeDomain }));

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell product-detail-grid">
          <div className="product-detail-media">
            <ProductImage src={product.image} alt={product.imageAlt || product.title} image={product.imageData} />
            {images.length > 1 && (
              <div className="product-gallery-strip" aria-label="Product images">
                {images.map((image) => (
                  <img src={image.url} alt={image.altText || shopifyProduct.title} key={image.id || image.url} loading="lazy" />
                ))}
              </div>
            )}
          </div>
          <div className="product-detail-copy">
            <p className="page-kicker">
              {product.category} · Model {product.model}
            </p>
            <h1>{shopifyProduct.title}</h1>
            <ProductPrice product={product} price={selectedVariant?.price} compareAtPrice={selectedVariant?.compareAtPrice} />
            <ProductOptions productOptions={productOptions} />
            <ProductUtilityButtons product={product} />
            <div className="hero-actions">
              <CartForm
                route="/cart"
                action={CartForm.ACTIONS.LinesAdd}
                inputs={{ lines: selectedVariant?.id ? [{ merchandiseId: selectedVariant.id, quantity: 1 }] : [] }}
              >
                {(fetcher) => (
                  <>
                    <button
                      className={`button-primary${canAddToCart ? " product-action-icon" : ""}`}
                      type="submit"
                      aria-label={canAddToCart ? `Add ${shopifyProduct.title} to cart` : "Sold out"}
                      title={canAddToCart ? "Add to cart" : "Sold out"}
                      disabled={!canAddToCart || fetcher.state !== "idle"}
                      onClick={openCart}
                    >
                      {canAddToCart ? <ShoppingBagIcon /> : "Sold out"}
                    </button>
                    {getCartError(fetcher) && (
                      <p className="product-action-error" role="alert">
                        {getCartError(fetcher)}
                      </p>
                    )}
                  </>
                )}
              </CartForm>
              <Link className="button-secondary" to="/shop">
                Back to shop
              </Link>
            </div>
            {canAddToCart && storeDomain && (
              <div className="shop-pay-wrap">
                <ShopPayButton storeDomain={shopPayStoreDomain} variantIds={[selectedVariant.id]} />
              </div>
            )}
            {specs.length > 0 && (
              <dl className="product-specs">
                {specs.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </section>
      {relatedProducts.length > 0 && (
        <section className="section">
          <div className="site-shell">
            <div className="section-copy product-related-head">
              <p className="section-kicker">Related</p>
              <h2 className="section-title">From the same collection.</h2>
            </div>
            <div className="product-grid">
              {relatedProducts.map((related) => (
                <ProductCard key={related.id} product={related} variant="minimal" />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default function ProductPage({ product, shopifyProduct, storeDomain }) {
  if (!product) {
    return (
      <main>
        <section className="page-hero">
          <div className="site-shell page-hero-grid">
            <div>
              <p className="page-kicker">Catalog</p>
              <h1>Product unavailable.</h1>
            </div>
            <aside className="page-hero-aside">
              <Link className="button-secondary" to="/shop">
                Back to shop
              </Link>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  if (shopifyProduct) {
    return <ShopifyProductDetail shopifyProduct={shopifyProduct} storeDomain={storeDomain} />;
  }

  return <FallbackProductDetail product={product} />;
}
