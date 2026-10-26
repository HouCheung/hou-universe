// ============================================================
// MiniMind — research/capability-eval/utf8.ts
// ============================================================
// Phase 95: repaired UTF-8 measurement for the generation capability
// evaluator.
//
// WHY THIS FILE EXISTS
// --------------------
// The Level-4 gate required `validUtf8Ratio === 1` per language class
// (levels.ts). That ratio counts U+FFFD characters in
// `tokenizer.decode(generatedIds)`. Because the generation horizon is a
// FIXED 24 tokens (evaluate.ts:238) and the tokenizer is byte-level
// (3-byte CJK characters ≈ 3 byte tokens), a PERFECT generator — one
// that emits the true continuation of real corpus text — lands off a
// character boundary roughly two times in three. The strict metric then
// reports U+FFFD for a tail that is not a defect at all.
//
// Measured on the oracle (Phase 95 audit, 5,457 character-aligned
// 24-token windows of real text):
//
//     strict   P(perfect model passes Level 4) = 7.639%
//     tolerant P(perfect model passes Level 4) = 100.000%
//
// The strict metric is therefore *saturated* for zh/mixed: it reports the
// horizon's alignment more than the model's capability. `en` is unaffected
// (ASCII is single-byte, so nothing can be cut).
//
// WHAT THIS FILE PROVIDES
// -----------------------
// ONE byte scanner, used by every repaired metric so that all of them
// describe the same generation from the same bytes:
//
//   scanUtf8(bytes)          — the single shared UTF-8 state machine
//   analyzeGeneration(...)   — strict + tolerant verdicts, the first
//                              irrecoverable token index, and character
//                              integrity, all from one pass
//
// This is a MEASUREMENT repair only. It never constrains generation:
// forcing the model to emit valid UTF-8 would move the reported ratio
// without testing the capability claim (Phase 94 §13.5).
//
// The strict metric is preserved unchanged, under its existing field
// names. Nothing here reinterprets historical results.
// ============================================================

/** Vocabulary lookup used to turn token ids back into their raw bytes. */
export type IdToTokenMap = ReadonlyMap<number, string>;

/** First byte id of the byte-token range: `id = 4 + byteValue` (BPETokenizer.ts:269). */
export const BYTE_TOKEN_MIN_ID = 4;
/** One past the last byte-token id: ids 4..259 are raw bytes 0x00..0xFF. */
export const BYTE_TOKEN_MAX_ID = 260;

/** The result of one UTF-8 structural scan. */
export interface Utf8Scan {
  /**
   * Offset of the first byte that can never be part of a valid UTF-8
   * stream no matter what follows — an irrecoverable error. `-1` if none.
   */
  firstInvalidByte: number;
  /**
   * Offset at which a trailing, structurally well-formed but UNFINISHED
   * multi-byte sequence begins. `-1` if the stream ends on a boundary.
   * At most one such run can exist, because it must end at end-of-input.
   */
  incompleteTailAt: number;
}

/** Everything Phase 95 measures about one generation's bytes. */
export interface GenerationByteAnalysis {
  /** Raw bytes the tokenizer would decode, in order. */
  bytes: Uint8Array;
  /** Count of token ids that are neither in the vocabulary nor byte tokens. */
  outOfRangeIdCount: number;
  /** See {@link Utf8Scan.firstInvalidByte}. */
  firstInvalidByte: number;
  /** See {@link Utf8Scan.incompleteTailAt}. */
  incompleteTailAt: number;
  /** Whether the stream was cut mid-character at the horizon. */
  trailingIncomplete: boolean;
  /** The HISTORICAL strict verdict: `decode(ids)` contains no U+FFFD. */
  strictValid: boolean;
  /** The REPAIRED verdict: no irrecoverable error, no out-of-range id. */
  tolerantValid: boolean;
  /**
   * Token index containing {@link firstInvalidByte}, or `-1` when there is
   * none. `-1` is the repository's established "absent" idiom.
   */
  tokensToFirstInvalid: number;
  /** Non-U+FFFD character count after discarding the tolerated tail. */
  charIntegrityNumerator: number;
  /** Numerator + U+FFFD character count, after discarding the tolerated tail. */
  charIntegrityDenominator: number;
}

// ============================================================
// Byte extraction — mirrors BPETokenizer.decode exactly
// ============================================================

