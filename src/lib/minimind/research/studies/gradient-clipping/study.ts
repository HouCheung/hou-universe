// ============================================================
// MiniMind — research/studies/gradient-clipping/study.ts
// ============================================================
// Phase 63: Gradient Clipping Study — Canonical Definition.
//
// This is the first reproducible MiniMind research study.
// It tests whether gradient clipping (gradientClipNorm=1.0)
// improves training stability without damaging convergence.
//
// Study Design:
//   - Baseline:  gradientClipNorm = undefined (disabled)
//   - Variant:    gradientClipNorm = 1.0
//   - All other variables held constant
//   - 2 runs each for reproducibility (seed=42)
//
// Usage:
//   import { gradientClippingStudy, STUDY_CORPUS } from "./study";
//   import { validateStudyControlledVariables } from "../ControlledVariableValidator";
//
//   // Validate before running
//   const validation = validateStudyControlledVariables(gradientClippingStudy);
//   if (!validation.valid) throw new Error(validation.error!);
//
//   // Execute
//   import { ResearchBenchmarkRunner } from "../benchmark/ResearchBenchmarkRunner";
//   const runner = new ResearchBenchmarkRunner();
//   const baselineResult = await runner.benchmarkExperiment(
//     gradientClippingStudy.baseline, STUDY_CORPUS, 2
//   );
//   const clippedResult = await runner.benchmarkExperiment(
//     gradientClippingStudy.variants[0], STUDY_CORPUS, 2
//   );
// ============================================================

import { createResearchExperiment } from "../../ResearchExperiment";
import { createResearchStudy } from "../../ResearchStudy";
import type { ResearchStudy } from "../../ResearchStudy";
import type { ResearchExperiment } from "../../ResearchExperiment";
import type { TrainingRecipe } from "../../../experiments/TrainingRecipe";
import type { ModelConfigEntry } from "../../../experiments/ModelRegistry";
import type { DatasetConfig, TokenizerConfig, EvaluationConfig } from "../../ResearchExperiment";
import baselineJson from "./baseline.json";
import clippedJson from "./clipped.json";

// ============================================================
// Experiment Definitions
// ============================================================

/**
 * Baseline experiment: gradient clipping DISABLED.
 *
 * gradientClipNorm is undefined — the Trainer will skip
 * gradient clipping entirely, allowing gradient norms to
 * evolve naturally during training.
 */
export const baselineExperiment: ResearchExperiment =
  createResearchExperiment({
    id: baselineJson.id,
    name: baselineJson.name,
    description: baselineJson.description,
    hypothesis: baselineJson.hypothesis,
    seed: baselineJson.seed,
    modelConfig: baselineJson.modelConfig as unknown as ModelConfigEntry,
    trainingConfig: baselineJson.trainingConfig as unknown as TrainingRecipe,
    datasetConfig: baselineJson.datasetConfig as unknown as DatasetConfig,
    tokenizerConfig: baselineJson.tokenizerConfig as unknown as TokenizerConfig,
    evaluationConfig: baselineJson.evaluationConfig as unknown as EvaluationConfig,
    tags: baselineJson.tags,
  });

/**
 * Variant experiment: gradient clipping ENABLED (norm = 1.0).
 *
 * Only gradientClipNorm differs from baseline.
 * All other config fields are identical.
 */
export const clippedExperiment: ResearchExperiment =
  createResearchExperiment({
    id: clippedJson.id,
    name: clippedJson.name,
    description: clippedJson.description,
    hypothesis: clippedJson.hypothesis,
    seed: clippedJson.seed,
    modelConfig: clippedJson.modelConfig as unknown as ModelConfigEntry,
    trainingConfig: clippedJson.trainingConfig as unknown as TrainingRecipe,
    datasetConfig: clippedJson.datasetConfig as unknown as DatasetConfig,
    tokenizerConfig: clippedJson.tokenizerConfig as unknown as TokenizerConfig,
    evaluationConfig: clippedJson.evaluationConfig as unknown as EvaluationConfig,
    tags: clippedJson.tags,
  });

// ============================================================
// Study Definition
// ============================================================

/**
 * The canonical Gradient Clipping Study.
 *
 * Research Question:
 *   "Does gradient clipping improve MiniMind GPT training stability?"
 *
 * Hypothesis:
 *   Gradient clipping reduces gradient explosion / instability
 *   without materially damaging convergence.
 *
 * Independent Variable:
 *   gradientClipNorm: undefined (baseline) → 1.0 (variant)
 *
 * Controlled Variables:
 *   model preset, model config, tokenizer, dataset, dataset subset,
 *   training recipe, learning rate, scheduler, batch size,
 *   sequence length, accumulation steps, epochs, seed
 */
