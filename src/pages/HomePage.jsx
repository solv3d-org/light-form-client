import HomeCarousel from "../components/HomeCarousel";
import BrandRail from "../components/BrandRail";
import MoodSetter from "../components/MoodSetter";

export default function HomePage({ products, catalogMetadata, catalogStatus, theme, onThemeChange }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <div className="hero-layer hero-layer-neutral"></div>
          <div className="hero-layer hero-layer-warm"></div>
          <div className="hero-layer hero-layer-cosy"></div>
        </div>

        <div className="site-shell hero-shell">
          <div className="hero-copy">
            <h1>
              <span className="hero-title-line">
                Light that <em>shapes</em>
              </span>
              <span className="hero-title-line">the room around it.</span>
            </h1>
            <MoodSetter theme={theme} onThemeChange={onThemeChange} />
          </div>
        </div>
      </section>

      <BrandRail />

      <section className="section">
        <div className="site-shell">
          <HomeCarousel
            products={products}
            catalogMetadata={catalogMetadata}
            catalogStatus={catalogStatus}
          />
        </div>
      </section>
    </main>
  );
}
