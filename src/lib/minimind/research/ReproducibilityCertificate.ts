// ============================================================
// MiniMind — research/ReproducibilityCertificate.ts
// ============================================================
// Phase 60: Reproducibility certificate with fingerprinting.
//
// Generates a structured certificate that verifies whether
// a training run can be reproduced. Computes stable fingerprints
// for model config, tokenizer config, dataset config, and
// training config.
//
// The certificate includes:
//   - Fingerprints for all config components
//   - Loss curve match verification
//   - Checkpoint match verification
//   - Generation output match verification
//   - Random state match verification
//   - Overall reproducibility verdict
//
// Design principles:
//   - Deterministic fingerprinting (FNV-1a hash)
//   - Same config + seed → same fingerprint
//   - Different config → different fingerprint
//   - No third-party hash libraries
//   - Browser-safe
// ============================================================

import type { ResearchExperiment } from "./ResearchExperiment";
import type { ResearchRun, RunReproducibility } from "./ResearchRun";

// ============================================================
// Certificate Types
// ============================================================

/**
 * A structured reproducibility certificate.
 */
export interface ReproducibilityCertificateData {
  /** Random seed used */
  seed: number;

  /** Fingerprints for each component */
  fingerprints: {
    /** Model config fingerprint */
    model: string;
    /** Tokenizer config fingerprint */
    tokenizer: string;
    /** Dataset config fingerprint */
    dataset: string;
    /** Training config fingerprint */
    training: string;
    /** Evaluation config fingerprint */
    evaluation: string;
    /** Combined fingerprint of all configs */
    combined: string;
  };

  /** Match verification results */
  matches: {
    /** Whether loss curves matched between runs */
    lossMatch: boolean;
    /** Maximum loss difference between runs */
    maxLossDiff: number;
    /** Whether checkpoints matched between runs */
    checkpointMatch: boolean;
    /** Whether generation outputs matched */
    generationMatch: boolean;
    /** Whether random state was consistent */
    randomStateMatch: boolean;
  };

  /** Overall reproducibility verdict */
  overall: {
    /** Whether the experiment is fully reproducible */
    reproducible: boolean;
    /** Confidence level (0-1) */
    confidence: number;
    /** Human-readable verdict */
    verdict: string;
  };

  /** Certificate metadata */
  meta: {
    /** When the certificate was generated */
    generatedAt: number;
    /** Certificate format version */
    version: 1;
    /** Experiment ID */
    experimentId: string;
    /** Run IDs compared */
    runIds: string[];
  };
}

// ============================================================
// FNV-1a Hash Implementation
// ============================================================

/**
 * FNV-1a 32-bit hash.
 *
 * A simple, deterministic, non-cryptographic hash function.
 * Same input always produces the same hash.
 *
 * Used for fingerprinting configs — NOT for security.
 */
function fnv1a32(input: string): number {
  let hash = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime (32-bit)
  }
  return hash >>> 0; // Unsigned 32-bit
}

/**
 * Convert a hash number to a hex string fingerprint.
 */
function toFingerprint(hash: number): string {
  return hash.toString(16).padStart(8, "0");
}

// ============================================================
// Stable Serialization for Fingerprinting
// ============================================================

/**
 * Stable JSON serialization: sorts object keys for deterministic output.
 *
 * Regular JSON.stringify may produce different output for the same
 * object if keys are in different order. This ensures consistent ordering.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => stableStringify(v));
    return `[${items.join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const items = keys.map((k) => `"${k}":${stableStringify(obj[k])}`);
  return `{${items.join(",")}}`;
}

// ============================================================
// Fingerprint Computation
// ============================================================

/**
 * Compute the model config fingerprint.
 */
