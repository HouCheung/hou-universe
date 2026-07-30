"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  MINIMIND_MODULES,
  computeDependencyLevels,
  type DependencyLevel,
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
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.1, duration: 0.4, ease: "easeOut" },
  }),
};

// ============================================================
// SVG connector line between two module DOM elements
// ============================================================

interface Connector {
  from: string;
  to: string;
}

function ConnectorLines({
  connectors,
}: {
  connectors: Connector[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);

  useEffect(() => {
    function updateLines() {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

      for (const conn of connectors) {
        const fromEl = document.getElementById(`dep-node-${conn.from}`);
        const toEl = document.getElementById(`dep-node-${conn.to}`);

        if (!fromEl || !toEl) continue;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        // Start from bottom-center of "from" node
        const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
        const y1 = fromRect.bottom - containerRect.top;

        // End at top-center of "to" node
        const x2 = toRect.left + toRect.width / 2 - containerRect.left;
        const y2 = toRect.top - containerRect.top;

        newLines.push({ x1, y1, x2, y2 });
      }

      setLines(newLines);
    }

    updateLines();
    window.addEventListener("resize", updateLines);
    return () => window.removeEventListener("resize", updateLines);
  }, [connectors]);

  if (lines.length === 0) return null;

  // Compute SVG bounds
  const allX = lines.flatMap((l) => [l.x1, l.x2]);
  const allY = lines.flatMap((l) => [l.y1, l.y2]);
  const minX = Math.min(...allX) - 12;
  const minY = Math.min(...allY) - 12;
  const maxX = Math.max(...allX) + 12;
  const maxY = Math.max(...allY) + 12;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0"
      style={{ width: "100%", height: "100%" }}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="currentColor"
          className="text-brand/20 dark:text-brand/30"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ))}
    </svg>
  );
}

// ============================================================
// ModuleDependencyGraph
// ============================================================

export function ModuleDependencyGraph() {
  const { t } = useTranslation();

  const dependencyLevels = useMemo(() => computeDependencyLevels(), []);

  // Group modules by their dependency level
  const levelGroups = useMemo(() => {
    const map = new Map<number, DependencyLevel[]>();
    for (const dl of dependencyLevels) {
      const existing = map.get(dl.level) ?? [];
      existing.push(dl);
      map.set(dl.level, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [dependencyLevels]);

  // Build connector list: for each module, connect from each dependency to it
  const connectors = useMemo(() => {
    const conns: Connector[] = [];
    for (const mod of MINIMIND_MODULES) {
      const deps = mod.metadata.dependencies ?? [];
      for (const depId of deps) {
        conns.push({ from: depId, to: mod.id });
      }
    }
    return conns;
  }, []);

  const maxLevel = Math.max(...dependencyLevels.map((d) => d.level), 0);

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
            {t("minimind.experience.sectionTitles.dependencyGraph")}
          </h2>
        </div>
      </div>

      <p className="-mt-6 mb-10 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
        {t("minimind.experience.dependencyGraph.description")}
      </p>

      {/* Dependency graph grid — rows = levels, columns = modules at that level */}
      <div className="relative" style={{ minHeight: `${(maxLevel + 1) * 100}px` }}>
        {/* SVG connector overlay */}
        <ConnectorLines connectors={connectors} />

        {/* Level rows */}
        <div className="relative z-10 flex flex-col gap-10">
          {levelGroups.map(([level, deps], rowIdx) => (
            <div key={level} className="flex flex-col gap-3">
              {/* Level label */}
              <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-slate-500/60 dark:text-slate-400/40">
                {level === 0 ? "Foundation" : `Level ${level}`}
              </span>

              {/* Module nodes row */}
              <div className="flex flex-wrap gap-4">
                {deps.map((dl, colIdx) => {
                  const mod = MINIMIND_MODULES.find(
                    (m) => m.id === dl.moduleId
                  );
                  if (!mod) return null;

                  const isImplemented = mod.implemented;

                  return (
                    <motion.div
                      key={mod.id}
                      id={`dep-node-${mod.id}`}
                      custom={rowIdx * 5 + colIdx}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                      variants={nodeVariants}
                      className={cn(
                        "relative rounded-xl border px-5 py-4 backdrop-blur-sm transition-all duration-300",
                        isImplemented
                          ? "border-brand/25 bg-brand/[0.05] shadow-[0_0_20px_rgba(var(--brand-rgb),0.06)] dark:border-brand/30 dark:bg-[rgba(var(--brand-rgb),0.06)]"
                          : "border-dashed border-slate-500/15 bg-transparent dark:border-white/[0.04]"
                      )}
                    >
                      {/* Title */}
                      <p
                        className={cn(
                          "text-sm font-semibold tracking-tight",
                          isImplemented
                            ? "text-foreground"
                            : "text-slate-500 dark:text-slate-500"
                        )}
                      >
                        {mod.title}
                      </p>

                      {/* Dependency list */}
                      {mod.metadata.dependencies &&
                        mod.metadata.dependencies.length > 0 && (
                          <p className="mt-1 text-[0.6rem] text-slate-500/60 dark:text-slate-400/40">
                            uses:{" "}
                            {mod.metadata.dependencies
                              .map((depId) => {
                                const depMod = MINIMIND_MODULES.find(
                                  (m) => m.id === depId
                                );
                                return depMod?.title ?? depId;
                              })
                              .join(", ")}
                          </p>
                        )}

                      {/* Status dot */}
                      <span
                        className={cn(
                          "absolute right-3 top-3 size-2 rounded-full",
                          isImplemented
                            ? "bg-brand shadow-[0_0_6px_rgba(var(--brand-rgb),0.5)]"
                            : "bg-slate-500/30 dark:bg-slate-600"
                        )}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

        {/* Link to full knowledge graph */}
        <div className="mt-10 flex justify-center">
          <Link
            href="/ai-lab/knowledge"
            className="group inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.03] px-5 py-2.5 text-sm font-medium text-brand/70 transition-all duration-300 hover:border-brand/40 hover:bg-brand/[0.06] hover:text-brand dark:border-brand/25 dark:text-brand/60 dark:hover:text-brand/80"
          >
            Explore full knowledge graph
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
    </motion.section>
  );
}
