// ============================================================
// MiniMind — data/ITokenizer.ts
// ============================================================
// Common tokenizer interface for the MiniMind data pipeline.
//
// Both MiniTokenizer and BPETokenizer conform to this interface,
// allowing TextDataset and other data pipeline components to
// work with any tokenizer implementation.
//
// Design:
//   - Minimal interface — only the methods that data pipeline needs
//   - encode/decode for text↔ids conversion
//   - getVocabulary for inspection and special token access
// ============================================================

/**
 * Common tokenizer interface for MiniMind data pipeline.
 *
 * Implementations:
 *   - MiniTokenizer (word-level, educational)
 *   - BPETokenizer (subword, trainable)
 */
export interface ITokenizer {
  /** Encode text to token ID sequence */
  encode(text: string): number[];

  /** Decode token ID sequence back to text */
  decode(ids: number[]): string;

  /** Get vocabulary info for inspection */
  getVocabulary(): {
    size: number;
    tokenToId: ReadonlyMap<string, number>;
    idToToken: ReadonlyMap<number, string>;
  };
}
