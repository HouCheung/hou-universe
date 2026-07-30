"use client";

import { useState, useCallback, useRef } from "react";
import { MiniMindModel } from "@/lib/minimind/model";
import { MiniLMHead } from "@/lib/minimind/model";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import { MiniEmbedding } from "@/lib/minimind/embedding";
import { RotaryEmbedding } from "@/lib/minimind/rope";
import { MiniTransformerBlock } from "@/lib/minimind/transformer";
import { MiniAttention } from "@/lib/minimind/attention";
import { MiniFeedForward } from "@/lib/minimind/ffn";
import { ForwardVisualAdapter } from "@/lib/minimind/visualization";
import type { ModelConfig } from "@/lib/minimind/model";
import type { VisualTrace } from "@/lib/minimind/visualization";
import type { StageId } from "@/data/minimind/visualization-capabilities";
import { ForwardHeader } from "./ForwardHeader";
import { InputPanel } from "./InputPanel";
import { PipelineTimeline } from "./PipelineTimeline";

// ============================================================
// ForwardPlayground — Root state owner for Forward Model
// ============================================================
//
// Owns three pieces of state:
//   inputText       — controlled text input
//   visualTrace     — result of ForwardVisualAdapter.enrich()
//   selectedStageId — which stage is expanded in Level 2
//   isRunning       — whether model.forward() is in progress
//
// Creates a MiniMindModel instance once via useRef (following
// the TokenizerPlayground pattern). The model is constructed
// with the same config as runForwardExample() for consistency.
//
// Data flow:
//   User types → InputPanel.onChange → setInputText
//   User clicks Run → ForwardVisualAdapter.enrich(model, text)
//                  → setVisualTrace
//   User clicks stage → setSelectedStageId
// ============================================================

// ── Constants ────────────────────────────────────────────────

const DEFAULT_TEXT = "Hello HOU Universe";

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

// ── Model factory ────────────────────────────────────────────

/**
 * Create a MiniMindModel with the standard educational configuration.
 *
 * Uses the same config and dependency injection pattern as
 * runForwardExample(). The model is created once and reused
 * across all forward runs — forward() is deterministic given
 * the same input.
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

export function ForwardPlayground() {
  const model = useRef<MiniMindModel>(createModel()).current;
  const [inputText, setInputText] = useState(DEFAULT_TEXT);
  const [visualTrace, setVisualTrace] = useState<VisualTrace | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<StageId | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
  }, []);

  const handleRun = useCallback(() => {
    const trimmed = inputText.trim();
    if (trimmed.length === 0) return;

    setIsRunning(true);

    // Use setTimeout to allow the spinner to render before
    // the synchronous forward() blocks the main thread.
    setTimeout(() => {
      try {
        const trace = ForwardVisualAdapter.enrich(model, trimmed);
        setVisualTrace(trace);
        setSelectedStageId(null);
      } catch {
        setVisualTrace(null);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  }, [inputText, model]);

  const handleSelectStage = useCallback((stageId: StageId | null) => {
    setSelectedStageId(stageId);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <ForwardHeader />

      {/* Input */}
      <InputPanel
        value={inputText}
        onChange={handleTextChange}
        onRun={handleRun}
        isRunning={isRunning}
      />

      {/* Pipeline Timeline (Level 1) — shown when trace exists */}
      {visualTrace && (
        <PipelineTimeline
          trace={visualTrace}
          selectedStageId={selectedStageId}
          onSelectStage={handleSelectStage}
        />
      )}

      {/* DeepDivePanel (Level 2) — Commit 3 placeholder */}
      {/* {visualTrace && selectedStageId && (
        <DeepDivePanel trace={visualTrace} stageId={selectedStageId} />
      )} */}

      {/* Empty state — shown before first run */}
      {!visualTrace && !isRunning && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <span className="font-mono text-xl font-light text-slate-300 dark:text-slate-600">
              →
            </span>
          </div>
          <p className="text-center text-[0.75rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
            Click <span className="font-medium text-brand/70">Run Forward</span> to trace
            the complete pipeline
            <br />
            from text to logits through all five stages.
          </p>
        </div>
      )}
    </div>
  );
}
