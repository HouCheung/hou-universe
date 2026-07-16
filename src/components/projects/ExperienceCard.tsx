"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Calendar, User } from "lucide-react";
import type { ProjectExperience } from "@/types";
import { cn } from "@/lib/utils";

interface ExperienceCardProps {
  experience: ProjectExperience;
  index: number;
}

export function ExperienceCard({ experience, index }: ExperienceCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  /* ── Read all text content from i18n, keyed by experience.id ── */
  const i18nBase = `experience.projects.${experience.id}`;
  const title = t(`${i18nBase}.title`, experience.title);
  const role = t(`${i18nBase}.role`, experience.role);
  const description = t(`${i18nBase}.description`, experience.description);
  const background = t(`${i18nBase}.background`, experience.background);
  const coreWork = t(`${i18nBase}.coreWork`, { returnObjects: true, defaultValue: experience.coreWork }) as unknown as string[];
  const achievements = t(`${i18nBase}.achievements`, { returnObjects: true, defaultValue: experience.achievements }) as unknown as string[];

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

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
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-expanded={isExpanded}
        className={cn(
          "glass-card group/exp relative cursor-pointer rounded-2xl transition-all duration-300 ease-out",
          "hover:-translate-y-1",
          "hover:bg-slate-100/80 hover:border-brand/20 dark:hover:bg-white/[0.06]",
          "hover:shadow-[0_4px_16px_rgba(var(--brand-rgb),0.06)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08),0_0_60px_rgba(var(--brand-rgb),0.03)]",
          /* ── Mobile: preserve all glass effects, no design downgrade ── */
          "max-md:rounded-xl"
        )}
      >
        <div className="p-5 sm:p-6">
          {/* ── Header: time + role tags ── */}
          {/* ── Mobile: stacked vertically; desktop: flex-wrap row ── */}
          <div className="mb-3 flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[0.7rem] tracking-wide",
                "border border-slate-300/30 bg-slate-100/50 text-slate-600",
                "dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-400",
                /* ── Mobile: same visual style, proportional sizing ── */
                "max-md:text-[0.65rem] max-md:px-2 max-md:py-[0.15rem]"
              )}
            >
              <Calendar className="size-3 shrink-0 opacity-60 max-md:size-2.5" />
              {experience.time}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[0.7rem] font-medium tracking-wide",
                "border border-brand/15 bg-brand/[0.06] text-brand",
                "dark:border-brand/20 dark:bg-brand/[0.08] dark:text-brand-light",
                /* ── Mobile: same visual style, proportional sizing ── */
                "max-md:text-[0.65rem] max-md:px-2 max-md:py-[0.15rem]"
              )}
            >
              <User className="size-3 shrink-0 opacity-60 max-md:size-2.5" />
              {role}
            </span>
          </div>

          {/* ── Title ── */}
          <h3
            className={cn(
              "mb-2 text-lg font-semibold tracking-tight",
              "text-foreground",
              "dark:text-slate-100",
              "group-hover/exp:text-brand dark:group-hover/exp:text-slate-200",
              "transition-colors duration-300",
              /* ── Mobile: proportional size reduction ── */
              "max-md:text-base max-md:mb-1.5"
            )}
          >
            {title}
          </h3>

          {/* ── Collapsed description ── */}
          <p
            className={cn(
              "text-sm leading-relaxed",
              "text-muted-foreground",
              "dark:text-slate-400",
              /* ── Mobile: proportional size reduction ── */
              "max-md:text-xs max-md:leading-relaxed"
            )}
          >
            {description}
          </p>

          {/* ── Expand indicator ── */}
          <div className="mt-3 flex items-center justify-center max-md:mt-2.5">
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className={cn(
                "flex items-center gap-1 text-[0.7rem] tracking-wide",
                "text-muted-foreground/60 dark:text-slate-500/60",
                /* ── Mobile: touch target ≥ 44px, visual size unchanged ── */
                "max-md:min-h-[44px] max-md:min-w-[44px] max-md:justify-center max-md:text-[0.65rem]"
              )}
            >
              <span>{isExpanded ? t("experience.collapse") : t("experience.expandDetails")}</span>
              <ChevronDown className="size-3.5 max-md:size-3" />
            </motion.div>
          </div>
        </div>

        {/* ── Expanded detail section ── */}
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
                  /* ── Mobile: proportional margins ── */
                  "max-md:mx-4 max-md:mb-4"
                )}
              />

              <div className="px-5 pb-5 sm:px-6 sm:pb-6 max-md:px-4 max-md:pb-4">
                <div className="space-y-5 max-md:space-y-4">
                  {/* ── 项目背景 / Background ── */}
                  <DetailSection title={t("experience.projectBackground")}>
                    <p
                      className={cn(
                        "text-sm leading-relaxed",
                        "text-foreground dark:text-slate-200",
                        /* ── Mobile: proportional ── */
                        "max-md:text-xs max-md:leading-relaxed"
                      )}
                    >
                      {background}
                    </p>
                  </DetailSection>

                  {/* ── 核心工作 / Core Work ── */}
                  <DetailSection title={t("experience.coreWork")}>
                    <ul className="space-y-2 max-md:space-y-1.5">
                      {coreWork.map((item, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-start gap-2.5 text-sm leading-relaxed",
                            "text-foreground dark:text-slate-200",
                            /* ── Mobile: proportional ── */
                            "max-md:text-xs max-md:leading-relaxed max-md:gap-2"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-[0.35em] block size-1.5 shrink-0 rounded-full",
                              "bg-brand/60 dark:bg-brand-light/60",
                              "max-md:size-1"
                            )}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </DetailSection>

                  {/* ── 项目成果 / Achievements ── */}
                  <DetailSection title={t("experience.projectAchievements")}>
                    <ul className="space-y-2 max-md:space-y-1.5">
                      {achievements.map((item, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-start gap-2.5 text-sm leading-relaxed",
                            "text-foreground dark:text-slate-200",
                            /* ── Mobile: proportional ── */
                            "max-md:text-xs max-md:leading-relaxed max-md:gap-2"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-[0.35em] block size-1.5 shrink-0 rounded-full",
                              "bg-emerald-500/70 dark:bg-emerald-400/70",
                              "max-md:size-1"
                            )}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </DetailSection>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ── Internal: section sub-component ── */
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4
        className={cn(
          "mb-2.5 flex items-center gap-2 text-sm font-semibold tracking-tight",
          "text-slate-700 dark:text-slate-300",
          /* ── Mobile: proportional ── */
          "max-md:text-xs max-md:mb-2 max-md:gap-1.5"
        )}
      >
        <span
          className={cn(
            "block h-4 w-0.5 shrink-0 rounded-full",
            "bg-gradient-to-b from-brand/70 via-brand/50 to-brand/30",
            "max-md:h-3"
          )}
        />
        {title}
      </h4>
      {children}
    </div>
  );
}
