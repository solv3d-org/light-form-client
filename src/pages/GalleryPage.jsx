import { Link } from "react-router";
import { legacyProjects } from "../data/legacyContent";

export default function GalleryPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">Projects</p>
            <h1>Installed rooms and commercial work.</h1>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-shell project-grid">
          {legacyProjects.map((project) => (
            <Link className="project-card" to={`/projects/${project.handle}`} key={project.handle}>
              <img src={project.images[0]} alt={project.title} loading="lazy" />
              <span>{project.title}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
