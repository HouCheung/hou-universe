"use client";

import type { ExperimentResult } from "@/lib/minimind/experiments";
import type {
  TokenizerComparisonData,
  EmbeddingExplorerData,
  AttentionHeatmapData,
} from "@/lib/minimind/experiments";
import { TokenizerComparisonResult } from "./results/TokenizerComparisonResult";
import { EmbeddingExplorerResult } from "./results/EmbeddingExplorerResult";
import { AttentionHeatmapResult } from "./results/AttentionHeatmapResult";

// ============================================================
// ExperimentResultRenderer — Switch dispatcher
// ============================================================
//
// Dispatches to the correct typed result renderer based on
// experimentId. Mirrors the discriminated union pattern from
// DeepDivePanel (forward playground).
//
// Each case casts result.data to the experiment-specific type.
// The typed data contracts are defined in experiment types.ts
// and are guaranteed by the runner that produced them.
// ============================================================

interface ExperimentResultRendererProps {
  experimentId: string;
  result: ExperimentResult<unknown>;
}

export function ExperimentResultRenderer({
  experimentId,
  result,
}: ExperimentResultRendererProps) {
  if (result.status === "failed" && result.data === null) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-6 text-center">
        <p className="font-mono text-sm text-red-600 dark:text-red-400">
          Experiment failed
        </p>
        {result.errors.map((err, i) => (
          <p key={i} className="mt-1 font-mono text-xs text-red-500/80 dark:text-red-400/70">
            [{err.phase}] {err.message}
          </p>
        ))}
      </div>
    );
  }

  switch (experimentId) {
    case "tokenizer-comparison-lab":
      return (
        <TokenizerComparisonResult
          data={result.data as TokenizerComparisonData}
          errors={result.errors}
          timing={result.timing}
        />
      );

    case "embedding-explorer":
      return (
        <EmbeddingExplorerResult
          data={result.data as EmbeddingExplorerData}
          errors={result.errors}
          timing={result.timing}
        />
      );

    case "attention-heatmap-explorer":
      return (
        <AttentionHeatmapResult
          data={result.data as AttentionHeatmapData}
          errors={result.errors}
          timing={result.timing}
        />
      );

    default:
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[ExperimentResultRenderer] Unknown experimentId: "${experimentId}"`
        );
      }
      return null;
  }
}
