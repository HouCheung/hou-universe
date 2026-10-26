// ============================================================
// MiniMind — research/capability/index.ts
// ============================================================
// Phase 84: bilingual capability evaluation barrel.
//
// This module contains the REAL capability evaluator (evaluate.ts) and
// the explicit capability gates (levels.ts). It measures tokenizer
// round-trip, memorization (top-1 vs chance), and generation quality —
// and derives an honest Level 0–5 capability rating. No fake metrics,
// no fabricated Q&A, no simulated training.
// ============================================================

export {
  aggregateGenerationSamples,
  evaluateGeneration,
  evaluateTokenizerRoundTrip,
  measureMemorization,
} from "./evaluate";

export type {
  CapabilityPrompt,
  GenerationEvaluationReport,
  GenerationSampleMetrics,
  LanguageAggregate,
  LanguageClass,
  MemorizationReport,
  TokenizerRoundTripReport,
} from "./evaluate";

export {
  LEVEL4_DIAGNOSTIC_FIELDS,
  LEVEL4_GATE_CONDITIONS,
  buildEvidence,
  deriveCapabilityLevel,
  formatCapabilityReport,
} from "./levels";

export {
  BYTE_TOKEN_MAX_ID,
  BYTE_TOKEN_MIN_ID,
  analyzeGeneration,
  charIntegrityRate,
  scanUtf8,
  tokenBytesOf,
} from "./utf8";

export type {
  GenerationByteAnalysis,
  IdToTokenMap,
  Utf8Scan,
} from "./utf8";

export type {
  CapabilityEvidence,
  CapabilityLevel,
  CapabilityLevelReport,
  Utf8GateMode,
} from "./levels";