/**
 * Reproduce the byte sequence `BPETokenizer.decode` would collect for
 * `ids`, and separately report any id that is out of range.
 *
 * This mirrors `BPETokenizer.decode`'s own loop (BPETokenizer.ts:262-282)
 * step for step:
 *   1. a vocabulary token contributes its Latin-1 bytes;
 *   2. otherwise an id in `[4, 260)` contributes the single byte `id - 4`;
 *   3. otherwise the fallback contributes the three bytes `EF BF BD`.
 *
 * Step 3 is the D4 trap: `EF BF BD` is a WELL-FORMED UTF-8 sequence, so a
 * byte-level scan alone cannot tell an out-of-range token id apart from a
 * model that legitimately emitted U+FFFD. Step 3 is therefore counted in
 * `outOfRangeIdCount` so the tolerant judge can reject it explicitly.
 *
 * @param idToToken - Vocabulary id→token map (`getVocabulary().idToToken`)
 * @param ids - Generated token ids
 */
export function tokenBytesOf(
  idToToken: IdToTokenMap,
  ids: readonly number[]
): { bytes: Uint8Array; outOfRangeIdCount: number } {
  const bytes: number[] = [];
  let outOfRangeIdCount = 0;

  for (const id of ids) {
    const token = idToToken.get(id);
    if (token !== undefined) {
      for (let i = 0; i < token.length; i++) {
        bytes.push(token.charCodeAt(i) & 0xff);
      }
    } else if (id >= BYTE_TOKEN_MIN_ID && id < BYTE_TOKEN_MAX_ID) {
      bytes.push(id - BYTE_TOKEN_MIN_ID);
    } else {
      bytes.push(0xef, 0xbf, 0xbd);
      outOfRangeIdCount++;
    }
  }

  return { bytes: Uint8Array.from(bytes), outOfRangeIdCount };
}

// ============================================================
// The single shared UTF-8 scanner
// ============================================================

/**
 * Walk a byte stream with a UTF-8 state machine.
 *
 * Valid lead bytes are `0x00-0x7F`, `0xC2-0xDF`, `0xE0-0xEF`, `0xF0-0xF4`;
 * everything else (`0x80-0xC1`, `0xF5-0xFF`) is an illegal lead and is
 * reported as an irrecoverable error at its own offset.
 *
 * Tolerating a trailing unfinished sequence cannot be exploited by
 * "emit unfinished bytes forever": a run of lead bytes (`E6 E6 ...`) fails
 * at offset 1, and a run of bare continuation bytes fails at offset 0.
 * At most one unfinished sequence is ever tolerated, and only because it
 * ends at end-of-input.
 *
 * @param bytes - Raw bytes, in order
 */
export function scanUtf8(bytes: Uint8Array): Utf8Scan {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let need: number;
    if (b < 0x80) need = 0;
    else if (b >= 0xc2 && b <= 0xdf) need = 1;
    else if (b >= 0xe0 && b <= 0xef) need = 2;
    else if (b >= 0xf0 && b <= 0xf4) need = 3;
    else return { firstInvalidByte: i, incompleteTailAt: -1 }; // illegal lead / bare continuation

    for (let k = 1; k <= need; k++) {
      if (i + k >= bytes.length) {
        // Ran out of input while a well-formed sequence was still open:
        // an artifact of where the stream was cut, not a malformed byte.
        return { firstInvalidByte: -1, incompleteTailAt: i };
      }
      const c = bytes[i + k];
      if (c < 0x80 || c > 0xbf) {
        return { firstInvalidByte: i + k, incompleteTailAt: -1 };
      }
    }
    i += need + 1;
  }
  return { firstInvalidByte: -1, incompleteTailAt: -1 };
}

/** Token index whose bytes contain `byteOffset`, or `-1`. */
function tokenIndexOfByte(
  idToToken: IdToTokenMap,
  ids: readonly number[],
  byteOffset: number
): number {
  if (byteOffset < 0) return -1;
  let at = 0;
  for (let t = 0; t < ids.length; t++) {
    const { bytes } = tokenBytesOf(idToToken, [ids[t]]);
    if (byteOffset < at + bytes.length) return t;
    at += bytes.length;
  }
  return -1;
}

// ============================================================
// Character integrity
// ============================================================

