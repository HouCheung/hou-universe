// ============================================================
// MiniMind — research/capability/evaluate.ts
// ============================================================
// Phase 84: REAL bilingual capability evaluation.
//
// Measures what the production model + tokenizer can ACTUALLY do,
// split into the four capability dimensions the phase requires:
//
//   1. tokenizer capability   — zh / en / mixed encode→decode round-trip
//   2. memorization capability — next-token top-1 accuracy vs. chance
//   3. generation capability  — UTF-8 validity, CJK presence, learned
//                               vocab, emptiness, repetition collapse,
//                               replacement-character collapse
//   4. Q&A capability         — NEVER asserted here (no instruction tuning
//                               or Q&A evaluation set exists)
//
// Every metric is derived from the real tokenizer/model output. Nothing
// is fabricated. The evaluator is deliberately honest: an untrained or
// weakly-trained model produces garbled output, and the metrics report
// exactly that.
// ============================================================

import { Tensor } from "../../core/Tensor";
import type { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import type { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { analyzeGeneration, charIntegrityRate, type IdToTokenMap } from "./utf8";

// ============================================================
// Types
// ============================================================

/** Language class of a prompt (aligned with the dataset language field). */
export type LanguageClass = "zh" | "en" | "mixed";

/** A prompt to evaluate generation on, tagged with its language class. */
export interface CapabilityPrompt {
  prompt: string;
  language: LanguageClass;
}

/**
 * Per-sample generation metrics. All are derived, never asserted.
 *
 * Phase 95 adds a REPAIRED block (tolerant verdict, first irrecoverable
 * token, character integrity) alongside the HISTORICAL block. Both are
 * computed from the SAME `generatedIds` in the same pass; neither replaces
 * the other, and no historical field changes meaning.
 */
export interface GenerationSampleMetrics {
  prompt: string;
  language: LanguageClass;
  /** The decoded continuation (prompt excluded). */
  continuation: string;
  /**
   * The exact token ids this sample's metrics describe. Surfaced by
   * Phase 95 so that every metric on a sample is traceable to one
   * generation and can be re-analysed without re-running the model.
   */
  generatedIds: number[];
  /** Number of generated token ids. */
  tokenCount: number;
  /** Whether the continuation is empty (model produced nothing readable). */
  empty: boolean;
  // ---- HISTORICAL (Phase 84 strict semantics, unchanged) ----
  /** Count of U+FFFD replacement characters (invalid UTF-8 byte sequences). */
  replacementCharCount: number;
  /** Whether the continuation is free of replacement characters. */
  validUtf8: boolean;
  /** Count of CJK (Han) characters in the continuation. */
  cjkCharCount: number;
  /** Whether any CJK character appears in the continuation. */
  hasCjk: boolean;
  /** Whether the continuation collapsed into repeated tokens/chars. */
  repeatedCollapse: boolean;
  /** Whether any generated token is a learned (merged) subword token. */
  usesMergedTokens: boolean;
  /** Count of generated token ids that are merged subwords (id >= 260). */
  mergedTokenCount: number;
  // ---- REPAIRED / DIAGNOSTIC (Phase 95, see capability-eval/utf8.ts) ----
  /**
   * Byte-level verdict: no irrecoverable UTF-8 error and no out-of-range
   * token id. A trailing sequence left unfinished BY THE HORIZON CUT is
   * tolerated; an interior malformed byte is not.
   */
  validUtf8Tolerant: boolean;
  /**
   * Index of the first token containing an irrecoverable error, or `-1`
   * when there is none. `-1` is the repository's "absent" idiom.
   */
  tokensToFirstInvalid: number;
  /** Whether the stream was cut mid-character at the horizon. */
  trailingIncomplete: boolean;
  /** Character integrity ratio (diagnostic — NOT a gate condition). */
  charIntegrityRate: number;
  /** Non-U+FFFD character count after discarding the tolerated tail. */
  charIntegrityNumerator: number;
  /** Numerator + U+FFFD count after discarding the tolerated tail. */
  charIntegrityDenominator: number;
}

/**
 * Aggregation over one language class.
 *
 * Phase 95 adds repaired metrics and diagnostics. The HISTORICAL fields
 * keep their names and their numeric semantics so that historical results
 * stay comparable; `strictValidUtf8Ratio` is an explicit alias of
 * `validUtf8Ratio` for new consumers.
 */
export interface LanguageAggregate {
  language: LanguageClass;
  sampleCount: number;
  // ---- HISTORICAL (Phase 84 semantics, unchanged) ----
  /** Fraction of samples with a non-empty continuation. */
  nonEmptyRatio: number;
  /** Fraction of samples free of replacement characters (strict). */
  validUtf8Ratio: number;
  /** Fraction of samples containing at least one CJK character. */
  cjkRatio: number;
  /** Fraction of samples flagged as repetition-collapsed. */
  collapsedRatio: number;
  /** Fraction of samples that emitted at least one merged subword token. */
  mergedTokenRatio: number;
  // ---- REPAIRED ----
  /** Fraction of samples valid under the repaired tolerant judge. */
  validUtf8TolerantRatio: number;
  /** Explicit alias of `validUtf8Ratio`; identical value, never a second measurement. */
  strictValidUtf8Ratio: number;
  // ---- DIAGNOSTICS (reported, never gate conditions — no threshold defined) ----
  /** Pooled character integrity = Σnumerator / Σdenominator (NOT a mean of ratios). */
  charIntegrityRate: number;
  /** The worst single prompt's character integrity. */
  charIntegrityRateMin: number;
  /** Pooled numerator (valid characters). */
  charIntegrityNumerator: number;
  /** Pooled denominator (valid + U+FFFD characters). */
  charIntegrityDenominator: number;
  /** Earliest irrecoverable token index among samples that have one, else -1. */
  tokensToFirstInvalidMin: number;
  /** Mean irrecoverable token index among samples that have one, else -1. */
  tokensToFirstInvalidMean: number;
  /** How many samples have an irrecoverable error at all. */
  invalidSampleCount: number;
  /** How many samples were cut mid-character at the horizon. */
  trailingIncompleteCount: number;
}

/** Complete generation evaluation report. */
export interface GenerationEvaluationReport {
  samples: GenerationSampleMetrics[];
  byLanguage: Record<LanguageClass, LanguageAggregate>;
}

/** Tokenizer round-trip evaluation result. */
export interface TokenizerRoundTripReport {
  /** Whether every tested text round-tripped losslessly. */
  allRoundTrip: boolean;
  /** Number of texts tested per language class. */
  counts: Record<LanguageClass, number>;
  /** Number of texts that failed to round-trip per language class. */
  failures: Record<LanguageClass, number>;
}

/** Memorization measurement: next-token top-1 accuracy vs. chance. */
export interface MemorizationReport {
  /** Number of next-token predictions evaluated. */
  predictions: number;
  /** Fraction of predictions where argmax matched the true next token. */
  top1Accuracy: number;
  /** Random-chance accuracy = 1 / vocabSize. */
  chance: number;
  /** Whether top-1 accuracy clearly exceeds chance (weak training signal). */
  exceedsChance: boolean;
  /** Whether the model REPRODUCES training patterns (top-1 >= 0.5). */
  reproducesPatterns: boolean;
}

// ============================================================
// Tokenizer round-trip (Level 1)
// ============================================================

/**
 * Evaluate zh / en / mixed tokenizer round-trip.
 *
 * For each text, `decode(encode(text))` must equal `text` exactly for
 * the tokenizer to be considered lossless. The byte-level BPE guarantees
 * this by construction; this function verifies it against REAL dataset
 * texts.
 *
 * @param tokenizer - A trained BPETokenizer
 * @param texts - Text samples keyed by language class
 */
export function evaluateTokenizerRoundTrip(
  tokenizer: BPETokenizer,
  texts: CapabilityPrompt[]
): TokenizerRoundTripReport {
  const counts: Record<LanguageClass, number> = { zh: 0, en: 0, mixed: 0 };
  const failures: Record<LanguageClass, number> = { zh: 0, en: 0, mixed: 0 };

  for (const { prompt, language } of texts) {
    counts[language]++;
    const roundTripped = tokenizer.decode(tokenizer.encode(prompt)) === prompt;
    if (!roundTripped) failures[language]++;
  }

  const totalFailures = failures.zh + failures.en + failures.mixed;
  return { allRoundTrip: totalFailures === 0, counts, failures };
}

// ============================================================
// Memorization (Level 3) — next-token top-1 accuracy vs chance
// ============================================================

/**
 * Measure whether the model memorizes training text by comparing its
 * argmax next-token prediction against the true next token.
 *
 * A model with NO signal matches chance (1 / vocabSize). A model that
 * has memorized the training distribution predicts the correct next
 * token well above chance. This is the honest, quantitative form of
 * "can the model reproduce training patterns".
 *
 * @param model - Trained (or untrained) model
 * @param tokenizer - Matching tokenizer
 * @param sampleTexts - Training-sample texts to test against
 * @param maxSamples - Bound the number of texts evaluated
 */
export function measureMemorization(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer,
  sampleTexts: string[],
  maxSamples: number = 8
): MemorizationReport {
  let correct = 0;
  let total = 0;

  const texts = sampleTexts.slice(0, maxSamples);
  for (const text of texts) {
    const ids = tokenizer.encode(text);
    if (ids.length < 2) continue;

    // Predict every position except the last (no target after it).
    const input = Tensor.fromArray([ids.slice(0, ids.length - 1)]);
    const logitsArr = Tensor.noGrad(() => model.forward(input).toArray()) as number[][][];
    const lastLogits = logitsArr[0]; // [S-1, V]

    for (let i = 0; i < lastLogits.length; i++) {
      const trueNext = ids[i + 1];
      let argmax = 0;
      let maxVal = -Infinity;
      const row = lastLogits[i];
      for (let v = 0; v < row.length; v++) {
        if (row[v] > maxVal) {
          maxVal = row[v];
          argmax = v;
        }
      }
      total++;
      if (argmax === trueNext) correct++;
    }
  }

  const vocabSize = tokenizer.vocabSize;
  const chance = vocabSize > 0 ? 1 / vocabSize : 0;
  const top1Accuracy = total > 0 ? correct / total : 0;

  return {
    predictions: total,
    top1Accuracy,
    chance,
    exceedsChance: total > 0 && top1Accuracy > chance * 2,
    reproducesPatterns: total > 0 && top1Accuracy >= 0.5,
  };
}

// ============================================================
// Generation quality (Level 4)
// ============================================================

/**
 * Evaluate generation quality across zh / en / mixed prompts.
 *
 * The continuation is decoded from the model's real output and inspected
 * for the failure modes the phase requires measuring:
 *   - empty output
 *   - replacement characters (invalid UTF-8)
 *   - absence of CJK characters (for Chinese prompts)
 *   - repetition collapse (one char/pattern dominates)
 *   - failure to use learned (merged) subword tokens
 *
 * @param model - Trained (or untrained) model
 * @param tokenizer - Matching tokenizer
 * @param prompts - Prompts tagged with language class
 * @param maxTokens - Generation length bound
 * @param temperature - Sampling temperature (0 = greedy)
 * @param seed - Seed for deterministic sampling
 */
export function evaluateGeneration(
  model: TensorMiniMindModel,
  tokenizer: BPETokenizer,
  prompts: CapabilityPrompt[],
  options: { maxTokens?: number; temperature?: number; seed?: number } = {}
): GenerationEvaluationReport {
  const { maxTokens = 24, temperature = 0.8, seed = 42 } = options;

  // Deterministic seeded RNG (mulberry32, mirroring GenerationEvaluator).
  const random = createSeededRNG(seed);

  // The tokenizer's own id→token map: the repaired metrics must describe
  // the SAME bytes `decode` sees, from the SAME generation. No second
  // tokenizer, no second decoder, no second generation pass.
  const idToToken: IdToTokenMap = tokenizer.getVocabulary().idToToken;

  const samples: GenerationSampleMetrics[] = [];

  for (const { prompt, language } of prompts) {
    const promptIds = tokenizer.encode(prompt);
    const currentIds = [...promptIds];
    const generatedIds: number[] = [];

    for (let step = 0; step < maxTokens; step++) {
      const ctx = currentIds.slice(-128);
      const input = Tensor.fromArray([ctx]);
      const logitsArr = Tensor.noGrad(() => model.forward(input).toArray()) as number[][][];
      const row = logitsArr[0][ctx.length - 1];
      const nextId = sampleToken(row, random, temperature);
      generatedIds.push(nextId);
      currentIds.push(nextId);
      if (nextId === 3) break; // <eos>
    }

    const continuation = tokenizer.decode(generatedIds);
    samples.push(measureSample(prompt, language, continuation, generatedIds, idToToken));
  }

  return { samples, byLanguage: aggregateByLanguage(samples) };
}

/**
 * Compute per-sample metrics from a decoded continuation.
 *
 * `continuation` is produced by the production `tokenizer.decode`, exactly
 * as before Phase 95 — the strict metrics are untouched. The repaired
 * metrics are derived from the SAME `generatedIds` via the shared byte
 * scanner, so every number on a sample describes one generation.
 */
function measureSample(
  prompt: string,
  language: LanguageClass,
  continuation: string,
  generatedIds: number[],
  idToToken: IdToTokenMap
): GenerationSampleMetrics {
  let replacementCharCount = 0;
  let cjkCharCount = 0;

  for (const ch of continuation) {
    if (ch === "�") replacementCharCount++;
    if (isCjk(ch)) cjkCharCount++;
  }

  const mergedTokenCount = generatedIds.filter((id) => id >= 260).length;
  const bytes = analyzeGeneration(idToToken, generatedIds);

  return {
    prompt,
    language,
    continuation,
    generatedIds: [...generatedIds],
    tokenCount: generatedIds.length,
    empty: continuation.length === 0,
    replacementCharCount,
    validUtf8: replacementCharCount === 0,
    cjkCharCount,
    hasCjk: cjkCharCount > 0,
    repeatedCollapse: detectRepeatedCollapse(continuation),
    usesMergedTokens: mergedTokenCount > 0,
    mergedTokenCount,
    validUtf8Tolerant: bytes.tolerantValid,
    tokensToFirstInvalid: bytes.tokensToFirstInvalid,
    trailingIncomplete: bytes.trailingIncomplete,
    charIntegrityRate: charIntegrityRate(bytes),
    charIntegrityNumerator: bytes.charIntegrityNumerator,
    charIntegrityDenominator: bytes.charIntegrityDenominator,
  };
}

/** Aggregate per-language metrics. */
function aggregateByLanguage(
  samples: GenerationSampleMetrics[]
): Record<LanguageClass, LanguageAggregate> {
  return aggregateGenerationSamples(samples);
}

/**
 * Aggregate per-language metrics from a flat sample list.
 *
 * Exported so the aggregation contract (pooled counts, not a mean of
 * ratios) is independently testable — see Phase 95 §4.3.
 *
 * Historical fields keep their exact previous computation, including the
 * `group.length || 1` denominator idiom, so historical results stay
 * comparable. The repaired diagnostics are pooled: `charIntegrityRate` is
 * Σnumerator / Σdenominator across the class's prompts, which is the fix
 * for "one or two examples per class produce all-or-nothing aggregate
 * behaviour". The per-prompt minimum is reported alongside so the worst
 * prompt stays visible.
 */
export function aggregateGenerationSamples(
  samples: GenerationSampleMetrics[]
): Record<LanguageClass, LanguageAggregate> {
  const make = (language: LanguageClass): LanguageAggregate => {
    const group = samples.filter((s) => s.language === language);
    const n = group.length || 1;
    const ratio = (count: number) => count / n;

    const numerator = group.reduce((a, s) => a + s.charIntegrityNumerator, 0);
    const denominator = group.reduce((a, s) => a + s.charIntegrityDenominator, 0);

    // Samples that actually carry an irrecoverable error. `-1` means "none",
    // so it must never enter a min/mean: `tokensToFirstInvalidMin` is the
    // EARLIEST error in the class (smaller is worse) and
    // `tokensToFirstInvalidMean` is the mean position of real errors.
    const invalid = group
      .map((s) => s.tokensToFirstInvalid)
      .filter((t) => t !== -1);

    return {
      language,
      sampleCount: group.length,
      nonEmptyRatio: ratio(group.filter((s) => !s.empty).length),
      validUtf8Ratio: ratio(group.filter((s) => s.validUtf8).length),
      cjkRatio: ratio(group.filter((s) => s.hasCjk).length),
      collapsedRatio: ratio(group.filter((s) => s.repeatedCollapse).length),
      mergedTokenRatio: ratio(group.filter((s) => s.usesMergedTokens).length),
      validUtf8TolerantRatio: ratio(group.filter((s) => s.validUtf8Tolerant).length),
      strictValidUtf8Ratio: ratio(group.filter((s) => s.validUtf8).length),
      charIntegrityRate: denominator > 0 ? numerator / denominator : 0,
      charIntegrityRateMin: group.length
        ? Math.min(...group.map((s) => s.charIntegrityRate))
        : 0,
      charIntegrityNumerator: numerator,
      charIntegrityDenominator: denominator,
      tokensToFirstInvalidMin: invalid.length ? Math.min(...invalid) : -1,
      tokensToFirstInvalidMean:
        invalid.length > 0
          ? invalid.reduce((a, t) => a + t, 0) / invalid.length
          : -1,
      invalidSampleCount: invalid.length,
      trailingIncompleteCount: group.filter((s) => s.trailingIncomplete).length,
    };
  };
  return { zh: make("zh"), en: make("en"), mixed: make("mixed") };
}

// ============================================================
// Sampling + detection helpers
// ============================================================

/** Sample a token from logits with temperature (top-k/top-p omitted for the fixed eval). */
function sampleToken(
  logits: number[],
  random: () => number,
  temperature: number
): number {
  if (temperature === 0) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxVal) {
        maxVal = logits[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  const scaled = logits.map((l) => l / Math.max(temperature, 1e-8));
  const maxL = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - maxL));
  const sum = exps.reduce((s, v) => s + v, 0);
  const r = random() * sum;
  let cum = 0;
  for (let i = 0; i < exps.length; i++) {
    cum += exps[i];
    if (r < cum) return i;
  }
  return exps.length - 1;
}

/** Whether a character is in the CJK Unified Ideographs block. */
function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9fff;
}

/**
 * Detect repetition collapse: a short, low-diversity continuation is
 * dominated by a single repeated character.
 */
function detectRepeatedCollapse(text: string): boolean {
  if (text.length < 6) return false;
  const counts = new Map<string, number>();
  for (const ch of text) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let maxCount = 0;
  for (const c of counts.values()) {
    if (c > maxCount) maxCount = c;
  }
  return maxCount / text.length > 0.6;
}

/** Mulberry32 seeded RNG (deterministic, mirrors GenerationEvaluator). */
function createSeededRNG(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return () => {
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    state = state + 0x6d2b79f5 | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