export const gradientClippingStudy: ResearchStudy = createResearchStudy({
  id: "study-gradient-clipping-v1",
  name: "Gradient Clipping Study",
  researchQuestion:
    "Does gradient clipping improve MiniMind GPT training stability?",
  hypothesis:
    "Gradient clipping reduces gradient explosion / instability " +
    "without materially damaging convergence.",
  baseline: baselineExperiment,
  variants: [clippedExperiment],
  controlledVariables: [
    "modelConfig (dModel, numHeads, dFF, numLayers, maxSeqLen, vocabSize)",
    "tokenizerConfig (type, vocabSize)",
    "datasetConfig (name, blockSize, batchSize, shuffle)",
    "trainingConfig.epochs",
    "trainingConfig.optimizer (type, lr, weightDecay, betas)",
    "trainingConfig.scheduler (type, minLRRatio, warmupSteps)",
    "trainingConfig.gradientAccumulation",
    "trainingConfig.warmupSteps",
    "trainingConfig.batchSize",
    "seed",
  ],
  independentVariable: {
    name: "gradientClipNorm",
    baselineValue: "undefined (disabled)",
    variantValue: "1.0",
  },
  numRuns: 2,
  tags: [
    "phase-63",
    "gradient-clipping",
    "training-stability",
    "controlled-experiment",
    "reproducibility",
  ],
});

// ============================================================
// Training Corpus
// ============================================================

/**
 * Inline text corpus for the gradient clipping study.
 *
 * This is a curated set of simple English sentences repeated
 * to provide enough training data for a meaningful signal.
 * Using an inline corpus keeps the study browser-safe and
 * deterministic — no external file dependencies.
 */
const CORPUS_SENTENCES = [
  "the cat sat on the mat",
  "the dog ran in the park",
  "once upon a time there was a princess",
  "the sun was shining brightly in the sky",
  "a bird flew over the tall tree",
  "the fish swam in the clear water",
  "the boy played with his red ball",
  "a beautiful rainbow appeared after the rain",
  "the girl read a book under the lamp",
  "the horse jumped over the fence",
  "the teacher wrote on the blackboard",
  "the children played in the garden",
  "the baker made fresh bread every morning",
  "the river flowed gently through the valley",
  "the stars twinkled in the night sky",
  "the old man walked slowly down the street",
  "the flowers bloomed in the spring sunshine",
  "the train arrived at the station on time",
  "the artist painted a beautiful landscape",
  "the musician played a lovely melody",
];

/**
 * Study corpus — 200 sentences (20 unique × 10 repeats).
 *
 * Small enough for fast training, large enough to observe
 * gradient dynamics and convergence behavior.
 */
export const STUDY_CORPUS: string[] = Array.from(
  { length: 200 },
  (_, i) => CORPUS_SENTENCES[i % CORPUS_SENTENCES.length],
);

// ============================================================
// Study Metadata
// ============================================================

/**
 * Human-readable summary of the study design.
 */
export const STUDY_DESIGN_SUMMARY = `
============================================================
GRADIENT CLIPPING STUDY — Experimental Design
============================================================

Research Question:
  Does gradient clipping improve MiniMind GPT training stability?

Hypothesis:
  Gradient clipping reduces gradient explosion / instability
  without materially damaging convergence.

Design:
  Controlled experiment with ONE independent variable.

  Baseline (A):  gradientClipNorm = undefined (disabled)
  Variant  (B):  gradientClipNorm = 1.0

Controlled Variables (identical across A and B):
  - Model:    dModel=64, numHeads=4, dFF=128, numLayers=3, maxSeqLen=64
  - Dataset:  inline corpus, blockSize=32, batchSize=4, shuffle=true
  - Tokenizer: BPE, vocabSize=1000
  - Training: 5 epochs, lr=0.001, AdamW, cosine scheduler
  - Seed:     42

Metrics Collected:
  Training:   initialLoss, finalLoss, bestLoss, lossReduction, perplexity
  Stability:  meanGradientNorm, maxGradientNorm, gradientNormVariance,
              divergenceDetected, instabilityDetected
  Efficiency: tokensPerSecond, wallClockMs
  Model:      parameterCount

Runs: 2 per experiment (total: 4 runs)
Expected Duration: ~30-60 seconds total
============================================================
`;
