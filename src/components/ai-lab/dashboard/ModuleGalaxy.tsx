"use client";

// ============================================================
// ModuleGalaxy — Responsive grid of all MiniMind modules
// ============================================================
//
// Displays every module from the registry with status indicator,
// description, lifecycle badge, implemented badge, and dependency
// chain. All data is sourced exclusively through the adapter layer.
//
// Adapter sources:
//   - src/lib/ai-lab/adapters/progressAdapter.ts
//
// Zero direct registry imports.
// ============================================================

import { motion, type Variants } from "framer-motion";
import { CheckCircle2, GitBranch } from "lucide-react";
import { SectionHeader } from "@/components/home/SectionHeader";
import { getModules, type MiniMindModule } from "@/lib/ai-lab/adapters/progressAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" },
  }),
};

// ============================================================
// Style helpers
// ============================================================

const STATUS_STYLE: Record<MiniMindModule["status"], { dot: string; label: string }> = {
  completed: {
    dot: "bg-emerald-500/60",
    label: "Completed",
  },
  "in-progress": {
    dot: "bg-brand/60",
    label: "In Progress",
  },
  upcoming: {
    dot: "bg-slate-400/40",
    label: "Upcoming",
  },
};

// ============================================================
// ModuleGalaxy
// ============================================================

export function ModuleGalaxy() {
  const modules = getModules();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.moduleProgress" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((mod, i) => {
          const style = STATUS_STYLE[mod.status];

          return (
            <motion.div
              key={mod.id}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
              className={cn(
                "group rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-4 backdrop-blur-sm transition-all duration-300",
                "hover:scale-[1.02] hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)]",
                "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.07)]"
              )}
            >
              {/* Status dot + name */}
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  className={cn("size-2 shrink-0 rounded-full", style.dot)}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                  {mod.title}
                </span>
              </div>

              {/* Description */}
              <p className="mb-3 line-clamp-2 text-[0.65rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60">
                {mod.description}
              </p>

              {/* Metadata row: status + implemented */}
              <div className="mb-3 flex flex-wrap items-center gap-3 text-[0.6rem]">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                    mod.status === "completed"
                      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400"
                      : mod.status === "in-progress"
                        ? "border-brand/20 bg-brand/[0.06] text-brand dark:text-brand-light"
                        : "border-slate-500/15 bg-slate-500/[0.04] text-slate-500 dark:text-slate-400"
                  )}
                >
                  {style.label}
                </span>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                    mod.implemented
                      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400"
                      : "border-slate-500/15 bg-slate-500/[0.04] text-slate-500 dark:text-slate-400"
                  )}
                >
                  <CheckCircle2 className="size-2.5" />
                  {mod.implemented ? "Implemented" : "Not Implemented"}
                </span>
              </div>

              {/* Dependencies */}
              {mod.metadata.dependencies &&
                mod.metadata.dependencies.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                    <GitBranch className="size-3" />
                    <span className="font-medium">Deps:</span>
                    <span className="truncate">
                      {mod.metadata.dependencies.join(", ")}
                    </span>
                  </div>
                )}
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
