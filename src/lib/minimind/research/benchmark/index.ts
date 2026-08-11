// ============================================================
// MiniMind — research/benchmark/index.ts
// ============================================================
// Phase 62: Research Benchmark Module — Barrel Export
// ============================================================

// Experiment Fingerprint
export {
  createExperimentFingerprint,
  compareExperimentIdentity,
  formatFingerprint,
  extractExperimentIdentity,
} from "./ExperimentFingerprint";

export type {
  ExperimentFingerprint,
  ExperimentIdentity,
  FingerprintModelConfig,
  FingerprintTrainingConfig,
  FingerprintDatasetConfig,
  FingerprintTokenizerConfig,
} from "./ExperimentFingerprint";

// Research Benchmark Runner
export {
  ResearchBenchmarkRunner,
  detectConvergence,
  formatBenchmarkReport,
  compareBenchmarkReports,
} from "./ResearchBenchmarkRunner";

export type {
  ResearchBenchmarkProfile,
  ResearchBenchmarkRunResult,
  ResearchBenchmarkAggregate,
  ResearchBenchmarkResult,
  ResearchBenchmarkReport,
  BenchmarkMetricStats,
  ConvergenceStats,
} from "./ResearchBenchmarkRunner";
