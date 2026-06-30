import { useEffect, useState } from "react";
import { isProductInList, toggleProductInList } from "../lib/localProductLists";
import { HeartIcon } from "./Icons";

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
        className="icon-button"
        type="button"
        aria-label={saved ? `Remove ${product.title} from saved products` : `Save ${product.title}`}
        aria-pressed={saved}
        title={saved ? "Saved" : "Save"}
        onClick={() => setSaved(toggleProductInList("wishlist", product))}
      >
        <HeartIcon filled={saved} />
      </button>
    </div>
  );
}
