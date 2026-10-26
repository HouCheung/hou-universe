// ============================================================
// Phase 95 — Generation Evaluation Instrument Repair (contract suite)
// ============================================================
// Verifies the Phase 95 repair of the UTF-8 measurement used by the
// Level-4 capability gate.
//
//   STATIC contracts (pure functions, no model, deterministic):
//   1. scanUtf8 on crafted byte vectors — every case the repair must
//      distinguish: complete sequences, trailing incomplete sequences of
//      1/2/3 bytes, interior malformed bytes, bare continuation bytes,
//      illegal lead bytes, empty input
//   2. tolerant ⊇ strict — the repaired judge is a relaxation of the
//      historical judge and never the reverse
//   3. tolerant REJECTS an out-of-range token id (Phase 95 defect D4) —
//      decode()'s fallback emits well-formed U+FFFD bytes, so a byte-level
//      tail rule alone would silently forgive an invalid id
//   4. a trailing-incomplete-only window is tolerated; an interior-error
//      window is not
//   5. tokensToFirstInvalid — sentinel -1, index 0, interior index, and
//      "clean but cut" (== -1 together with trailingIncomplete)
//   6. charIntegrityRate — numerator/denominator arithmetic, empty
//      denominator, pooled aggregation (NOT mean-of-ratios)
//   7. determinism + no stochastic timing/RNG in the metric code
//
//   ORACLE contract (the Phase 95 spec §5 acceptance gate):
//   8. A1–A4: the tolerant judge reaches EXACTLY 100% on the oracle for
//      ASCII, CJK and mixed; A5: the strict judge stays materially below
//      (bound, not an equality); A6: tolerant ⊇ strict on every window
//      and the strict verdict equals the production decoder's
//
//   ARTIFACT contracts (skip-with-report if absent — never fabricated):
//   9. the Phase 95 re-evaluation artifact exists and its reload
//      acceptance values reproduce
//  10. the recomputed strict validUtf8Ratio equals the recorded Phase 94
//      historical value (the determinism gate: the repair must not change
//      strict semantics)
//  11. Level-4 still demands valid UTF-8, and no numeric Level-4
//      threshold was invented for the new diagnostics
//
// This suite makes NO claim that any A/B/C verdict changed. That is the
// report's job, driven by the measured numbers.
//
// Existing Phase 57–94 suites are NOT modified or weakened.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { Random } from "../../core/random/Random";
import { loadProductionDataset, getDatasetTexts } from "../../data/datasetLoader";
import {
  analyzeGeneration,
  charIntegrityRate,
  scanUtf8,
  tokenBytesOf,
  type IdToTokenMap,
} from "../capability-eval/utf8";
import { deriveCapabilityLevel } from "../capability-eval";
import {
  LEVEL4_DIAGNOSTIC_FIELDS,
  LEVEL4_GATE_CONDITIONS,
} from "../capability-eval/levels";
import { aggregateGenerationSamples } from "../capability-eval/evaluate";
import type { GenerationSampleMetrics } from "../capability-eval/evaluate";

// ============================================================
// Test infrastructure (existing hand-written harness)
// ============================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`  ~ SKIP: ${name} — ${reason}`);
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function assertClose(actual: number, expected: number, tol: number, msg: string): void {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(
      `Assertion failed: ${msg}\n  Expected: ${expected} ± ${tol}\n  Actual:   ${actual}`
    );
  }
}

// ============================================================
// Constants — the production evaluation recipe
// ============================================================

const SEED = 42;
const VOCAB_TARGET = 300;
const MAX_TOKENS = 24;

const CAPABILITY_DIR = path.join(__dirname, "..", "capability-eval");
const P95_DIR = path.join(__dirname, "../../../../../experiments/phase95");
const PROBE_RESULTS_PATH = path.join(P95_DIR, "probe-results.json");

// ============================================================
// Crafted-vector helpers
// ============================================================

/**
 * An id→token map containing NO entries. Byte tokens still work, because
 * `tokenBytesOf` reproduces `decode`'s own rule: an id in [4, 260) is the
 * single byte `id - 4`. So `bytesToIds` below builds any byte stream using
 * the production byte-token mapping, with no tokenizer needed.
 */
const NO_VOCAB: IdToTokenMap = new Map<number, string>();