/**
 * Decode a byte range with the SAME decoder configuration the production
 * tokenizer uses (`TextDecoder("utf-8", { fatal: false })`,
 * BPETokenizer.ts:281) and count characters.
 *
 * This is not a second tokenizer: it is the identical platform decoder
 * applied to a byte RANGE rather than to the whole stream, which is what
 * "discard the tolerated trailing incomplete sequence" requires. Counting
 * bytes is impossible at this point because the tolerated tail is defined
 * on the byte stream, not on token boundaries.
 */
function countDecodedCharacters(bytes: Uint8Array): { valid: number; replacement: number } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let valid = 0;
  let replacement = 0;
  for (const ch of text) {
    if (ch === "�") replacement++;
    else valid++;
  }
  return { valid, replacement };
}

// ============================================================
// The one entry point
// ============================================================

/**
 * Measure one generation: strict verdict, tolerant verdict, first
 * irrecoverable token index, and character integrity — all from a single
 * byte extraction and a single scan, so every number describes the same
 * generation.
 *
 * Semantics (Phase 95 spec §4):
 * - **tolerant** forgives a trailing unfinished sequence ONLY. Interior
 *   malformed bytes, a leading orphan continuation byte, an illegal lead
 *   byte, and an out-of-range token id are never forgiven.
 * - **tolerant** is deliberately silent about emptiness; emptiness is
 *   carried by the existing `nonEmptyRatio === 1` gate condition, not here.
 * - **charIntegrityRate** = numerator / denominator over the decoded
 *   characters AFTER discarding the tolerated tail, so a horizon cut is
 *   not counted as a defect while interior errors are. `denominator === 0`
 *   yields ratio `0`, the repository's existing empty-denominator idiom
 *   (`probe.ts:928`); the raw counts are returned alongside so an empty
 *   sample stays distinguishable from a zero-integrity one.
 *
 * @param idToToken - Vocabulary id→token map (`getVocabulary().idToToken`)
 * @param ids - The generated token ids (the continuation, prompt excluded)
 */
export function analyzeGeneration(
  idToToken: IdToTokenMap,
  ids: readonly number[]
): GenerationByteAnalysis {
  const { bytes, outOfRangeIdCount } = tokenBytesOf(idToToken, ids);
  const scan = scanUtf8(bytes);

  const firstInvalidByte = scan.firstInvalidByte;
  const incompleteTailAt = scan.incompleteTailAt;
  const trailingIncomplete = incompleteTailAt !== -1;

  // HISTORICAL strict semantics, unchanged: the decoded continuation is
  // free of U+FFFD. Out-of-range ids always contribute U+FFFD through
  // decode()'s fallback, so this agrees with `replacementCharCount === 0`
  // in evaluate.ts without special-casing anything.
  const whole = countDecodedCharacters(bytes);
  const strictValid = whole.replacement === 0;

  // REPAIRED semantics: no irrecoverable structural error, and no id that
  // reached the byte stream through decode()'s fallback (D4).
  const tolerantValid = firstInvalidByte === -1 && outOfRangeIdCount === 0;

  // Integrity is measured on the bytes the tolerant judge accepted: the
  // tolerated trailing incomplete sequence is discarded, nothing else.
  const kept = trailingIncomplete ? bytes.subarray(0, incompleteTailAt) : bytes;
  const { valid, replacement } = countDecodedCharacters(kept);

  return {
    bytes,
    outOfRangeIdCount,
    firstInvalidByte,
    incompleteTailAt,
    trailingIncomplete,
    strictValid,
    tolerantValid,
    tokensToFirstInvalid: tokenIndexOfByte(idToToken, ids, firstInvalidByte),
    charIntegrityNumerator: valid,
    charIntegrityDenominator: valid + replacement,
  };
}

/**
 * Character integrity ratio from a {@link GenerationByteAnalysis}.
 *
 * `denominator === 0` → `0`, per the repository's empty-denominator idiom.
 * This is a DIAGNOSTIC. Phase 95 defines no Level-4 threshold for it; no
 * numeric bar may be invented here.
 */
export function charIntegrityRate(analysis: GenerationByteAnalysis): number {
  return analysis.charIntegrityDenominator > 0
    ? analysis.charIntegrityNumerator / analysis.charIntegrityDenominator
    : 0;
}
