import { ProjectsContent } from "@/components/projects/ProjectsContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Projects",
  description:
    "Project showcase — covering big data pipelines, AI applications, full-stack platforms, and developer tools.",
  path: "/projects",
});

export default function ProjectsPage() {
  return <ProjectsContent />;
}
