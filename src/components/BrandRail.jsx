import { legacyBrands, legacyMediaUrl } from "../data/legacyContent";

export default function BrandRail() {
  const brands = [...legacyBrands, ...legacyBrands];

  return (
    <section className="brand-rail" aria-label="Brand partners">
      <div className="brand-rail-track">
        {brands.map((brand, index) => (
          <div className="brand-rail-item" key={`${brand.name}-${index}`} aria-hidden={index >= legacyBrands.length}>
            <img src={legacyMediaUrl(brand.image)} alt={brand.name} loading="lazy" />
            <span>{brand.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
