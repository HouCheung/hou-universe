"use client";

import { motion, type Variants } from "framer-motion";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MatrixInfo } from "@/lib/minimind/embedding";

// ============================================================
// EmbeddingInfoCard — Module metadata display
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function percentOfMiniMind(n: number): string {
  const pct = (n / 26_000_000) * 100;
  return pct.toFixed(1);
}

interface EmbeddingInfoCardProps {
  info: MatrixInfo;
}

export function EmbeddingInfoCard({ info }: EmbeddingInfoCardProps) {
  const { t } = useTranslation();

  const stats = [
    {
      label: t("minimind.playground.embedding.infoVocabSize"),
      value: formatInt(info.vocabSize),
      detail: t("minimind.playground.embedding.infoVocabSizeDetail"),
      emoji: "📚",
    },
    {
      label: t("minimind.playground.embedding.infoEmbeddingDim"),
      value: info.embeddingDim.toString(),
      detail: t("minimind.playground.embedding.infoEmbeddingDimDetail"),
      emoji: "📐",
    },
    {
      label: t("minimind.playground.embedding.infoTotalParams"),
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
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <Info className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          {t("minimind.playground.embedding.infoHeader")}
        </span>
        <span className="ml-auto rounded-full border border-brand/15 bg-brand/[0.05] px-2 py-0.5 font-mono text-[0.55rem] text-brand/70 dark:text-brand-light/70">
          {t("minimind.playground.embedding.infoVersion")}
        </span>
      </div>

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

      <div className="border-t border-brand/[0.04] px-5 py-3 dark:border-white/[0.03]">
        <p className="text-center font-mono text-[0.55rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60">
          {t("minimind.playground.embedding.infoContext", {
            pct: percentOfMiniMind(info.totalParameters),
          })}
        </p>
      </div>
    </motion.div>
  );
}
