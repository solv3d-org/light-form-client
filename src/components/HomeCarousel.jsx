import { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";

const MAX_CAROUSEL_PRODUCTS = 24;

export default function HomeCarousel({ products, catalogMetadata, catalogStatus }) {
  const featuredProducts = products.filter((product) => product.featured);
  const carouselProducts = (featuredProducts.length ? featuredProducts : products).slice(0, MAX_CAROUSEL_PRODUCTS);
  const trackRef = useRef(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    let frame = 0;
    const updateScrollState = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const firstItem = track.children[0];
        const secondItem = track.children[1];
        const itemWidth = firstItem?.getBoundingClientRect().width || track.clientWidth;
        const itemGap = secondItem
          ? Math.max(0, secondItem.getBoundingClientRect().left - firstItem.getBoundingClientRect().left - itemWidth)
          : 0;
        const step = Math.max(1, itemWidth + itemGap);
        const visibleCount = Math.max(1, Math.round((track.clientWidth + itemGap) / step));
        const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
        const pageStep = step * visibleCount;
        const nextPageCount = Math.max(1, Math.ceil(track.children.length / visibleCount));
        const nextPageIndex = Math.min(nextPageCount - 1, Math.round(track.scrollLeft / pageStep));

        setPageCount(nextPageCount);
        setPageIndex(nextPageIndex);
        setCanScrollPrevious(track.scrollLeft > 1);
        setCanScrollNext(track.scrollLeft < maxScrollLeft - 1);
      });
    };

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(track);
    track.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      track.removeEventListener("scroll", updateScrollState);
    };
  }, [carouselProducts.length]);

  const scrollCarousel = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const firstItem = track.children[0];
    const secondItem = track.children[1];
    const itemWidth = firstItem?.getBoundingClientRect().width || track.clientWidth;
    const itemGap = secondItem
      ? Math.max(0, secondItem.getBoundingClientRect().left - firstItem.getBoundingClientRect().left - itemWidth)
      : 0;
    const step = Math.max(1, itemWidth + itemGap);
    const visibleCount = Math.max(1, Math.round((track.clientWidth + itemGap) / step));

    track.scrollBy({ left: direction * step * visibleCount, behavior: "smooth" });
  };

  return (
    <div className="carousel-shell" role="region" aria-label="Selected products carousel" aria-roledescription="carousel">
      <div className="carousel-head">
        <div className="section-copy">
          <h2 className="section-title">Latest pieces for the room.</h2>
        </div>
        <div className="carousel-meta">
          <button
            className="carousel-arrow"
            type="button"
            aria-label="Show previous products"
            disabled={!canScrollPrevious}
            onClick={() => scrollCarousel(-1)}
          >
            Prev
          </button>
          <span className="carousel-status">
            {String(pageIndex + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}
          </span>
          <button
            className="carousel-arrow"
            type="button"
            aria-label="Show next products"
            disabled={!canScrollNext}
            onClick={() => scrollCarousel(1)}
          >
            Next
          </button>
        </div>
      </div>

      <div className="carousel-track" ref={trackRef} tabIndex="0" aria-label="Selected products">
        {carouselProducts.map((product) => (
          <div className="carousel-item" key={product.id}>
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  );
}
