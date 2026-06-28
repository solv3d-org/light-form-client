import { createContext, useContext, useMemo, useState } from "react";

const CartDrawerContext = createContext(null);

export function CartDrawerProvider({ children }) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const value = useMemo(
    () => ({
      isCartOpen,
      isWishlistOpen,
      closeCart: () => setIsCartOpen(false),
      closeWishlist: () => setIsWishlistOpen(false),
      openCart: () => {
        setIsWishlistOpen(false);
        setIsCartOpen(true);
      },
      openWishlist: () => {
        setIsCartOpen(false);
        setIsWishlistOpen(true);
      }
    }),
    [isCartOpen, isWishlistOpen]
  );

  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
}

export function useCartDrawer() {
  const value = useContext(CartDrawerContext);
  if (!value) throw new Error("useCartDrawer must be used within CartDrawerProvider.");
  return value;
}
