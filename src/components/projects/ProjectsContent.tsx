"use client";

import { useTranslation } from "react-i18next";
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StarField } from "@/components/shared/StarField";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { CategoryFilter } from "@/components/projects/CategoryFilter";
import { TechTagCloud } from "@/components/projects/TechTagCloud";
import { ExperienceCard } from "@/components/projects/ExperienceCard";
import { projects } from "@/data/projects";
import { experiences } from "@/data/experiences";

export function ProjectsContent() {
  const { t } = useTranslation();
  const categories = useMemo(() => [t("projects.categoryAll"), t("projects.categoryFullstack"), t("projects.categoryData")], [t]);
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  /* ── Collect all unique tech tags from all projects ── */
  const allTechTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach((p) => p.techStack.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, []);

  /* ── Handle tag click: toggle (click again to clear) ── */
  const handleTagClick = useCallback((tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
  }, []);

  const filteredProjects = useMemo(() => {
    let result = projects;

    // Category filter
    if (activeCategory !== categories[0]) {
      const catMap: Record<string, string> = {
        [t("projects.categoryFullstack")]: "fullstack",
        [t("projects.categoryData")]: "data",
      };
      const dataCat = catMap[activeCategory] || activeCategory;
      result = result.filter((p) => p.category === dataCat);
    }

    // Tag filter
    if (activeTag) {
      result = result.filter((p) =>
        p.techStack.some((t) => t === activeTag) ||
        p.tags.some((t) => t === activeTag)
      );
    }

    return result;
  }, [activeCategory, activeTag, categories, t]);

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36 max-sm:px-5 max-sm:py-16">
          {/* Page header */}
          <header className="mb-12 text-center sm:mb-16 max-sm:mb-10">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-400/60">
              {t("projects.subhead")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl max-sm:text-3xl">
              <span className="bg-gradient-to-r from-[#1e293b] via-[#334155] to-[#475569] bg-clip-text text-transparent dark:from-[#e2e8f0] dark:via-[#f8fafc] dark:to-[#94a3b8]">
                {t("projects.heading")}
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg max-sm:text-sm max-sm:mt-4">
              {t("projects.intro")}
            </p>
          </header>

          {/* Category filter tabs */}
          <CategoryFilter
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />

          {/* 3D tech tag cloud */}
          <TechTagCloud
            tags={allTechTags}
            activeTag={activeTag}
            onTagClick={handleTagClick}
          />

          {/* Divider */}
          <div className="mb-12 flex items-center gap-4 sm:mb-16 max-sm:mb-8 max-sm:gap-3">
            <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
            <span className="shrink-0 font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
              {t("projects.featured")}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
          </div>

          {/* Project grid */}
          <motion.div
            layout
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 card-grid-depth"
          >
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project, index) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <ProjectCard project={project} index={index} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* ── Project experience divider ── */}
          <div className="mb-12 mt-16 flex items-center gap-4 sm:mb-16 sm:mt-20 max-sm:mb-8 max-sm:mt-12">
            <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand/70 via-brand/50 to-brand/30" />
            <span className="shrink-0 font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
              {t("experience.sectionTitle")}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
          </div>

          {/* Project experience cards */}
          <div className="flex flex-col gap-5 sm:gap-6">
            {experiences.map((exp, index) => (
              <ExperienceCard
                key={exp.id}
                experience={exp}
                index={index}
              />
            ))}
          </div>

          {/* Empty state */}
          {filteredProjects.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <p className="text-lg text-muted-foreground">
                {t("projects.emptyState")}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
