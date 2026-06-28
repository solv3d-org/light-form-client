export default function AboutPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <h1>More than buying a product online.</h1>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="site-shell about-grid">
          <article className="about-panel">
            <p className="section-kicker">How it started</p>
            <h2>Lighting roots first, broader interiors second.</h2>
            <p className="about-copy">
              Light-Pro started as a lighting company in 1990. Over time the practice widened into Light + Form
              Concepts, a showroom-led environment that can speak to decorative lighting, technical requirements, and
              the furnishing decisions that affect how light lands in a room.
            </p>
            <p className="about-copy">
              The company later expanded into curtains, blinds, solar films, wall coverings, upholstery, and Ziptrak
              so clients could solve atmosphere across the whole envelope, not just choose a single fixture in
              isolation.
            </p>
          </article>

          <article className="about-panel">
            <p className="section-kicker">What makes it different</p>
            <h2>Why this is not just ecommerce.</h2>
            <div className="values-grid">
              <div className="value-card">
                <h3>Safer selection</h3>
                <p className="callout-copy">
                  Clients are not left to infer compatibility, safety marks, or practical fit from thumbnails alone.
                  The value is in guided specification before the product enters the room.
                </p>
              </div>
              <div className="value-card">
                <h3>Installation support</h3>
                <p className="callout-copy">
                  The Light-Pro service language explicitly includes installation, rewiring, and technical coordination,
                  which changes the purchase from object-only to outcome-based.
                </p>
              </div>
              <div className="value-card">
                <h3>After-sales care</h3>
                <p className="callout-copy">
                  Maintenance, cleaning, and custom fabrication remain part of the offering. That after-service layer
                  is the opposite of anonymous online buying.
                </p>
              </div>
              <div className="value-card">
                <h3>Showroom perspective</h3>
                <p className="callout-copy">
                  A dedicated Swarovski Lighting concept-store presence and a wider commercial-residential mix give the
                  business a showroom logic rather than a narrow marketplace logic.
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="site-shell teaser-grid about-teaser-grid">
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
