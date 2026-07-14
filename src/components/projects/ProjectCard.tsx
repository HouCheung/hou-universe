"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      delay: i * 0.1,
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
      className={cn(
        "group/card glass-card-hover flex flex-col rounded-2xl"
      )}
    >
      {/* Cover image */}
      <Link
        href={`/projects/${project.id}`}
        className="relative block h-44 overflow-hidden rounded-t-2xl bg-gradient-to-br from-blue-950/50 via-indigo-950/30 to-background sm:h-48"
      >
        {project.coverImage && !imgError ? (
          <>
            <Image
              src={project.coverImage}
              alt={project.title}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
              onError={() => setImgError(true)}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          </>
        ) : (
          <>
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
            {/* Gradient overlay for consistency */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          </>
        )}
      </Link>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <Link href={`/projects/${project.id}`} className="group/title">
          <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover/title:text-blue-200">
            {project.title}
          </h3>
        </Link>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {project.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {project.tags.slice(0, 4).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[0.7rem] border-white/[0.06] bg-white/[0.04] transition-all duration-300 group-hover/card:border-white/[0.1]"
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
            className="transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(96,165,250,0.25)]"
          >
            <Download className="mr-1.5 size-3.5" />
            下载作品
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
