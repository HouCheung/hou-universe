// ============================================================
// MiniMind Evaluation — Barrel export
// ============================================================
// Phase 44 + 46: Generation evaluation, benchmark, prompts,
// and training report exports.
// ============================================================

export { GenerationEvaluator } from "./GenerationEvaluator";
export type {
  GenerationEvalResult,
  GenerationComparison,
  GenerationEvalOptions,
} from "./GenerationEvaluator";

// ── Phase 46: Generation Benchmark ──
export { GenerationBenchmark } from "./GenerationBenchmark";
export type {
  GenerationBenchmarkResult,
  GenerationBenchmarkAggregate,
  GenerationBenchmarkComparison,
  GenerationBenchmarkOptions,
} from "./GenerationBenchmark";

// ── Phase 46: Prompt Suite ──
export {
  DEFAULT_PROMPTS,
  STORY_PROMPTS,
  SIMPLE_PROMPTS,
  GPT2_PROMPTS,
  PROMPT_SUITES,
  getPromptSuite,
  getAvailablePromptSuites,
} from "./PromptSuite";
export type { PromptSuiteName } from "./PromptSuite";

// ── Phase 50: Benchmark Runner ──
export { BenchmarkRunner } from "./BenchmarkRunner";
export type {
  TrainingBenchmarkConfig,
  TrainingBenchmarkResult,
  GenerationBenchmarkConfig,
  GenerationMetrics,
  BenchmarkResult,
} from "./BenchmarkRunner";

// ── Phase 50: Model Statistics ──
export { ModelStats } from "./ModelStats";
export type {
  LayerStats,
  ParameterDetail,
  MemoryEstimate,
  ModelStatsReport,
  ArchitectureSummary,
} from "./ModelStats";

// ── Node-only exports ──
// TrainingReport uses Node.js fs/path — it is NOT browser-safe.
// Import from "@/lib/minimind/evaluation/node" (or "@/lib/minimind/node")
// for CLI / server-side use.
