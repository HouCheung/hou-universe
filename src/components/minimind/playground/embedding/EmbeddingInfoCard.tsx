"use client";

import { motion, type Variants } from "framer-motion";
import { Info } from "lucide-react";
import type { MatrixInfo } from "@/lib/minimind/embedding";

// ============================================================
// EmbeddingInfoCard — Module metadata display
// ============================================================
//
// Shows the core dimensional parameters of the embedding layer:
// vocabSize, embeddingDim, and total parameter count.
//
// Helps users understand the scale and cost of the embedding
// layer within a Transformer architecture.
// ============================================================

// ── Animation ────────────────────────────────────────────────

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// ── Helpers ──────────────────────────────────────────────────

/** Format large integers with commas (e.g. 3276800 → "3,276,800") */
function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Compute a rough percentage of 26M (MiniMind total params) */
function percentOfMiniMind(n: number): string {
  const pct = (n / 26_000_000) * 100;
  return pct.toFixed(1);
}

// ── Component ────────────────────────────────────────────────

interface EmbeddingInfoCardProps {
  /** Matrix metadata from MiniEmbedding.getMatrixInfo() */
  info: MatrixInfo;
}

export function EmbeddingInfoCard({ info }: EmbeddingInfoCardProps) {
  const stats = [
    {
      label: "Vocabulary Size",
      value: formatInt(info.vocabSize),
      detail: "rows in the embedding matrix",
      emoji: "📚",
    },
    {
      label: "Embedding Dimension",
      value: info.embeddingDim.toString(),
      detail: `d_model — width of each token vector`,
      emoji: "📐",
    },
    {
      label: "Total Parameters",
      value: formatInt(info.totalParameters),
      detail: `vocabSize × d_model = ${formatInt(info.totalParameters)}`,
      emoji: "⚙️",
    },
  ];

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <Info className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Module Info
        </span>
        <span className="ml-auto rounded-full border border-brand/15 bg-brand/[0.05] px-2 py-0.5 font-mono text-[0.55rem] text-brand/70 dark:text-brand-light/70">
          V1
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 px-5 py-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-500/[0.08] bg-slate-500/[0.02] px-3 py-3 text-center dark:border-white/[0.03] dark:bg-white/[0.01]"
          >
            <span className="text-lg" aria-hidden="true">
              {stat.emoji}
            </span>
            <span className="font-mono text-[0.6rem] tracking-wider text-slate-500/70 dark:text-slate-500/60">
              {stat.label}
            </span>
            <span className="text-lg font-bold text-foreground tabular-nums">
              {stat.value}
            </span>
            <span className="text-[0.5rem] leading-tight text-slate-500/60 dark:text-slate-500/50">
              {stat.detail}
            </span>
          </div>
        ))}
      </div>

      {/* MiniMind context */}
      <div className="border-t border-brand/[0.04] px-5 py-3 dark:border-white/[0.03]">
        <p className="text-center font-mono text-[0.55rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60">
          This embedding layer accounts for ~
          <span className="font-semibold text-brand/80 dark:text-brand-light/80">
            {percentOfMiniMind(info.totalParameters)}%
          </span>{" "}
          of MiniMind&apos;s ~26M parameters
        </p>
      </div>
    </motion.div>
  );
}