/** Byte token id for a raw byte value: `id = 4 + byteValue` (BPETokenizer.ts:269). */
function idOfByte(b: number): number {
  return 4 + b;
}

function bytesToIds(bytes: number[]): number[] {
  return bytes.map(idOfByte);
}

/**
 * A map with MERGED (multi-byte) tokens only — used to prove that a token
 * spanning several bytes maps to a single token index.
 *   700 = 方 (E6 96 B9)   — a well-formed 3-byte character in ONE token
 *   701 = 太 (E5 A4 AA)   — a well-formed 3-byte character in ONE token
 *   702 = E6 96 41       — a MALFORMED merged token (short sequence):
 *                          zero-width cases like this are only reachable
 *                          through a corrupted vocabulary, which is exactly
 *                          why the scanner must not assume a token is
 *                          internally well-formed
 */
const MERGED_ONLY: IdToTokenMap = new Map<number, string>([
  [700, "\xe6\x96\xb9"],
  [701, "\xe5\xa4\xaa"],
  [702, "\xe6\x96\x41"],
]);

/** U+FFFD count in a decoded string (the historical strict semantics). */
function countReplacement(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === "�") n++;
  return n;
}

// ============================================================
// Runtime context (tokenizer + corpus), built once
// ============================================================

interface Context {
  tokenizer: BPETokenizer;
  corpus: string[];
  idToToken: IdToTokenMap;
}

let cachedContext: Context | null = null;

function getContext(): Context {
  if (cachedContext) return cachedContext;
  const dataset = loadProductionDataset();
  const corpus = getDatasetTexts(dataset);
  Random.setSeed(SEED);
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, VOCAB_TARGET);
  assertEqual(tokenizer.vocabSize, VOCAB_TARGET, "production tokenizer vocabulary size");
  cachedContext = {
    tokenizer,
    corpus,
    idToToken: tokenizer.getVocabulary().idToToken,
  };
  return cachedContext;
}

/** Gate language classes, assigned from document content (Phase 95 audit method). */
function docClass(text: string): "en" | "zh" | "mixed" {
  let cjk = false;
  let latin = false;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x4e00 && c <= 0x9fff) cjk = true;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin = true;
  }
  if (cjk && latin) return "mixed";
  if (cjk) return "zh";
  return "en";
}

// ============================================================
// 1. scanUtf8 on crafted vectors
// ============================================================

function testScannerCraftedVectors(): void {
  test("1. scanUtf8: complete / trailing-incomplete / interior-error / illegal-lead / empty", () => {
    const scan = (bytes: number[]) => scanUtf8(Uint8Array.from(bytes));
    const clean = { firstInvalidByte: -1, incompleteTailAt: -1 };

    // --- complete, valid streams ---
    assertEqual(JSON.stringify(scan([])), JSON.stringify(clean), "empty input is valid");
    assertEqual(JSON.stringify(scan([0x41, 0x42])), JSON.stringify(clean), "ASCII is valid");
    assertEqual(
      JSON.stringify(scan([0xe6, 0x96, 0xb9])),
      JSON.stringify(clean),
      "complete 3-byte CJK (方) is valid"
    );
    assertEqual(
      JSON.stringify(scan([0xf0, 0x9f, 0x98, 0x80])),
      JSON.stringify(clean),
      "complete 4-byte sequence (emoji) is valid"
    );
    assertEqual(
      JSON.stringify(scan([0x41, 0xe6, 0x96, 0xb9, 0x42])),
      JSON.stringify(clean),
      "CJK between ASCII is valid"
    );
    // --- trailing incomplete: 1, 2 and 3 continuation bytes missing ---
    assertEqual(scan([0xe6]).incompleteTailAt, 0, "E6 alone starts an unfinished sequence");
    assertEqual(scan([0xe6]).firstInvalidByte, -1, "E6 alone is not an irrecoverable error");
    assertEqual(scan([0xe6, 0x96]).incompleteTailAt, 0, "E6 96 is unfinished (2-byte lead)");
    assertEqual(scan([0xf0, 0x9f, 0x98]).incompleteTailAt, 0, "F0 9F 98 is unfinished");
    assertEqual(scan([0x41, 0xe6, 0x96]).incompleteTailAt, 1, "tail offset is after the ASCII");
    assertEqual(scan([0x41, 0xe6]).firstInvalidByte, -1, "ASCII + unfinished tail: no error");
    // --- interior malformed bytes are NEVER forgiven ---
    assertEqual(scan([0xe6, 0x41]).firstInvalidByte, 1, "lead byte followed by ASCII is an error");
    assertEqual(scan([0xe6, 0x96, 0x41]).firstInvalidByte, 2, "short sequence (0x41 not continuation)");
    assertEqual(scan([0x41, 0xff, 0x42]).firstInvalidByte, 1, "0xFF inside a stream is an error");
    // --- bare continuation byte / illegal lead bytes ---
    for (const illegal of [0x80, 0x9f, 0xbf, 0xc0, 0xc1, 0xf5, 0xff]) {
      assertEqual(
        scan([illegal]).firstInvalidByte,
        0,
        `illegal lead byte 0x${illegal.toString(16)} is an irrecoverable error at offset 0`
      );
      assertEqual(
        scan([illegal]).incompleteTailAt,
        -1,
        `illegal lead byte 0x${illegal.toString(16)} is not an incomplete sequence`
      );
    }
    assertEqual(scan([0x41, 0x80]).firstInvalidByte, 1, "bare continuation after ASCII");
    // --- the "unfinished forever" exploit fails ---
    assertEqual(
      scan([0xe6, 0xe6, 0xe6]).firstInvalidByte,
      1,
      "a run of lead bytes fails at offset 1 (at most ONE tail is tolerated)"
    );
    assertEqual(
      scan([0x80, 0x80]).firstInvalidByte,
      0,
      "a run of bare continuation bytes fails at offset 0"
    );
  });
}

