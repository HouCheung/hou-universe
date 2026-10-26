// ============================================================
// MiniMind — BPETokenizer.ts
// ============================================================
// Byte-Pair Encoding (BPE) tokenizer for real GPT training.
//
// Algorithm (Sennrich et al., 2016):
//   1. Initialize vocabulary with all byte tokens (0-255)
//   2. Count adjacent token pair frequencies across corpus
//   3. Merge the most frequent pair into a new token
//   4. Repeat until target vocab size is reached
//
// The trained tokenizer supports:
//   - encode(text) → number[]  — greedy BPE subword tokenization
//   - decode(ids)  → string     — detokenization
//   - getVocabulary()           — token↔id mapping (matches MiniTokenizer)
//
// Design:
//   - Self-contained — no external tokenizer dependencies
//   - Compatible with TextDataset (same encode/decode/getVocabulary shape)
//   - Serializable — save/load merge rules as JSON
// ============================================================

import { Vocabulary, DEFAULT_SPECIAL_TOKENS } from "./vocabulary";
import type { SpecialToken } from "./vocabulary";

// ============================================================
// Types
// ============================================================

/** Serialized form for save/load */
export interface BPETokenizerState {
  version: 1;
  vocabSize: number;
  merges: { a: string; b: string; result: string; rank: number }[];
  vocab: Record<string, number>;
}

// ============================================================
// BPETokenizer
// ============================================================

export class BPETokenizer {
  private vocabulary: Vocabulary;

  /** Merge table: "a b" → { result, rank }. Rank 0 = first/most frequent merge. */
  private merges: Map<string, { result: string; rank: number }>;

  /** Total vocab size after training */
  private _vocabSize: number = 0;

  /** Whether the tokenizer has been trained or loaded */
  private trained: boolean = false;

  constructor() {
    this.vocabulary = new Vocabulary();
    this.merges = new Map();
  }

  // ============================================================
  // Training
  // ============================================================

