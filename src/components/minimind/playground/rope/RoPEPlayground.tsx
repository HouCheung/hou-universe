"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { RotaryEmbedding } from "@/lib/minimind/rope";
import type { RoPEConfig, RotationResult } from "@/lib/minimind/rope";
import { RoPEInput } from "./RoPEInput";
import { RoPERotationView } from "./RoPERotationView";
import { RoPENormCheck } from "./RoPENormCheck";
import { StageCard } from "../forward/shared/StageCard";
import { StatRow } from "../forward/shared/StatRow";
import { VectorBarChart } from "../forward/shared/VectorBarChart";
import { DistributionChart } from "../forward/shared/DistributionChart";

// ============================================================
// RoPEPlayground — Interactive RoPE Explorer
// ============================================================

const DEFAULT_CONFIG: RoPEConfig = {
  headDim: 64,
  theta: 10000,
  maxSeqLen: 512,
};

const DEFAULT_POSITION = 5;
const DEFAULT_HEAD_DIM = 64;

function generateSampleVector(dim: number, seed: number = 42): Float64Array {
  let state = seed;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };

  const vec = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = next() * 0.5;
  }
  return vec;
}

export function RoPEPlayground() {
  const { t } = useTranslation();

  const rope = useRef<RotaryEmbedding>(
    new RotaryEmbedding(DEFAULT_CONFIG)
  ).current;

  const config = useMemo(() => rope.getConfig(), [rope]);
  const frequencies = useMemo(() => rope.getFrequencies(), [rope]);
  const numDimPairs = useMemo(() => rope.getNumDimPairs(), [rope]);
  const cache = useMemo(() => rope.getCache(), [rope]);

  const sampleVector = useRef<Float64Array>(
    generateSampleVector(DEFAULT_HEAD_DIM)
  ).current;

  const [position, setPosition] = useState(DEFAULT_POSITION);

  const angles = useMemo(() => {
    try {
      return rope.getAngles(position);
    } catch {
      return null;
    }
  }, [rope, position]);

  const rotationResult: RotationResult | null = useMemo(() => {
    try {
      return rope.rotate(sampleVector, position);
    } catch {
      return null;
    }
  }, [rope, sampleVector, position]);

  const normDelta = useMemo(() => {
    try {
      return rope.verifyNormInvariance(sampleVector, position);
    } catch {
      return null;
    }
  }, [rope, sampleVector, position]);

  const freqArray = useMemo(
    () => Array.from(frequencies),
    [frequencies]
  );

  const angleArray = useMemo(
    () => (angles ? Array.from(angles) : []),
    [angles]
  );

  const handlePositionChange = useCallback((newPos: number) => {
    setPosition(newPos);
  }, []);

  const maxPos = config.maxSeqLen - 1;

  return (
    <div className="space-y-5">
      {/* ① RoPE Configuration */}
      <StageCard title={t("minimind.playground.rope.configTitle")}>
        <StatRow
          items={[
            { label: t("minimind.playground.rope.configHeadDim"), value: config.headDim },
            { label: t("minimind.playground.rope.configTheta"), value: config.theta },
            { label: t("minimind.playground.rope.configMaxSeqLen"), value: config.maxSeqLen },
            { label: t("minimind.playground.rope.configDimPairs"), value: numDimPairs },
          ]}
        />
        <p className="mt-3 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          θ = {config.theta} → freq_i = θ<sup>-2i/d</sup> for i ∈ [0, {numDimPairs - 1}].
          High frequencies (near 1.0) capture short-range positions;
          low frequencies (near 0.0001) capture long-range positions.
        </p>
      </StageCard>

      {/* ② Position Input */}
      <RoPEInput
        position={position}
        maxPosition={maxPos}
        onChange={handlePositionChange}
      />

      {/* ③ Frequency Spectrum */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <StageCard title={t("minimind.playground.rope.freqSpectrumTitle", { pairs: numDimPairs })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                {t("minimind.playground.rope.freqFrequencies")}
              </h4>
              <VectorBarChart
                data={freqArray}
                maxBars={numDimPairs}
                height={80}
                positiveColor="rgba(99, 102, 241, 0.6)"
              />
              <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                Range: [{freqArray[freqArray.length - 1]?.toExponential(2)} – {freqArray[0]?.toFixed(4)}]
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                {t("minimind.playground.rope.freqAngles", { pos: position })}
              </h4>
              <DistributionChart
                data={angleArray}
                bins={numDimPairs}
                height={80}
                barColor="rgba(236, 72, 153, 0.5)"
              />
              <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                angle_i = {position} × freq_i
              </p>
            </div>
          </div>
        </StageCard>
      </motion.div>

      {/* ④ Rotation Flow */}
      {rotationResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <StageCard title={t("minimind.playground.rope.rotationTitle")}>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[0.65rem] font-mono">
              <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                {t("minimind.playground.rope.rotationInputVector")}
              </span>
              <span className="text-slate-400 dark:text-slate-500">→</span>
              <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                {t("minimind.playground.rope.rotationFrequency")}
              </span>
              <span className="text-slate-400 dark:text-slate-500">→</span>
              <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                {t("minimind.playground.rope.rotationAngle")}
              </span>
              <span className="text-slate-400 dark:text-slate-500">→</span>
              <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                {t("minimind.playground.rope.rotation2d")}
              </span>
              <span className="text-slate-400 dark:text-slate-500">→</span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]">
                {t("minimind.playground.rope.rotationRotatedVector")}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                  {t("minimind.playground.rope.rotationBefore")}
                </h4>
                <VectorBarChart
                  data={Array.from(sampleVector)}
                  maxBars={64}
                  height={80}
                />
              </div>
              <div>
                <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                  {t("minimind.playground.rope.rotationAfter", { pos: position })}
                </h4>
                <VectorBarChart
                  data={Array.from(rotationResult.result)}
                  maxBars={64}
                  height={80}
                  positiveColor="rgba(16, 185, 129, 0.7)"
                />
              </div>
            </div>
          </StageCard>
        </motion.div>
      )}

      {/* ⑤ Norm Invariance Check */}
      {rotationResult && normDelta !== null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <RoPENormCheck
            normBefore={rotationResult.normBefore}
            normAfter={rotationResult.normAfter}
            normDelta={normDelta}
            normPreserved={rotationResult.normPreserved}
          />
        </motion.div>
      )}

      {/* ⑥ Rotation Trace Details */}
      {rotationResult && rotationResult.traces.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <RoPERotationView traces={rotationResult.traces} position={position} />
        </motion.div>
      )}

      {/* ⑦ Cos/Sin Cache Preview */}
      <StageCard title={t("minimind.playground.rope.cacheTitle")}>
        <p className="mb-3 font-mono text-[0.6rem] text-slate-400/80 dark:text-slate-500/70">
          Shape: [maxSeqLen={cache.maxSeqLen}][numDimPairs={cache.numDimPairs}].
          Each forward pass does zero trigonometry — just table lookup.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
              {t("minimind.playground.rope.cacheCos", { pos: position })}
            </h4>
            <VectorBarChart
              data={Array.from(cache.cosTable[position] ?? [])}
              maxBars={numDimPairs}
              height={60}
              positiveColor="rgba(59, 130, 246, 0.5)"
            />
          </div>
          <div>
            <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
              {t("minimind.playground.rope.cacheSin", { pos: position })}
            </h4>
            <VectorBarChart
              data={Array.from(cache.sinTable[position] ?? [])}
              maxBars={numDimPairs}
              height={60}
              positiveColor="rgba(245, 158, 11, 0.5)"
            />
          </div>
        </div>
      </StageCard>
    </div>
  );
}
