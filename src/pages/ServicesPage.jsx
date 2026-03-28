export default function ServicesPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">Services page</p>
            <h1>A simple line through the room.</h1>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="site-shell">
          <div className="line-list">
            <article className="line-item">
              <span className="line-number">01</span>
              <h2 className="line-title">Lighting</h2>
              <p className="line-copy">
                Product supply, specification guidance, light-temperature selection, and fixture recommendations shaped
                around residential and commercial use rather than catalog browsing alone.
              </p>
            </article>

            <article className="line-item">
              <span className="line-number">02</span>
              <h2 className="line-title">Curtains &amp; Blinds</h2>
              <p className="line-copy">
                A furnishing layer added in 2011 so window treatment, daylight control, and lighting mood can be
                resolved together instead of as separate purchases.
              </p>
            </article>

            <article className="line-item">
              <span className="line-number">03</span>
              <h2 className="line-title">Electrical Work</h2>
              <p className="line-copy">
                Installation support, rewiring, technical coordination, and practical problem-solving that sit between
                the chosen fixture and the finished room.
              </p>
            </article>

            <article className="line-item">
              <span className="line-number">04</span>
              <h2 className="line-title">Renovation Work</h2>
              <p className="line-copy">
                Refurbishment support for cafés, offices, houses, and apartments where lighting has to live inside a
                wider renovation rhythm rather than stand alone.
              </p>
            </article>
          </div>

          <article className="services-callout">
            <p className="section-kicker">After-service product</p>
            <h2>Support does not stop at supply.</h2>
          </article>
        </div>
      </section>
    </main>
  );
}