  /**
   * Train the BPE tokenizer on a text corpus.
   *
   * @param corpus — Array of text documents to train on
   * @param vocabSize — Target vocabulary size (including special tokens + byte tokens)
   * @param onProgress — Optional callback for progress reporting
   */
  train(
    corpus: string[],
    vocabSize: number,
    onProgress?: (currentVocab: number, targetVocab: number) => void
  ): void {
    if (!corpus || corpus.length === 0) {
      throw new Error("BPETokenizer.train: corpus must not be empty");
    }
    if (vocabSize < 260) {
      throw new Error(
        `BPETokenizer.train: vocabSize must be >= 260 (256 bytes + 4 special tokens), got ${vocabSize}`
      );
    }

    // Step 1: Initialize byte-level tokens (each byte 0-255 gets its own ID)
    this.initializeBaseVocabulary();

    // Step 2: Convert corpus to byte-token sequences
    const texts = corpus.filter((t) => t.length > 0);
    if (texts.length === 0) {
      throw new Error("BPETokenizer.train: no non-empty texts in corpus");
    }

    const sequences: number[][] = [];
    for (const text of texts) {
      const bytes = new TextEncoder().encode(text);
      const seq: number[] = [];
      for (let i = 0; i < bytes.length; i++) {
        seq.push(4 + bytes[i]);
      }
      if (seq.length > 0) {
        sequences.push(seq);
      }
    }

    if (sequences.length === 0) {
      throw new Error("BPETokenizer.train: no encodable content in corpus");
    }

    const targetMerges = vocabSize - this.vocabulary.size;
    if (targetMerges <= 0) {
      this.trained = true;
      this._vocabSize = this.vocabulary.size;
      return;
    }

    // Step 3: Iterative BPE merge loop
    for (let mergeRank = 0; mergeRank < targetMerges; mergeRank++) {
      // Count all adjacent pairs
      const pairCounts = new Map<string, number>();
      for (const seq of sequences) {
        for (let i = 0; i < seq.length - 1; i++) {
          const key = `${seq[i]},${seq[i + 1]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }

      if (pairCounts.size === 0) break;

      // Find most frequent pair
      let bestPair = "";
      let bestCount = 0;
      for (const [pair, count] of pairCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestPair = pair;
        }
      }

      if (bestCount === 0 || bestPair === "") break;

      // Parse pair IDs
      const [aStr, bStr] = bestPair.split(",");
      const aId = parseInt(aStr, 10);
      const bId = parseInt(bStr, 10);

      // Get token strings for the pair
      const tokenA = this.resolveToken(aId);
      const tokenB = this.resolveToken(bId);
      const mergedToken = tokenA + tokenB;
      const newId = this.vocabulary.add(mergedToken);

      // Record the merge rule — keyed by the token-ID PAIR, not the token
      // strings. IDs are non-negative integers, so "," is an unambiguous
      // separator. The previous `${tokenA} ${tokenB}` key collided with the
      // space byte (0x20) inside tokens, breaking encode() and serialization.
      const mergeIdKey = `${aId},${bId}`;
      this.merges.set(mergeIdKey, { result: mergedToken, rank: mergeRank });

      // Apply the merge exhaustively across all sequences
      for (const seq of sequences) {
        let i = 0;
        while (i < seq.length - 1) {
          if (seq[i] === aId && seq[i + 1] === bId) {
            seq.splice(i, 2, newId);
            // Backtrack to catch cascading: prev token + new merged might merge
            if (i > 0) i--;
          } else {
            i++;
          }
        }
      }

      if (onProgress && mergeRank % 100 === 0) {
        onProgress(this.vocabulary.size, vocabSize);
      }
    }

    this.trained = true;
    this._vocabSize = this.vocabulary.size;

    if (onProgress) {
      onProgress(this._vocabSize, vocabSize);
    }
  }

  // ============================================================
  // Encode / Decode
  // ============================================================

  /**
   * Encode text into token IDs using greedy BPE.
   *
   * Algorithm:
   *   1. Convert text to UTF-8 byte tokens
   *   2. Repeatedly find the best (lowest-rank) mergeable adjacent pair
   *   3. Merge that pair into the combined token
   *   4. Stop when no more merges are possible
   */
  encode(text: string): number[] {
    if (!text || text.length === 0) {
      return [];
    }

    // Start with byte-level tokens
    const bytes = new TextEncoder().encode(text);
    const tokens: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      tokens.push(4 + bytes[i]);
    }

    if (!this.trained || this.merges.size === 0) {
      return tokens;
    }

    // Build lookup: pair of token IDs → merge info.
    // The merge map is keyed by `${idA},${idB}` (integer IDs), so the key
    // parses back unambiguously — no separator byte can appear inside it.
    const idPairToMerge = new Map<string, { mergedId: number; rank: number }>();
    for (const [mergeIdKey, { result, rank }] of this.merges) {
      const [aStr, bStr] = mergeIdKey.split(",");
      const idA = parseInt(aStr, 10);
      const idB = parseInt(bStr, 10);
      const mergedId = this.vocabulary.getId(result);
      if (!Number.isNaN(idA) && !Number.isNaN(idB) && mergedId !== undefined) {
        idPairToMerge.set(`${idA},${idB}`, { mergedId, rank });
      }
    }

    // Greedy BPE: at each step, find the pair with the lowest rank and merge it
    while (true) {
      let bestRank = Infinity;
      let bestPos = -1;
      let bestMergedId = -1;

      for (let i = 0; i < tokens.length - 1; i++) {
        const key = `${tokens[i]},${tokens[i + 1]}`;
        const merge = idPairToMerge.get(key);
        if (merge !== undefined && merge.rank < bestRank) {
          bestRank = merge.rank;
          bestPos = i;
          bestMergedId = merge.mergedId;
        }
      }

      if (bestPos === -1) break;

      // Merge: replace two tokens with merged token
      tokens.splice(bestPos, 2, bestMergedId);
    }

    return tokens;
  }

  /**
   * Decode token IDs back to text.
   *
   * Tokens represent byte sequences (byte tokens and BPE merges
   * are stored as Latin-1 strings where each char is a byte).
   * We collect the byte string and use TextDecoder to convert
   * from UTF-8 bytes back to a JavaScript (UTF-16) string.
   */
  decode(ids: number[]): string {
    const byteChars: string[] = [];
    for (const id of ids) {
      const token = this.vocabulary.getToken(id);
      if (token !== undefined) {
        byteChars.push(token);
      } else if (id >= 4 && id < 260) {
        byteChars.push(String.fromCharCode(id - 4));
      } else {
        // Unknown — push replacement character bytes (UTF-8: EF BF BD)
        byteChars.push("\xEF\xBF\xBD");
      }
    }
    // Convert byte string (Latin-1 chars) → Uint8Array → UTF-8 decode
    const byteStr = byteChars.join("");
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) {
      bytes[i] = byteStr.charCodeAt(i) & 0xFF;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  // ============================================================
  // Vocabulary access (matches MiniTokenizer interface)
  // ============================================================

  getVocabulary(): {
    size: number;
    tokenToId: ReadonlyMap<string, number>;
    idToToken: ReadonlyMap<number, string>;
  } {
    return {
      size: this.vocabulary.size,
      tokenToId: this.vocabulary.getTokenToIdMap(),
      idToToken: this.vocabulary.getIdToTokenMap(),
    };
  }

  get vocabSize(): number {
    return this._vocabSize > 0 ? this._vocabSize : this.vocabulary.size;
  }

  get isTrained(): boolean {
    return this.trained;
  }

  // ============================================================
  // Serialization
  // ============================================================

  /**
   * Export tokenizer state for save/load.
   */
  toState(): BPETokenizerState {
    const merges: BPETokenizerState["merges"] = [];
    for (const [key, value] of this.merges) {
      const [aStr, bStr] = key.split(",");
      const aId = parseInt(aStr, 10);
      const bId = parseInt(bStr, 10);
      merges.push({
        a: this.resolveToken(aId),
        b: this.resolveToken(bId),
        result: value.result,
        rank: value.rank,
      });
    }
    merges.sort((a, b) => a.rank - b.rank);

    const vocab: Record<string, number> = {};
    for (const [token, id] of this.vocabulary.getTokenToIdMap()) {
      vocab[token] = id;
    }

    return {
      version: 1,
      vocabSize: this._vocabSize,
      merges,
      vocab,
    };
  }

  /**
   * Load tokenizer state from a previously exported state.
   */
  fromState(state: BPETokenizerState): void {
    if (state.version !== 1) {
      throw new Error(
        `BPETokenizer.fromState: unsupported version ${state.version}`
      );
    }

    this.vocabulary = new Vocabulary();
    this.merges = new Map();

    // Load non-special tokens with exact IDs
    // Sort by ID to ensure consistent loading
    const entries = Object.entries(state.vocab)
      .filter(([token]) => !DEFAULT_SPECIAL_TOKENS.includes(token as SpecialToken))
      .sort((a, b) => a[1] - b[1]);

    for (const [token, id] of entries) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, id);
      }
    }

    // Load merges — reconstruct the ID-pair key from the token strings.
    for (const merge of state.merges) {
      const idA = this.vocabulary.getId(merge.a);
      const idB = this.vocabulary.getId(merge.b);
      if (idA === undefined || idB === undefined) {
        throw new Error(
          `BPETokenizer.fromState: merge token not in vocabulary ` +
          `("${merge.a}", "${merge.b}")`
        );
      }
      this.merges.set(`${idA},${idB}`, { result: merge.result, rank: merge.rank });
    }

    this._vocabSize = state.vocabSize;
    this.trained = true;
  }

  // ============================================================
  // Token management
  // ============================================================

  addToken(token: string): number {
    return this.vocabulary.add(token);
  }

  hasToken(token: string): boolean {
    return this.vocabulary.has(token);
  }

  getTokenId(token: string): number | undefined {
    return this.vocabulary.getId(token);
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  /**
   * Initialize byte tokens (values 0-255) into the vocabulary.
   * Each byte gets an ID offset by 4 (after the 4 special tokens).
   */
  private initializeBaseVocabulary(): void {
    for (let byteVal = 0; byteVal < 256; byteVal++) {
      const char = String.fromCharCode(byteVal);
      if (!this.vocabulary.has(char)) {
        this.vocabulary.add(char);
      }
    }
  }

  /**
   * Resolve a token ID to its string representation.
   * Falls back to byte-value decoding for byte-range IDs.
   */
  private resolveToken(id: number): string {
    const token = this.vocabulary.getToken(id);
    if (token !== undefined) return token;
    // Byte-range ID: decode as single character
    if (id >= 4 && id < 260) {
      return String.fromCharCode(id - 4);
    }
    return String.fromCharCode(id);
  }
}
