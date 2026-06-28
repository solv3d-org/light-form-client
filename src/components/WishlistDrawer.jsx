import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";
import { readProductList, toggleProductInList } from "../lib/localProductLists";
import ProductImage from "./ProductImage";

export default function WishlistDrawer() {
  const { closeWishlist, isWishlistOpen } = useCartDrawer();
  const [items, setItems] = useState([]);

  useEffect(() => {
    const sync = () => setItems(readProductList("wishlist"));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("lightform:product-list", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lightform:product-list", sync);
    };
  }, []);

  return (
    <div className={`cart-layer saved-layer${isWishlistOpen ? " is-open" : ""}`} role="presentation">
      <button className="cart-backdrop" type="button" aria-label="Close wishlist" onClick={closeWishlist}></button>
      <aside className="cart-drawer saved-drawer" aria-label="Wishlist" aria-hidden={!isWishlistOpen}>
        <div className="cart-head">
          <div>
            <p className="section-kicker">Wishlist</p>
            <h2>Saved pieces</h2>
          </div>
          <button className="cart-close" type="button" aria-label="Close wishlist" onClick={closeWishlist}>
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <p className="cart-empty">No saved products.</p>
        ) : (
          <ul className="cart-lines">
            {items.map((product) => (
              <li className="cart-line" key={product.id}>
                <div className="cart-line-image">
                  <ProductImage src={product.image} alt={product.imageAlt || product.title} image={product.imageData} />
                </div>
                <div className="cart-line-copy">
                  {product.handle ? (
                    <Link to={`/products/${product.handle}`} onClick={closeWishlist}>
                      {product.title}
                    </Link>
                  ) : (
                    <strong>{product.title}</strong>
                  )}
                  {product.category && <span>{product.category}</span>}
                  {product.priceLabel && <strong>{product.priceLabel}</strong>}
                  <div className="cart-line-actions">
                    <button type="button" onClick={() => toggleProductInList("wishlist", product)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
