"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { EmbeddingVisualData } from "@/lib/minimind/visualization";
import { StageCard } from "../shared/StageCard";
import { VectorBarChart } from "../shared/VectorBarChart";
import { StatRow } from "../shared/StatRow";

// ============================================================
// EmbeddingStage — Vector viewer + per-position statistics
// ============================================================
//
// Features:
//   - Position selector dropdown (Token N: "text")
//   - VectorBarChart for the selected position
//   - Per-position stats: min, max, mean, L2 norm
//   - Embedding matrix metadata card
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface EmbeddingStageProps {
  data: EmbeddingVisualData;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function EmbeddingStage({ data, className }: EmbeddingStageProps) {
  const [selectedPos, setSelectedPos] = useState(0);

  const selectedVector = useMemo(
    () => data.vectors[selectedPos] ?? [],
    [data.vectors, selectedPos]
  );

  const selectedStat = useMemo(
    () => data.vectorStats[selectedPos] ?? null,
    [data.vectorStats, selectedPos]
  );

  const handlePositionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedPos(Number(e.target.value));
    },
    []
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Position selector */}
      <StageCard title="Position Selector">
        <div className="flex items-center gap-3">
          <label
            htmlFor="embedding-position"
            className="text-[0.7rem] font-medium text-slate-500/70 dark:text-slate-400/60"
          >
            Token:
          </label>
          <select
            id="embedding-position"
            value={selectedPos}
            onChange={handlePositionChange}
            className={cn(
              "rounded-lg border border-brand/10 bg-slate-50/80 px-3 py-1.5 font-mono text-xs",
              "dark:border-white/[0.06] dark:bg-white/[0.03]",
              "text-foreground focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
            )}
          >
            {data.vectorStats.map((stat) => (
              <option key={stat.tokenIndex} value={stat.tokenIndex}>
                Token {stat.tokenIndex}: &quot;{stat.token}&quot;
              </option>
            ))}
          </select>
        </div>
      </StageCard>

      {/* Vector bar chart */}
      <StageCard title={`Vector Bar Chart — Token ${selectedPos}`}>
        {selectedVector.length > 0 ? (
          <VectorBarChart
            data={selectedVector}
            maxBars={128}
            height={120}
          />
        ) : (
          <p className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
            No vector data available
          </p>
        )}
      </StageCard>

      {/* Statistics */}
      {selectedStat && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <StageCard title="Vector Statistics">
            <StatRow
              items={[
                { label: "Min", value: selectedStat.min },
                { label: "Max", value: selectedStat.max },
                { label: "Mean", value: selectedStat.mean },
                { label: "L2 Norm", value: selectedStat.l2Norm },
              ]}
            />
          </StageCard>
        </motion.div>
      )}

      {/* Matrix info */}
      <StageCard title="Embedding Matrix">
        <StatRow
          items={[
            { label: "Vocab Size", value: data.matrixInfo.vocabSize },
            { label: "Embedding Dim", value: data.matrixInfo.embeddingDim },
            {
              label: "Total Parameters",
              value: data.matrixInfo.totalParameters,
            },
          ]}
        />
      </StageCard>
    </div>
  );
}
