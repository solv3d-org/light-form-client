import { useCart } from "../context/CartContext";

export default function CartDrawer() {
  const {
    cart,
    cartError,
    cartStatus,
    checkout,
    closeCart,
    isCartOpen,
    removeLine,
    setLineQuantity
  } = useCart();

  if (!isCartOpen) return null;

  const lines = cart?.lines || [];
  const isUpdating = cartStatus === "updating";

  return (
    <div className="cart-layer" role="presentation">
      <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={closeCart}></button>
      <aside className="cart-drawer" aria-label="Cart">
        <div className="cart-head">
          <div>
            <p className="section-kicker">Cart</p>
            <h2>Selected pieces</h2>
          </div>
          <button className="cart-close" type="button" aria-label="Close cart" onClick={closeCart}>
            ×
          </button>
        </div>

        {cartError && <p className="cart-error">{cartError}</p>}

        {lines.length === 0 ? (
          <p className="cart-empty">No products selected.</p>
        ) : (
          <ul className="cart-lines">
            {lines.map((line) => (
              <li className="cart-line" key={line.id}>
                <div className="cart-line-image">
                  {line.image && <img src={line.image} alt={line.imageAlt} loading="lazy" />}
                </div>
                <div className="cart-line-copy">
                  <a href={line.productUrl} target="_blank" rel="noreferrer">
                    {line.title}
                  </a>
                  {line.variantTitle && <span>{line.variantTitle}</span>}
                  <strong>{line.lineTotalLabel}</strong>
                  <div className="cart-line-actions">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => setLineQuantity(line.id, line.quantity - 1)}
                    >
                      -
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => setLineQuantity(line.id, line.quantity + 1)}
                    >
                      +
                    </button>
                    <button type="button" disabled={isUpdating} onClick={() => removeLine(line.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="cart-footer">
          <div className="cart-total">
            <span>Subtotal</span>
            <strong>{cart?.subtotalLabel || "$0.00"}</strong>
          </div>
          <button className="button-primary cart-checkout" type="button" disabled={!lines.length || isUpdating} onClick={checkout}>
            Checkout
          </button>
        </div>
      </aside>
    </div>
  );
}
