"use client";

import { motion } from "framer-motion";
import { BookOpen, Hash, AlignLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ============================================================
// DatasetPreview — ToyDataset sample display
// ============================================================
//
// Displays the ToyDataset corpus samples in a glass card grid.
// Each sample shows:
//   - Original text
//   - Token IDs (comma-separated)
//   - Token count
//
// All data comes from ToyDataset.getSamples() — no fake data.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface DatasetSample {
  /** Original decoded text */
  text: string;
  /** Token ID sequence */
  tokenIds: number[];
  /** Number of tokens */
  tokenCount: number;
}

interface DatasetPreviewProps {
  samples: DatasetSample[];
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function DatasetPreview({ samples, className }: DatasetPreviewProps) {
  const { t } = useTranslation();

  if (samples.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("aiLab.training.datasetPreview")}
          </h3>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300/80 bg-slate-50/50 px-4 py-8 text-center dark:border-white/[0.06] dark:bg-white/[0.02]">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("aiLab.training.noDataset")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.training.datasetPreview")}
        </h3>
        <span className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          ({samples.length} {t("aiLab.training.samples")})
        </span>
      </div>

      {/* Sample cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {samples.map((sample, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3, ease: "easeOut" }}
            className="rounded-xl border border-slate-200/60 bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            {/* Sample index */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand/[0.08] font-mono text-[0.55rem] font-semibold text-brand/70 dark:bg-brand/[0.12] dark:text-brand/60">
                {i + 1}
              </span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("aiLab.training.sampleLabel")} {i + 1}
              </span>
            </div>

            {/* Original text */}
            <div className="flex items-start gap-1.5 mb-1.5">
              <AlignLeft className="size-3 shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" />
              <span className="font-mono text-xs text-foreground/80 break-all leading-relaxed">
                &ldquo;{sample.text}&rdquo;
              </span>
            </div>

            {/* Token IDs */}
            <div className="flex items-start gap-1.5 mb-1.5">
              <Hash className="size-3 shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" />
              <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60 break-all">
                [{sample.tokenIds.join(", ")}]
              </span>
            </div>

            {/* Token count */}
            <div className="flex items-center gap-1.5">
              <BookOpen className="size-3 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="font-mono text-[0.65rem] text-slate-400/80 dark:text-slate-500/60">
                {sample.tokenCount} {t("aiLab.training.tokens")}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
