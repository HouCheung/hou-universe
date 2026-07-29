"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { ArrowDown, Dot } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFlowPipeline,
  getModuleById,
  type FlowNode,
} from "@/data/minimind/module-registry";

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

const nodeVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.12, duration: 0.45, ease: "easeOut" },
  }),
};

// ============================================================
// Node label mapping
// ============================================================

function getNodeLabel(node: FlowNode, t: (key: string) => string): string {
  if (node.type === "module") return node.label;
  return t(`minimind.experience.flow.nodes.${node.id}`);
}

// ============================================================
// MiniMindFlow
// ============================================================

export function MiniMindFlow() {
  const { t } = useTranslation();
  const pipeline = getFlowPipeline();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
    >
      {/* Section header */}
      <div className="mb-10 flex items-center gap-5 sm:mb-14">
        <div className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {t("minimind.experience.sectionTitles.flow")}
          </h2>
        </div>
      </div>

      <p className="-mt-6 mb-10 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
        {t("minimind.experience.flow.description")}
      </p>

      {/* Flow pipeline */}
      <div className="flex flex-col items-center gap-3">
        {pipeline.map((node, i) => {
          const isModule = node.type === "module";
          const moduleData = isModule ? getModuleById(node.id) : null;
          const isImplemented = moduleData?.implemented ?? false;
          const isLast = i === pipeline.length - 1;

          return (
            <div key={node.id} className="flex flex-col items-center">
              {/* Node card */}
              <motion.div
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={nodeVariants}
                className={cn(
                  "relative flex items-center gap-4 rounded-xl border px-6 py-4 backdrop-blur-sm transition-all duration-300",
                  "min-w-[240px] sm:min-w-[300px]",
                  isModule && isImplemented
                    ? "border-brand/25 bg-brand/[0.05] shadow-[0_0_20px_rgba(var(--brand-rgb),0.06)] dark:border-brand/30 dark:bg-[rgba(var(--brand-rgb),0.06)]"
                    : isModule && !isImplemented
                      ? "border-dashed border-slate-500/15 bg-transparent dark:border-white/[0.04]"
                      : "border-brand/15 bg-brand/[0.03] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]"
                )}
              >
                {/* Left accent dot */}
                <Dot
                  className={cn(
                    "size-5 shrink-0",
                    isModule && isImplemented
                      ? "text-brand"
                      : isModule && !isImplemented
                        ? "text-slate-500/40"
                        : "text-brand/60"
                  )}
                />

                {/* Node label */}
                <div className="flex flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm font-semibold tracking-tight transition-colors",
                      isModule && isImplemented
                        ? "text-foreground"
                        : isModule && !isImplemented
                          ? "text-slate-500 dark:text-slate-500"
                          : "text-foreground"
                    )}
                  >
                    {getNodeLabel(node, t)}
                  </span>
                  {isModule && moduleData && (
                    <span className="text-[0.6rem] font-mono text-slate-500/60 dark:text-slate-400/40">
                      {moduleData.implemented
                        ? moduleData.description
                        : `${moduleData.futureVersion} — ${t("roadmap.status.upcoming")}`}
                    </span>
                  )}
                </div>

                {/* Flow type badge */}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.55rem] font-mono tracking-[0.1em] uppercase",
                    node.type === "input" || node.type === "output"
                      ? "border-slate-400/15 text-slate-400/70 dark:border-white/[0.06] dark:text-slate-500"
                      : node.type === "intermediate"
                        ? "border-slate-400/15 text-slate-400/70 dark:border-white/[0.06] dark:text-slate-500"
                        : isImplemented
                          ? "border-brand/25 bg-brand/[0.08] text-brand/80 dark:text-brand-light/80"
                          : "border-slate-500/[0.1] text-slate-500/50 dark:border-white/[0.03] dark:text-slate-600"
                  )}
                >
                  {node.type === "input"
                    ? "Input"
                    : node.type === "output"
                      ? "Output"
                      : isImplemented
                        ? "Active"
                        : "Upcoming"}
                </span>
              </motion.div>

              {/* Connector arrow between nodes */}
              {!isLast && (
                <motion.div
                  initial={{ opacity: 0, scaleY: 0 }}
                  whileInView={{ opacity: 1, scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 + 0.2, duration: 0.3 }}
                  className="flex flex-col items-center py-1"
                >
                  <ArrowDown className="size-4 text-brand/30" />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
