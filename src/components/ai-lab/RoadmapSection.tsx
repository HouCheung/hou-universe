"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { roadmapPhases, getCurrentTask } from "@/data/roadmap";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDot, Circle } from "lucide-react";

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-emerald-400" />;
    case "in-progress":
      return <CircleDot className="size-4 text-brand" />;
    default:
      return <Circle className="size-4 text-slate-600 dark:text-slate-700" />;
  }
}

export function RoadmapSection() {
  const { t } = useTranslation();
  const currentTask = getCurrentTask();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.roadmap" />

      <div className="space-y-14">
        {roadmapPhases.map((phase) => (
          <div key={phase.id}>
            {/* Phase header */}
            <div className="mb-5 flex items-center gap-3">
              <span
                className={cn(
                  "font-mono text-[0.6rem] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border",
                  phase.status === "in-progress"
                    ? "border-brand/30 bg-brand/[0.06] text-brand/80 dark:text-brand-light/80"
                    : phase.status === "completed"
                      ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-500/70"
                      : "border-slate-500/15 bg-slate-500/[0.03] text-slate-500/60"
                )}
              >
                {t(phase.titleKey)}
              </span>
              <span className="text-xs text-slate-500/70 dark:text-slate-500/60">
                {t(phase.descriptionKey)}
              </span>
            </div>

            {/* Node grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {phase.nodes.map((node, i) => {
                const isActive = currentTask?.id === node.id;
                return (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className={cn(
                      "group relative rounded-xl border px-4 py-3.5 transition-all duration-300",
                      isActive
                        ? "border-brand/25 bg-brand/[0.05] shadow-[0_0_20px_rgba(var(--brand-rgb),0.06)] dark:border-white/[0.1] dark:bg-[rgba(var(--brand-rgb),0.06)]"
                        : node.status === "upcoming"
                          ? "border-slate-500/[0.08] bg-transparent dark:border-white/[0.03]"
                          : "border-emerald-500/15 bg-emerald-500/[0.03]"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm font-semibold truncate",
                            node.status === "upcoming"
                              ? "text-slate-500 dark:text-slate-500"
                              : "text-foreground"
                          )}
                        >
                          {t(node.titleKey)}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500/80 dark:text-slate-500/70 line-clamp-2">
                          {t(node.descriptionKey)}
                        </p>
                      </div>
                      <span className="ml-2 shrink-0 mt-0.5">
                        {statusIcon(node.status)}
                      </span>
                    </div>

                    {/* Topics pills */}
                    {node.topics && node.topics.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {node.topics.slice(0, 3).map((topic) => (
                          <span
                            key={topic}
                            className="inline-block rounded-full border border-slate-500/[0.1] px-1.5 py-0.5 text-[0.6rem] text-slate-500/80 dark:border-white/[0.04] dark:text-slate-500"
                          >
                            {topic}
                          </span>
                        ))}
                        {node.topics.length > 3 && (
                          <span className="text-[0.6rem] text-slate-500/60">
                            +{node.topics.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
