import type { Metadata } from "next";
import { ProjectsContent } from "@/components/projects/ProjectsContent";

export const metadata: Metadata = {
  title: "项目 - HOU Universe",
  description:
    "项目展示——涵盖大数据管道、AI 应用、全栈平台和开发者工具。",
};

export default function ProjectsPage() {
  return <ProjectsContent />;
}
