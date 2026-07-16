import type { Metadata } from "next";
import { ProjectsContent } from "@/components/projects/ProjectsContent";

export const metadata: Metadata = {
  title: "Projects - HOU Universe",
  description:
    "Project showcase — covering big data pipelines, AI applications, full-stack platforms, and developer tools.",
};

export default function ProjectsPage() {
  return <ProjectsContent />;
}
