"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type {
  TransformerVisualData,
} from "@/lib/minimind/visualization";
import { StageCard } from "../shared/StageCard";
import { HeatmapGrid } from "../shared/HeatmapGrid";
import { DistributionChart } from "../shared/DistributionChart";
import { VectorBarChart } from "../shared/VectorBarChart";
import { StatRow } from "../shared/StatRow";
import { CapabilityBadge } from "../shared/CapabilityBadge";

// ============================================================
// TransformerStage — Attention heatmap + Residual flow + FFN
// ============================================================
//
// Features (conditional on capabilities):
//   - Layer selector (tabs)
//   - Residual flow horizontal comparison
//   - Token change deltas
//   - Attention heatmap (if AttentionTrace available)
//   - Head diversity chart (if head entropies available)
//   - FFN gate distribution (if ActivationTrace available)
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface TransformerStageProps {
  data: TransformerVisualData[];
  capabilities: {
    attentionHeatmap: boolean;
    attentionHeadDiversity: boolean;
    ffnGateDistribution: boolean;
    residualFlowChart: boolean;
  };
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function formatNormValue(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toExponential(2);
}

// ── Component ────────────────────────────────────────────────

export function TransformerStage({ data, capabilities, className }: TransformerStageProps) {
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [selectedHead, setSelectedHead] = useState(0);

  const numLayers = data.length;
  const layer = useMemo(
    () => data[selectedLayer] ?? null,
    [data, selectedLayer]
  );

  const handleLayerChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedLayer(Number(e.target.value));
      setSelectedHead(0);
    },
    []
  );

  if (numLayers === 0) {
    return (
      <StageCard title="Transformer">
        <p className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
          No transformer layer data available
        </p>
      </StageCard>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Layer selector */}
      <StageCard title="Layer Selector">
        <div className="flex items-center gap-3">
          <label
            htmlFor="transformer-layer"
            className="text-[0.7rem] font-medium text-slate-500/70 dark:text-slate-400/60"
          >
            Layer:
          </label>
          <select
            id="transformer-layer"
            value={selectedLayer}
            onChange={handleLayerChange}
            className={cn(
              "rounded-lg border border-brand/10 bg-slate-50/80 px-3 py-1.5 font-mono text-xs",
              "dark:border-white/[0.06] dark:bg-white/[0.03]",
              "text-foreground focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
            )}
          >
            {Array.from({ length: numLayers }, (_, i) => (
              <option key={i} value={i}>
                Layer {i}
              </option>
            ))}
          </select>
        </div>
      </StageCard>

      {layer && (
        <>
          {/* Residual flow chart */}
          {capabilities.residualFlowChart && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <StageCard title="Residual Flow">
                <div className="space-y-1.5">
                  {[
                    { label: "Pre-Attention Norm", value: layer.overview.attentionInputNorm },
                    { label: "Post-Attention", value: layer.overview.attentionOutputNorm },
                    { label: "Post-Attn + Residual", value: layer.overview.afterAttentionResidualNorm },
                    { label: "Pre-FFN Norm", value: layer.overview.ffnInputNorm },
                    { label: "Post-FFN", value: layer.overview.ffnOutputNorm },
                    { label: "Post-FFN + Residual", value: layer.overview.afterFFNResidualNorm },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between"
                    >
                      <span className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                        {item.label}
                      </span>
                      <span className="font-mono text-[0.65rem] tabular-nums text-foreground/80">
                        {formatNormValue(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </StageCard>
            </motion.div>
          )}

          {/* Token deltas */}
          <StageCard title="Per-Token Change (L2 Delta)">
            <VectorBarChart
              data={layer.overview.tokenDeltas}
              maxBars={32}
              height={80}
            />
          </StageCard>

          {/* Attention heatmap */}
          {capabilities.attentionHeatmap && layer.attention && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <StageCard title={`Attention Heatmap — Layer ${selectedLayer}, Head ${selectedHead}`}>
                {/* Head selector for heatmap */}
                <div className="mb-3 flex items-center gap-3">
                  <label
                    htmlFor="attention-head"
                    className="text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60"
                  >
                    Head:
                  </label>
                  <select
                    id="attention-head"
                    value={selectedHead}
                    onChange={(e) => setSelectedHead(Number(e.target.value))}
                    className={cn(
                      "rounded-lg border border-brand/10 bg-slate-50/80 px-3 py-1.5 font-mono text-xs",
                      "dark:border-white/[0.06] dark:bg-white/[0.03]",
                      "text-foreground focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                    )}
                  >
                    {Array.from(
                      { length: layer.attention.numHeads },
                      (_, i) => (
                        <option key={i} value={i}>
                          Head {i}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <HeatmapGrid
                  data={layer.attention.attentionWeights[selectedHead] ?? []}
                  rows={layer.attention.seqLen}
                  cols={layer.attention.seqLen}
                  cellSize={24}
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <StatRow
                    items={[
                      { label: "Seq Len", value: layer.attention.seqLen },
                      { label: "Num Heads", value: layer.attention.numHeads },
                      {
                        label: "Causal Mask",
                        value: layer.attention.causalMaskApplied ? "On" : "Off",
                      },
                    ]}
                  />
                </div>
              </StageCard>
            </motion.div>
          )}

          {/* Head diversity */}
          {capabilities.attentionHeadDiversity && layer.attention && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <StageCard title="Head Diversity (Entropy)">
                <VectorBarChart
                  data={layer.attention.headEntropies}
                  maxBars={16}
                  height={80}
                  positiveColor="rgba(var(--brand-rgb), 0.6)"
                />
                <div className="mt-2">
                  <StatRow
                    items={layer.attention.headEntropies.map((entropy, i) => ({
                      label: `Head ${i}`,
                      value: entropy,
                    }))}
                  />
                </div>
              </StageCard>
            </motion.div>
          )}

          {/* FFN gate distribution */}
          {capabilities.ffnGateDistribution && layer.ffn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <StageCard title="FFN Gate Activation Distribution">
                <div className="space-y-3">
                  {/* Flatten and show histogram */}
                  <DistributionChart
                    data={layer.ffn.gateActivations.flat()}
                    bins={40}
                    height={100}
                  />

                  <StatRow
                    items={[
                      { label: "dFF", value: layer.ffn.dFF },
                      { label: "Seq Len", value: layer.ffn.seqLen },
                    ]}
                  />

                  {/* Per-token sparsity */}
                  <h4 className="text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                    Per-Token Activation Sparsity
                  </h4>
                  <VectorBarChart
                    data={layer.ffn.activationSparsity}
                    maxBars={32}
                    height={60}
                    positiveColor="rgba(245, 158, 11, 0.5)"
                  />
                  <p className="font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                    Fraction of gate values ≈ 0 per token (higher = more sparse)
                  </p>
                </div>
              </StageCard>
            </motion.div>
          )}

          {/* Capability badges for unavailable features */}
          <StageCard title="Available Features">
            <div className="flex flex-wrap gap-1.5">
              <CapabilityBadge
                available={capabilities.attentionHeatmap}
                label="Attention Heatmap"
              />
              <CapabilityBadge
                available={capabilities.attentionHeadDiversity}
                label="Head Diversity"
              />
              <CapabilityBadge
                available={capabilities.ffnGateDistribution}
                label="FFN Gates"
              />
              <CapabilityBadge
                available={capabilities.residualFlowChart}
                label="Residual Flow"
              />
            </div>
          </StageCard>
        </>
      )}
    </div>
  );
}
