"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { SkillCategoryWithLevel, Project } from "@/types";
import { projects } from "@/data/projects";

/* ── Match skill name to related projects ── */
function matchProjects(skillName: string): Project[] {
  const lower = skillName.toLowerCase();
  return projects.filter((p) => {
    const allTech = [...p.techStack, ...p.tags];
    return allTech.some(
      (t) =>
        t.toLowerCase().includes(lower) || lower.includes(t.toLowerCase())
    );
  });
}

/* ── Planet visual size based on proficiency ── */
function planetSize(pct: number): number {
  return 10 + (pct / 100) * 12; // 10px → 22px — much smaller, low-key
}

/* ── Color palette per category ── */
const CATEGORY_COLORS: Record<string, { glow: string; body: string; ring: string; accent: string }> = {
  programming: {
    glow: "rgba(96,165,250,{a})",
    body: "rgba(59,130,246,0.45)",
    ring: "rgba(96,165,250,0.20)",
    accent: "rgba(96,165,250,0.35)",
  },
  database: {
    glow: "rgba(52,211,153,{a})",
    body: "rgba(16,185,129,0.45)",
    ring: "rgba(52,211,153,0.20)",
    accent: "rgba(52,211,153,0.35)",
  },
  core: {
    glow: "rgba(251,191,36,{a})",
    body: "rgba(245,158,11,0.45)",
    ring: "rgba(251,191,36,0.20)",
    accent: "rgba(251,191,36,0.35)",
  },
  ai: {
    glow: "rgba(167,139,250,{a})",
    body: "rgba(139,92,246,0.45)",
    ring: "rgba(167,139,250,0.20)",
    accent: "rgba(167,139,250,0.35)",
  },
};

const DEFAULT_COLORS = {
  glow: "rgba(148,163,184,{a})",
  body: "rgba(100,116,139,0.45)",
  ring: "rgba(148,163,184,0.20)",
  accent: "rgba(148,163,184,0.35)",
};

interface StarSkillTreeProps {
  categories: SkillCategoryWithLevel[];
}

