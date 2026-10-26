// ============================================================
// MiniMind — tokenizer/tokenCounter.ts
// ============================================================
// Phase 80: Tokenizer-backed context token counting.
//
// Replaces the crude `length / 4` heuristic (which is wrong for
// Chinese, whose UTF-8 bytes do not map 4-characters-per-token).
//
// Uses the REAL production BPETokenizer to tokenize actual text and
// return the true token count. This is the SAME tokenizer used by
// TrainingWorker / GenerationWorker — trained on the same production
// corpus at the same target vocab size, so the counts are faithful.
//
// No second tokenizer is introduced: this wraps the production
// BPETokenizer and memoizes a single trained instance.
// ============================================================

import { BPETokenizer } from "./BPETokenizer";
import {
  loadProductionDataset,
  getDatasetTexts,
} from "../data/datasetLoader";
import { PRODUCTION_VOCAB_TARGET } from "../experiments/ModelRegistry";

// ============================================================
// Singleton tokenizer
// ============================================================

let cachedTokenizer: BPETokenizer | null = null;
let cachedVocabTarget = -1;

/**
 * Lazily train (and memoize) the production BPETokenizer on the
 * production foundation corpus.
 *
 * BPE training is deterministic: the same corpus + target vocab
 * always produces the same merge table. This tokenizer is therefore
 * equivalent to the one the Workers build at generation/training time.
 */
export function getProductionTokenizer(): BPETokenizer {
  if (cachedTokenizer && cachedVocabTarget === PRODUCTION_VOCAB_TARGET) {
    return cachedTokenizer;
  }

  const tokenizer = new BPETokenizer();
  tokenizer.train(getDatasetTexts(loadProductionDataset()), PRODUCTION_VOCAB_TARGET);
  cachedTokenizer = tokenizer;
  cachedVocabTarget = PRODUCTION_VOCAB_TARGET;
  return tokenizer;
}

// ============================================================
// Public API
// ============================================================

/**
 * Return the true token count for a piece of text, using the
 * production BPETokenizer.
 *
 * @param text - The text to tokenize
 * @returns Number of tokens produced by encode()
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  return getProductionTokenizer().encode(text).length;
}

/**
 * Estimate the context tokens used by a conversation prompt.
 *
 * This is the replacement for `Math.ceil(length / 4)`. It returns the
 * real token count so context-window truncation is correct for
 * Chinese, English, and mixed text alike.
 *
 * @param prompt - The full formatted prompt string
 * @returns The real token count of the prompt
 */
export function estimateContextTokens(prompt: string): number {
  return countTokens(prompt);
}

/**
 * Truncate text to at most `maxTokens` tokens, keeping the tail (the most
 * recent content). Used for context-window management so Chinese / mixed
 * prompts respect the real token budget instead of a `maxSeqLen * 4`
 * character guess.
 *
 * @param text - The full prompt/conversation text
 * @param maxTokens - The token budget (typically modelConfig.maxSeqLen)
 * @returns The tail of `text` that fits within `maxTokens` tokens
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const tokenizer = getProductionTokenizer();
  const ids = tokenizer.encode(text);
  if (ids.length <= maxTokens) return text;
  return tokenizer.decode(ids.slice(ids.length - maxTokens));
}
