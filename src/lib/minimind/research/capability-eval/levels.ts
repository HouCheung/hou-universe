// ============================================================
// MiniMind — research/capability/levels.ts
// ============================================================
// Phase 84: explicit capability gates (Level 0 → Level 5).
//
// Each level is a GATE — it is only "achieved" when every criterion
// below it (and its own) is met by MEASURED evidence. Nothing is
// granted by assertion; a level that cannot be evidenced is reported
// as NOT ACHIEVED, with the reason recorded.
//
//   Level 0 — pipeline works (training completes, checkpoint saves/loads)
//   Level 1 — tokenizer is bilingual (zh/en/mixed round-trip lossless)
//   Level 2 — training signal exists (loss drops, params change)
//   Level 3 — memorization (model strongly favors training patterns)
//   Level 4 — coherent bilingual generation (valid UTF-8, non-empty,
//             non-collapsed, uses learned vocab, CJK present for zh)
//   Level 5 — basic bilingual Q&A (NEVER asserted without evidence;
//             requires instruction tuning + a Q&A evaluation set that
//             do not exist in this codebase)
//
// NOTE (Phase 95 risk #5, recorded not fixed): the "CJK present for zh"
// clause in the Level 4 line above describes the INTENT, but
// `everyAggregateCoherent` does NOT check `cjkRatio` — it never has. The
// enforced gate is exactly the three conditions in `LEVEL4_GATE_CONDITIONS`.
// Adding the CJK clause now would CHANGE the gate, which Phase 95 forbids;
// the discrepancy is recorded here so the stated criterion and the enforced
// one can be reconciled explicitly in a later phase.
// ============================================================

import type {
  GenerationEvaluationReport,
  LanguageAggregate,
  MemorizationReport,
  TokenizerRoundTripReport,
} from "./evaluate";

// ============================================================
// Types
// ============================================================

/** The measurable evidence feeding the capability gates. */
export interface CapabilityEvidence {
  /** Level 0: did the training loop run to completion and checkpoint save/load? */
  pipelineRuns: boolean;
  /** Level 1: did the tokenizer round-trip all zh/en/mixed samples? */
  tokenizerRoundTrip: boolean;
  /** Level 2: did the training loss decrease meaningfully? */
  lossDecreases: boolean;
  /** Level 2: did model parameters change during training? */
  paramsChange: boolean;
  /** Level 3: does next-token top-1 accuracy clearly exceed chance? */
  memorizationSignal: boolean;
  /** Level 4: is generated text coherent (valid UTF-8, non-empty, non-collapsed)? */
  coherentGeneration: boolean;
  /** Level 5: is Q&A demonstrated? (Always false unless evidenced.) */
  qaCapability: boolean;
}

/**
 * Which UTF-8 condition a Level-4 evaluation applies.
 *
 * `"tolerant"` — Phase 95 repaired condition (adopted).
 * `"strict"`   — historical Phase 84 condition (retained for comparison).
 */
export type Utf8GateMode = "tolerant" | "strict";

/** A single capability gate definition. */
export interface CapabilityLevel {
  level: number;
  name: string;
  criterion: string;
  achieved: boolean;
  reasons: string[];
}

/** Full gate report. */
export interface CapabilityLevelReport {
  /** Highest level fully achieved (0–5). */
  highestLevel: number;
  /** Whether every gate up to highestLevel is achieved. */
  levels: CapabilityLevel[];
}

// ============================================================
// Gate definitions
// ============================================================

/**
 * Derive the achieved capability level from measured evidence.
 *
 * The derivation is STRICT: level N is achieved only if every level
 * from 0..N is achieved. A level that is not achieved is reported with
 * the reason it failed, and stops the chain (higher levels are also
 * not achieved).
 */