export function StarSkillTree({ categories }: StarSkillTreeProps) {
  const [selectedSkill, setSelectedSkill] = useState<{
    name: string;
    percentage: number;
    categoryTitle: string;
    categoryId: string;
  } | null>(null);

  const relatedProjects = useMemo(
    () => (selectedSkill ? matchProjects(selectedSkill.name) : []),
    [selectedSkill]
  );

  const handleSelect = useCallback(
    (name: string, percentage: number, categoryTitle: string, categoryId: string) => {
      setSelectedSkill({ name, percentage, categoryTitle, categoryId });
    },
    []
  );

  const handleClose = useCallback(() => setSelectedSkill(null), []);

  return (
    <>
      <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat.id] || DEFAULT_COLORS;

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="flex flex-col gap-5 rounded-2xl border border-slate-200/60 bg-white/60 p-6 backdrop-blur-sm sm:p-7 dark:border-white/[0.04] dark:bg-slate-900/30"
            >
              {/* ── Category header with constellation decoration ── */}
              <div className="flex items-center gap-3">
                {/* Constellation line: 3 tiny dots connected by a fine line */}
                <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
                  <span
                    className="block h-1 w-1 rounded-full"
                    style={{ background: colors.accent.replace("{a}", "0.5") }}
                  />
                  <span
                    className="block h-px w-3"
                    style={{ background: `linear-gradient(to right, ${colors.accent.replace("{a}", "0.15")}, ${colors.accent.replace("{a}", "0.25")})` }}
                  />
                  <span
                    className="block h-1.5 w-1.5 rounded-full"
                    style={{ background: colors.accent.replace("{a}", "0.65") }}
                  />
                  <span
                    className="block h-px w-2.5"
                    style={{ background: `linear-gradient(to right, ${colors.accent.replace("{a}", "0.2")}, ${colors.accent.replace("{a}", "0.12")})` }}
                  />
                  <span
                    className="block h-1 w-1 rounded-full"
                    style={{ background: colors.accent.replace("{a}", "0.35") }}
                  />
                </div>

                <span className="text-base" role="img" aria-hidden="true">
                  {cat.icon}
                </span>
                <h3 className="text-sm font-semibold text-foreground">
                  {cat.title}
                </h3>
                <span className="ml-auto rounded-full bg-slate-300/20 px-2 py-0.5 text-xs font-medium text-slate-500/60 dark:bg-slate-400/8 dark:text-slate-400/60">
                  {cat.skills.length}
                </span>
              </div>

              {/* ── Skills list — aligned vertical rows ── */}
              <div className="flex flex-col gap-3">
                {cat.skills.map((skill, i) => {
                  const size = planetSize(skill.percentage);
                  const glowAlpha = 0.12 + (skill.percentage / 100) * 0.18;

                  return (
                    <motion.button
                      key={skill.name}
                      type="button"
                      onClick={() =>
                        handleSelect(skill.name, skill.percentage, cat.title, cat.id)
                      }
                      className="group/skill flex w-full items-center gap-3 rounded-lg px-2 py-2 -mx-2 text-left transition-colors duration-200 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50"
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06, duration: 0.35, ease: "easeOut" }}
                      aria-label={`${skill.name} - ${skill.percentage}%`}
                    >
                      {/* Mini planet icon */}
                      <div
                        className="relative shrink-0 rounded-full transition-transform duration-300 group-hover/skill:scale-110"
                        style={{ width: size, height: size }}
                      >
                        {/* Soft glow */}
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `radial-gradient(circle, ${colors.glow.replace("{a}", String(glowAlpha + 0.08))} 0%, transparent 70%)`,
                            transform: "scale(2.2)",
                          }}
                        />
                        {/* Planet body */}
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `radial-gradient(circle at 30% 30%, rgba(200,215,240,0.18) 0%, ${colors.body} 40%, rgba(15,23,42,0.8) 100%)`,
                            boxShadow: `0 0 ${4 + (skill.percentage / 100) * 6}px ${colors.glow.replace("{a}", String(glowAlpha))}`,
                            border: `1px solid ${colors.ring.replace("{a}", "0.15")}`,
                          }}
                        />
                        {/* Specular highlight */}
                        <div
                          className="absolute inset-[16%] rounded-full opacity-25"
                          style={{
                            background: "radial-gradient(circle at 25% 25%, white 0%, transparent 50%)",
                          }}
                        />
                      </div>

                      {/* Skill name */}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-600/90 transition-colors duration-200 group-hover/skill:text-slate-800 dark:text-slate-300/90 dark:group-hover/skill:text-slate-100">
                        {skill.name}
                      </span>

                      {/* Progress bar + percentage */}
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-200/60 dark:bg-white/[0.04] sm:w-20">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: `linear-gradient(90deg, ${colors.glow.replace("{a}", "0.55")}, ${colors.body.replace("{a}", "0.8")})`,
                            }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${skill.percentage}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.0, ease: "easeOut", delay: 0.3 + i * 0.08 }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono text-xs tabular-nums text-slate-500/70 transition-colors duration-200 group-hover/skill:text-slate-700 dark:text-slate-400/70 dark:group-hover/skill:text-slate-300">
                          {skill.percentage}%
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Skill detail glass-morphism popup ── */}
      <AnimatePresence>
        {selectedSkill && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <motion.button
              type="button"
              className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
              onClick={handleClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="关闭弹窗"
            />

            {/* Popup card — glass-morphism */}
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-xl backdrop-blur-xl sm:p-7 dark:border-white/[0.08] dark:bg-[#0d0d18]/90 dark:shadow-2xl"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              {/* Decorative corner accent */}
              <div
                className="pointer-events-none absolute -top-px -right-px h-12 w-12 rounded-bl-2xl opacity-15"
                style={{
                  background: `radial-gradient(circle at 100% 0%, ${CATEGORY_COLORS[selectedSkill.categoryId]?.glow.replace("{a}", "0.4") || "rgba(148,163,184,0.4)"}, transparent 70%)`,
                }}
              />

              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/30 bg-slate-100/50 text-sm text-slate-700 transition-all duration-200 hover:border-slate-400/40 hover:bg-slate-200/60 hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-400 dark:hover:border-white/[0.15] dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                aria-label="关闭"
              >
                ✕
              </button>

              {/* Skill header */}
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${CATEGORY_COLORS[selectedSkill.categoryId]?.glow.replace("{a}", "0.8") || "rgba(148,163,184,0.8)"} 0%, ${CATEGORY_COLORS[selectedSkill.categoryId]?.body || "rgba(100,116,139,0.6)"} 100%)`,
                    boxShadow: `0 0 10px ${CATEGORY_COLORS[selectedSkill.categoryId]?.glow.replace("{a}", "0.4") || "rgba(148,163,184,0.4)"}`,
                  }}
                />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {selectedSkill.name}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {selectedSkill.categoryTitle}
                  </p>
                </div>
              </div>

              {/* Proficiency bar */}
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">熟练度</span>
                <span className="font-mono text-xl font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                  {selectedSkill.percentage}
                  <span className="text-sm text-slate-400 dark:text-slate-500">%</span>
                </span>
              </div>
              <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/60 dark:bg-white/[0.04]">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${CATEGORY_COLORS[selectedSkill.categoryId]?.glow.replace("{a}", "0.6") || "rgba(148,163,184,0.6)"}, ${CATEGORY_COLORS[selectedSkill.categoryId]?.body || "rgba(100,116,139,0.5)"})`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${selectedSkill.percentage}%` }}
                  transition={{ duration: 0.55, ease: "easeOut", delay: 0.15 }}
                />
              </div>

              {/* Divider */}
              <div className="mb-4 h-px bg-gradient-to-r from-slate-300/30 via-slate-200/20 to-transparent dark:from-white/[0.06] dark:via-white/[0.03]" />

              {/* Related projects */}
              <div>
                <p className="mb-2.5 text-xs font-medium uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                  相关项目
                  {relatedProjects.length > 0 && (
                    <span className="ml-1.5 text-slate-500 dark:text-slate-600">
                      ({relatedProjects.length})
                    </span>
                  )}
                </p>
                {relatedProjects.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {relatedProjects.map((proj) => (
                      <Link
                        key={proj.id}
                        href={`/projects/${proj.id}`}
                        onClick={handleClose}
                        className="group/link flex items-center gap-2.5 rounded-lg border border-slate-200/60 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-700 transition-all duration-200 hover:border-brand/30 hover:bg-brand/8 hover:text-slate-800 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-300 dark:hover:text-white"
                      >
                        <span className="text-xs" aria-hidden="true">
                          📁
                        </span>
                        <span className="flex-1 truncate">{proj.title}</span>
                        <span className="shrink-0 text-xs text-slate-400 transition-all duration-200 group-hover/link:translate-x-0.5 group-hover/link:text-slate-600 dark:text-slate-500 dark:group-hover/link:text-slate-300">
                          →
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-500">暂无相关项目</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
