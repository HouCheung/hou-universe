"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { GraduationCap, Play, Loader2, Zap } from "lucide-react";
import { MiniMindModel } from "@/lib/minimind/model";
import { MiniLMHead } from "@/lib/minimind/model";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import { MiniEmbedding } from "@/lib/minimind/embedding";
import { RotaryEmbedding } from "@/lib/minimind/rope";
import { MiniTransformerBlock } from "@/lib/minimind/transformer";
import { MiniAttention } from "@/lib/minimind/attention";
import { MiniFeedForward } from "@/lib/minimind/ffn";
import { ToyDataset, Pretrainer, NoOpOptimizer } from "@/lib/minimind/pretrain";
import type { ModelConfig } from "@/lib/minimind/model";
import type {
  TrainingResult,
  TrainingConfig,
} from "@/lib/minimind/pretrain";
import { cn } from "@/lib/utils";
import { TrainingPipeline } from "./TrainingPipeline";
import { DatasetPreview } from "./DatasetPreview";
import type { DatasetSample } from "./DatasetPreview";
import { LossChart } from "./LossChart";
import { TrainingCapabilityPanel } from "./TrainingCapabilityPanel";

// ============================================================
// TrainingPageClient — Root state owner for Training Showcase
// ============================================================
//
// Owns all state:
//   epochs         — configurable epoch count (1-10)
//   isRunning      — whether training loop is executing
//   result         — TrainingResult after loop completes
//   modelRef       — MiniMindModel instance (created once)
//
// Data flow:
//   User configures epochs
//   User clicks "Run Training"
//     → Pretrainer.runTrainingLoop({ epochs, learningRate })
//     → Returns TrainingResult
//     → Children render from result
//
// All training logic is in src/lib/minimind/pretrain/.
// No fake ML. Gradient boundary is honest.
// ============================================================

// ── Constants ────────────────────────────────────────────────

