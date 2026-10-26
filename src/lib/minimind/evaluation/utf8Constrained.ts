// ============================================================
// utf8Constrained — P012 UTF-8 legality at the sampling boundary
// ============================================================
// Production port of the Phase-102 P012-MASK predicate.
//
// The predicate is intentionally narrow:
//   - A token is legal iff appending ALL of its raw bytes to the current
//     byte phase leaves the stream structurally valid UTF-8.
//   - The mask is active at EVERY phase, including a character boundary
//     (P0), where it excludes bare continuation bytes, overlong leads and
//     out-of-range leads.
//   - The four control tokens are never user-visible. <eos> is allowed only
//     at a character boundary so that termination can never cut a
//     multi-byte character in half.
//
// This module reuses the repository's byte extraction (`tokenBytesOf`) and
// scanner (`scanUtf8`) so the mask and the measurement describe the same
// bytes. It does NOT import the Phase 98/101/102 experiment chains.
// ============================================================

import {
  tokenBytesOf,
  scanUtf8,
  type IdToTokenMap,
} from "../research/capability-eval/utf8";

// ============================================================
// Types
// ============================================================

/** Byte-phase state of the generated stream. */
export interface Utf8StreamState {
  /** Continuation bytes still required to complete the open character. */
  need: number;
  /** false once an irrecoverable byte sequence has been emitted. */
  recoverable: boolean;
}

/** A character boundary (P0). */
export const BOUNDARY_STATE: Utf8StreamState = {
  need: 0,
  recoverable: true,
};

/** The legal-candidate set for one sampling step. */
export interface LegalCandidateMask {
  allowed: boolean[];
  legalCount: number;
  empty: boolean;
}

/** Result of appending raw bytes to a stream state. */
export interface AppendResult {
  state: Utf8StreamState;
  /** Offset of the first illegal byte, or -1. */
  invalidAt: number;
}

/** Result of flushing an incremental decoder. */
export interface IncrementalDecodeFinish {
  /** All complete characters decoded so far. */
  text: string;
  /** true when a trailing incomplete sequence was withheld. */
  droppedIncompleteTail: boolean;
  /** Offset of the first malformed interior byte, or -1. */
  invalidByteOffset: number;
}

// ============================================================
// Byte-phase walker (same rules as scanUtf8)
// ============================================================

function leadNeed(byte: number): number {
  if (byte < 0x80) return 0;
  if (byte >= 0xc2 && byte <= 0xdf) return 1;
  if (byte >= 0xe0 && byte <= 0xef) return 2;
  if (byte >= 0xf0 && byte <= 0xf4) return 3;
  return -1;
}

function isContinuation(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

/**
 * Append raw bytes to a UTF-8 phase state.
 *
 * Mirrors the repository's `scanUtf8` rule set: it enforces lead /
 * continuation structure but deliberately does not add overlong or
 * surrogate sub-range checks, so mask and measurement never disagree.
 */
export function appendUtf8Bytes(
  state: Utf8StreamState,
  bytes: readonly number[]
): AppendResult {
  if (!state.recoverable) {
    return { state: { ...state }, invalidAt: -1 };
  }

  let need = state.need;
  const recoverable = true;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (need === 0) {
      const nextNeed = leadNeed(byte);
      if (nextNeed === -1) {
        return { state: { need, recoverable: false }, invalidAt: i };
      }
      need = nextNeed;
    } else {
      if (!isContinuation(byte)) {
        return { state: { need, recoverable: false }, invalidAt: i };
      }
      need -= 1;
    }
  }

  return { state: { need, recoverable }, invalidAt: -1 };
}

// ============================================================
// Candidate legality
// ============================================================

/** <pad>, <unk>, <bos> — never emitted into user-visible text. */
export function isControlTokenId(id: number): boolean {
  return id >= 0 && id <= 2;
}

/**
 * Build the legal candidate set for one sampling step.
 *
 * @param idToToken - vocabulary id → token map (`getVocabulary().idToToken`)
 * @param vocabSize - number of logits (candidate ids are 0..vocabSize-1)
 * @param state - byte phase BEFORE the next token
 * @param eosTokenId - the stop token (allowed only at a character boundary)
 */
