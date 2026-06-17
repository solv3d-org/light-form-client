import ProductCard from "../components/ProductCard";

export default function ShopPage({ products }) {
  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <h1>Lighting, not clutter.</h1>
          </div>
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
