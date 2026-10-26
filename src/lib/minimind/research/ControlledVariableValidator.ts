// ============================================================
// MiniMind — research/ControlledVariableValidator.ts
// ============================================================
// Phase 63: Controlled variable validation for research studies.
//
// A controlled experiment MUST differ in exactly one independent
// variable. All other variables must be identical. This module
// verifies that constraint and fails loudly on violation.
//
// It does NOT silently continue when variables differ —
// a controlled variable mismatch means the experiment is invalid.
//
// Design principles:
//   - Fail-fast — any uncontrolled difference aborts the study
//   - Specific — exact field paths in error messages
//   - Browser-safe — no fs/path dependencies
//   - Uses existing fingerprint infrastructure
// ============================================================

import {
  createExperimentFingerprint,
  extractExperimentIdentity,
  compareExperimentIdentity,
} from "./benchmark/ExperimentFingerprint";
import type {
  ExperimentFingerprint,
  ExperimentIdentity,
} from "./benchmark/ExperimentFingerprint";
import type { ResearchExperiment } from "./ResearchExperiment";
import type { ResearchStudy } from "./ResearchStudy";

// ============================================================
// Validation Result
// ============================================================

/**
 * Result of controlled variable validation.
 */
export interface ControlledVariableValidationResult {
  /** Whether the validation passed */
  valid: boolean;

  /** Which variables are identical across experiments */
  identicalVariables: string[];

  /** Which variables differ (should only be the independent variable) */
  differingVariables: string[];

  /** Detailed comparison report */
  details: {
    model: ComponentComparison;
    training: ComponentComparison;
    dataset: ComponentComparison;
    tokenizer: ComponentComparison;
    seed: ValueComparison;
  };

  /** Human-readable summary */
  summary: string;

  /** Specific error message if validation failed */
  error?: string;
}

interface ComponentComparison {
  identical: boolean;
  hashBaseline: string;
  hashVariant: string;
  differingFields: string[];
}

interface ValueComparison {
  identical: boolean;
  baseline: number;
  variant: number;
}

// ============================================================
// Field-level Comparison
// ============================================================

/**
 * Compare two objects field by field, returning the list of
 * fields that differ (ignoring specified fields).
 */
function diffFields(
  baseline: Record<string, unknown>,
  variant: Record<string, unknown>,
  ignoreFields: string[] = [],
): string[] {
  const allKeys = new Set([
    ...Object.keys(baseline),
    ...Object.keys(variant),
  ]);

  const differing: string[] = [];

  for (const key of allKeys) {
    if (ignoreFields.includes(key)) continue;

    const a = baseline[key];
    const b = variant[key];

    if (JSON.stringify(a) !== JSON.stringify(b)) {
      differing.push(key);
    }
  }

  return differing;
}

/**
 * Compare the training configs field by field, ignoring the
 * independent variable (gradientClipNorm).
 */
function diffTrainingFields(
  baselineIdentity: ExperimentIdentity,
  variantIdentity: ExperimentIdentity,
  independentVariable: string,
): string[] {
  const baselineTraining = baselineIdentity.training as unknown as unknown as Record<string, unknown>;
  const variantTraining = variantIdentity.training as unknown as unknown as Record<string, unknown>;

  return diffFields(baselineTraining, variantTraining, [independentVariable]);
}

/**
 * Compare model configs field by field.
 */
function diffModelFields(
  baselineIdentity: ExperimentIdentity,
  variantIdentity: ExperimentIdentity,
): string[] {
  const baselineModel = baselineIdentity.model as unknown as Record<string, unknown>;
  const variantModel = variantIdentity.model as unknown as Record<string, unknown>;

  return diffFields(baselineModel, variantModel);
}

/**
 * Compare dataset configs field by field.
 */
function diffDatasetFields(
  baselineIdentity: ExperimentIdentity,
  variantIdentity: ExperimentIdentity,
): string[] {
  const baselineDataset = baselineIdentity.dataset as unknown as Record<string, unknown>;
  const variantDataset = variantIdentity.dataset as unknown as Record<string, unknown>;

  return diffFields(baselineDataset, variantDataset);
}

/**
 * Compare tokenizer configs field by field.
 */
function diffTokenizerFields(
  baselineIdentity: ExperimentIdentity,
  variantIdentity: ExperimentIdentity,
): string[] {
  const baselineTokenizer = baselineIdentity.tokenizer as unknown as Record<string, unknown>;
  const variantTokenizer = variantIdentity.tokenizer as unknown as Record<string, unknown>;

  return diffFields(baselineTokenizer, variantTokenizer);
}

// ============================================================
// Main Validator
// ============================================================

/**
 * Verify that two experiments differ ONLY in the specified
 * independent variable. All other variables must be identical.
 *
 * If any uncontrolled difference is found, validation fails
 * and the result includes the exact fields that differ.
 *
 * @param baseline — the baseline experiment
 * @param variant — the variant experiment
 * @param independentVariable — the field name that is allowed to differ
 *   (e.g. "gradientClipNorm")
 * @returns validation result with detailed comparison
 *
 * Usage:
 *   const result = verifyControlledVariables(
 *     baselineExperiment,
 *     clippedExperiment,
 *     "gradientClipNorm",
 *   );
 *   if (!result.valid) {
 *     throw new Error(result.error!);
 *   }
 */
