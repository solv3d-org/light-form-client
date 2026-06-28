import { CartForm, Image, Money, useOptimisticCart } from "@shopify/hydrogen";
import { Link, useFetchers, useRouteLoaderData } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";

function getCartError(fetcher) {
  const error = fetcher.data?.errors?.[0];
  return error?.message || "";
}

function CartSubmitButton({ action, inputs, children, className }) {
  return (
    <CartForm route="/cart" action={action} inputs={inputs}>
      {(fetcher) => (
        <>
          <button className={className} type="submit" disabled={fetcher.state !== "idle"}>
            {children}
          </button>
          {getCartError(fetcher) && <p className="cart-error">{getCartError(fetcher)}</p>}
        </>
      )}
    </CartForm>
  );
}

export default function CartDrawer() {
  const rootData = useRouteLoaderData("root");
  const cart = useOptimisticCart(rootData?.cart);
  const { closeCart, isCartOpen } = useCartDrawer();
  const fetchers = useFetchers();
  const isUpdating = fetchers.some((fetcher) => fetcher.formAction === "/cart" && fetcher.state !== "idle");

  if (!rootData?.shopifyConfigured) return null;

  const lines = cart?.lines?.nodes || [];

  return (
    <div className={`cart-layer${isCartOpen ? " is-open" : ""}`} role="presentation">
      <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={closeCart}></button>
      <aside className="cart-drawer" aria-label="Cart" aria-hidden={!isCartOpen}>
        <div className="cart-head">
          <div>
            <p className="section-kicker">Cart</p>
            <h2>Selected pieces</h2>
          </div>
          <button className="cart-close" type="button" aria-label="Close cart" onClick={closeCart}>
            ×
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="cart-empty">No products selected.</p>
        ) : (
          <ul className="cart-lines">
            {lines.map((line) => {
              const merchandise = line.merchandise;
              const product = merchandise?.product;
              const image = merchandise?.image;
              const variantTitle = merchandise?.title === "Default Title" ? "" : merchandise?.title;

              return (
                <li className="cart-line" key={line.id}>
                  <div className="cart-line-image">
                    {image?.url && <Image data={image} sizes="84px" loading="lazy" />}
                  </div>
                  <div className="cart-line-copy">
                    {product?.handle ? <Link to={`/products/${product.handle}`}>{product.title}</Link> : <strong>{product?.title}</strong>}
                    {variantTitle && <span>{variantTitle}</span>}
                    {line.cost?.totalAmount && (
                      <strong>
                        <Money data={line.cost.totalAmount} />
                      </strong>
                    )}
                    <div className="cart-line-actions">
                      <CartSubmitButton
                        action={line.quantity <= 1 ? CartForm.ACTIONS.LinesRemove : CartForm.ACTIONS.LinesUpdate}
                        inputs={
                          line.quantity <= 1
                            ? { lineIds: [line.id] }
                            : { lines: [{ id: line.id, quantity: line.quantity - 1 }] }
                        }
                      >
                        -
                      </CartSubmitButton>
                      <span>{line.quantity}</span>
                      <CartSubmitButton
                        action={CartForm.ACTIONS.LinesUpdate}
                        inputs={{ lines: [{ id: line.id, quantity: line.quantity + 1 }] }}
                      >
                        +
                      </CartSubmitButton>
                      <CartSubmitButton action={CartForm.ACTIONS.LinesRemove} inputs={{ lineIds: [line.id] }}>
                        Remove
                      </CartSubmitButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="cart-footer">
          <div className="cart-total">
            <span>Subtotal</span>
            <strong>{cart?.cost?.subtotalAmount ? <Money data={cart.cost.subtotalAmount} /> : "$0.00"}</strong>
          </div>
          <a
            className="button-primary cart-checkout"
            href={cart?.checkoutUrl || undefined}
            aria-disabled={!lines.length || isUpdating}
            onClick={(event) => {
              if (!lines.length || isUpdating) event.preventDefault();
            }}
          >
            Checkout
          </a>
        </div>
      </aside>
    </div>
  );
}
