"use client";

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Cpu, Zap, Database, Play, Loader2 } from "lucide-react";
import { MiniMindModel } from "@/lib/minimind/model";
import { MiniLMHead } from "@/lib/minimind/model";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import { MiniEmbedding } from "@/lib/minimind/embedding";
import { RotaryEmbedding } from "@/lib/minimind/rope";
import { MiniTransformerBlock } from "@/lib/minimind/transformer";
import { MiniAttention } from "@/lib/minimind/attention";
import { MiniFeedForward } from "@/lib/minimind/ffn";
import { InferenceEngine } from "@/lib/minimind/inference";
import type { ModelConfig } from "@/lib/minimind/model";
import type {
  GenerationStep,
  GenerationTrace,
  InferenceConfig,
} from "@/lib/minimind/inference";
import { cn } from "@/lib/utils";
import { CrossRefButton } from "@/components/ai-lab/CrossRefButton";
import { InferenceVisualizer } from "./InferenceVisualizer";
import { TokenStream } from "./TokenStream";
import { GenerationTracePanel } from "./GenerationTracePanel";

// ============================================================
// InferencePageClient — Root state owner for Inference Showcase
// ============================================================
//
// Owns all state:
//   prompt          — controlled textarea input
//   steps           — collected GenerationStep[] from engine.generate()
//   trace           — final GenerationTrace after generation completes
//   isRunning       — whether generation is in progress
//   engineRef       — InferenceEngine instance (created once)
//
// Data flow:
//   User types → setPrompt
//   User clicks Generate → engine.generate(prompt, config)
//     → yields GenerationStep → setSteps(prev => [...prev, step])
//     → completes → engine.getTrace() → setTrace
//
// All data comes from the existing InferenceEngine API.
// No fake ML logic. No training code. No inference engine modifications.
// ============================================================

// ── Constants ────────────────────────────────────────────────

const DEFAULT_PROMPT = "Hello MiniMind";

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

const DEFAULT_INFERENCE_CONFIG: Partial<InferenceConfig> = {
  maxTokens: 12,
  sampling: { temperature: 0.8, topK: 40, topP: 0.95 },
  stopConditions: [{ type: "maxTokens" }],
  debug: false,
};

// ── Model factory ────────────────────────────────────────────

