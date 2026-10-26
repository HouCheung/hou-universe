"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { MiniFeedForward } from "@/lib/minimind/ffn";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import type { ActivationTrace } from "@/lib/minimind/ffn";
import { FFNGateView } from "./FFNGateView";
import { FFNActivationView } from "./FFNActivationView";
import { StageCard } from "../forward/shared/StageCard";
import { StatRow } from "../forward/shared/StatRow";
import { VectorBarChart } from "../forward/shared/VectorBarChart";

// ============================================================
// FFNPlayground — Interactive SwiGLU FFN Explorer
// ============================================================

const DEFAULT_CONFIG = {
  dModel: 512,
  dFF: 2048,
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

export function FFNPlayground() {
  const { t } = useTranslation();

  const ffn = useRef(
    new MiniFeedForward(DEFAULT_CONFIG)
  ).current;
  const tokenizer = useRef(new MiniTokenizer()).current;

  const config = useMemo(() => ffn.getConfig(), [ffn]);

  const [inputText, setInputText] = useState(DEFAULT_TEXT);
  const [selectedToken, setSelectedToken] = useState(0);

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

    let trace: ActivationTrace | null = null;
    try {
      const out = ffn.forward({ hiddenStates: vectors });
      trace = out.trace;
    } catch {
      // graceful fallback
    }

    return { tokens, vectors, trace };
  }, [inputText, ffn, tokenizer, config]);

  const { tokens, vectors, trace } = result;
  const seqLen = tokens.length;
  const pos = Math.min(selectedToken, Math.max(0, seqLen - 1));
  const tokenLabel = tokens[pos] ?? `[${pos}]`;

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputText(e.target.value);
      setSelectedToken(0);
    },
    []
  );

  return (
    <div className="space-y-5">
      {/* ① Configuration */}
      <StageCard title={t("minimind.playground.ffn.configTitle")}>
        <StatRow
          items={[
            { label: t("minimind.playground.ffn.configDModel"), value: config.dModel },
            { label: t("minimind.playground.ffn.configDFF"), value: config.dFF },
            { label: t("minimind.playground.ffn.configExpansionRatio"), value: (config.dFF / config.dModel).toFixed(0) + "×" },
            { label: t("minimind.playground.ffn.configMaxSeqLen"), value: config.maxSeqLen },
            { label: t("minimind.playground.ffn.configParams"), value: "3.1M" },
          ]}
        />
        <p className="mt-3 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          SwiGLU: hidden → Gate/Up parallel projection → SiLU(gate) ⊙ up →
          Down projection. The {config.dFF / config.dModel}× expansion creates
          a high-dimensional space where non-linear transformations happen,
          then compresses back to dModel={config.dModel}.
        </p>
      </StageCard>

      {/* ② Text Input */}
      <StageCard title={t("minimind.playground.ffn.inputTitle")}>
        <textarea
          rows={2}
          value={inputText}
          onChange={handleTextChange}
          className="w-full resize-none rounded-xl border border-brand/15 bg-brand/[0.03] px-4 py-2.5 font-mono text-sm text-foreground backdrop-blur-sm placeholder:text-slate-400/60 focus:border-brand/40 focus:outline-none focus:ring-1 focus:ring-brand/25 dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500/50"
          placeholder={t("minimind.playground.ffn.inputPlaceholder")}
        />
        {seqLen > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[0.6rem] text-slate-400/70 dark:text-slate-500/60">
              {t("minimind.playground.ffn.inputTokens")}
            </span>
            {tokens.map((token, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedToken(i)}
                className={
                  "rounded-full border px-2.5 py-0.5 font-mono text-[0.6rem] transition-all " +
                  (i === pos
                    ? "border-brand/40 bg-brand/[0.12] text-brand dark:border-brand/35 dark:bg-brand/[0.14] dark:text-brand-light"
                    : "border-brand/10 bg-brand/[0.03] text-slate-500 hover:border-brand/25 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400")
                }
              >
                {token}
              </button>
            ))}
          </div>
        )}
      </StageCard>

      {/* ③ Pipeline Overview */}
      {trace && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StageCard title={t("minimind.playground.ffn.pipelineTitle")}>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[0.65rem] font-mono">
              {[
                "Hidden [dModel]",
                "Gate Proj [dFF]",
                "SiLU(gate)",
                "⊙ Up [dFF]",
                "Down Proj [dModel]",
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
                  {t("minimind.playground.ffn.pipelineInput", { pos })}
                </h4>
                <VectorBarChart
                  data={vectors[pos]?.slice(0, 128) ?? []}
                  maxBars={128}
                  height={60}
                />
              </div>
              <div>
                <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                  {t("minimind.playground.ffn.pipelineOutput", { pos })}
                </h4>
                <VectorBarChart
                  data={trace.output[pos]?.slice(0, 128) ?? []}
                  maxBars={128}
                  height={60}
                  positiveColor="rgba(16, 185, 129, 0.7)"
                />
              </div>
            </div>
          </StageCard>
        </motion.div>
      )}

      {/* ④ Gate Projection View */}
      {trace && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <FFNGateView
            gateProjection={trace.gateProjection}
            gateActivation={trace.gateActivation}
            selectedToken={pos}
            tokenLabel={tokenLabel}
          />
        </motion.div>
      )}

      {/* ⑤ Activation Analysis */}
      {trace && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <FFNActivationView
            gateProjection={trace.gateProjection}
            gateActivation={trace.gateActivation}
            gatedHidden={trace.gatedHidden}
            output={trace.output}
          />
        </motion.div>
      )}

      {/* Empty state */}
      {!trace && (
        <StageCard title="FFN Result">
          <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
            {inputText.trim().length === 0
              ? t("minimind.playground.ffn.emptyNoText")
              : seqLen > config.maxSeqLen
                ? t("minimind.playground.ffn.emptyTooLong", { len: seqLen, max: config.maxSeqLen })
                : t("minimind.playground.ffn.emptyFallback")}
          </p>
        </StageCard>
      )}
    </div>
  );
}
