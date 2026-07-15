"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, Github, Download, CheckCircle2, Lightbulb, Cpu, Star } from "lucide-react";
import { StarField } from "@/components/shared/StarField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UpdateLogTimeline } from "@/components/projects/UpdateLogTimeline";
import { AnchorNav } from "@/components/projects/AnchorNav";
import type { Project } from "@/types";

interface ProjectDetailContentProps {
  project: Project;
}

export function ProjectDetailContent({ project }: ProjectDetailContentProps) {
  const { t } = useTranslation();

  const projectId = project.id;
  const title = t(`projectData.${projectId}.title`, project.title);
  const description = t(`projectData.${projectId}.description`, project.description);
  const fullDescription = t(`projectData.${projectId}.fullDescription`, project.fullDescription);
  const background = t(`projectData.${projectId}.background`, project.detail?.background || "");
  const coreFeatures = t(`projectData.${projectId}.coreFeatures`, { returnObjects: true, defaultValue: project.detail?.coreFeatures || [] }) as unknown as string[];
  const techSolution = t(`projectData.${projectId}.techSolution`, project.detail?.techSolution || "");
  const highlights = t(`projectData.${projectId}.highlights`, { returnObjects: true, defaultValue: project.detail?.highlights || [] }) as unknown as string[];
  const translatedUpdateLog = t(`projectData.${projectId}.updateLog`, { returnObjects: true, defaultValue: project.updateLog }) as unknown as typeof project.updateLog;

  return (
    <>
      <StarField />
      <AnchorNav />

      <div className="min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Back link */}
          <Link
            href="/projects"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-12"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("projects.backToList")}
          </Link>

          {/* Hero cover area — project screenshot placeholder */}
          <div className="mb-8 overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-background sm:mb-10">
            {project.coverImage ? (
              <div className="flex items-center justify-center py-16 sm:py-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={project.coverImage}
                  alt={`${title} 项目封面`}
                  className="max-h-64 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 sm:py-20">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-300/20 text-3xl font-bold text-slate-500 dark:bg-slate-400/10 dark:text-slate-300 sm:h-20 sm:w-20 sm:text-4xl">
                  {title.charAt(0)}
                </div>
                <p className="mt-3 text-xs text-muted-foreground/50">
                  {t("projects.imagePlaceholder")}
                </p>
              </div>
            )}
          </div>

          {/* Project title + tags */}
          <header className="mb-8 sm:mb-10">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {description}
            </p>
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
            {project.liveUrl && (
              <Button
                render={
                  <a
                    href={project.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                variant="default"
                size="lg"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("projects.livePreview")}
              </Button>
            )}
            {project.downloadUrl && (
              <Button
                render={<a href={project.downloadUrl} download />}
                variant="outline"
                size="lg"
              >
                <Download className="mr-2 h-4 w-4" />
                {t("projects.download")}
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
                {t("projects.githubRepo")}
              </Button>
            )}
          </div>

          {/* Full description */}
          <section className="mb-10 sm:mb-14">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-slate-400/50" />
              <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                {t("projects.aboutProject")}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
            </div>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {fullDescription
                .split("\n")
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
            </div>
          </section>

          {/* Detail sections */}
          {project.detail && (
            <>
              {/* Project background */}
              <section id="section-background" className="mb-10 sm:mb-14">
                <div className="mb-6 flex items-center gap-3">
                  <Lightbulb className="h-4 w-4 text-slate-600/70 dark:text-slate-300/70" />
                  <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                    {t("projects.projectBackground")}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
                </div>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {background}
                </p>
              </section>

              {/* Core features */}
              <section id="section-features" className="mb-10 sm:mb-14">
                <div className="mb-6 flex items-center gap-3">
                  <Star className="h-4 w-4 text-slate-600/70 dark:text-slate-300/70" />
                  <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                    {t("projects.coreFeatures")}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.isArray(coreFeatures) && coreFeatures.map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/50 p-4 transition-all duration-200 hover:border-brand/20 hover:bg-card"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500/70 dark:text-slate-400/60" />
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Technical solution */}
              <section id="section-tech-solution" className="mb-10 sm:mb-14">
                <div className="mb-6 flex items-center gap-3">
                  <Cpu className="h-4 w-4 text-slate-600/70 dark:text-slate-300/70" />
                  <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                    {t("projects.techSolution")}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
                </div>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {techSolution}
                </p>
              </section>

              {/* Highlights */}
              <section className="mb-10 sm:mb-14">
                <div className="mb-6 flex items-center gap-3">
                  <span className="h-px w-8 bg-slate-400/50" />
                  <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                    {t("projects.highlights")}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
                </div>
                <div className="grid gap-4">
                  {Array.isArray(highlights) && highlights.map((highlight, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-4 rounded-lg border border-border/40 bg-card/50 p-5 transition-all duration-200 hover:border-brand/20 hover:bg-card"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300/30 text-sm font-bold text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {highlight}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Tech stack */}
          <section id="section-tech-stack" className="mb-10 sm:mb-14">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-slate-400/50" />
              <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                {t("projects.techStack")}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {project.techStack.map((tech) => (
                <div
                  key={tech}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-4 py-3 text-sm text-foreground transition-all duration-200 hover:border-brand/20 hover:bg-card"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500/50" />
                  {tech}
                </div>
              ))}
            </div>
          </section>

          {/* Update log */}
          <section className="mb-10 sm:mb-14">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-slate-400/50" />
              <h2 className="font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                {t("projects.updateLog")}
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-400/40 to-transparent" />
            </div>
            <UpdateLogTimeline entries={translatedUpdateLog} />
          </section>

          {/* Bottom buttons */}
          <div id="section-download" className="flex flex-wrap items-center justify-center gap-4 border-t border-border/60 pt-8 sm:pt-10">
            <Button
              render={<Link href="/projects" />}
              variant="outline"
              size="lg"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("projects.backToList")}
            </Button>
            {project.downloadUrl && (
              <Button
                render={<a href={project.downloadUrl} download />}
                variant="default"
                size="lg"
              >
                <Download className="mr-2 h-4 w-4" />
                {t("projects.download")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
