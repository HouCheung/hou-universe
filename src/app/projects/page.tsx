import type { Metadata } from "next";
import { StarField } from "@/components/shared/StarField";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "项目 - HOU Universe",
  description:
    "项目展示——涵盖大数据管道、AI 应用、全栈平台和开发者工具。",
};

export default function ProjectsPage() {
  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-blue-300/60 uppercase">
              项目
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              项目
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              涵盖全栈平台与开发工具的精选项目展示——
              每个项目都是构建、学习与创造之旅中的一个里程碑。
            </p>
          </header>

          {/* Divider */}
          <div className="mb-12 flex items-center gap-3 sm:mb-16">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
            <span className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
              精选项目
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
          </div>

          {/* Project grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} />
            ))}
          </div>

          {/* Empty state */}
          {projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg text-muted-foreground">
                暂无项目，敬请期待！
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
