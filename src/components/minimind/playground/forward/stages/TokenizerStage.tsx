"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hash, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenizerVisualData, TokenDetail } from "@/lib/minimind/visualization";
import { StageCard } from "../shared/StageCard";
import { StatRow } from "../shared/StatRow";

// ============================================================
// TokenizerStage — Token grid + per-token detail panel
// ============================================================
//
// Renders the tokenization result as interactive pills:
//   - Brand color for known tokens (exists=true)
//   - Amber color for unknown tokens (<unk> fallback)
//   - Gray for special tokens (<pad>, <bos>, <eos>)
//
// Click a pill → expand per-token detail (ID, exists, isSpecial).
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface TokenizerStageProps {
  data: TokenizerVisualData;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function getTokenPillClass(detail: TokenDetail): string {
  if (detail.isSpecial) {
    return "border-slate-300/60 bg-slate-100/60 text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-400";
  }
  if (!detail.exists) {
    return "border-amber-500/20 bg-amber-500/[0.06] text-amber-600 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-400";
  }
  return "border-brand/15 bg-brand/[0.06] text-brand/80 dark:border-brand/25 dark:bg-brand/[0.08] dark:text-brand/70";
}

function getTokenBadge(detail: TokenDetail): string {
  if (detail.isSpecial) return "special";
  if (!detail.exists) return "<unk>";
  return "known";
}

// ── Component ────────────────────────────────────────────────

export function TokenizerStage({ data, className }: TokenizerStageProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleToggle = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Token grid card */}
      <StageCard title="Token Grid">
        <div className="flex flex-wrap gap-1.5">
          {data.tokenDetails.map((detail, i) => (
            <motion.button
              key={`${detail.token}-${i}`}
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              onClick={() => handleToggle(i)}
              className={cn(
                "rounded-lg border px-2.5 py-1 font-mono text-xs font-medium transition-all",
                getTokenPillClass(detail),
                expandedIndex === i
                  ? "ring-1 ring-brand/30 dark:ring-brand/20"
                  : "hover:scale-105"
              )}
            >
              {detail.token}
            </motion.button>
          ))}
        </div>

        {/* Token count badge */}
        <div className="mt-3 flex items-center gap-2">
          <Hash className="size-3 text-slate-400/60 dark:text-slate-500/60" />
          <span className="font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/60">
            {data.tokens.length} token{data.tokens.length !== 1 ? "s" : ""} in
            vocabulary of {data.vocabSize.toLocaleString("en-US")}
          </span>
        </div>
      </StageCard>

      {/* Expanded token detail */}
      <AnimatePresence>
        {expandedIndex !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <StageCard title={`Token Detail — "${data.tokenDetails[expandedIndex].token}"`}>
              <div className="space-y-2">
                <StatRow
                  items={[
                    { label: "Position", value: expandedIndex },
                    { label: "Token ID", value: data.tokenDetails[expandedIndex].id },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <span className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                    Status:
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-medium",
                      data.tokenDetails[expandedIndex].exists
                        ? "border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-400"
                        : "border border-amber-500/20 bg-amber-500/[0.06] text-amber-600 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-400"
                    )}
                  >
                    {getTokenBadge(data.tokenDetails[expandedIndex])}
                    {!data.tokenDetails[expandedIndex].exists && (
                      <AlertTriangle className="size-2.5" />
                    )}
                  </span>
                </div>
              </div>
            </StageCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input text preview */}
      <StageCard title="Input Text">
        <p className="font-mono text-sm text-foreground/80 break-all">
          {data.inputText}
        </p>
      </StageCard>
    </div>
  );
}
