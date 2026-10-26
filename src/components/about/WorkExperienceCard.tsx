"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, Building2, Calendar, ChevronDown } from "lucide-react";
import type { WorkExperience } from "@/types";
import { cn } from "@/lib/utils";

interface WorkExperienceCardProps {
  experience: WorkExperience;
  index: number;
}

/**
 * WorkExperienceCard — collapsible internship card for the About page.
 *
 * Canonical structure lives in src/data/work-experience.ts; all display
 * strings are overridden through `workExperience.items.<id>.*` so the
 * Chinese and English pages stay in sync.
 */
export function WorkExperienceCard({
  experience,
  index,
}: WorkExperienceCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const base = `workExperience.items.${experience.id}`;
  const company = t(`${base}.company`, experience.company);
  const role = t(`${base}.role`, experience.role);
  const period = t(`${base}.period`, experience.period);
  const description = t(`${base}.description`, experience.description);
  const tags = t(`${base}.tags`, {
    returnObjects: true,
    defaultValue: experience.tags,
  }) as unknown as string[];

  const sections = experience.sections.map((section) => ({
    id: section.id,
    title: t(`${base}.sections.${section.id}.title`, section.title),
    points: t(`${base}.sections.${section.id}.points`, {
      returnObjects: true,
      defaultValue: section.points,
    }) as unknown as string[],
  }));

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.08 }}
    >
      <motion.div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        aria-expanded={isExpanded}
        className={cn(
          "glass-card group/exp relative cursor-pointer rounded-2xl transition-all duration-300 ease-out",
          "hover:-translate-y-1 hover:border-brand/20 hover:bg-slate-100/80",
          "hover:shadow-[0_4px_16px_rgba(var(--brand-rgb),0.06)]",
          "dark:hover:bg-white/[0.06] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08)]",
          "max-md:rounded-xl"
        )}
      >
        <div className="p-5 sm:p-6">
          {/* Header: time + role */}
          <div className="mb-3 flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[0.7rem] tracking-wide",
                "border border-slate-300/30 bg-slate-100/50 text-slate-600",
                "dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-400",
                "max-md:px-2 max-md:py-[0.15rem] max-md:text-[0.65rem]"
              )}
            >
              <Calendar className="size-3 shrink-0 opacity-60 max-md:size-2.5" />
              {period}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[0.7rem] font-medium tracking-wide",
                "border border-brand/15 bg-brand/[0.06] text-brand",
                "dark:border-brand/20 dark:bg-brand/[0.08] dark:text-brand-light",
                "max-md:px-2 max-md:py-[0.15rem] max-md:text-[0.65rem]"
              )}
            >
              <Briefcase className="size-3 shrink-0 opacity-60 max-md:size-2.5" />
              {role}
            </span>
          </div>

          {/* Company */}
          <h3
            className={cn(
              "mb-2 flex items-start gap-2 text-lg font-semibold tracking-tight",
              "text-foreground transition-colors duration-300",
              "group-hover/exp:text-brand dark:text-slate-100 dark:group-hover/exp:text-slate-200",
              "max-md:text-base max-md:mb-1.5"
            )}
          >
            <Building2 className="mt-1 size-4 shrink-0 text-brand/60 max-md:size-3.5" />
            <span className="min-w-0 break-words">{company}</span>
          </h3>

          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              "dark:text-slate-400",
              "max-md:text-xs max-md:leading-relaxed"
            )}
          >
            {description}
          </p>

          {/* Technical keywords */}
          <div className="mt-3 flex flex-wrap gap-1.5 max-md:mt-2.5">
            {Array.isArray(tags) &&
              tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "rounded-md border border-slate-300/30 bg-slate-100/50 px-2 py-0.5",
                    "font-mono text-[0.65rem] text-slate-600",
                    "dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-400",
                    "max-md:text-[0.6rem]"
                  )}
                >
                  {tag}
                </span>
              ))}
          </div>

          {/* Expand indicator */}
          <div className="mt-3 flex items-center justify-center max-md:mt-2.5">
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className={cn(
                "flex items-center gap-1 text-[0.7rem] tracking-wide",
                "text-muted-foreground/60 dark:text-slate-500/60",
                "max-md:min-h-[44px] max-md:min-w-[44px] max-md:justify-center max-md:text-[0.65rem]"
              )}
            >
              <span>
                {isExpanded
                  ? t("experience.collapse")
                  : t("experience.expandDetails")}
              </span>
              <ChevronDown className="size-3.5 max-md:size-3" />
            </motion.div>
          </div>
        </div>

        {/* Expanded responsibilities */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "mx-5 mb-5 border-t sm:mx-6 sm:mb-6",
                  "border-slate-300/20 dark:border-white/[0.06]",
                  "max-md:mx-4 max-md:mb-4"
                )}
              />

              <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6 max-md:grid-cols-1 max-md:gap-4 max-md:px-4 max-md:pb-4">
                {sections.map((section) => (
                  <div key={section.id} className="min-w-0">
                    <h4
                      className={cn(
                        "mb-2.5 flex items-center gap-2 text-sm font-semibold tracking-tight",
                        "text-slate-700 dark:text-slate-300",
                        "max-md:mb-2 max-md:text-xs"
                      )}
                    >
                      <span className="block h-4 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-brand/70 via-brand/50 to-brand/30 max-md:h-3" />
                      {section.title}
                    </h4>
                    <ul className="space-y-2 max-md:space-y-1.5">
                      {section.points.map((point, pointIndex) => (
                        <li
                          key={pointIndex}
                          className={cn(
                            "flex items-start gap-2.5 text-sm leading-relaxed",
                            "text-foreground dark:text-slate-200",
                            "max-md:gap-2 max-md:text-xs"
                          )}
                        >
                          <span className="mt-[0.35em] block size-1.5 shrink-0 rounded-full bg-brand/60 dark:bg-brand-light/60 max-md:size-1" />
                          <span className="min-w-0 break-words">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
