import { Link } from "react-router";
import { policyPages } from "../data/legacyContent";

export default function PolicyPage({ policyHandle }) {
  const policy = policyPages[policyHandle];

  if (!policy) {
    return (
      <main>
        <section className="page-hero">
          <div className="site-shell page-hero-grid">
            <div>
              <p className="page-kicker">Policy</p>
              <h1>Policy unavailable.</h1>
            </div>
            <aside className="page-hero-aside">
              <Link className="button-secondary" to="/">
                Home
              </Link>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">{policy.kicker}</p>
            <h1>{policy.title}</h1>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-shell policy-stack">
          {policy.sections.map((section) => (
            <article className="policy-panel" key={section.title}>
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
