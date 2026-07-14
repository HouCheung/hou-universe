"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";
import { cn } from "@/lib/utils";

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
      delay: i * 0.08,
    },
  }),
};

interface ProjectCardProps {
  project: Project;
  index: number;
}

export function ProjectCard({ project, index }: ProjectCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={cardVariants}
    >
      <Link
        href={`/projects/${project.id}`}
        className={cn(
          "group/card block rounded-xl border border-border/60 bg-card/80",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-1.5 hover:border-blue-400/40",
          "hover:shadow-[0_0_28px_rgba(96,165,250,0.12)]",
          "backdrop-blur-sm"
        )}
      >
        {/* Cover image */}
        <div className="relative h-44 overflow-hidden rounded-t-xl bg-gradient-to-br from-blue-950/60 via-indigo-950/40 to-background sm:h-48">
          {project.coverImage && !imgError ? (
            <>
              <Image
                src={project.coverImage}
                alt={project.title}
                fill
                className="object-cover transition-transform duration-500 group-hover/card:scale-110"
                onError={() => setImgError(true)}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div
                className={cn(
                  "absolute inset-0 opacity-0 transition-opacity duration-500",
                  "group-hover/card:opacity-100",
                  "bg-gradient-to-t from-blue-500/10 via-transparent to-transparent"
                )}
              />
            </>
          ) : (
            <>
              <div
                className={cn(
                  "absolute inset-0 opacity-0 transition-opacity duration-500",
                  "group-hover/card:opacity-100",
                  "bg-gradient-to-t from-blue-500/5 via-transparent to-transparent"
                )}
              />
              {/* Decorative grid pattern */}
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(148,163,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,255,0.3) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              {/* Center icon fallback */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/20 bg-blue-400/5 text-blue-300/50 text-2xl font-bold tracking-wider">
                  {project.title.charAt(0)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Card body */}
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-foreground transition-colors group-hover/card:text-blue-200">
            {project.title}
          </h3>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {project.description}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {project.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[0.7rem]">
                {tag}
              </Badge>
            ))}
            {project.tags.length > 4 && (
              <Badge variant="outline" className="text-[0.7rem]">
                +{project.tags.length - 4}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
