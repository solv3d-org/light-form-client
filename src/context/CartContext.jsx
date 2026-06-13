import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addCartLine, createCart, fetchCart, removeCartLine, updateCartLine } from "../lib/shopifyStorefront";
import { isShopifyConfigured } from "../lib/shopifyConfig";

const CART_STORAGE_KEY = "light-form-shopify-cart-id";

const CartContext = createContext(null);

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSavedCartId() {
  return getLocalStorage()?.getItem(CART_STORAGE_KEY) || "";
}

function saveCartId(cartId) {
  const storage = getLocalStorage();
  if (!storage) return;
  if (cartId) {
    storage.setItem(CART_STORAGE_KEY, cartId);
  } else {
    storage.removeItem(CART_STORAGE_KEY);
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null);
  const [cartError, setCartError] = useState("");
  const [cartStatus, setCartStatus] = useState("idle");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const isEnabled = isShopifyConfigured();

  useEffect(() => {
    if (!isEnabled) return;

    const cartId = getSavedCartId();
    if (!cartId) return;

    let cancelled = false;
    setCartStatus("loading");

    fetchCart(cartId)
      .then((loadedCart) => {
        if (cancelled) return;
        if (!loadedCart) {
          saveCartId("");
          setCart(null);
          return;
        }
        setCart(loadedCart);
      })
      .catch((error) => {
        if (cancelled) return;
        saveCartId("");
        setCart(null);
        setCartError(error.message);
      })
      .finally(() => {
        if (!cancelled) setCartStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [isEnabled]);

  const addProduct = useCallback(
    async (product, quantity = 1) => {
      if (!isEnabled) throw new Error("Shopify Storefront API is not configured.");
      if (!product.shopifyVariantId) throw new Error("This product is missing a Shopify variant ID.");

      setCartStatus("updating");
      setCartError("");

      try {
        const nextCart = cart?.id
          ? await addCartLine(cart.id, product.shopifyVariantId, quantity)
          : await createCart(product.shopifyVariantId, quantity);

        saveCartId(nextCart.id);
        setCart(nextCart);
        setIsCartOpen(true);
        return nextCart;
      } catch (error) {
        setCartError(error.message);
        throw error;
      } finally {
        setCartStatus("idle");
      }
    },
    [cart?.id, isEnabled]
  );

  const setLineQuantity = useCallback(
    async (lineId, quantity) => {
      if (!cart?.id) return null;

      setCartStatus("updating");
      setCartError("");

      try {
        const nextCart =
          quantity <= 0 ? await removeCartLine(cart.id, lineId) : await updateCartLine(cart.id, lineId, quantity);

        setCart(nextCart);
        return nextCart;
      } catch (error) {
        setCartError(error.message);
        throw error;
      } finally {
        setCartStatus("idle");
      }
    },
    [cart?.id]
  );

  const removeLine = useCallback(
    async (lineId) => {
      if (!cart?.id) return null;

      setCartStatus("updating");
      setCartError("");

      try {
        const nextCart = await removeCartLine(cart.id, lineId);
        setCart(nextCart);
        return nextCart;
      } catch (error) {
        setCartError(error.message);
        throw error;
      } finally {
        setCartStatus("idle");
      }
    },
    [cart?.id]
  );

  const checkout = useCallback(() => {
    if (!cart?.checkoutUrl) return;
    window.location.assign(cart.checkoutUrl);
  }, [cart?.checkoutUrl]);

  const value = useMemo(
    () => ({
      cart,
      cartError,
      cartStatus,
      isCartOpen,
      isEnabled,
      totalQuantity: cart?.totalQuantity || 0,
      addProduct,
      checkout,
      closeCart: () => setIsCartOpen(false),
      openCart: () => setIsCartOpen(true),
      removeLine,
      setLineQuantity
    }),
    [addProduct, cart, cartError, cartStatus, checkout, isCartOpen, isEnabled, removeLine, setLineQuantity]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider.");
  return value;
}