// ============================================================
// 2 + 3. Relaxation direction and the D4 out-of-range guard
// ============================================================

function testTolerantIsARelaxation(): void {
  test("2. tolerant ⊇ strict on crafted vectors (never the reverse)", () => {
    const vectors: number[][] = [
      [],
      [0x41],
      [0xe6, 0x96, 0xb9],
      [0xe6],
      [0xe6, 0x96],
      [0x41, 0xe6],
      [0xf0, 0x9f, 0x98],
      [0x41, 0x42, 0x43],
    ];
    for (const bytes of vectors) {
      const a = analyzeGeneration(NO_VOCAB, bytesToIds(bytes));
      assert(
        !a.strictValid || a.tolerantValid,
        `strict ⇒ tolerant for [${bytes.map((b) => b.toString(16)).join(" ")}]`
      );
    }
    // The relaxation is strict: a pure tail cut is strict-invalid but tolerant-valid.
    const cut = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0xe6, 0x96]));
    assertEqual(cut.strictValid, false, "a tail cut is invalid under the historical judge");
    assertEqual(cut.tolerantValid, true, "a tail cut is valid under the repaired judge");
  });
}

function testOutOfRangeIdRejected(): void {
  test("3. tolerant REJECTS an out-of-range token id (D4: decode()'s fallback is well-formed UTF-8)", () => {
    // decode()'s fallback for an id that is neither in the vocabulary nor a
    // byte token pushes EF BF BD — a WELL-FORMED sequence that decodes to
    // the character U+FFFD. A byte-level tail rule alone would therefore
    // flip this id from invalid to valid. It must not.
    const unknownId = 9999;
    const a = analyzeGeneration(NO_VOCAB, [...bytesToIds([0x41, 0x42]), unknownId]);
    assertEqual(a.outOfRangeIdCount, 1, "the out-of-range id is counted");
    assertEqual(a.firstInvalidByte, -1, "the fallback bytes are structurally well-formed");
    assertEqual(a.incompleteTailAt, -1, "the fallback bytes are not an incomplete sequence");
    assertEqual(a.tolerantValid, false, "tolerant must reject the out-of-range id");
    assertEqual(a.strictValid, false, "strict already rejected it (U+FFFD present)");

    // The byte stream itself is exactly the fallback: EF BF BD.
    const raw = tokenBytesOf(NO_VOCAB, [unknownId]);
    assertEqual(
      [...raw.bytes].map((b) => b.toString(16)).join(" "),
      "ef bf bd",
      "the fallback contributes the three bytes EF BF BD"
    );

    // And it cannot masquerade on its own: a lone out-of-range id is invalid
    // under both judges even though its bytes scan clean.
    const lone = analyzeGeneration(NO_VOCAB, [unknownId]);
    assertEqual(lone.tolerantValid, false, "a lone out-of-range id is not tolerantly valid");
    assertEqual(scanUtf8(raw.bytes).firstInvalidByte, -1, "its bytes alone scan clean (the trap)");
  });
}

