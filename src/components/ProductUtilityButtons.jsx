import { useEffect, useState } from "react";
import { isProductInList, toggleProductInList } from "../lib/localProductLists";

export default function ProductUtilityButtons({ product, compact = false }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSaved(isProductInList("wishlist", product.id));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("lightform:product-list", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lightform:product-list", sync);
    };
  }, [product.id]);

  return (
    <div className={`product-utility${compact ? " product-utility-compact" : ""}`}>
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => setSaved(toggleProductInList("wishlist", product))}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