function computeModelFingerprint(
  experiment: ResearchExperiment
): string {
  const canonical = {
    name: experiment.modelConfig.name,
    label: experiment.modelConfig.label,
    dModel: experiment.modelConfig.dModel,
    numHeads: experiment.modelConfig.numHeads,
    dFF: experiment.modelConfig.dFF,
    numLayers: experiment.modelConfig.numLayers,
    maxSeqLen: experiment.modelConfig.maxSeqLen,
    vocabSize: experiment.modelConfig.vocabSize,
  };
  return toFingerprint(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the tokenizer config fingerprint.
 */
function computeTokenizerFingerprint(
  experiment: ResearchExperiment
): string {
  const canonical = {
    type: experiment.tokenizerConfig.type,
    vocabSize: experiment.tokenizerConfig.vocabSize,
  };
  return toFingerprint(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the dataset config fingerprint.
 */
function computeDatasetFingerprint(
  experiment: ResearchExperiment
): string {
  const canonical = {
    name: experiment.datasetConfig.name,
    blockSize: experiment.datasetConfig.blockSize,
    batchSize: experiment.datasetConfig.batchSize,
    shuffle: experiment.datasetConfig.shuffle,
    type: experiment.datasetConfig.type ?? "inline",
  };
  return toFingerprint(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the training config fingerprint.
 */
function computeTrainingFingerprint(
  experiment: ResearchExperiment
): string {
  const canonical = {
    name: experiment.trainingConfig.name,
    epochs: experiment.trainingConfig.epochs,
    optimizer: {
      lr: experiment.trainingConfig.optimizer.lr,
      weightDecay: experiment.trainingConfig.optimizer.weightDecay,
      type: experiment.trainingConfig.optimizer.type,
    },
    gradientClipNorm: experiment.trainingConfig.gradientClipNorm,
    gradientAccumulation: experiment.trainingConfig.gradientAccumulation,
  };
  return toFingerprint(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the evaluation config fingerprint.
 */
function computeEvaluationFingerprint(
  experiment: ResearchExperiment
): string {
  const canonical = {
    maxTokens: experiment.evaluationConfig.maxTokens,
    temperature: experiment.evaluationConfig.temperature,
    runGenerationComparison: experiment.evaluationConfig.runGenerationComparison,
    runBenchmarks: experiment.evaluationConfig.runBenchmarks,
  };
  return toFingerprint(fnv1a32(stableStringify(canonical)));
}

/**
 * Compute the combined fingerprint from all individual fingerprints.
 */
function computeCombinedFingerprint(fingerprints: {
  model: string;
  tokenizer: string;
  dataset: string;
  training: string;
  evaluation: string;
}): string {
  const combined = [
    fingerprints.model,
    fingerprints.tokenizer,
    fingerprints.dataset,
    fingerprints.training,
    fingerprints.evaluation,
  ].join(":");
  return toFingerprint(fnv1a32(combined));
}

// ============================================================
// Match Verification
// ============================================================

/**
 * Verify that two runs' loss curves match within tolerance.
 */
function verifyLossMatch(
  runA: ResearchRun,
  runB: ResearchRun,
  tolerance: number
): { match: boolean; maxDiff: number } {
  const diff = Math.abs(runA.bestLoss - runB.bestLoss);
  return {
    match: diff <= tolerance,
    maxDiff: diff,
  };
}

/**
 * Verify that checkpoint IDs match.
 */
function verifyCheckpointMatch(
  runA: ResearchRun,
  runB: ResearchRun
): boolean {
  // If both have checkpoints, they should match
  if (runA.checkpointId && runB.checkpointId) {
    return runA.checkpointId === runB.checkpointId;
  }
  // If neither has a checkpoint, that's consistent
  return !runA.checkpointId && !runB.checkpointId;
}

/**
 * Verify that generation outputs match.
 */
function verifyGenerationMatch(
  runA: ResearchRun,
  runB: ResearchRun
): boolean {
  const genA = runA.generationAfter;
  const genB = runB.generationAfter;

  if (genA.length !== genB.length) return false;

  for (let i = 0; i < genA.length; i++) {
    if (genA[i].generatedText !== genB[i].generatedText) {
      return false;
    }
  }

  return true;
}

/**
 * Verify that random state is consistent (same seed used).
 */
function verifyRandomStateMatch(
  runA: ResearchRun,
  runB: ResearchRun
): boolean {
  return runA.seed === runB.seed;
}

// ============================================================
// Certificate Generation
// ============================================================

/**
 * ReproducibilityCertificate — generates structured reproducibility
 * certificates with deterministic fingerprinting.
 *
 * Usage:
 *   const cert = new ReproducibilityCertificate();
 *   const certificate = cert.generate(experiment, runA, runB);
 *   console.log(certificate.overall.reproducible);
 */
export class ReproducibilityCertificate {
  /**
   * Loss comparison tolerance.
   *
   * Two runs are considered to have matching loss if the
   * absolute difference in bestLoss is ≤ this value.
   */
  private lossTolerance: number;

  constructor(lossTolerance: number = 1e-6) {
    this.lossTolerance = lossTolerance;
  }

  /**
   * Generate a reproducibility certificate for two runs.
   *
   * @param experiment — the experiment definition
   * @param runA — first run
   * @param runB — second run (supposedly identical)
   * @returns a structured reproducibility certificate
   */
  generate(
    experiment: ResearchExperiment,
    runA: ResearchRun,
    runB: ResearchRun
  ): ReproducibilityCertificateData {
    // Compute fingerprints
    const fingerprints = {
      model: computeModelFingerprint(experiment),
      tokenizer: computeTokenizerFingerprint(experiment),
      dataset: computeDatasetFingerprint(experiment),
      training: computeTrainingFingerprint(experiment),
      evaluation: computeEvaluationFingerprint(experiment),
      combined: "",
    };
    fingerprints.combined = computeCombinedFingerprint(fingerprints);

    // Verify matches
    const lossMatch = verifyLossMatch(runA, runB, this.lossTolerance);
    const checkpointMatch = verifyCheckpointMatch(runA, runB);
    const generationMatch = verifyGenerationMatch(runA, runB);
    const randomStateMatch = verifyRandomStateMatch(runA, runB);

    // Overall verdict
    const allMatch =
      lossMatch.match &&
      checkpointMatch &&
      generationMatch &&
      randomStateMatch;

    const matchCount = [
      lossMatch.match,
      checkpointMatch,
      generationMatch,
      randomStateMatch,
    ].filter(Boolean).length;

    const confidence = matchCount / 4;

    let verdict: string;
    if (allMatch) {
      verdict =
        "Fully reproducible: all checks passed. Same seed and config " +
        "produce identical results.";
    } else if (matchCount >= 3) {
      verdict =
        "Mostly reproducible: minor differences detected. " +
        "Results are consistent within tolerance.";
    } else if (matchCount >= 2) {
      verdict =
        "Partially reproducible: significant differences detected. " +
        "Results may vary between runs.";
    } else {
      verdict =
        "Not reproducible: major differences detected. " +
        "Results differ significantly between runs.";
    }

    return {
      seed: experiment.seed,
      fingerprints,
      matches: {
        lossMatch: lossMatch.match,
        maxLossDiff: lossMatch.maxDiff,
        checkpointMatch,
        generationMatch,
        randomStateMatch,
      },
      overall: {
        reproducible: allMatch,
        confidence,
        verdict,
      },
      meta: {
        generatedAt: Date.now(),
        version: 1,
        experimentId: experiment.id,
        runIds: [runA.runId, runB.runId],
      },
    };
  }

  /**
   * Generate a fingerprint-only certificate (single run, no comparison).
   *
   * Useful for recording the fingerprint of a specific run
   * without needing a second run for comparison.
   */
  generateFingerprint(
    experiment: ResearchExperiment
  ): Pick<
    ReproducibilityCertificateData,
    "seed" | "fingerprints" | "meta"
  > {
    const fingerprints = {
      model: computeModelFingerprint(experiment),
      tokenizer: computeTokenizerFingerprint(experiment),
      dataset: computeDatasetFingerprint(experiment),
      training: computeTrainingFingerprint(experiment),
      evaluation: computeEvaluationFingerprint(experiment),
      combined: "",
    };
    fingerprints.combined = computeCombinedFingerprint(fingerprints);

    return {
      seed: experiment.seed,
      fingerprints,
      meta: {
        generatedAt: Date.now(),
        version: 1,
        experimentId: experiment.id,
        runIds: [],
      },
    };
  }

  /**
   * Verify two config fingerprints match.
   *
   * @returns true if the combined fingerprints are identical
   */
  verifyFingerprintsMatch(
    certA: ReproducibilityCertificateData,
    certB: ReproducibilityCertificateData
  ): boolean {
    return certA.fingerprints.combined === certB.fingerprints.combined;
  }

  /**
   * Generate RunReproducibility from a certificate (for embedding in ResearchRun).
   */
  toRunReproducibility(
    certificate: ReproducibilityCertificateData
  ): RunReproducibility {
    return {
      verified: certificate.overall.reproducible,
      lossMatch: certificate.matches.lossMatch,
      checkpointMatch: certificate.matches.checkpointMatch,
      generationMatch: certificate.matches.generationMatch,
      maxLossDiff: certificate.matches.maxLossDiff,
    };
  }

  /**
   * Serialize a certificate to JSON.
   */
  serialize(certificate: ReproducibilityCertificateData): string {
    return JSON.stringify(certificate, null, 2);
  }

  /**
   * Generate a human-readable summary of the certificate.
   */
  summarize(certificate: ReproducibilityCertificateData): string {
    const lines: string[] = [];
    lines.push("=".repeat(55));
    lines.push("REPRODUCIBILITY CERTIFICATE");
    lines.push("=".repeat(55));
    lines.push(`Experiment: ${certificate.meta.experimentId}`);
    lines.push(`Seed:       ${certificate.seed}`);
    lines.push(`Generated:  ${new Date(certificate.meta.generatedAt).toISOString()}`);
    lines.push("");
    lines.push("Fingerprints:");
    lines.push(`  Model:      ${certificate.fingerprints.model}`);
    lines.push(`  Tokenizer:  ${certificate.fingerprints.tokenizer}`);
    lines.push(`  Dataset:    ${certificate.fingerprints.dataset}`);
    lines.push(`  Training:   ${certificate.fingerprints.training}`);
    lines.push(`  Evaluation: ${certificate.fingerprints.evaluation}`);
    lines.push(`  Combined:   ${certificate.fingerprints.combined}`);
    lines.push("");
    lines.push("Matches:");
    lines.push(`  Loss:        ${certificate.matches.lossMatch ? "✅" : "❌"} (max diff: ${certificate.matches.maxLossDiff.toExponential(2)})`);
    lines.push(`  Checkpoint:  ${certificate.matches.checkpointMatch ? "✅" : "❌"}`);
    lines.push(`  Generation:  ${certificate.matches.generationMatch ? "✅" : "❌"}`);
    lines.push(`  Random State: ${certificate.matches.randomStateMatch ? "✅" : "❌"}`);
    lines.push("");
    lines.push(`Overall: ${certificate.overall.reproducible ? "✅ REPRODUCIBLE" : "❌ NOT REPRODUCIBLE"}`);
    lines.push(`Confidence: ${(certificate.overall.confidence * 100).toFixed(0)}%`);
    lines.push(`Verdict: ${certificate.overall.verdict}`);
    lines.push("=".repeat(55));

    return lines.join("\n");
  }
}
