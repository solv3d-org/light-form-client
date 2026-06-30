import { CartForm } from "@shopify/hydrogen";
import { Link } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";
import { ShoppingBagIcon } from "./Icons";
import ProductUtilityButtons from "./ProductUtilityButtons";
import ProductImage from "./ProductImage";
import ProductPrice from "./ProductPrice";

function getCartError(fetcher) {
  const error = fetcher.data?.errors?.[0];
  return error?.message || "";
}

export default function ProductCard({ product, variant = "default" }) {
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
        <div className="product-card-actions">
          <ProductUtilityButtons product={product} compact={isMinimal} />
          {canAddToCart && (
            <div className="product-actions">
              <CartForm
                route="/cart"
                action={CartForm.ACTIONS.LinesAdd}
                inputs={{ lines: [{ merchandiseId: product.shopifyVariantId, quantity: 1 }] }}
              >
                {(fetcher) => (
                  <>
                    <button
                      className="button-inline product-action product-action-icon"
                      type="submit"
                      aria-label={`Add ${product.title} to cart`}
                      title="Add to cart"
                      disabled={fetcher.state !== "idle"}
                      onClick={openCart}
                    >
                      <ShoppingBagIcon />
                    </button>
                    {getCartError(fetcher) && (
                      <p className="product-action-error" role="alert">
                        {getCartError(fetcher)}
                      </p>
                    )}
                  </>
                )}
              </CartForm>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
