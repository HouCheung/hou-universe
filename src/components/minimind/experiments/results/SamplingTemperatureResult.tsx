"use client";

import { useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MiniMindModel } from "@/lib/minimind/model";
import { MiniLMHead } from "@/lib/minimind/model";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import { MiniEmbedding } from "@/lib/minimind/embedding";
import { RotaryEmbedding } from "@/lib/minimind/rope";
import { MiniTransformerBlock } from "@/lib/minimind/transformer";
import { MiniAttention } from "@/lib/minimind/attention";
import { MiniFeedForward } from "@/lib/minimind/ffn";
import type { ModelConfig } from "@/lib/minimind/model";
import { DistributionChart } from "@/components/minimind/playground/forward/shared/DistributionChart";
import { VectorBarChart } from "@/components/minimind/playground/forward/shared/VectorBarChart";

// ============================================================
// SamplingTemperatureResult — Temperature vs Probability Lab
// ============================================================
//
// Demonstrates how temperature affects token prediction
// probabilities. Uses real logits from MiniMindModel.forward()
// processed at 5 temperature values (0.1, 0.5, 0.8, 1.0, 2.0):
//   - Logits distribution per temperature
//   - Top-K token ranking comparison
//   - Probability mass concentration vs spread
// ============================================================

// ── Model config ───────────────────────────────────────────────

const MODEL_CONFIG: ModelConfig = {
  vocabSize: 1000,
  dModel: 512,
  numHeads: 8,
  headDim: 64,
  dFF: 2048,
  numLayers: 1,
  maxSeqLen: 128,
  normEps: 1e-6,
  ropeTheta: 10000,
};

// ── Temperature values ────────────────────────────────────────

const TEMPERATURES = [0.1, 0.5, 0.8, 1.0, 2.0];

// ── Softmax ───────────────────────────────────────────────────

function softmax(logits: number[], temperature: number): number[] {
  if (temperature <= 0) {
    let maxIdx = 0;
    for (let i = 1; i < logits.length; i++) {
      if (logits[i] > logits[maxIdx]) maxIdx = i;
    }
    const probs = new Array(logits.length).fill(0);
    probs[maxIdx] = 1;
    return probs;
  }

  const scaled = logits.map((l) => l / temperature);
  const maxScaled = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - maxScaled));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// ── Top-K ─────────────────────────────────────────────────────

interface TokenRank {
  index: number;
  logit: number;
  probability: number;
}

