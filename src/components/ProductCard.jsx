import ProductImage from "./ProductImage";

export default function ProductCard({ product, variant = "default" }) {
  const isMinimal = variant === "minimal";

  return (
    <article className={`product-card${isMinimal ? " product-card-minimal" : ""}`} id={`product-${product.id}`}>
      <div className="product-image-wrap">
        <ProductImage src={product.image} alt={product.title} />
      </div>
      <div className="product-copy">
        {!isMinimal && (
          <p className="product-tag">
            {product.category} · Model {product.model}
          </p>
        )}
        <h3>{product.title}</h3>
        <p className="product-price">{product.priceLabel}</p>
        {!isMinimal && (
          <a className="button-inline" href={product.sourceUrl} target="_blank" rel="noreferrer">
            View product
          </a>
        )}
      </div>
    </article>
  );
}
