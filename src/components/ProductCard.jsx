import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import ProductImage from "./ProductImage";

export default function ProductCard({ product, variant = "default" }) {
  const isMinimal = variant === "minimal";
  const { addProduct, cartStatus, isEnabled } = useCart();
  const [actionError, setActionError] = useState("");
  const canAddToCart = isEnabled && product.checkoutEnabled;
  const isUpdating = cartStatus === "updating";
  const productPath = product.handle ? `/products/${product.handle}` : "";

  const handleAddToCart = async () => {
    setActionError("");

    try {
      await addProduct(product);
    } catch (error) {
      setActionError(error.message);
    }
  };

  return (
    <article className={`product-card${isMinimal ? " product-card-minimal" : ""}`} id={`product-${product.id}`}>
      {productPath ? (
        <Link className="product-image-wrap" to={productPath}>
          <ProductImage src={product.image} alt={product.imageAlt || product.title} />
        </Link>
      ) : (
        <div className="product-image-wrap">
          <ProductImage src={product.image} alt={product.imageAlt || product.title} />
        </div>
      )}
      <div className="product-copy">
        {!isMinimal && (
          <p className="product-tag">
            {product.category} · Model {product.model}
          </p>
        )}
        <h3>{productPath ? <Link to={productPath}>{product.title}</Link> : product.title}</h3>
        <p className="product-price">{product.priceLabel}</p>
        <div className="product-actions">
          {canAddToCart ? (
            <button className="button-inline product-action" type="button" disabled={isUpdating} onClick={handleAddToCart}>
              Add to cart
            </button>
          ) : (
            product.sourceUrl && (
              <a className="button-inline product-action" href={product.sourceUrl} target="_blank" rel="noreferrer">
                View product
              </a>
            )
          )}
        </div>
        {actionError && (
          <p className="product-action-error" role="alert">
            {actionError}
          </p>
        )}
      </div>
    </article>
  );
}