// ============================================================
// 4. Tail tolerated, interior error not
// ============================================================

function testInteriorErrorNeverForgiven(): void {
  test("4. a trailing-incomplete-only window is tolerated; an interior-error window is not", () => {
    const tail = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0x42, 0xe6, 0x96]));
    assertEqual(tail.trailingIncomplete, true, "the tail cut is flagged");
    assertEqual(tail.tolerantValid, true, "a pure tail cut is tolerated");
    assertEqual(tail.tokensToFirstInvalid, -1, "a tail cut is not an irrecoverable error");

    const interior = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0xff, 0x42, 0xe6]));
    assertEqual(interior.trailingIncomplete, false, "no tail is claimed when an interior error exists");
    assertEqual(interior.tolerantValid, false, "an interior malformed byte is never forgiven");
    assertEqual(interior.firstInvalidByte, 1, "the interior error is located");

    // A cut CANNOT be used to hide an interior error before it.
    const both = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0xe6, 0x41, 0xe6]));
    assertEqual(both.tolerantValid, false, "an error before the cut still fails");
  });
}

// ============================================================
// 5. tokensToFirstInvalid
// ============================================================

function testTokensToFirstInvalid(): void {
  test("5. tokensToFirstInvalid: sentinel -1, index 0, interior index, clean-but-cut", () => {
    // Multi-byte MERGED tokens, so a token index is not the same as a byte offset.
    // bytes: 41 | E6 96 B9 (方) | E5 A4 AA (太)
    const clean = analyzeGeneration(MERGED_ONLY, [idOfByte(0x41), 700, 701]);
    assertEqual(clean.tokensToFirstInvalid, -1, "clean stream → sentinel -1");
    assertEqual(clean.trailingIncomplete, false, "clean stream is not cut");

    // Invalid in the FIRST token: a bare continuation byte at offset 0.
    const atZero = analyzeGeneration(NO_VOCAB, bytesToIds([0x80, 0x41]));
    assertEqual(atZero.tokensToFirstInvalid, 0, "invalid at token 0 → 0");

    // Invalid in the MIDDLE: 41 | E6 96 B9 | 80 → the bad byte is in token 2.
    const middle = analyzeGeneration(MERGED_ONLY, [idOfByte(0x41), 700, idOfByte(0x80)]);
    assertEqual(middle.firstInvalidByte, 4, "the bad byte is the 5th byte");
    assertEqual(middle.tokensToFirstInvalid, 2, "containing token index is 2");
    assertEqual(middle.tolerantValid, false, "an interior error is not tolerated");

    // Invalid INSIDE a multi-byte merged token: token 702 is the bytes
    // E6 96 41, so the bad byte is inside token 0 — the scanner must locate
    // it there rather than at a token boundary.
    const insideMerged = analyzeGeneration(MERGED_ONLY, [702, idOfByte(0x42)]);
    assertEqual(insideMerged.firstInvalidByte, 2, "the bad byte is inside token 0");
    assertEqual(insideMerged.tokensToFirstInvalid, 0, "error inside token 0 → 0");
    assertEqual(insideMerged.tolerantValid, false, "a short merged sequence is an error");

    // Clean but CUT: the sentinel stays -1 and the cut is reported separately.
    const cut = analyzeGeneration(MERGED_ONLY, [700, idOfByte(0xe5)]);
    assertEqual(cut.tokensToFirstInvalid, -1, "a pure tail cut → sentinel -1");
    assertEqual(cut.trailingIncomplete, true, "the cut is reported separately");

    // The sentinel is the repository's existing "absent" idiom, not a new one.
    assertEqual(-1, -1, "sentinel documented as -1");
  });
}

// ============================================================
// 6. charIntegrityRate + pooling
// ============================================================

