import { useEffect, useState } from "react";
import ProductCard from "./ProductCard";

function getCarouselPerView() {
  if (window.innerWidth <= 680) return 1;
  if (window.innerWidth <= 1040) return 2;
  return 4;
}

export default function HomeCarousel({ products, catalogMetadata }) {
  const featuredProducts = products.filter((product) => product.featured);
  const carouselProducts = featuredProducts.length ? featuredProducts : products.slice(0, 12);
  const [perView, setPerView] = useState(() => getCarouselPerView());
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      setPerView(getCarouselPerView());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(carouselProducts.length / perView));
  const currentPage = Math.min(totalPages - 1, pageIndex);
  const start = currentPage * perView;
  const visibleProducts = carouselProducts.slice(start, start + perView);

  useEffect(() => {
    if (pageIndex !== currentPage) {
      setPageIndex(currentPage);
    }
  }, [currentPage, pageIndex]);

  return (
    <div className="carousel-shell">
      <div className="carousel-head">
        <div className="section-copy">
          <p className="section-kicker">Landing page sync</p>
          <h2 className="section-title">Latest products from the live catalog.</h2>
          <p className="section-body">
            Showing the latest {catalogMetadata.featuredCount} products pulled from Light-Pro&apos;s WooCommerce feed,
            four at a time on desktop and responsive below that.
          </p>
        </div>
        <div className="carousel-meta">
          <button
            className="carousel-arrow"
            type="button"
            aria-label="Show previous products"
            disabled={totalPages === 1}
            onClick={() => setPageIndex((index) => (index - 1 + totalPages) % totalPages)}
          >
            ←
          </button>
          <span className="carousel-status">
            {String(currentPage + 1).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
          </span>
          <button
            className="carousel-arrow"
            type="button"
            aria-label="Show next products"
            disabled={totalPages === 1}
            onClick={() => setPageIndex((index) => (index + 1) % totalPages)}
          >
            →
          </button>
        </div>
      </div>

      <div className="product-row">
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
