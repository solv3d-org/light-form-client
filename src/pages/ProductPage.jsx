import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProductImage from "../components/ProductImage";
import { useCart } from "../context/CartContext";

export default function ProductPage({ products }) {
  const { handle } = useParams();
  const product = products.find((item) => item.handle === handle || item.id === handle);
  const { addProduct, cartStatus, isEnabled } = useCart();
  const [actionError, setActionError] = useState("");
  const canAddToCart = isEnabled && product?.checkoutEnabled;
  const isUpdating = cartStatus === "updating";

  const handleAddToCart = async () => {
    if (!product) return;
    setActionError("");

    try {
      await addProduct(product);
    } catch (error) {
      setActionError(error.message);
    }
  };

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

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell product-detail-grid">
          <div className="product-detail-media">
            <ProductImage src={product.image} alt={product.imageAlt || product.title} />
          </div>
          <div className="product-detail-copy">
            <p className="page-kicker">
              {product.category} · Model {product.model}
            </p>
            <h1>{product.title}</h1>
            <p className="product-price">{product.priceLabel}</p>
            <div className="hero-actions">
              {canAddToCart ? (
                <button className="button-primary" type="button" disabled={isUpdating} onClick={handleAddToCart}>
                  Add to cart
                </button>
              ) : (
                product.sourceUrl && (
                  <a className="button-primary" href={product.sourceUrl} target="_blank" rel="noreferrer">
                    View product
                  </a>
                )
              )}
              <Link className="button-secondary" to="/shop">
                Back to shop
              </Link>
            </div>
            {actionError && (
              <p className="product-action-error" role="alert">
                {actionError}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