const DEFAULT_CONFIG: ModelConfig = {
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

const MIN_EPOCHS = 1;
const MAX_EPOCHS = 10;
const DEFAULT_EPOCHS = 3;

// ── Model factory ────────────────────────────────────────────

/**
 * Create a MiniMindModel with the standard educational configuration.
 *
 * Uses the same dependency injection pattern as InferencePageClient
 * and ForwardPlayground. The model is created once and reused.
 */
function createModel(): MiniMindModel {
  const tokenizer = new MiniTokenizer({ addSpecialTokens: false });
  const embedding = new MiniEmbedding({
    vocabSize: DEFAULT_CONFIG.vocabSize,
    embeddingDim: DEFAULT_CONFIG.dModel,
  });
  const rope = new RotaryEmbedding({
    headDim: DEFAULT_CONFIG.headDim,
    theta: DEFAULT_CONFIG.ropeTheta,
    maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
  });
  const attention = new MiniAttention({
    dModel: DEFAULT_CONFIG.dModel,
    numHeads: DEFAULT_CONFIG.numHeads,
    headDim: DEFAULT_CONFIG.headDim,
    maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
  });
  const ffn = new MiniFeedForward({
    dModel: DEFAULT_CONFIG.dModel,
    dFF: DEFAULT_CONFIG.dFF,
    maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: DEFAULT_CONFIG.dModel,
      numHeads: DEFAULT_CONFIG.numHeads,
      headDim: DEFAULT_CONFIG.headDim,
      dFF: DEFAULT_CONFIG.dFF,
      maxSeqLen: DEFAULT_CONFIG.maxSeqLen,
      normEps: DEFAULT_CONFIG.normEps,
    },
    attention,
    ffn
  );
  const lmHead = new MiniLMHead({
    dModel: DEFAULT_CONFIG.dModel,
    vocabSize: DEFAULT_CONFIG.vocabSize,
    seed: 42,
  });

  return new MiniMindModel(DEFAULT_CONFIG, {
    tokenizer,
    embedding,
    rope,
    blocks: [block],
    lmHead,
  });
}

// ── Component ────────────────────────────────────────────────

export function TrainingPageClient() {
  const { t } = useTranslation();

  // Model + dataset + pretrainer — created once via refs
  const model = useRef<MiniMindModel>(createModel()).current;
  const datasetRef = useRef<ToyDataset>(new ToyDataset(model.getTokenizer()));
  const pretrainerRef = useRef<Pretrainer>(
    new Pretrainer(model, datasetRef.current, new NoOpOptimizer())
  );

  // Config state
  const [epochs, setEpochs] = useState(DEFAULT_EPOCHS);

  // Training state
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TrainingResult | null>(null);

  // Dataset samples — decoded from ToyDataset token IDs for preview
  const datasetSamples: DatasetSample[] = useMemo(() => {
    const tokenizer = model.getTokenizer();
    const samples = datasetRef.current.getSamples();
    return samples.map((s) => ({
      text: tokenizer.decode(s.inputIds),
      tokenIds: s.inputIds,
      tokenCount: s.inputIds.length,
    }));
  }, [model]);

  // ── Run training ──────────────────────────────────────────

  const handleRunTraining = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setResult(null);

    // Small delay so the "processing" state renders before
    // the synchronous training loop completes
    await new Promise((r) => setTimeout(r, 100));

    try {
      const config: TrainingConfig = {
        epochs,
        learningRate: 0.01,
      };
      const trainingResult = pretrainerRef.current.runTrainingLoop(config);
      setResult(trainingResult);
    } catch {
      // Training error — handled gracefully
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, epochs, pretrainerRef]);

  // ── Render ────────────────────────────────────────────────

  const hasRun = result !== null;
  const pretrainer = pretrainerRef.current;
  const capability = pretrainer.getCapability();

  return (
    <div className="space-y-6">
      {/* ===================================================== */}
      {/* Section 1: Hero */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02] p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/[0.10] dark:bg-brand/[0.15]">
            <GraduationCap className="size-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("aiLab.training.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500/80 dark:text-slate-400/70 leading-relaxed">
              {t("aiLab.training.subtitle")}
            </p>

            {/* Status badges */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Dataset badge */}
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-2.5 py-1 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06]">
                <div className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span className="font-mono text-[0.6rem] text-emerald-700/80 dark:text-emerald-400/70">
                  {t("aiLab.training.datasetReady")}: {datasetRef.current.size}{" "}
                  {t("aiLab.training.samples")}
                </span>
              </div>

              {/* Forward pass badge */}
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-2.5 py-1 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06]">
                <div className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span className="font-mono text-[0.6rem] text-emerald-700/80 dark:text-emerald-400/70">
                  {t("aiLab.training.forwardPassReady")}
                </span>
              </div>

              {/* Gradient boundary badge */}
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50/50 px-2.5 py-1 dark:border-amber-500/15 dark:bg-amber-500/[0.06]">
                <div className="size-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                <span className="font-mono text-[0.6rem] text-amber-700/80 dark:text-amber-400/70">
                  {t("aiLab.training.gradientPending")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ===================================================== */}
      {/* Section 2: Training Controls */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
        className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02] p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          {/* Epochs control */}
          <div className="flex-1">
            <label
              htmlFor="training-epochs"
              className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              {t("aiLab.training.epochsLabel")}
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="training-epochs"
                type="range"
                min={MIN_EPOCHS}
                max={MAX_EPOCHS}
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                disabled={isRunning}
                className="flex-1 h-1.5 rounded-full appearance-none bg-slate-200 dark:bg-white/[0.08] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(var(--brand-rgb),0.3)]
                  [&::-webkit-slider-thumb]:cursor-pointer
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="w-10 text-center font-mono text-sm font-semibold text-foreground tabular-nums">
                {epochs}
              </span>
            </div>
          </div>

          {/* Run button */}
          <button
            type="button"
            onClick={handleRunTraining}
            disabled={isRunning}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 shrink-0",
              "bg-brand text-white shadow-[0_0_20px_rgba(var(--brand-rgb),0.3)]",
              "hover:bg-brand/90 hover:shadow-[0_0_28px_rgba(var(--brand-rgb),0.4)]",
              "active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("aiLab.training.running")}
              </>
            ) : (
              <>
                <Play className="size-4" />
                {t("aiLab.training.runTraining")}
              </>
            )}
          </button>
        </div>

        {/* Run summary after training */}
        {hasRun && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand/10 bg-brand/[0.02] px-4 py-2.5 dark:border-brand/15 dark:bg-brand/[0.03]"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="size-3 text-brand/60" />
              <span className="font-mono text-[0.65rem] text-brand/70 dark:text-brand/60">
                {result.epochs} {t("aiLab.training.epochsComplete")}
              </span>
            </div>
            <span className="text-[0.6rem] text-slate-300 dark:text-slate-600">
              |
            </span>
            <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
              {result.steps} {t("aiLab.training.stepsTotal")}
            </span>
            <span className="text-[0.6rem] text-slate-300 dark:text-slate-600">
              |
            </span>
            <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.training.finalLoss")}:{" "}
              {result.lossHistory[result.lossHistory.length - 1]?.toFixed(4) ??
                "—"}
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* ===================================================== */}
      {/* Section 3: Dataset Preview */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
      >
        <DatasetPreview samples={datasetSamples} />
      </motion.div>

      {/* ===================================================== */}
      {/* Section 4: Training Pipeline */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35, ease: "easeOut" }}
      >
        <TrainingPipeline
          hasRun={hasRun}
          isRunning={isRunning}
          datasetSize={datasetRef.current.size}
          steps={result?.steps ?? 0}
          epochs={result?.epochs ?? epochs}
          lastLoss={
            result
              ? result.lossHistory[result.lossHistory.length - 1]
              : null
          }
        />
      </motion.div>

      {/* ===================================================== */}
      {/* Section 5: Loss Chart */}
      {/* ===================================================== */}
      {(hasRun || isRunning) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: "easeOut" }}
        >
          <LossChart
            lossHistory={result?.lossHistory ?? []}
            epochs={result?.epochs ?? 0}
          />
        </motion.div>
      )}

      {/* ===================================================== */}
      {/* Section 6: Capability Panel */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: "easeOut" }}
      >
        <TrainingCapabilityPanel capability={capability} />
      </motion.div>
    </div>
  );
}
