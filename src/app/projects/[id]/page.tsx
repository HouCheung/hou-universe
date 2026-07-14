import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import { StarField } from "@/components/shared/StarField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UpdateLogTimeline } from "@/components/projects/UpdateLogTimeline";
import { getProjectById } from "@/data/projects";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = getProjectById(id);

  if (!project) {
    return {
      title: "项目未找到 - HOU Universe",
    };
  }

  return {
    title: `${project.title} - HOU Universe`,
    description: project.description,
  };
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const project = getProjectById(id);

  if (!project) {
    notFound();
  }

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Back link */}
          <Link
            href="/projects"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-12"
          >
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
          </Link>

          {/* Project title + tags */}
          <header className="mb-8 sm:mb-10">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {project.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </header>

          {/* Action buttons */}
          <div className="mb-10 flex flex-wrap gap-3 sm:mb-14">
            {project.demoUrl && (
              <Button
                render={
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                variant="default"
                size="lg"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                在线演示
              </Button>
            )}
            {project.githubUrl && (
              <Button
                render={
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                variant="outline"
                size="lg"
              >
                <Github className="mr-2 h-4 w-4" />
                GitHub 仓库
              </Button>
            )}
          </div>

          {/* Full description */}
          <section className="mb-10 sm:mb-14">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-400/40" />
              <h2 className="font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
                关于项目
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-blue-400/30 to-transparent" />
            </div>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {project.fullDescription
                .split("\n")
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
            </div>
          </section>

          {/* Tech stack */}
          <section className="mb-10 sm:mb-14">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-400/40" />
              <h2 className="font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
                技术栈
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-blue-400/30 to-transparent" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {project.techStack.map((tech) => (
                <div
                  key={tech}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-4 py-3 text-sm text-foreground transition-all duration-200 hover:border-blue-400/25 hover:bg-card"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400/50" />
                  {tech}
                </div>
              ))}
            </div>
          </section>

          {/* Update log */}
          <section className="mb-10 sm:mb-14">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-400/40" />
              <h2 className="font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
                更新日志
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-blue-400/30 to-transparent" />
            </div>
            <UpdateLogTimeline entries={project.updateLog} />
          </section>

          {/* Bottom back button */}
          <div className="border-t border-border/60 pt-8 text-center sm:pt-10">
            <Button
              render={<Link href="/projects" />}
              variant="outline"
              size="lg"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回项目列表
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