export function deriveCapabilityLevel(evidence: CapabilityEvidence): CapabilityLevelReport {
  const levels: CapabilityLevel[] = [];
  let chainUnbroken = true;

  const gate = (
    level: number,
    name: string,
    criterion: string,
    achieved: boolean,
    reasons: string[]
  ): void => {
    const effective = chainUnbroken && achieved;
    levels.push({
      level,
      name,
      criterion,
      achieved: effective,
      reasons: effective ? reasons : [...reasons, "lower gate not met"],
    });
    if (!effective) chainUnbroken = false;
  };

  gate(0, "Pipeline works", "Training loop runs to completion; checkpoint saves and loads", evidence.pipelineRuns, [
    "training loop completes",
    "checkpoint save/load succeeds",
  ]);

  gate(1, "Bilingual tokenizer", "zh/en/mixed encode→decode round-trip is lossless", evidence.tokenizerRoundTrip, [
    "tokenizer round-trips all language classes",
  ]);

  gate(2, "Training signal", "Loss decreases and parameters change during training", evidence.lossDecreases && evidence.paramsChange, [
    "loss decreases",
    "parameters change",
  ]);

  gate(3, "Memorization", "Model reproduces training patterns (top-1 >= 0.5)", evidence.memorizationSignal, [
    "next-token top-1 accuracy >= 0.5 (actual reproduction, not merely above chance)",
  ]);

  gate(4, "Coherent bilingual generation", "Generated text is valid UTF-8, non-empty, non-collapsed, uses learned vocab", evidence.coherentGeneration, [
    "generation is valid UTF-8",
    "generation is non-empty",
    "generation is not repetition-collapsed",
    "generation uses learned (merged) subword tokens",
  ]);

  gate(5, "Bilingual Q&A", "Model answers zh/en questions coherently", evidence.qaCapability, [
    "requires instruction tuning + Q&A evaluation set (not present)",
  ]);

  const highestLevel = levels.reduce((acc, l) => (l.achieved ? l.level : acc), 0);

  return { highestLevel, levels };
}

// ============================================================
// Evidence builders (from measured reports)
// ============================================================

/**
 * Build capability evidence from the measured evaluation reports.
 *
 * This is the ONLY place raw measurements are turned into the
 * yes/no gate signals. The thresholds are conservative and explicit.
 */
export function buildEvidence(args: {
  pipelineRuns: boolean;
  lossDecreases: boolean;
  paramsChange: boolean;
  roundTrip: TokenizerRoundTripReport;
  memorization: MemorizationReport;
  generation: GenerationEvaluationReport;
  /**
   * Which UTF-8 condition feeds the Level-4 gate.
   *
   * `"tolerant"` (default, Phase 95 Option B) is the adopted condition.
   * `"strict"` evaluates the HISTORICAL condition against the retained
   * `strictValidUtf8Ratio`. It exists so a report can show both Level-4
   * verdicts side by side WITHOUT re-implementing the gate anywhere: this
   * function remains the single source of truth for the gate, and the two
   * modes differ in exactly one term.
   */
  utf8Gate?: Utf8GateMode;
}): CapabilityEvidence {
  const {
    pipelineRuns,
    lossDecreases,
    paramsChange,
    roundTrip,
    memorization,
    generation,
    utf8Gate = "tolerant",
  } = args;

  // Level 4 — coherent generation: the model must produce valid UTF-8,
  // non-empty, non-collapsed output in every language class, and emit at
  // least one learned (merged) subword token somewhere. CJK presence for
  // zh prompts is a further (stronger) signal, reported separately.
  //
  // Phase 95 (Option B, adopted only after the oracle acceptance test
  // passed): the UTF-8 condition uses the REPAIRED tolerant verdict. The
  // historical strict condition it replaces had a measured oracle ceiling
  // of 7.639% — a PERFECT generator failed it four times in five, purely
  // because the fixed 24-token horizon lands mid-character. Every other
  // condition is untouched. See capability-eval/utf8.ts.
  const everyLanguageCoherent =
    everyAggregateCoherent(generation.byLanguage.zh, utf8Gate) &&
    everyAggregateCoherent(generation.byLanguage.en, utf8Gate) &&
    everyAggregateCoherent(generation.byLanguage.mixed, utf8Gate);

  const mergedUsed = generation.samples.some((s) => s.usesMergedTokens);

  return {
    pipelineRuns,
    tokenizerRoundTrip: roundTrip.allRoundTrip,
    lossDecreases,
    paramsChange,
    // Level 3 = reproduction, NOT merely above-chance (which is still Level 2).
    memorizationSignal: memorization.reproducesPatterns,
    coherentGeneration: everyLanguageCoherent && mergedUsed,
    qaCapability: false, // never asserted — no Q&A evaluation set exists
  };
}