function testCharIntegrity(): void {
  test("6. charIntegrityRate: arithmetic, empty denominator, tail exclusion", () => {
    // All valid.
    const allValid = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0x42, 0x43]));
    assertEqual(allValid.charIntegrityNumerator, 3, "3 valid characters");
    assertEqual(allValid.charIntegrityDenominator, 3, "denominator 3");
    assertEqual(charIntegrityRate(allValid), 1, "integrity 1");

    // One interior invalid byte → one U+FFFD character → 2 / 3.
    const oneBad = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0xff, 0x42]));
    assertEqual(oneBad.charIntegrityNumerator, 2, "2 valid characters");
    assertEqual(oneBad.charIntegrityDenominator, 3, "denominator includes the U+FFFD");
    assertClose(charIntegrityRate(oneBad), 2 / 3, 1e-12, "integrity 2/3");

    // Trailing incomplete → the cut character is EXCLUDED from both, so 1/1.
    const cut = analyzeGeneration(NO_VOCAB, bytesToIds([0x41, 0xe6, 0x96]));
    assertEqual(cut.charIntegrityNumerator, 1, "the cut character is not counted as valid");
    assertEqual(cut.charIntegrityDenominator, 1, "the cut character is not counted as invalid either");
    assertEqual(charIntegrityRate(cut), 1, "a pure tail cut does not reduce integrity");

    // Empty stream → denominator 0 → ratio 0, counts carried alongside.
    const empty = analyzeGeneration(NO_VOCAB, []);
    assertEqual(empty.charIntegrityDenominator, 0, "empty denominator is 0");
    assertEqual(empty.charIntegrityNumerator, 0, "empty numerator is 0");
    assertEqual(charIntegrityRate(empty), 0, "empty denominator → ratio 0");
  });

  test("6b. aggregation pools COUNTS across prompts, it is not a mean of ratios", () => {
    const mk = (
      language: "zh" | "en" | "mixed",
      numerator: number,
      denominator: number
    ): GenerationSampleMetrics => ({
      prompt: "p",
      language,
      continuation: "",
      generatedIds: [4],
      tokenCount: 1,
      empty: false,
      replacementCharCount: denominator - numerator,
      validUtf8: false,
      cjkCharCount: 0,
      hasCjk: false,
      repeatedCollapse: false,
      usesMergedTokens: false,
      mergedTokenCount: 0,
      validUtf8Tolerant: false,
      tokensToFirstInvalid: -1,
      trailingIncomplete: false,
      charIntegrityRate: denominator > 0 ? numerator / denominator : 0,
      charIntegrityNumerator: numerator,
      charIntegrityDenominator: denominator,
    });

    // 9/10 = 0.9 and 1/1 = 1.0 → mean-of-ratios 0.95, pooled 10/11 = 0.909090...
    const agg = aggregateGenerationSamples([mk("zh", 9, 10), mk("zh", 1, 1)]).zh;
    assertEqual(agg.charIntegrityNumerator, 10, "pooled numerator");
    assertEqual(agg.charIntegrityDenominator, 11, "pooled denominator");
    assertClose(agg.charIntegrityRate, 10 / 11, 1e-12, "pooled ratio = sum(num)/sum(den)");
    assertClose(
      (9 / 10 + 1 / 1) / 2,
      0.95,
      1e-12,
      "the mean-of-ratios alternative is 0.95"
    );
    assert(
      Math.abs(agg.charIntegrityRate - 0.95) > 1e-6,
      "pooled ratio differs from mean-of-ratios (the whole point of pooling)"
    );
    assertClose(agg.charIntegrityRateMin, 0.9, 1e-12, "the per-prompt minimum keeps the worst prompt visible");
  });
}

// ============================================================
// 7. Determinism + no fabricated metrics
// ============================================================

function testDeterminismAndNoStochasticity(): void {
  test("7. identical ids → identical metrics; no Math.random / Date / setTimeout in the metric code", () => {
    const ids = [...bytesToIds([0x41, 0xe6, 0x96, 0xb9]), 700, idOfByte(0xff)];
    const a = analyzeGeneration(MERGED_ONLY, ids);
    const b = analyzeGeneration(MERGED_ONLY, ids);
    assertEqual(JSON.stringify(a), JSON.stringify(b), "two analyses of identical ids agree");

    for (const file of ["utf8.ts", "evaluate.ts"]) {
      const src = fs.readFileSync(path.join(CAPABILITY_DIR, file), "utf8");
      assert(!src.includes("Math.random("), `${file} contains no Math.random`);
      assert(!src.includes("Date.now("), `${file} contains no Date.now`);
      assert(!src.includes("setTimeout("), `${file} contains no setTimeout`);
    }
  });
}