export function verifyControlledVariables(
  baseline: ResearchExperiment,
  variant: ResearchExperiment,
  independentVariable: string,
): ControlledVariableValidationResult {
  const baselineIdentity = extractExperimentIdentity(baseline);
  const variantIdentity = extractExperimentIdentity(variant);

  const baselineFingerprint = createExperimentFingerprint(baselineIdentity);
  const variantFingerprint = createExperimentFingerprint(variantIdentity);

  const comparison = compareExperimentIdentity(
    baselineFingerprint,
    variantFingerprint,
  );

  // ── Per-component field-level diffs ──

  const modelDifferingFields = diffModelFields(
    baselineIdentity,
    variantIdentity,
  );

  const trainingDifferingFields = diffTrainingFields(
    baselineIdentity,
    variantIdentity,
    independentVariable,
  );

  const datasetDifferingFields = diffDatasetFields(
    baselineIdentity,
    variantIdentity,
  );

  const tokenizerDifferingFields = diffTokenizerFields(
    baselineIdentity,
    variantIdentity,
  );

  const seedIdentical = baselineIdentity.seed === variantIdentity.seed;

  // ── Build result ──

  const details = {
    model: {
      identical: modelDifferingFields.length === 0,
      hashBaseline: baselineFingerprint.components.model,
      hashVariant: variantFingerprint.components.model,
      differingFields: modelDifferingFields,
    },
    training: {
      identical: trainingDifferingFields.length === 0,
      hashBaseline: baselineFingerprint.components.training,
      hashVariant: variantFingerprint.components.training,
      differingFields: trainingDifferingFields,
    },
    dataset: {
      identical: datasetDifferingFields.length === 0,
      hashBaseline: baselineFingerprint.components.dataset,
      hashVariant: variantFingerprint.components.dataset,
      differingFields: datasetDifferingFields,
    },
    tokenizer: {
      identical: tokenizerDifferingFields.length === 0,
      hashBaseline: baselineFingerprint.components.tokenizer,
      hashVariant: variantFingerprint.components.tokenizer,
      differingFields: tokenizerDifferingFields,
    },
    seed: {
      identical: seedIdentical,
      baseline: baselineIdentity.seed,
      variant: variantIdentity.seed,
    },
  };

  // ── Determine validity ──

  const identicalVariables: string[] = [];
  const differingVariables: string[] = [];

  if (details.model.identical) identicalVariables.push("model");
  else differingVariables.push(`model: ${details.model.differingFields.join(", ")}`);

  if (details.training.identical) identicalVariables.push("training (except gradientClipNorm)");
  else differingVariables.push(`training: ${details.training.differingFields.join(", ")}`);

  if (details.dataset.identical) identicalVariables.push("dataset");
  else differingVariables.push(`dataset: ${details.dataset.differingFields.join(", ")}`);

  if (details.tokenizer.identical) identicalVariables.push("tokenizer");
  else differingVariables.push(`tokenizer: ${details.tokenizer.differingFields.join(", ")}`);

  if (details.seed.identical) identicalVariables.push("seed");
  else differingVariables.push("seed");

  // Also explicitly note the independent variable differs
  differingVariables.push(`${independentVariable} (independent variable — allowed)`);

  const valid =
    details.model.identical &&
    details.training.identical &&
    details.dataset.identical &&
    details.tokenizer.identical &&
    details.seed.identical;

  // ── Build summary ──

  let summary: string;
  let error: string | undefined;

  if (valid) {
    summary =
      `✅ Controlled variable validation PASSED. ` +
      `All variables identical except "${independentVariable}" (the independent variable).`;
  } else {
    const failures: string[] = [];
    if (!details.model.identical) failures.push(`Model: ${details.model.differingFields.join(", ")}`);
    if (!details.training.identical) failures.push(`Training: ${details.training.differingFields.join(", ")}`);
    if (!details.dataset.identical) failures.push(`Dataset: ${details.dataset.differingFields.join(", ")}`);
    if (!details.tokenizer.identical) failures.push(`Tokenizer: ${details.tokenizer.differingFields.join(", ")}`);
    if (!details.seed.identical) failures.push(`Seed: baseline=${details.seed.baseline}, variant=${details.seed.variant}`);

    error =
      `❌ Controlled variable validation FAILED. ` +
      `The following variables differ between baseline and variant ` +
      `(only "${independentVariable}" is allowed to differ): ` +
      failures.join("; ");

    summary = error;
  }

  return {
    valid,
    identicalVariables,
    differingVariables,
    details,
    summary,
    error,
  };
}

/**
 * Validate a complete ResearchStudy's controlled variables.
 *
 * Calls verifyControlledVariables for each variant against the baseline.
 * Returns the first failure, or success if all variants pass.
 *
 * @param study — the research study to validate
 * @returns validation result
 */
export function validateStudyControlledVariables(
  study: ResearchStudy,
): ControlledVariableValidationResult {
  const independentVarName = study.independentVariable.name;

  for (let i = 0; i < study.variants.length; i++) {
    const variant = study.variants[i];
    const result = verifyControlledVariables(
      study.baseline,
      variant,
      independentVarName,
    );

    if (!result.valid) {
      return {
        ...result,
        error: `Study "${study.name}" variant ${i} ("${variant.name}"): ${result.error}`,
        summary: `Study "${study.name}" variant ${i} ("${variant.name}"): ${result.summary}`,
      };
    }
  }

  // All variants passed
  const lastResult = study.variants.length > 0
    ? verifyControlledVariables(study.baseline, study.variants[study.variants.length - 1], independentVarName)
    : {
        valid: true,
        identicalVariables: [],
        differingVariables: [],
        details: {} as ControlledVariableValidationResult["details"],
        summary: "No variants to validate.",
      };

  return {
    valid: true,
    identicalVariables: lastResult.identicalVariables,
    differingVariables: lastResult.differingVariables,
    details: lastResult.details,
    summary: `✅ Study "${study.name}": All ${study.variants.length} variant(s) validated — only "${independentVarName}" differs from baseline.`,
  };
}
