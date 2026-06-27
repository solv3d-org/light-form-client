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
            <p className="eyebrow">Light + Form Concepts</p>
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

      <section className="section">
        <div className="site-shell teaser-grid">
          <article className="teaser-panel">
            <p className="section-kicker">Why the business exists</p>
            <h2>Lighting should feel guided, not guessed.</h2>
            <p className="teaser-copy">
              Light-Pro started as a lighting company in 1990 and built Light + Form Concepts around a simple idea:
              choosing light well requires context. The right fixture depends on mood, installation conditions,
              maintenance expectations, and how the room actually lives.
            </p>
            <div className="teaser-stat-row">
              <div>
                <span className="teaser-stat-value">1990</span>
                <span className="teaser-stat-label">Lighting roots that predate the current catalog.</span>
              </div>
              <div>
                <span className="teaser-stat-value">2011</span>
                <span className="teaser-stat-label">
                  Expanded into blinds, curtains, upholstery, and complementary furnishing support.
                </span>
              </div>
              <div>
                <span className="teaser-stat-value">After</span>
                <span className="teaser-stat-label">
                  Installation, rewiring, fabrication, maintenance, and cleaning remain part of the conversation.
                </span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