// ============================================================
// 8. Oracle acceptance test — the Phase 95 spec §5 gate
// ============================================================

interface OracleWindow {
  language: "zh" | "en" | "mixed";
  strictValid: boolean;
  tolerantValid: boolean;
  decoderStrictValid: boolean;
  /** The ONLY defect a perfect generator may exhibit: the horizon cut the last character. */
  trailingIncomplete: boolean;
  /** A genuinely malformed stream — a perfect generator must never produce one. */
  interiorInvalid: boolean;
}

/**
 * The Phase 95 oracle: a model-free PERFECT generator. Real corpus text,
 * encoded with the production tokenizer, sliced into exactly MAX_TOKENS
 * (24) token windows. A window's byte stream is byte-for-byte what a
 * perfect model emits, cut at the evaluator's horizon.
 *
 * Only windows that OPEN on a character boundary are kept — those are the
 * ones a character-aligned prompt can actually produce, so they are the
 * gate-relevant population.
 */
function buildOracleWindows(): OracleWindow[] {
  const { tokenizer, corpus, idToToken } = getContext();
  const windows: OracleWindow[] = [];

  for (const text of corpus) {
    const ids = tokenizer.encode(text);
    if (ids.length < MAX_TOKENS) continue;
    const language = docClass(text);
    for (let start = 0; start + MAX_TOKENS <= ids.length; start++) {
      const win = ids.slice(start, start + MAX_TOKENS);
      const { bytes } = tokenBytesOf(idToToken, win);
      // Opens mid-character → unreachable from a character-aligned prompt.
      if (bytes.length > 0 && (bytes[0] & 0xc0) === 0x80) continue;

      const analysis = analyzeGeneration(idToToken, win);
      windows.push({
        language,
        strictValid: analysis.strictValid,
        tolerantValid: analysis.tolerantValid,
        // Independent cross-check against the PRODUCTION decoder.
        decoderStrictValid: countReplacement(tokenizer.decode(win)) === 0,
        trailingIncomplete: analysis.trailingIncomplete,
        interiorInvalid: analysis.firstInvalidByte !== -1,
      });
    }
  }
  return windows;
}

