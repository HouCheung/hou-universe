"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { MiniAttention } from "@/lib/minimind/attention";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import type { AttentionTrace } from "@/lib/minimind/attention";
import { AttentionInput } from "./AttentionInput";
import { AttentionHeatmap } from "./AttentionHeatmap";
import { AttentionHeadView } from "./AttentionHeadView";
import { StageCard } from "../forward/shared/StageCard";
import { StatRow } from "../forward/shared/StatRow";
import { VectorBarChart } from "../forward/shared/VectorBarChart";
import { DistributionChart } from "../forward/shared/DistributionChart";

// ============================================================
// AttentionPlayground — Interactive Multi-Head Attention Explorer
// ============================================================

const DEFAULT_CONFIG = {
  dModel: 512,
  numHeads: 8,
  headDim: 64,
  maxSeqLen: 128,
};

const DEFAULT_TEXT = "the cat sat on the mat";

function generateTokenVector(
  tokenId: number,
  dim: number,
  position: number
): number[] {
  let state = ((tokenId + 1) * 1664525 + position * 1013904223) | 0;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };

  const vec = new Array(dim);
  for (let d = 0; d < dim; d++) {
    vec[d] = next() * 0.5;
  }
  return vec;
}

export function AttentionPlayground() {
  const { t } = useTranslation();

  const attention = useRef(
    new MiniAttention(DEFAULT_CONFIG)
  ).current;
  const tokenizer = useRef(new MiniTokenizer()).current;

  const config = useMemo(() => attention.getConfig(), [attention]);

  const [inputText, setInputText] = useState(DEFAULT_TEXT);
  const [selectedHead, setSelectedHead] = useState(0);

  const handleChange = useCallback(
    (field: "text" | "head", value: string | number) => {
      if (field === "text") {
        setInputText(value as string);
      } else {
        setSelectedHead(value as number);
      }
    },
    []
  );

  const result = useMemo(() => {
    const tokens = tokenizer.tokenize(inputText);
    if (tokens.length === 0) {
      return { tokens: [] as string[], vectors: [] as number[][], trace: null };
    }

    const vectors = tokens.map((_token, i) =>
      generateTokenVector(i, config.dModel, i)
    );

    if (vectors.length > config.maxSeqLen) {
      return { tokens, vectors, trace: null };
    }

    let trace: AttentionTrace | null = null;
    try {
      const out = attention.forward({
        queries: vectors,
        keys: vectors,
        values: vectors,
        mask: "causal",
      });
      trace = out.trace;
    } catch {
      // graceful fallback
    }

    return { tokens, vectors, trace };
  }, [inputText, attention, tokenizer, config]);

  const { tokens, vectors, trace } = result;
  const seqLen = tokens.length;
  const selHead = Math.min(selectedHead, config.numHeads - 1);

  const rawScoresFlat = useMemo(() => {
    if (!trace) return [];
    const flat: number[] = [];
    for (let h = 0; h < trace.numHeads; h++) {
      const scores = trace.rawScores[h];
      if (!scores) continue;
      for (let q = 0; q < scores.length; q++) {
        const row = scores[q];
        if (!row) continue;
        for (let k = 0; k < row.length; k++) {
          flat.push(row[k]);
        }
      }
    }
    return flat;
  }, [trace]);

  const selWeights = trace?.attentionWeights[selHead] ?? [];
  const qHead = trace?.headOutputs[selHead]
    ? trace.headOutputs[selHead]
    : [];

  const kSlice = useMemo(() => {
    if (!vectors.length) return [];
    const offset = selHead * config.headDim;
    return vectors.map((vec) =>
      vec.slice(offset, offset + config.headDim)
    );
  }, [vectors, selHead, config.headDim]);

  const vSlice = useMemo(() => {
    if (!vectors.length) return [];
    const offset = selHead * config.headDim;
    return vectors.map((vec) =>
      vec.slice(offset, offset + config.headDim)
    );
  }, [vectors, selHead, config.headDim]);

  return (
    <div className="space-y-5">
      {/* ① Configuration */}
      <StageCard title={t("minimind.playground.attention.configTitle")}>
        <StatRow
          items={[
            { label: t("minimind.playground.attention.configDModel"), value: config.dModel },
            { label: t("minimind.playground.attention.configNumHeads"), value: config.numHeads },
            { label: t("minimind.playground.attention.configHeadDim"), value: config.headDim },
            { label: t("minimind.playground.attention.configMaxSeqLen"), value: config.maxSeqLen },
            { label: t("minimind.playground.attention.configScale"), value: Math.sqrt(config.headDim).toFixed(2) },
          ]}
        />
        <p className="mt-3 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          dModel = numHeads × headDim = {config.numHeads} × {config.headDim} ={" "}
          {config.dModel}. Each head operates in a {config.headDim}-dim
          subspace, capturing different relational patterns.
        </p>
      </StageCard>

      {/* ② Input + Head selector */}
      <AttentionInput
        inputText={inputText}
        numHeads={config.numHeads}
        selectedHead={selHead}
        onChange={handleChange}
      />

      {/* ③ Pipeline Overview */}
      {trace && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StageCard title={t("minimind.playground.attention.pipelineTitle")}>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[0.65rem] font-mono">
              {[
                "Input [seq×dModel]",
                "Q/K/V Proj",
                "Split Heads",
                "QKᵀ/√d",
                "Causal Mask",
                "Softmax",
                "×V",
                "Merge Heads",
                "W_O Proj",
              ].map((label, i, arr) => (
                <span key={i} className="contents">
                  <span
                    className={
                      "rounded-full border px-2.5 py-1.5 " +
                      (i === arr.length - 1
                        ? "border-emerald-500/20 bg-emerald-500/[0.06] dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]"
                        : "border-brand/10 bg-brand/[0.04] dark:border-white/[0.06] dark:bg-white/[0.02]")
                    }
                  >
                    {label}
                  </span>
                  {i < arr.length - 1 && (
                    <span className="text-slate-400 dark:text-slate-500">
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                  {t("minimind.playground.attention.pipelineInputVecs")}
                </h4>
                <VectorBarChart
                  data={vectors[0] ?? []}
                  maxBars={64}
                  height={60}
                />
              </div>
              <div>
                <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                  {t("minimind.playground.attention.pipelineOutputVecs")}
                </h4>
                <VectorBarChart
                  data={trace.output[0] ?? []}
                  maxBars={64}
                  height={60}
                  positiveColor="rgba(16, 185, 129, 0.7)"
                />
              </div>
            </div>
          </StageCard>
        </motion.div>
      )}

      {/* ④ Raw Scores Distribution */}
      {rawScoresFlat.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <StageCard title={t("minimind.playground.attention.rawScoresTitle")}>
            <DistributionChart
              data={rawScoresFlat}
              bins={40}
              height={100}
            />
            <p className="mt-2 font-mono text-[0.6rem] text-slate-400/80 dark:text-slate-500/70">
              Distribution of Q·Kᵀ scores before scaling and softmax.
              After dividing by √{config.headDim} ≈{" "}
              {Math.sqrt(config.headDim).toFixed(1)}, softmax sharpens the
              differences into attention weights.
            </p>
          </StageCard>
        </motion.div>
      )}

      {/* ⑤ Attention Heatmap */}
      {trace && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <AttentionHeatmap
            weights={selWeights}
            tokens={tokens}
            headIndex={selHead}
          />
        </motion.div>
      )}

      {/* ⑥ Per-Head Detail View */}
      {trace && seqLen > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <AttentionHeadView
            qHead={qHead}
            kHead={kSlice}
            vHead={vSlice}
            weights={selWeights}
            tokens={tokens}
            headIndex={selHead}
            selectedPos={0}
          />
        </motion.div>
      )}

      {/* ⑦ Head Diversity Summary */}
      {trace && trace.numHeads > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <StageCard title={t("minimind.playground.attention.diversityTitle")}>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: trace.numHeads }, (_, h) => {
                const w = trace.attentionWeights[h];
                if (!w || !w.length) return null;
                let maxW = 0;
                let maxQ = 0;
                let maxK = 0;
                for (let q = 0; q < w.length; q++) {
                  for (let k = 0; k < (w[q]?.length ?? 0); k++) {
                    if (w[q][k] > maxW) {
                      maxW = w[q][k];
                      maxQ = q;
                      maxK = k;
                    }
                  }
                }
                return (
                  <span
                    key={h}
                    className={
                      "rounded-full border px-2.5 py-1 font-mono text-[0.6rem] " +
                      (h === selHead
                        ? "border-brand/40 bg-brand/[0.12] text-brand dark:border-brand/35 dark:bg-brand/[0.14] dark:text-brand-light"
                        : "border-brand/10 bg-brand/[0.04] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400")
                    }
                  >
                    H{h}: [{maxQ},{maxK}]={maxW.toFixed(3)}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 font-mono text-[0.6rem] text-slate-400/80 dark:text-slate-500/70">
              Each head develops distinct attention patterns. Max position
              diversity = heads are learning different relationships.
            </p>
          </StageCard>
        </motion.div>
      )}

      {/* Empty state */}
      {!trace && (
        <StageCard title="Attention Result">
          <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
            {inputText.trim().length === 0
              ? t("minimind.playground.attention.emptyNoText")
              : seqLen > config.maxSeqLen
                ? t("minimind.playground.attention.emptyTooLong", { len: seqLen, max: config.maxSeqLen })
                : t("minimind.playground.attention.emptyFallback")}
          </p>
        </StageCard>
      )}
    </div>
  );
}
