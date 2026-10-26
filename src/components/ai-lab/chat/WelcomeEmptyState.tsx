"use client";

// ============================================================
// WelcomeEmptyState — first-time /ai-lab experience
// ============================================================
// Phase 73: Replaces the minimal empty state with a product-grade
// welcome screen that communicates what MiniMind is and offers
// quick-start prompts.
//
// Phase 76: Suggested prompts are now MiniMind-specific ("Explain
// how MiniMind works", "Help me understand attention", …) and the
// baseline warning offers a direct "Train a checkpoint →" action
// into the real Training Lab.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import Link from "next/link";
import { Cpu, Zap, ArrowRight, AlertTriangle } from "lucide-react";
import { getProductionModelConfig } from "@/lib/minimind/experiments/ModelRegistry";

// ============================================================
// Suggested prompts — MiniMind-focused conversation starters
// ============================================================

interface SuggestedPrompt {
  key: string;
  promptKey: string;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { key: "explainMiniMind", promptKey: "aiLab.chat.welcome.prompts.explainMiniMind" },
  { key: "attention", promptKey: "aiLab.chat.welcome.prompts.attention" },
  { key: "pythonExample", promptKey: "aiLab.chat.welcome.prompts.pythonExample" },
  { key: "whatAmILookingAt", promptKey: "aiLab.chat.welcome.prompts.whatAmILookingAt" },
];

// ============================================================
// Model stats — derived from the canonical registry config.
// Phase 80: single source of truth is the PRODUCTION config (not the
// "tiny" reference preset, whose 32K vocab implies a false ~9.2M params).
// ============================================================

interface ModelStat {
  key: string;
  value: string;
}

const PRODUCTION_CONFIG = getProductionModelConfig();

function formatParamCount(params: number): string {
  if (params >= 1_000_000) {
    return `~${(params / 1_000_000).toFixed(1)}M`;
  }
  if (params >= 1_000) {
    return `~${Math.round(params / 1_000)}K`;
  }
  return String(params);
}

function formatVocabSize(vocab: number): string {
  if (vocab >= 1_000 && vocab % 1_000 === 0) {
    return `${vocab / 1_000}K`;
  }
  return vocab.toLocaleString();
}

const MODEL_STATS: ModelStat[] = [
  { key: "parameters", value: formatParamCount(PRODUCTION_CONFIG.estimatedParams) },
  { key: "layers", value: String(PRODUCTION_CONFIG.numLayers) },
  { key: "heads", value: String(PRODUCTION_CONFIG.numHeads) },
  { key: "dModel", value: String(PRODUCTION_CONFIG.dModel) },
  { key: "context", value: String(PRODUCTION_CONFIG.maxSeqLen) },
  { key: "vocabSize", value: formatVocabSize(PRODUCTION_CONFIG.vocabSize) },
];

// ============================================================
// WelcomeEmptyState
// ============================================================

interface WelcomeEmptyStateProps {
  onPromptClick: (prompt: string) => void;
  /** Whether the model is untrained (baseline) — shows a gibberish warning */
  isBaseline?: boolean;
}

export function WelcomeEmptyState({ onPromptClick, isBaseline = false }: WelcomeEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex w-full max-w-xl flex-col items-center"
      >
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          {/* Icon */}
          <div className="flex size-16 items-center justify-center rounded-2xl border border-brand/15 bg-brand/[0.04] shadow-[0_0_48px_rgba(var(--brand-rgb),0.06)] dark:border-brand/20 dark:bg-brand/[0.06]">
            <Cpu className="size-7 text-brand/70" />
          </div>

          {/* Heading */}
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            MiniMind
          </h1>
          <p className="max-w-sm text-center font-mono text-[0.65rem] leading-relaxed tracking-[0.08em] uppercase text-slate-500/60 dark:text-slate-400/40">
            {t("aiLab.chat.welcome.subtitle")}
          </p>
        </div>

        {/* Baseline warning — untrained model produces nonsense */}
        {isBaseline && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="mb-6 flex w-full max-w-md flex-col gap-3"
          >
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-left">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500/70" />
              <span className="text-xs leading-relaxed text-amber-600/90 dark:text-amber-400/80">
                {t("aiLab.chat.welcome.baselineNotice")}
              </span>
            </div>
            <Link
              href="/ai-lab/lab/training"
              className="group inline-flex items-center justify-center gap-2 rounded-xl border border-brand/15 bg-brand/[0.05] px-4 py-2.5 text-xs font-medium text-brand/80 transition-all duration-200 hover:border-brand/30 hover:bg-brand/[0.1] hover:text-brand dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-brand/80 dark:hover:border-brand/25 dark:hover:bg-brand/[0.1]"
            >
              {t("aiLab.chat.welcome.trainCheckpointCta")}
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        )}

        {/* Model stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mb-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
        >
          {MODEL_STATS.map((stat) => (
            <div
              key={stat.key}
              className="flex items-center gap-1.5 rounded-full border border-brand/[0.06] bg-brand/[0.015] px-3 py-1 dark:border-white/[0.04] dark:bg-white/[0.01]"
            >
              <span className="font-mono text-[0.6rem] tracking-wider text-slate-400/80 dark:text-slate-500/60">
                {t(`aiLab.chat.welcome.stats.${stat.key}`)}
              </span>
              <span className="font-mono text-[0.65rem] font-medium text-slate-600 dark:text-slate-300">
                {stat.value}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mb-8 flex items-center gap-2"
        >
          <Zap className="size-3 text-brand/50" />
          <span className="text-xs text-slate-500/70 dark:text-slate-400/50">
            {t("aiLab.chat.welcome.tagline")}
          </span>
        </motion.div>

        {/* Suggested prompts */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="w-full space-y-2"
        >
          <p className="mb-3 text-center font-mono text-[0.6rem] tracking-[0.1em] uppercase text-slate-400/50 dark:text-slate-500/40">
            {t("aiLab.chat.welcome.tryAsking")}
          </p>
          {SUGGESTED_PROMPTS.map((item, i) => {
            const promptText = t(item.promptKey);
            return (
              <motion.button
                key={item.key}
                type="button"
                onClick={() => onPromptClick(promptText)}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.07, duration: 0.3 }}
                className="group flex w-full items-center gap-3 rounded-xl border border-brand/[0.06] bg-brand/[0.012] px-4 py-3 text-left transition-all duration-200 hover:border-brand/15 hover:bg-brand/[0.04] dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"
              >
                <span className="flex-1 text-xs leading-relaxed text-slate-600/80 transition-colors group-hover:text-slate-700 dark:text-slate-400/70 dark:group-hover:text-slate-300">
                  {promptText}
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-slate-400/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand/50" />
              </motion.button>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
}