function testOracleAcceptance(): void {
  test("8. oracle A1–A7: tolerant validity is EXACTLY 100% for ascii, cjk and mixed, and the tolerated fraction is the horizon cut alone", () => {
    const windows = buildOracleWindows();
    assert(windows.length > 1000, `oracle has a meaningful population (got ${windows.length})`);

    const classes = ["en", "zh", "mixed"] as const;
    const pStrict: Record<string, number> = {};
    const pTolerant: Record<string, number> = {};
    let decoderDisagreements = 0;
    let strictNotSubsetOfTolerant = 0;

    for (const cls of classes) {
      const group = windows.filter((w) => w.language === cls);
      assert(group.length > 0, `oracle covers class ${cls}`);
      pStrict[cls] = group.filter((w) => w.strictValid).length / group.length;
      pTolerant[cls] = group.filter((w) => w.tolerantValid).length / group.length;
    }
    for (const w of windows) {
      if (w.strictValid !== w.decoderStrictValid) decoderDisagreements++;
      if (w.strictValid && !w.tolerantValid) strictNotSubsetOfTolerant++;
    }

    const gateStrict = pStrict.zh ** 2 * pStrict.en ** 2 * pStrict.mixed;
    const gateTolerant = pTolerant.zh ** 2 * pTolerant.en ** 2 * pTolerant.mixed;
    const pct = (x: number) => `${(100 * x).toFixed(3)}%`;

    console.log(
      `      oracle: ${windows.length} char-aligned windows | strict P_gate ${pct(gateStrict)} | ` +
        `tolerant P_gate ${pct(gateTolerant)}`
    );
    console.log(
      `      per class — en ${pct(pStrict.en)} → ${pct(pTolerant.en)} | ` +
        `zh ${pct(pStrict.zh)} → ${pct(pTolerant.zh)} | ` +
        `mixed ${pct(pStrict.mixed)} → ${pct(pTolerant.mixed)}`
    );

    // A6 — faithful to the production decoder, and never stricter than strict.
    assertEqual(decoderDisagreements, 0, "strict verdict matches the production decoder on every window");
    assertEqual(strictNotSubsetOfTolerant, 0, "tolerant ⊇ strict on every window");

    // A7 — the relaxed fraction is EXACTLY the horizon artifact, and nothing
    // else. A perfect generator receives valid UTF-8 corpus text, so the only
    // conceivable defect is the 24-token cut landing mid-character. If even one
    // window were strictly invalid for an INTERIOR reason, the strict gate would
    // be reporting something a perfect generator genuinely got wrong — and the
    // claim "the gate was measuring the horizon, not capability" would be false.
    const strictlyInvalid = windows.filter((w) => !w.strictValid);
    const interiorInvalid = windows.filter((w) => w.interiorInvalid);
    const cutOnly = strictlyInvalid.filter((w) => w.trailingIncomplete).length;

    assertEqual(
      interiorInvalid.length,
      0,
      `A7: no oracle window is malformed for an interior reason (got ${interiorInvalid.length})`
    );
    assertEqual(
      cutOnly,
      strictlyInvalid.length,
      `A7: every strictly-invalid oracle window is a trailing cut (${cutOnly}/${strictlyInvalid.length})`
    );
    console.log(
      `      tolerated fraction — ${cutOnly} / ${windows.length} windows ` +
        `(${pct(cutOnly / windows.length)}) rejected SOLELY by the horizon cut; ` +
        `0 interior defects`
    );

    // A5 — a BOUND, deliberately not an equality, so this is not a brittle
    // restatement of one measurement.
    assert(gateStrict < 0.15, `strict oracle ceiling is materially below 1 (got ${pct(gateStrict)})`);

    // A1–A4 — the acceptance condition. NOT to be lowered, NOT to be
    // special-cased, NOT satisfied by hardcoding.
    assertEqual(pTolerant.en, 1, `A1: tolerant p_en === 1 exactly (got ${pct(pTolerant.en)})`);
    assertEqual(pTolerant.zh, 1, `A2: tolerant p_zh === 1 exactly (got ${pct(pTolerant.zh)})`);
    assertEqual(pTolerant.mixed, 1, `A3: tolerant p_mixed === 1 exactly (got ${pct(pTolerant.mixed)})`);
    assertEqual(gateTolerant, 1, `A4: tolerant P_gate === 1 exactly (got ${pct(gateTolerant)})`);
  });
}

// ============================================================
// Level-4 separation contracts (guards §10 of the brief)
// ============================================================

function testLevel4GateSeparation(): void {
  test("11. Level-4 still demands valid UTF-8; gate conditions and diagnostics are disjoint", () => {
    const report = deriveCapabilityLevel({
      pipelineRuns: true,
      tokenizerRoundTrip: true,
      lossDecreases: true,
      paramsChange: true,
      memorizationSignal: true,
      coherentGeneration: false,
      qaCapability: false,
    });
    const level4 = report.levels.find((l) => l.level === 4)!;
    assert(level4.criterion.includes("valid UTF-8"), "Level 4 criterion still names valid UTF-8");

    // Exactly three gate conditions. Each is an EXACT equality to 0 or 1 —
    // never a tuned bar. A condition like "charIntegrityRate >= 0.9" would
    // be an invented Level-4 threshold, which Phase 95 forbids.
    assertEqual(LEVEL4_GATE_CONDITIONS.length, 3, "exactly three Level-4 gate conditions");
    for (const cond of LEVEL4_GATE_CONDITIONS) {
      assert(
        /^[A-Za-z][A-Za-z0-9]* === [01]$/.test(cond),
        `gate condition "${cond}" is an exact equality to 0 or 1 (no invented bar)`
      );
    }
    assertEqual(
      LEVEL4_GATE_CONDITIONS.filter((c) => c.startsWith("validUtf8")).length,
      1,
      "exactly one UTF-8 gate condition (no leftover strict duplicate)"
    );
    // The new diagnostics are REPORTED, never gates.
    for (const field of [
      "charIntegrityRate",
      "tokensToFirstInvalidMin",
      "tokensToFirstInvalidMean",
      "strictValidUtf8Ratio",
    ]) {
      assert(
        (LEVEL4_DIAGNOSTIC_FIELDS as readonly string[]).includes(field),
        `${field} is classified as a diagnostic`
      );
      for (const cond of LEVEL4_GATE_CONDITIONS) {
        assert(!cond.includes(field), `${field} is not a gate condition`);
      }
    }
  });

  test("11b. D3 regression guard: a genuine isolated continuation byte stays INVALID", () => {
    // Phase 95 REFUTED D3 as an evaluator defect: all five real prompts
    // encode to streams ending on a character boundary, so an orphan
    // continuation byte in generatedIds[0] is a genuine model error and the
    // isolated decode reports it correctly. It must never be forgiven.
    const orphan = analyzeGeneration(NO_VOCAB, bytesToIds([0x80, 0x41, 0x42]));
    assertEqual(orphan.tolerantValid, false, "a leading orphan continuation byte is invalid");
    assertEqual(orphan.tokensToFirstInvalid, 0, "and it is located at token 0");
    assertEqual(orphan.strictValid, false, "strict agrees");
  });
}

