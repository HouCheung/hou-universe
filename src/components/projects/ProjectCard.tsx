"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TiltCard } from "@/components/shared/TiltCard";
import { ProgressiveImage } from "@/components/shared/ProgressiveImage";
import type { Project } from "@/types";
import { cn } from "@/lib/utils";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: "easeOut",
      delay: i * 0.05,
    },
  }),
};

interface ProjectCardProps {
  project: Project;
  index: number;
}

export function ProjectCard({ project, index }: ProjectCardProps) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const projectTitle = t(`projectData.${project.id}.title`, project.title);
  const projectDesc = t(`projectData.${project.id}.description`, project.description);

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
    >
      <TiltCard
        className={cn(
          "group/card glass-card flex flex-col rounded-2xl transition-all duration-300 ease-out",
          "hover:bg-slate-100/80 hover:border-brand/20 dark:hover:bg-white/[0.06]",
          "hover:shadow-[0_4px_16px_rgba(var(--brand-rgb),0.06)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08),0_0_60px_rgba(var(--brand-rgb),0.03)]"
        )}
        intensity={0.06}
        glare={0.05}
      >
        {/* Cover image */}
        <Link
          href={`/projects/${project.id}`}
          className="relative block h-44 overflow-hidden rounded-t-2xl bg-gradient-to-br from-slate-900/50 via-slate-800/30 to-background sm:h-48"
        >
          {project.coverImage && !imgError ? (
            <>
              <ProgressiveImage
                src={project.coverImage}
                alt={projectTitle}
                fill
                containerClassName="absolute inset-0"
                className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
                onError={() => setImgError(true)}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                loading={index < 2 ? "eager" : "lazy"}
                priority={index < 2}
              />
              <div className="absolute inset-0 z-[1] bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-400/30 bg-slate-400/10 text-slate-500/50 text-2xl dark:text-slate-300/50 font-bold tracking-wider">
                  {projectTitle.charAt(0)}
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
            </>
          )}
        </Link>

        {/* Card body */}
        <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
          <Link href={`/projects/${project.id}`} className="group/title">
            <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover/title:text-brand dark:group-hover/title:text-slate-200">
              {projectTitle}
            </h3>
          </Link>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {projectDesc}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {project.tags.slice(0, 4).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[0.7rem] border-slate-300/30 bg-slate-100/50 transition-all duration-300 group-hover/card:border-brand/20 dark:border-white/[0.06] dark:bg-white/[0.04] dark:group-hover/card:border-white/[0.1]"
              >
                {tag}
              </Badge>
            ))}
            {project.tags.length > 4 && (
              <Badge variant="outline" className="text-[0.7rem]">
                +{project.tags.length - 4}
              </Badge>
            )}
          </div>

          {/* Action button */}
          {project.downloadUrl && (
            <div className="mt-auto flex justify-center pt-2">
              <Button
                render={
                  <a
                    href={project.downloadUrl}
                    download
                  />
                }
                variant="default"
                size="sm"
                className="transition-all duration-200"
              >
                <Download className="mr-1.5 size-3.5" />
                {t("projects.download")}
              </Button>
            </div>
          )}
        </div>
      </TiltCard>
    </motion.div>
  );
}
