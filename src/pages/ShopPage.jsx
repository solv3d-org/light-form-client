import ProductCard from "../components/ProductCard";

export default function ShopPage({ products, catalogMetadata, catalogStatus }) {
  const sourceLabel = catalogStatus === "loading" ? "Loading catalog" : catalogMetadata.sourceLabel || "Product catalog";
  const intro =
    catalogMetadata.mode === "shopify"
      ? `${catalogMetadata.productCount} pieces prepared for specification and purchase.`
      : `${catalogMetadata.productCount} pieces prepared for specification.`;

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <h1>Lighting, not clutter.</h1>
          </div>
          <aside className="page-hero-aside">
            <p className="page-kicker">{sourceLabel}</p>
            <p className="page-intro">{intro}</p>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="site-shell">
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} variant="minimal" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