// ============================================================
// ARTIFACT contracts (9–10) — skip-with-report when absent
// ============================================================

function testReloadAcceptance(): void {
  const name = "9/10. Phase 95 re-evaluation artifact: reload acceptance + strict determinism";
  if (!fs.existsSync(PROBE_RESULTS_PATH)) {
    skip(name, `probe-results.json not present at ${PROBE_RESULTS_PATH}`);
    return;
  }
  test(name, () => {
    const probe = JSON.parse(fs.readFileSync(PROBE_RESULTS_PATH, "utf8")) as {
      phase: string;
      candidates: Record<
        string,
        {
          historical: { validUtf8Ratio: Record<string, number>; alignedTop1: number; alignedTokens: number };
          repaired: { validUtf8TolerantRatio: Record<string, number> };
          reload: { matches: boolean };
        }
      >;
    };
    assertEqual(probe.phase, "phase95", "artifact phase id");
    for (const key of ["A", "B", "C"] as const) {
      const c = probe.candidates[key];
      if (!c) {
        skip(`${name} — cell ${key}`, "cell absent from the artifact");
        continue;
      }
      assert(c.reload.matches, `${key}: checkpoint reload reproduced the recorded Phase 94 values`);
      for (const lang of ["zh", "en", "mixed"] as const) {
        const strict = c.historical.validUtf8Ratio[lang];
        const tolerant = c.repaired.validUtf8TolerantRatio[lang];
        assert(strict >= 0 && strict <= 1, `${key}/${lang}: historical strict ratio in [0,1]`);
        assert(tolerant >= 0 && tolerant <= 1, `${key}/${lang}: tolerant ratio in [0,1]`);
        assert(tolerant >= strict, `${key}/${lang}: tolerant ⊇ strict`);
      }
    }
  });
}

// ============================================================
// Entry points
// ============================================================

export function runPhase95StaticTests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\n  -- Phase 95: Generation Evaluation Instrument Repair (static + oracle) --");

  testScannerCraftedVectors();
  testTolerantIsARelaxation();
  testOutOfRangeIdRejected();
  testInteriorErrorNeverForgiven();
  testTokensToFirstInvalid();
  testCharIntegrity();
  testDeterminismAndNoStochasticity();
  testOracleAcceptance();
  testLevel4GateSeparation();

  console.log(`  Phase 95 (static): ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}

export function runPhase95Tests(): { passed: number; failed: number; skipped: number } {
  const staticResult = runPhase95StaticTests();

  passed = 0;
  failed = 0;
  skipped = 0;
  console.log("\n  -- Phase 95: instrument repair (artifact contracts) --");
  testReloadAcceptance();
  console.log(`  Phase 95 (artifact): ${passed} passed, ${failed} failed, ${skipped} skipped`);

  return {
    passed: staticResult.passed + passed,
    failed: staticResult.failed + failed,
    skipped: staticResult.skipped + skipped,
  };
}