/**
 * The complete and exhaustive set of Level-4 per-language gate conditions.
 *
 * Exported so the separation is checkable rather than merely documented:
 * Phase 95 added several repaired metrics and diagnostics, and NONE of them
 * may quietly become a threshold. There is no numeric bar here — only the
 * three conditions below, all of which were already established before
 * Phase 95 (`validUtf8TolerantRatio === 1` is the repaired form of the
 * historical `validUtf8Ratio === 1`).
 */
export const LEVEL4_GATE_CONDITIONS = [
  "validUtf8TolerantRatio === 1",
  "nonEmptyRatio === 1",
  "collapsedRatio === 0",
] as const;

/**
 * Metrics Phase 95 ADDS to the Level-4 report but deliberately does NOT
 * gate on. No numeric threshold exists for any of them, and inventing one
 * would be a fabricated capability bar (§10 of the Phase 95 brief).
 *
 * These are reported so a future phase can decide, with evidence, whether
 * any of them should become a gate.
 */
export const LEVEL4_DIAGNOSTIC_FIELDS = [
  "strictValidUtf8Ratio",
  "charIntegrityRate",
  "charIntegrityRateMin",
  "tokensToFirstInvalidMin",
  "tokensToFirstInvalidMean",
  "invalidSampleCount",
  "trailingIncompleteCount",
  "cjkRatio",
  "mergedTokenRatio",
] as const;

/**
 * A language aggregate is coherent iff valid UTF-8, non-empty, non-collapsed.
 *
 * The UTF-8 term is the Phase 95 REPAIRED (tolerant) ratio: it forgives a
 * trailing sequence left unfinished by the fixed 24-token horizon, and
 * nothing else. Interior malformed bytes, leading orphan continuation
 * bytes, illegal lead bytes and out-of-range token ids all still fail.
 * `strictValidUtf8Ratio` carries the historical value, unchanged, and is
 * NOT a gate condition.
 *
 * The other two conditions are identical in both modes — Phase 95 changed
 * exactly one term, and added no threshold.
 */
function everyAggregateCoherent(agg: LanguageAggregate, utf8Gate: Utf8GateMode): boolean {
  const utf8Ok =
    utf8Gate === "strict"
      ? agg.strictValidUtf8Ratio === 1
      : agg.validUtf8TolerantRatio === 1;
  return utf8Ok && agg.nonEmptyRatio === 1 && agg.collapsedRatio === 0;
}

// ============================================================
// Human-readable report
// ============================================================

/**
 * Render a capability report as a plain-text table (for the Phase 84
 * report and console output).
 */
export function formatCapabilityReport(report: CapabilityLevelReport): string {
  const lines: string[] = [];
  lines.push("Capability gates:");
  for (const l of report.levels) {
    const mark = l.achieved ? "✔" : "✘";
    lines.push(`  [${mark}] Level ${l.level} — ${l.name}: ${l.criterion}`);
    for (const reason of l.reasons) {
      lines.push(`        - ${reason}`);
    }
  }
  lines.push(`Highest achieved level: ${report.highestLevel}`);
  return lines.join("\n");
}
