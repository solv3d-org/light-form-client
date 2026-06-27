import { CartForm } from "@shopify/hydrogen";
import { useState } from "react";
import { Link } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";
import ProductUtilityButtons from "./ProductUtilityButtons";
import QuickViewModal from "./QuickViewModal";
import ProductImage from "./ProductImage";
import ProductPrice from "./ProductPrice";

function getCartError(fetcher) {
  const error = fetcher.data?.errors?.[0];
  return error?.message || "";
}

export default function ProductCard({ product, variant = "default" }) {
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const isMinimal = variant === "minimal";
  const { openCart } = useCartDrawer();
  const canAddToCart = product.checkoutEnabled && product.shopifyVariantId;
  const isSoldOut = !product.availableForSale;
  const productPath = product.handle ? `/products/${product.handle}` : "";

  return (
    <article
      className={`product-card${isMinimal ? " product-card-minimal" : ""}${isSoldOut ? " is-sold-out" : ""}`}
      id={`product-${product.id}`}
    >
      {productPath ? (
        <Link className="product-image-wrap" to={productPath}>
          <ProductImage src={product.image} alt={product.imageAlt || product.title} image={product.imageData} />
          {isSoldOut && <span className="product-status">Sold out</span>}
        </Link>
      ) : (
        <div className="product-image-wrap">
          <ProductImage src={product.image} alt={product.imageAlt || product.title} image={product.imageData} />
          {isSoldOut && <span className="product-status">Sold out</span>}
        </div>
      )}
      <div className="product-copy">
        {!isMinimal && (
          <p className="product-tag">
            {product.category} · Model {product.model}
          </p>
        )}
        <h3>{productPath ? <Link to={productPath}>{product.title}</Link> : product.title}</h3>
        <ProductPrice product={product} />
        <ProductUtilityButtons product={product} compact={isMinimal} />
        <div className="product-actions">
          <button className="button-inline product-action" type="button" onClick={() => setQuickViewOpen(true)}>
            Quick view
          </button>
          {canAddToCart ? (
            <CartForm
              route="/cart"
              action={CartForm.ACTIONS.LinesAdd}
              inputs={{ lines: [{ merchandiseId: product.shopifyVariantId, quantity: 1 }] }}
            >
              {(fetcher) => (
                <>
                  <button
                    className="button-inline product-action"
                    type="submit"
                    disabled={fetcher.state !== "idle"}
                    onClick={openCart}
                  >
                    Add to cart
                  </button>
                  {getCartError(fetcher) && (
                    <p className="product-action-error" role="alert">
                      {getCartError(fetcher)}
                    </p>
                  )}
                </>
              )}
            </CartForm>
          ) : (
            product.sourceUrl && (
              <a className="button-inline product-action" href={product.sourceUrl} target="_blank" rel="noreferrer">
                View product
              </a>
            )
          )}
        </div>
      </div>
      {quickViewOpen && <QuickViewModal product={product} onClose={() => setQuickViewOpen(false)} />}
    </article>
  );
}
