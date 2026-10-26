"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Hash, Percent } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { GenerationStep, TokenAlternative } from "@/lib/minimind/inference";

// ============================================================
// TokenStream — Scrollable token-by-token generation display
// ============================================================
//
// Renders each GenerationStep as an expandable card showing:
//   - Step index, token string, token ID, probability
//   - Expand to see: pipeline description, top alternatives
//
// Uses Framer Motion for staggered entrance animations.
// Data comes entirely from GenerationStep records via the
// InferenceEngine API — no fake data.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface TokenStreamProps {
  steps: GenerationStep[];
  className?: string;
}

// ── Sub-component: Alternative badge ─────────────────────────

function AlternativeBadge({ alt }: { alt: TokenAlternative }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/50 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
        #{alt.rank}
      </span>
      <span className="font-mono text-xs font-medium text-foreground">
        {alt.token}
      </span>
      <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
        id:{alt.tokenId}
      </span>
      <span className="ml-auto font-mono text-[0.65rem] text-brand/70 dark:text-brand/60">
        {(alt.probability * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ── Sub-component: Single step card ──────────────────────────

function StepCard({ step, index }: { step: GenerationStep; index: number }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
      className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02] overflow-hidden"
    >
      {/* Step header — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Step index */}
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/[0.08] font-mono text-[0.65rem] font-semibold text-brand dark:bg-brand/[0.12] dark:text-brand/80">
          {step.stepIndex}
        </div>

        {/* Token display */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <ChevronRight className="size-3 shrink-0 text-slate-300 dark:text-slate-600" />
          <span className="font-mono text-sm font-semibold text-foreground truncate">
            {step.token}
          </span>
        </div>

        {/* Token ID + Probability */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <Hash className="size-2.5 text-slate-400 dark:text-slate-500" />
            <span className="font-mono text-[0.65rem] text-slate-500 dark:text-slate-400">
              {step.tokenId}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Percent className="size-2.5 text-slate-400 dark:text-slate-500" />
            <span className="font-mono text-[0.65rem] text-brand/70 dark:text-brand/60">
              {(step.probability * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Expanded details: pipeline + alternatives */}
      <div className="border-t border-slate-100 dark:border-white/[0.04] px-4 py-3 space-y-2.5 bg-slate-50/50 dark:bg-white/[0.01]">
        {/* Pipeline description */}
        <div>
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t("aiLab.inference.pipelineLabel")}
          </span>
          <p className="mt-0.5 font-mono text-[0.65rem] text-slate-500/80 dark:text-slate-400/70 leading-relaxed">
            {step.pipelineDescription}
          </p>
        </div>

        {/* Top alternatives */}
        {step.alternatives.length > 0 && (
          <div>
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t("aiLab.inference.alternativesLabel")}
            </span>
            <div className="mt-1.5 space-y-1">
              {step.alternatives.slice(0, 5).map((alt) => (
                <AlternativeBadge key={`${step.stepIndex}-${alt.rank}`} alt={alt} />
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Component ────────────────────────────────────────────────

export function TokenStream({ steps, className }: TokenStreamProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.inference.tokenStream")}
        </h3>
        <span className="font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
          {steps.length} token{steps.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="flex size-10 items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <span className="font-mono text-lg font-light text-slate-300 dark:text-slate-600">
              T
            </span>
          </div>
          <p className="text-center text-[0.75rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
            {t("aiLab.inference.emptyTokenStream")}
          </p>
        </div>
      )}

      {/* Step cards */}
      <AnimatePresence mode="popLayout">
        <div className="space-y-2">
          {steps.map((step, i) => (
            <StepCard key={step.stepIndex} step={step} index={i} />
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
}
