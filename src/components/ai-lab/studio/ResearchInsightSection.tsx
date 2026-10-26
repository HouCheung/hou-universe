"use client";

// ============================================================
// ResearchInsightSection — Copilot-generated research insights
// ============================================================
// Phase 64: Research intelligence panel showing deterministic
// copilot analysis of the latest training run.
//
// Features:
//   - Overall status banner with color coding
//   - Key findings list (top 4, severity-sorted)
//   - Top recommendations (top 3)
//   - Finding count summary
//   - Empty state when no analysis data
//
// Data sourced exclusively through studioAdapter.
// ============================================================

import { useState, useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Microscope,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  ArrowRight,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import {
  getResearchInsights,
  type ResearchInsightFinding,
  type ResearchInsightRecommendation,
} from "@/lib/ai-lab/adapters/studioAdapter";
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

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, delay: 0.3 + i * 0.07, ease: "easeOut" },
  }),
};

// ============================================================
// Severity config
// ============================================================

const severityConfig: Record<string, {
  icon: typeof CheckCircle2;
  border: string;
  bg: string;
  textColor: string;
}> = {
  critical: {
    icon: ShieldAlert,
    border: "border-red-500/20",
    bg: "bg-red-500/[0.04]",
    textColor: "text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-amber-500/20",
    bg: "bg-amber-500/[0.04]",
    textColor: "text-amber-400",
  },
  success: {
    icon: CheckCircle2,
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.04]",
    textColor: "text-emerald-400",
  },
  info: {
    icon: Info,
    border: "border-brand/15",
    bg: "bg-brand/[0.03]",
    textColor: "text-brand/70",
  },
};

const statusBannerConfig: Record<string, {
  border: string;
  bg: string;
  text: string;
  icon: string;
}> = {
  stable: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.04]",
    text: "text-emerald-600/80 dark:text-emerald-400/70",
    icon: "text-emerald-500",
  },
  converging: {
    border: "border-brand/20",
    bg: "bg-brand/[0.04]",
    text: "text-brand dark:text-brand-light",
    icon: "text-brand",
  },
  needs_attention: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/[0.04]",
    text: "text-amber-600/80 dark:text-amber-400/70",
    icon: "text-amber-500",
  },
  critical: {
    border: "border-red-500/20",
    bg: "bg-red-500/[0.04]",
    text: "text-red-600/80 dark:text-red-400/70",
    icon: "text-red-500",
  },
  no_data: {
    border: "border-slate-500/15",
    bg: "bg-slate-500/[0.03]",
    text: "text-slate-500/80 dark:text-slate-400/70",
    icon: "text-slate-400",
  },
};

// ============================================================
// Finding Row
// ============================================================

function FindingRow({ finding, index }: { finding: ResearchInsightFinding; index: number }) {
  const sc = severityConfig[finding.severity] ?? severityConfig.info;
  const SevIcon = sc.icon;

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={itemVariants}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 backdrop-blur-sm",
        sc.border,
        sc.bg
      )}
    >
      <SevIcon className={cn("mt-0.5 size-3.5 shrink-0", sc.textColor)} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground/90">
          {finding.title}
        </p>
        <p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-500/70 dark:text-slate-400/60 line-clamp-2">
          {finding.description}
        </p>
      </div>
    </motion.div>
  );
}

// ============================================================
// Recommendation Row
// ============================================================

function RecommendationRow({ rec, index }: { rec: ResearchInsightRecommendation; index: number }) {
  const priorityBorder =
    rec.priority === "high"
      ? "border-l-red-400/60"
      : rec.priority === "medium"
        ? "border-l-amber-400/60"
        : "border-l-brand/40";

  return (
    <motion.div
      custom={index + 4}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={itemVariants}
      className={cn(
        "rounded-lg border border-slate-500/[0.06] bg-slate-500/[0.02] px-3 py-2.5 backdrop-blur-sm",
        "border-l-2",
        priorityBorder,
        "dark:border-white/[0.03] dark:bg-white/[0.01]"
      )}
    >
      <div className="flex items-center gap-2">
        <Lightbulb className="size-3 shrink-0 text-amber-500/60" />
        <p className="text-xs font-semibold text-foreground/90">
          {rec.title}
        </p>
      </div>
      <p className="mt-0.5 pl-5 text-[0.65rem] leading-relaxed text-slate-500/70 dark:text-slate-400/60 line-clamp-2">
        {rec.rationale}
      </p>
    </motion.div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-12 text-center backdrop-blur-sm">
      <Microscope className="mx-auto mb-3 size-8 text-slate-400/40" />
      <p className="text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        No research insights available
      </p>
      <p className="mt-1 text-xs text-slate-400/60 dark:text-slate-500/50">
        Complete a training run to generate copilot analysis.
      </p>
      <Link
        href="/ai-lab/research"
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 px-4 py-1.5 text-xs font-medium text-brand/80 transition-all duration-300",
          "hover:border-brand/30 hover:bg-brand/[0.04] hover:text-brand"
        )}
      >
        Open Research Workspace
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

