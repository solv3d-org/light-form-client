import { useEffect, useState } from "react";
import ProductCard from "../components/ProductCard";
import { readProductList } from "../lib/localProductLists";

export default function SavedProductsPage({ listName, title, kicker, emptyCopy }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const sync = () => setItems(readProductList(listName));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("lightform:product-list", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lightform:product-list", sync);
    };
  }, [listName]);

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">{kicker}</p>
            <h1>{title}</h1>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-shell">
          {items.length ? (
            <div className={`product-grid${listName === "compare" ? " compare-grid" : ""}`}>
              {items.map((product) => (
                <ProductCard key={product.id} product={product} variant="minimal" />
              ))}
            </div>
          ) : (
            <p className="shop-empty">{emptyCopy}</p>
          )}
        </div>
      </section>
    </main>
  );
}
