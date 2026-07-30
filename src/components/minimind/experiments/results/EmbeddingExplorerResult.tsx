"use client";

import { cn } from "@/lib/utils";
import type {
  EmbeddingExplorerData,
  ExperimentError,
  ExperimentTiming,
} from "@/lib/minimind/experiments";
import { StageCard } from "@/components/minimind/playground/forward/shared/StageCard";
import { StatRow } from "@/components/minimind/playground/forward/shared/StatRow";
import { VectorBarChart } from "@/components/minimind/playground/forward/shared/VectorBarChart";

// ============================================================
// Helpers
// ============================================================

function similarityColor(sim: number): string {
  if (sim >= 0.7) return "text-emerald-500 dark:text-emerald-400";
  if (sim >= 0.3) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function similarityBarColor(sim: number): string {
  if (sim >= 0.7) return "rgba(16, 185, 129, 0.6)";    // emerald
  if (sim >= 0.3) return "rgba(245, 158, 11, 0.6)";     // amber
  return "rgba(239, 68, 68, 0.6)";                       // red
}

// ============================================================
// Component
// ============================================================

interface EmbeddingExplorerResultProps {
  data: EmbeddingExplorerData;
  errors: ExperimentError[];
  timing: ExperimentTiming;
}

export function EmbeddingExplorerResult({
  data,
  errors,
  timing,
}: EmbeddingExplorerResultProps) {
  return (
    <div className="space-y-6">
      {/* ── Timing ───────────────────────────────────────────── */}
      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
        Completed in {timing.durationMs.toFixed(0)}ms
      </p>

      {/* ── Errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="font-mono text-xs text-amber-600 dark:text-amber-400">
              [{err.phase}] {err.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Matrix info ───────────────────────────────────────── */}
      <StageCard title="Embedding Matrix">
        <StatRow
          items={[
            { label: "Vocab Size", value: data.matrixInfo.vocabSize },
            { label: "Embedding Dim", value: data.matrixInfo.embeddingDim },
            { label: "Parameters", value: data.matrixInfo.totalParameters.toLocaleString("en-US") },
          ]}
        />
      </StageCard>

      {/* ── Lookup vectors ────────────────────────────────────── */}
      {data.mode === "lookup" && data.vectors && data.vectors.length > 0 && (
        <div className="space-y-4">
          {data.vectors.map((vec) => (
            <StageCard key={vec.tokenId} title={`Token ${vec.tokenId}: "${vec.token}"`}>
              <div className="space-y-3">
                <VectorBarChart data={vec.vector} height={80} />
                <StatRow
                  items={[
                    { label: "Min", value: vec.stats.min },
                    { label: "Max", value: vec.stats.max },
                    { label: "Mean", value: vec.stats.mean },
                    { label: "L2 Norm", value: vec.stats.l2Norm },
                  ]}
                />
              </div>
            </StageCard>
          ))}
        </div>
      )}
      {data.mode === "lookup" && (!data.vectors || data.vectors.length === 0) && (
        <StageCard>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            No vectors to display. Check that the token IDs are valid.
          </p>
        </StageCard>
      )}

      {/* ── Similarity ────────────────────────────────────────── */}
      {data.mode === "similarity" && data.similarities && data.similarities.length > 0 && (
        <div className="space-y-4">
          {data.similarities.map((sim, i) => (
            <StageCard
              key={i}
              title={`Similarity: "${sim.tokenA}" ↔ "${sim.tokenB}"`}
            >
              <div className="space-y-3">
                {/* Similarity score */}
                <div className="flex items-center gap-4">
                  <span className="font-mono text-3xl font-bold tabular-nums">
                    <span className={similarityColor(sim.cosineSimilarity)}>
                      {sim.cosineSimilarity.toFixed(4)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Cosine similarity
                  </span>
                </div>

                {/* Visual bar */}
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${((sim.cosineSimilarity + 1) / 2) * 100}%`,
                      backgroundColor: similarityBarColor(sim.cosineSimilarity),
                    }}
                  />
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {sim.cosineSimilarity >= 0.7
                    ? "Strongly related — these tokens likely appear in similar contexts."
                    : sim.cosineSimilarity >= 0.3
                      ? "Moderately related — some shared contextual overlap."
                      : sim.cosineSimilarity >= 0
                        ? "Weakly related — mostly orthogonal in embedding space."
                        : "Negatively correlated — these tokens appear in opposite contexts."}
                </p>
              </div>
            </StageCard>
          ))}
        </div>
      )}
      {data.mode === "similarity" && (!data.similarities || data.similarities.length === 0) && (
        <StageCard>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            No similarity data. Check that both tokens exist in the vocabulary.
          </p>
        </StageCard>
      )}
    </div>
  );
}
