import { Link } from "react-router";
import { legacyProjects } from "../data/legacyContent";

export function findProject(handle) {
  return legacyProjects.find((project) => project.handle === handle || project.oldHandle === handle);
}

export default function ProjectPage({ project }) {
  if (!project) {
    return (
      <main>
        <section className="page-hero">
          <div className="site-shell page-hero-grid">
            <div>
              <p className="page-kicker">Projects</p>
              <h1>Project unavailable.</h1>
            </div>
            <aside className="page-hero-aside">
              <Link className="button-secondary" to="/gallery">
                Back to gallery
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
            <p className="page-kicker">Project</p>
            <h1>{project.title}</h1>
          </div>
          <aside className="page-hero-aside">
            <Link className="button-secondary" to="/gallery">
              Back to gallery
            </Link>
          </aside>
        </div>
      </section>
      <section className="section">
        <div className="site-shell project-detail-grid">
          {project.images.map((image) => (
            <figure className="project-image" key={image}>
              <img src={image} alt={project.title} loading="lazy" />
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
