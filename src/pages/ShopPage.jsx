import { Pagination } from "@shopify/hydrogen";
import BrandRail from "../components/BrandRail";
import ProductCard from "../components/ProductCard";
import { legacyProductCategories } from "../data/legacyContent";

const sortOptions = [
  ["manual", "Featured"],
  ["newest", "Newest"],
  ["title-asc", "A-Z"],
  ["price-asc", "Price low"],
  ["price-desc", "Price high"],
  ["best-selling", "Best selling"]
];

function isSelected(filters, input) {
  return (filters.selectedFilterInputs || []).includes(input);
}

function filterLabel(value) {
  return `${value.label}${value.count != null ? ` (${value.count})` : ""}`;
}

function FacetControls({ availableFilters, filters }) {
  return (
    <div className="shop-facets">
      {availableFilters.map((filter) => {
        if (filter.type === "PRICE_RANGE") {
          return (
            <fieldset className="shop-facet" key={filter.id}>
              <legend>{filter.label}</legend>
              <div className="shop-price-range">
                <label>
                  <span>Min</span>
                  <input name="price_min" type="number" min="0" step="0.01" defaultValue={filters.priceMin || ""} />
                </label>
                <label>
                  <span>Max</span>
                  <input name="price_max" type="number" min="0" step="0.01" defaultValue={filters.priceMax || ""} />
                </label>
              </div>
            </fieldset>
          );
        }

        return (
          <fieldset className="shop-facet" key={filter.id}>
            <legend>{filter.label}</legend>
            <div className="shop-facet-options">
              {filter.values.map((value) => (
                <label key={value.id}>
                  <input name="filter" type="checkbox" value={value.input} defaultChecked={isSelected(filters, value.input)} />
                  <span>{filterLabel(value)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function PaginationControls({ PreviousLink, NextLink, hasPreviousPage, hasNextPage }) {
  if (!hasPreviousPage && !hasNextPage) return null;
  return (
    <nav className="shop-pagination" aria-label="Product pagination">
      {hasPreviousPage ? <PreviousLink>Previous</PreviousLink> : <span aria-disabled="true">Previous</span>}
      {hasNextPage ? <NextLink>Next</NextLink> : <span aria-disabled="true">Next</span>}
    </nav>
  );
}

function CategoryRail({ activeHandle }) {
  return (
    <nav className="category-rail" aria-label="Product categories">
      <a className={!activeHandle ? "is-active" : ""} href="/shop">
        All
      </a>
      {legacyProductCategories.map((category) => (
        <a
          className={activeHandle === category.handle ? "is-active" : ""}
          href={`/collections/${category.handle}`}
          key={category.handle}
        >
          {category.title}
        </a>
      ))}
    </nav>
  );
}

export default function ShopPage({ products, productConnection, availableFilters = [], catalogMetadata }) {
  const filters = catalogMetadata?.filters || {};
  const connection = productConnection || { nodes: products, pageInfo: {} };
  const collection = catalogMetadata?.collection || {};
  const activeCategoryHandle = legacyProductCategories.some((category) => category.handle === collection.handle) ? collection.handle : "";

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <h1>Lighting, not clutter.</h1>
          </div>
        </div>
      </section>
      <BrandRail />

      <section className="section">
        <div className="site-shell">
          <CategoryRail activeHandle={activeCategoryHandle} />
          <form className="shop-filter-bar" method="get">
            <label className="shop-search-field">
              <span>Search</span>
              <input name="q" type="search" defaultValue={filters.search || ""} placeholder="Product, SKU, style" />
            </label>
            <label>
              <span>Sort</span>
              <select name="sort" defaultValue={filters.sort || "manual"}>
                {sortOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <FacetControls availableFilters={availableFilters} filters={filters} />
            <div className="shop-filter-actions">
              <button type="submit">Apply</button>
              <a href="/shop">Reset</a>
            </div>
          </form>
          <Pagination connection={connection}>
            {({ nodes, PreviousLink, NextLink, hasPreviousPage, hasNextPage }) => (
              <>
                <PaginationControls
                  PreviousLink={PreviousLink}
                  NextLink={NextLink}
                  hasPreviousPage={hasPreviousPage}
                  hasNextPage={hasNextPage}
                />
                <div className="product-grid">
                  {nodes.map((product) => (
                    <ProductCard key={product.id} product={product} variant="minimal" />
                  ))}
                </div>
                {!nodes.length && <p className="shop-empty">No products match these filters.</p>}
                <PaginationControls
                  PreviousLink={PreviousLink}
                  NextLink={NextLink}
                  hasPreviousPage={hasPreviousPage}
                  hasNextPage={hasNextPage}
                />
              </>
            )}
          </Pagination>
        </div>
      </section>
    </main>
  );
}