function getTopK(logits: number[], probs: number[], k: number): TokenRank[] {
  return logits
    .map((logit, i) => ({ index: i, logit, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, k);
}

// ── Lazy model factory ────────────────────────────────────────

function createModel(): MiniMindModel {
  const tokenizer = new MiniTokenizer({ addSpecialTokens: false });
  const embedding = new MiniEmbedding({
    vocabSize: MODEL_CONFIG.vocabSize,
    embeddingDim: MODEL_CONFIG.dModel,
  });
  const rope = new RotaryEmbedding({
    headDim: MODEL_CONFIG.headDim,
    theta: MODEL_CONFIG.ropeTheta,
    maxSeqLen: MODEL_CONFIG.maxSeqLen,
  });
  const attention = new MiniAttention({
    dModel: MODEL_CONFIG.dModel,
    numHeads: MODEL_CONFIG.numHeads,
    headDim: MODEL_CONFIG.headDim,
    maxSeqLen: MODEL_CONFIG.maxSeqLen,
  });
  const ffn = new MiniFeedForward({
    dModel: MODEL_CONFIG.dModel,
    dFF: MODEL_CONFIG.dFF,
    maxSeqLen: MODEL_CONFIG.maxSeqLen,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: MODEL_CONFIG.dModel,
      numHeads: MODEL_CONFIG.numHeads,
      headDim: MODEL_CONFIG.headDim,
      dFF: MODEL_CONFIG.dFF,
      maxSeqLen: MODEL_CONFIG.maxSeqLen,
      normEps: MODEL_CONFIG.normEps,
    },
    attention,
    ffn
  );
  const lmHead = new MiniLMHead({
    dModel: MODEL_CONFIG.dModel,
    vocabSize: MODEL_CONFIG.vocabSize,
    seed: 42,
  });

  return new MiniMindModel(MODEL_CONFIG, {
    tokenizer,
    embedding,
    rope,
    blocks: [block],
    lmHead,
  });
}

// ── Component ────────────────────────────────────────────────

export function SamplingTemperatureResult() {
  const { t } = useTranslation();
  const [selectedTemp, setSelectedTemp] = useState(0.8);

  // ── Create model once ─────────────────────────────────────
  const model = useRef<MiniMindModel>(createModel()).current;

  // ── Run forward pass to get real logits ────────────────────
  const realLogits = useMemo(() => {
    try {
      const result = model.forward({ inputText: "Hello HOU Universe" });
      return result.logits;
    } catch {
      // Fallback: if forward fails, use an empty array
      return [] as number[];
    }
  }, [model]);

  const vocabSize = realLogits.length;
  const logits = realLogits;

  // ── Compute for all temperatures ────────────────────────────
  const results = useMemo(() => {
    if (logits.length === 0) return [];
    return TEMPERATURES.map((T) => {
      const scaledLogits = logits.map((l) => (T === 0 ? l : l / T));
      const probs = softmax(logits, T);
      const top10 = getTopK(logits, probs, 10);
      const entropy = -probs.reduce((sum, p) => {
        if (p > 0) return sum + p * Math.log2(p);
        return sum;
      }, 0);
      return { T, scaledLogits, probs, top10, entropy };
    });
  }, [logits]);

  if (logits.length === 0) {
    return (
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.03] p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
        <p className="text-center font-mono text-sm text-slate-500 dark:text-slate-400">
          Unable to compute logits. Please try again.
        </p>
      </div>
    );
  }

  // ── Selected temperature result ─────────────────────────────
  const selected = results.find((r) => r.T === selectedTemp) ?? results[2];

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.03] px-6 py-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
        <span className="block h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
        <div className="mt-5">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {t("minimind.playground.sampling.labTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {t("minimind.playground.sampling.labDescription")}
          </p>
        </div>
      </div>

      {/* ── Temperature Selector ──────────────────────────────── */}
      <div>
        <span className="mb-2 block text-[0.7rem] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {t("minimind.playground.sampling.temperatureLabel")}
        </span>
        <div className="flex flex-wrap gap-2">
          {TEMPERATURES.map((T) => {
            const r = results.find((x) => x.T === T);
            return (
              <button
                key={T}
                type="button"
                onClick={() => setSelectedTemp(T)}
                className={cn(
                  "rounded-full border px-4 py-2 font-mono text-sm transition-all duration-200",
                  T === selectedTemp
                    ? "border-brand/40 bg-brand/[0.12] text-brand dark:border-brand/35 dark:bg-brand/[0.14] dark:text-brand-light"
                    : "border-brand/10 bg-brand/[0.03] text-slate-500 hover:border-brand/25 hover:text-brand/80 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400 dark:hover:border-brand/25"
                )}
                aria-pressed={T === selectedTemp}
              >
                T={T}
                <span className="ml-1.5 text-[0.6rem] opacity-60">
                  H={r?.entropy.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scaled Logits Distribution ────────────────────────── */}
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.03] p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
        <span className="block h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
        <h3 className="mt-4 mb-3 text-sm font-semibold tracking-tight text-foreground">
          {t("minimind.playground.sampling.logitsTitle", { temp: selectedTemp })}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
              {t("minimind.playground.sampling.logitsRawLabel")}
            </h4>
            <DistributionChart
              data={selected.scaledLogits}
              bins={30}
              height={80}
            />
            <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
              logits divided by T={selectedTemp}
            </p>
          </div>
          <div>
            <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
              {t("minimind.playground.sampling.logitsSoftmaxLabel")}
            </h4>
            <DistributionChart
              data={selected.probs}
              bins={30}
              height={80}
              barColor="rgba(16, 185, 129, 0.5)"
            />
            <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
              entropy = {selected.entropy.toFixed(3)} bits
            </p>
          </div>
        </div>
      </div>

      {/* ── Top-10 Token Ranking ───────────────────────────────── */}
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.03] p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
        <span className="block h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
        <h3 className="mt-4 mb-3 text-sm font-semibold tracking-tight text-foreground">
          {t("minimind.playground.sampling.topkTitle", { temp: selectedTemp })}
        </h3>
        <div className="flex items-end gap-px" style={{ height: 80 }}>
          {selected.top10.map((tok) => {
            const h = Math.max(1, tok.probability * 80);
            return (
              <div
                key={tok.index}
                className="flex flex-1 flex-col items-center justify-end min-w-0"
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: h }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="w-full rounded-t-sm"
                  style={{
                    backgroundColor:
                      tok.index === selected.top10[0].index
                        ? "rgba(var(--brand-rgb), 0.7)"
                        : "rgba(var(--brand-rgb), 0.3)",
                  }}
                />
                <span className="mt-1 font-mono text-[0.5rem] text-slate-400/60 dark:text-slate-500/50 truncate max-w-full">
                  #{tok.index}
                </span>
              </div>
            );
          })}
        </div>
        {/* ── Table ────────────────────────────────────────────── */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left font-mono text-[0.6rem]">
            <thead>
              <tr className="border-b border-brand/10 dark:border-white/[0.06]">
                <th className="pb-1.5 pr-3 text-slate-400/70 dark:text-slate-500/60">
                  {t("minimind.playground.sampling.topkRank")}
                </th>
                <th className="pb-1.5 pr-3 text-slate-400/70 dark:text-slate-500/60">
                  {t("minimind.playground.sampling.topkTokenId")}
                </th>
                <th className="pb-1.5 pr-3 text-slate-400/70 dark:text-slate-500/60">
                  {t("minimind.playground.sampling.topkLogit")}
                </th>
                <th className="pb-1.5 text-slate-400/70 dark:text-slate-500/60">
                  {t("minimind.playground.sampling.topkProb", { temp: selectedTemp })}
                </th>
              </tr>
            </thead>
            <tbody>
              {selected.top10.map((tok, rank) => (
                <tr
                  key={tok.index}
                  className="border-b border-brand/5 dark:border-white/[0.03]"
                >
                  <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">
                    {rank + 1}
                  </td>
                  <td className="py-1.5 pr-3 text-foreground">
                    [{tok.index}]
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums text-slate-500 dark:text-slate-400">
                    {tok.logit.toFixed(3)}
                  </td>
                  <td className="py-1.5 tabular-nums text-brand dark:text-brand-light">
                    {(tok.probability * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cross-temperature comparison ──────────────────────── */}
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.03] p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
        <span className="block h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
        <h3 className="mt-4 mb-3 text-sm font-semibold tracking-tight text-foreground">
          {t("minimind.playground.sampling.compareTitle")}
        </h3>

        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.T} className="flex items-center gap-2">
              <span
                className={cn(
                  "w-12 shrink-0 text-right font-mono text-[0.6rem]",
                  r.T === selectedTemp
                    ? "text-brand dark:text-brand-light"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                T={r.T}
              </span>
              <div className="flex flex-1 items-end gap-px" style={{ height: 24 }}>
                {r.top10.slice(0, 5).map((tok) => (
                  <div
                    key={tok.index}
                    className="rounded-t-sm"
                    style={{
                      height: Math.max(1, tok.probability * 24),
                      width: `${100 / 5}%`,
                      backgroundColor: `rgba(var(--brand-rgb), ${(0.3 + tok.probability * 2).toFixed(2)})`,
                    }}
                    title={`#[${tok.index}] ${(tok.probability * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
              <span className="w-16 shrink-0 font-mono text-[0.55rem] tabular-nums text-slate-400/70 dark:text-slate-500/60">
                H={r.entropy.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          {t("minimind.playground.sampling.compareFooter")}
        </p>
      </div>

      {/* ── Probability vector bar chart (selected T) ─────────── */}
      <div className="rounded-2xl border border-brand/15 bg-brand/[0.03] p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
        <span className="block h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
        <h3 className="mt-4 mb-3 text-sm font-semibold tracking-tight text-foreground">
          {t("minimind.playground.sampling.fullVectorTitle", { temp: selectedTemp, vocab: vocabSize })}
        </h3>
        <VectorBarChart
          data={selected.probs}
          maxBars={vocabSize}
          height={80}
          positiveColor="rgba(99, 102, 241, 0.6)"
        />
        <p className="mt-2 font-mono text-[0.6rem] text-slate-400/80 dark:text-slate-500/70">
          {t("minimind.playground.sampling.fullVectorFooter", { vocab: vocabSize, temp: selectedTemp })}
        </p>
      </div>
    </div>
  );
}