/**
 * Create a MiniMindModel with the standard educational configuration.
 *
 * Uses the same config and dependency injection pattern as
 * ForwardPlayground.createModel(). The model is created once
 * and reused across all inference runs.
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

export function InferencePageClient() {
  const { t } = useTranslation();

  // Model + Engine — created once via ref
  const model = useRef<MiniMindModel>(createModel()).current;
  const engineRef = useRef<InferenceEngine>(new InferenceEngine(model));

  // State
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [trace, setTrace] = useState<GenerationTrace | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [engineReady] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Engine info (derived, not state)
  const engine = engineRef.current;
  // InferenceEngine always uses fixed pipeline: Temperature → Top-K → Top-P → Greedy
  const samplingLabel = "Temperature → Top-K → Top-P → Greedy";

  // Handle generate
  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0 || isRunning) return;

    setIsRunning(true);
    setSteps([]);
    setTrace(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const collectedSteps: GenerationStep[] = [];

      for await (const step of engine.generate(trimmed, DEFAULT_INFERENCE_CONFIG)) {
        if (controller.signal.aborted) break;
        collectedSteps.push(step);
        setSteps([...collectedSteps]);
      }

      const result = engine.getResult(trimmed);
      if (result && !controller.signal.aborted) {
        setTrace(result.trace);
      }
    } catch {
      // Generation error — silently handle, show empty state
      setSteps([]);
      setTrace(null);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [prompt, isRunning, engine]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

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
        {/* Glow accent line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent dark:via-brand/40" />

        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/[0.10] dark:bg-brand/[0.15]">
            <Cpu className="size-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("aiLab.inference.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500/80 dark:text-slate-400/70 leading-relaxed">
              {t("aiLab.inference.subtitle")}
            </p>

            {/* Engine status badges */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Engine status */}
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-2.5 py-1 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06]">
                <div className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span className="font-mono text-[0.6rem] text-emerald-700/80 dark:text-emerald-400/70">
                  {t("aiLab.inference.engineStatus")}:{" "}
                  {engineReady
                    ? t("aiLab.inference.ready")
                    : t("aiLab.inference.notReady")}
                </span>
              </div>

              {/* Sampling strategy */}
              <div className="flex items-center gap-1.5 rounded-lg border border-brand/15 bg-brand/[0.04] px-2.5 py-1 dark:border-brand/20 dark:bg-brand/[0.06]">
                <Zap className="size-2.5 text-brand/60" />
                <span
                  className="font-mono text-[0.6rem] text-brand/70 dark:text-brand/60 truncate max-w-[180px]"
                  title={samplingLabel}
                >
                  {t("aiLab.inference.samplingStrategy")}: {samplingLabel}
                </span>
              </div>

              {/* KV Cache */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-slate-50/50 px-2.5 py-1 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Database className="size-2.5 text-slate-400 dark:text-slate-500" />
                <span className="font-mono text-[0.6rem] text-slate-500/80 dark:text-slate-400/70">
                  {t("aiLab.inference.kvCacheAvailable")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ===================================================== */}
      {/* Section 2: Generation Playground */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
        className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02] p-5"
      >
        <div className="space-y-3">
          {/* Input area */}
          <div>
            <label
              htmlFor="inference-prompt"
              className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              {t("aiLab.inference.promptLabel")}
            </label>
            <textarea
              id="inference-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              rows={3}
              placeholder={t("aiLab.inference.promptPlaceholder")}
              className={cn(
                "mt-1.5 w-full resize-none rounded-xl border bg-transparent px-4 py-3 font-mono text-sm",
                "border-slate-200/80 placeholder:text-slate-400/50 dark:border-white/[0.08] dark:placeholder:text-slate-500/40",
                "focus:border-brand/40 focus:outline-none focus:ring-1 focus:ring-brand/20 dark:focus:border-brand/30 dark:focus:ring-brand/15",
                "text-foreground",
                isRunning && "opacity-60 cursor-not-allowed"
              )}
            />
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isRunning || prompt.trim().length === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
                "bg-brand text-white shadow-[0_0_20px_rgba(var(--brand-rgb),0.3)]",
                "hover:bg-brand/90 hover:shadow-[0_0_28px_rgba(var(--brand-rgb),0.4)]",
                "active:scale-[0.98]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("aiLab.inference.generating")}
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  {t("aiLab.inference.generate")}
                </>
              )}
            </button>

            {/* Keyboard shortcut hint */}
            <span className="hidden sm:inline font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
              {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter
            </span>
          </div>

          {/* Generated text output */}
          {steps.length > 0 && (
            <div className="rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-brand/15 dark:bg-brand/[0.03]">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Output
              </span>
              <div className="mt-1 font-mono text-sm text-foreground leading-relaxed">
                <span className="text-slate-400 dark:text-slate-500">
                  {prompt}
                </span>
                <span className="text-brand dark:text-brand/80">
                  {steps.map((s) => s.token).join("")}
                </span>
                {isRunning && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="inline-block w-2 h-4 ml-0.5 bg-brand/60 rounded-sm align-middle"
                  />
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {steps.length === 0 && !isRunning && (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="flex size-8 items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <Cpu className="size-3.5 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-center text-[0.75rem] text-slate-400/80 dark:text-slate-500/70">
                {t("aiLab.inference.noGenerationYet")}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ===================================================== */}
      {/* Section 3: Pipeline Visualization */}
      {/* ===================================================== */}
      {(steps.length > 0 || isRunning) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35, ease: "easeOut" }}
        >
          <InferenceVisualizer
            latestStep={steps.length > 0 ? steps[steps.length - 1] : null}
            stepCount={steps.length}
            isRunning={isRunning}
          />
        </motion.div>
      )}

      {/* ===================================================== */}
      {/* Section 4: Token Stream */}
      {/* ===================================================== */}
      {(steps.length > 0 || isRunning) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: "easeOut" }}
        >
          <TokenStream steps={steps} />
        </motion.div>
      )}

      {/* ===================================================== */}
      {/* Section 5: Generation Trace + KV Cache Panel */}
      {/* ===================================================== */}
      {trace && !isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35, ease: "easeOut" }}
        >
          <GenerationTracePanel trace={trace} />
        </motion.div>
      )}

      {/* Cross-Reference Navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <CrossRefButton
          variant="forward"
          targetId="forward"
          label="Explore Forward Pipeline"
        />
        <CrossRefButton
          variant="training"
          targetId="training"
          label="View Training"
        />
      </div>
    </div>
  );
}