// ============================================================
// ResearchInsightSection
// ============================================================

export function ResearchInsightSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const data = mounted ? getResearchInsights() : ({ hasData: false } as ReturnType<typeof getResearchInsights>);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
    >
      {/* ── Section header ── */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-purple-500/20 bg-purple-500/[0.06] dark:border-purple-500/25 dark:bg-purple-500/[0.08]">
            <Sparkles className="size-4 text-purple-500/70" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Research Insight
            </h2>
            <p className="text-xs text-slate-500/60 dark:text-slate-400/50">
              {data.hasData
                ? `Analysis of "${data.experimentName}"`
                : "Copilot-powered training intelligence"}
            </p>
          </div>
        </div>

        {data.hasData && (
          <Link
            href="/ai-lab/research"
            className={cn(
              "inline-flex items-center gap-1 text-[0.7rem] font-medium text-slate-500/70 transition-colors",
              "hover:text-brand dark:text-slate-400/60 dark:hover:text-brand-light"
            )}
          >
            Full analysis
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      {/* ── Content ── */}
      {!data.hasData ? (
        <EmptyState />
      ) : (
        <div
          className={cn(
            "rounded-2xl border border-purple-500/10 bg-brand/[0.02] px-4 py-5 backdrop-blur-sm",
            "dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)]",
            "sm:px-6 sm:py-6"
          )}
        >
          {/* Status banner */}
          {(() => {
            const bannerCfg = statusBannerConfig[data.overallStatus] ?? statusBannerConfig.no_data;
            return (
              <div
                className={cn(
                  "mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-sm",
                  bannerCfg.border,
                  bannerCfg.bg
                )}
              >
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border",
                    bannerCfg.border,
                    bannerCfg.bg
                  )}
                >
                  <CheckCircle2 className={cn("size-4", bannerCfg.icon)} />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", bannerCfg.text)}>
                    {data.statusLabel}
                  </p>
                  <p className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                    {data.statusDescription}
                  </p>
                </div>

                {/* Finding counts */}
                <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
                  {data.findingCounts.critical > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/[0.06] px-2 py-0.5 text-[0.6rem] font-medium text-red-600/80 dark:text-red-400/70">
                      {data.findingCounts.critical} critical
                    </span>
                  )}
                  {data.findingCounts.warning > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-2 py-0.5 text-[0.6rem] font-medium text-amber-600/80 dark:text-amber-400/70">
                      {data.findingCounts.warning} warning
                    </span>
                  )}
                  {data.findingCounts.success > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-0.5 text-[0.6rem] font-medium text-emerald-600/80 dark:text-emerald-400/70">
                      {data.findingCounts.success} success
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Key Findings */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                <Microscope className="size-3" />
                Key Findings
              </h3>
              <div className="space-y-2">
                {data.keyFindings.length === 0 ? (
                  <p className="text-xs text-slate-500/50 dark:text-slate-400/40 italic">
                    No significant findings. Training is proceeding as expected.
                  </p>
                ) : (
                  data.keyFindings.map((f, i) => (
                    <FindingRow key={`${f.type}-${i}`} finding={f} index={i} />
                  ))
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                <Lightbulb className="size-3" />
                Recommendations
              </h3>
              <div className="space-y-2">
                {data.topRecommendations.length === 0 ? (
                  <p className="text-xs text-slate-500/50 dark:text-slate-400/40 italic">
                    No recommendations. Current configuration is well-optimized.
                  </p>
                ) : (
                  data.topRecommendations.map((r, i) => (
                    <RecommendationRow key={`${r.title}-${i}`} rec={r} index={i} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
}
