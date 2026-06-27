import { useLoaderData } from "react-router";
import ProjectPage, { findProject } from "../../src/pages/ProjectPage";

export function loader({ params }) {
  const project = findProject(params.projectHandle);
  if (!project) throw new Response(null, { status: 404 });
  return { project };
}

export const meta = ({ data }) => [{ title: `${data?.project?.title || "Project"} | Light + Form` }];

export default function ProjectRoute() {
  const { project } = useLoaderData();
  return <ProjectPage project={project} />;
}
