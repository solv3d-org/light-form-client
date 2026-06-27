import { CartForm } from "@shopify/hydrogen";
import { Link } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";
import ProductImage from "./ProductImage";
import ProductPrice from "./ProductPrice";
import ProductUtilityButtons from "./ProductUtilityButtons";

function getCartError(fetcher) {
  const error = fetcher.data?.errors?.[0];
  return error?.message || "";
}

export default function QuickViewModal({ product, onClose }) {
  const { openCart } = useCartDrawer();
  const canAddToCart = product.checkoutEnabled && product.shopifyVariantId;

  return (
    <div className="quick-view-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="quick-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`quick-view-${product.id}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="quick-view-close" type="button" aria-label="Close quick view" onClick={onClose}>
          Close
        </button>
        <div className="quick-view-media">
          <ProductImage src={product.image} alt={product.imageAlt || product.title} image={product.imageData} />
        </div>
        <div className="quick-view-copy">
          <p className="page-kicker">
            {product.category} · Model {product.model}
          </p>
          <h2 id={`quick-view-${product.id}`}>{product.title}</h2>
          <ProductPrice product={product} />
          <ProductUtilityButtons product={product} />
          <div className="hero-actions">
            {canAddToCart && (
              <CartForm
                route="/cart"
                action={CartForm.ACTIONS.LinesAdd}
                inputs={{ lines: [{ merchandiseId: product.shopifyVariantId, quantity: 1 }] }}
              >
                {(fetcher) => (
                  <>
                    <button className="button-primary" type="submit" disabled={fetcher.state !== "idle"} onClick={openCart}>
                      Add to cart
                    </button>
                    {getCartError(fetcher) && <p className="product-action-error">{getCartError(fetcher)}</p>}
                  </>
                )}
              </CartForm>
            )}
            {product.handle && (
              <Link className="button-secondary" to={`/products/${product.handle}`} onClick={onClose}>
                View details
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