export function buildLegalCandidateMask(
  idToToken: IdToTokenMap,
  vocabSize: number,
  state: Utf8StreamState,
  eosTokenId: number
): LegalCandidateMask {
  const allowed = new Array<boolean>(vocabSize).fill(false);
  let legalCount = 0;

  for (let id = 0; id < vocabSize; id++) {
    let legal = false;

    if (id === eosTokenId) {
      legal = state.recoverable && state.need === 0;
    } else if (!isControlTokenId(id) && state.recoverable) {
      const { bytes, outOfRangeIdCount } = tokenBytesOf(idToToken, [id]);
      if (outOfRangeIdCount === 0) {
        legal = appendUtf8Bytes(state, Array.from(bytes)).invalidAt === -1;
      }
    }

    if (legal) {
      allowed[id] = true;
      legalCount += 1;
    }
  }

  return { allowed, legalCount, empty: legalCount === 0 };
}

/**
 * Apply a legality mask to raw logits.
 *
 * Excluded candidates receive exactly `-Infinity`; every legal candidate
 * keeps its original logit. No rescaling or renormalisation happens here —
 * the sampler's own softmax handles that.
 */
export function applyLegalityMask(
  logits: readonly number[],
  allowed: readonly boolean[]
): number[] {
  const masked = new Array<number>(logits.length);
  for (let i = 0; i < logits.length; i++) {
    masked[i] = allowed[i] ? logits[i] : -Infinity;
  }
  return masked;
}

// ============================================================
// Incremental decoder
// ============================================================

/**
 * Byte-aware streaming decoder.
 *
 * Each pushed token contributes its raw bytes; only complete characters are
 * emitted. A trailing incomplete sequence is withheld until the remaining
 * bytes arrive, and is dropped (flagged) if the generation ends first.
 *
 * This is the streaming counterpart of `BPETokenizer.decode`, not a second
 * tokenizer: it uses the same id → raw-byte extraction and the same platform
 * TextDecoder configuration.
 */
export class IncrementalUtf8Decoder {
  private readonly idToToken: IdToTokenMap;
  private bytes: number[] = [];
  private emittedLength = 0;
  private textValue = "";
  private invalidByteOffsetValue = -1;

  constructor(idToToken: IdToTokenMap) {
    this.idToToken = idToToken;
  }

  /** Complete characters decoded so far. */
  get text(): string {
    return this.textValue;
  }

  /**
   * Push one generated token id and return the newly decodable text.
   *
   * @throws if the id is outside the vocabulary and byte ranges (such an id
   *         would otherwise silently become U+FFFD in the output)
   */
  pushToken(id: number): string {
    const { bytes, outOfRangeIdCount } = tokenBytesOf(this.idToToken, [id]);
    if (outOfRangeIdCount > 0) {
      throw new Error(
        `IncrementalUtf8Decoder: token id ${id} is outside the vocabulary ` +
        `and the raw-byte range`
      );
    }
    for (let i = 0; i < bytes.length; i++) {
      this.bytes.push(bytes[i]);
    }
    return this.emitComplete();
  }

  /**
   * Flush the decoder.
   *
   * Only an incomplete trailing sequence is withheld. Interior malformed
   * bytes are decoded as U+FFFD and reported via `invalidByteOffset`; they
   * are never silently dropped.
   */
  finish(): IncrementalDecodeFinish {
    this.emitComplete();
    const scan = scanUtf8(Uint8Array.from(this.bytes));
    return {
      text: this.textValue,
      droppedIncompleteTail:
        scan.firstInvalidByte === -1 && scan.incompleteTailAt !== -1,
      invalidByteOffset: this.invalidByteOffsetValue,
    };
  }

  private emitComplete(): string {
    if (this.bytes.length === 0) return "";

    const all = Uint8Array.from(this.bytes);
    const scan = scanUtf8(all);

    if (scan.firstInvalidByte !== -1 && this.invalidByteOffsetValue === -1) {
      this.invalidByteOffsetValue = scan.firstInvalidByte;
    }

    // With an interior error, decode everything (U+FFFD is visible and
    // flagged). Otherwise withhold only the trailing incomplete sequence.
    const end =
      scan.firstInvalidByte !== -1
        ? all.length
        : scan.incompleteTailAt === -1
          ? all.length
          : scan.incompleteTailAt;

    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(
      all.subarray(0, end)
    );

    if (decoded.length <= this.emittedLength) return "";

    const delta = decoded.slice(this.emittedLength);
    this.emittedLength = decoded.length;
    this.textValue += delta;
    return delta;
  }
}
