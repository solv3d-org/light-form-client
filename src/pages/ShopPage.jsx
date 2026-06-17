import ProductCard from "../components/ProductCard";

const availabilityOptions = [
  ["all", "All"],
  ["available", "In stock"],
  ["sold-out", "Sold out"]
];

const sortOptions = [
  ["newest", "Newest"],
  ["title-asc", "A-Z"],
  ["price-asc", "Price low"],
  ["price-desc", "Price high"],
  ["best-selling", "Best selling"]
];

export default function ShopPage({ products, catalogMetadata }) {
  const filters = catalogMetadata?.filters || {};

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
          <form className="shop-filter-bar" method="get">
            <label>
              <span>Search</span>
              <input name="q" type="search" defaultValue={filters.search || ""} placeholder="SKU, title, vendor" />
            </label>
            <label>
              <span>Availability</span>
              <select name="availability" defaultValue={filters.availability || "all"}>
                {availabilityOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select name="sort" defaultValue={filters.sort || "newest"}>
                {sortOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="shop-filter-actions">
              <button type="submit">Apply</button>
              <a href="/shop">Reset</a>
            </div>
          </form>
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} variant="minimal" />
            ))}
          </div>
          {!products.length && <p className="shop-empty">No products match these filters.</p>}
        </div>
      </section>
    </main>
  );
}
