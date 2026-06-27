import { contactDetails } from "../data/legacyContent";

export default function ContactPage() {
  const mailto = `mailto:${contactDetails.email}?subject=Light%20%2B%20Form%20enquiry`;

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">Contact</p>
            <h1>Start with the showroom.</h1>
          </div>
          <aside className="page-hero-aside">
            <a className="button-primary" href={mailto}>
              Email us
            </a>
          </aside>
        </div>
      </section>
      <section className="section">
        <div className="site-shell contact-grid">
          <article className="contact-card">
            <p className="section-kicker">Showroom</p>
            <h2>{contactDetails.address}</h2>
          </article>
          <article className="contact-card">
            <p className="section-kicker">Direct</p>
            <ul className="contact-list">
              <li>
                <a href={`tel:${contactDetails.phone.replace(/\\s/g, "")}`}>{contactDetails.phone}</a>
              </li>
              <li>Fax: {contactDetails.fax}</li>
              <li>
                <a href={mailto}>{contactDetails.email}</a>
              </li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
