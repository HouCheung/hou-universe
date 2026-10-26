// ============================================================
// chatSftMetrics — Phase 113 answer comparison
// ============================================================
// Deterministic, string-only metrics. No model, no random, no I/O.
// Used by the dataset audit, the evaluation probe, and the tests so
// all three describe the same EM and non-EM comparisons.
// ============================================================

export type ChatSftLanguage = "en" | "zh" | "mixed";

export interface NormalizedAnswer {
  text: string;
  /** true when the raw model output tried to start another turn. */
  turnLeak: boolean;
}

const TRAILING_PUNCTUATION = /[。．.!！?？]+$/u;
const TURN_MARKERS = ["\nUser:", "\nAssistant:"] as const;

/**
 * Frozen answer-normalization contract for the primary exact-match metric.
 *
 * 1. Normalize Unicode to NFC.
 * 2. Normalize CRLF and CR line endings to LF.
 * 3. Trim leading and trailing whitespace.
 * 4. Collapse each run of consecutive whitespace characters to one ASCII space.
 * 5. Preserve case, punctuation, wording, numbers, and semantic content.
 *
 * No fuzzy matching, stemming, semantic similarity, or post-hoc exceptions.
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extract the assistant continuation before normalization. A model output that
 * starts another turn is cut at the first "\nUser:" or "\nAssistant:" marker,
 * and the cut is recorded for the integrity report. This extraction is not part
 * of `normalizeAnswer` and does not change the normalization rule.
 */
export function normalizeChatAnswer(raw: string): NormalizedAnswer {
  let text = raw.replace(/\r\n?/g, "\n");
  let turnLeak = false;

  for (const marker of TURN_MARKERS) {
    const index = text.indexOf(marker);
    if (index !== -1) {
      text = text.slice(0, index);
      turnLeak = true;
    }
  }

  return { text: normalizeAnswer(text), turnLeak };
}

/**
 * Non-EM comparison key used only for duplicate detection and the control
 * mapping's "answers must differ" test. It is deliberately more permissive
 * than `normalizeAnswer`; it never scores a prediction.
 */
export function chatAnswerComparisonKey(raw: string): string {
  return normalizeChatAnswer(raw)
    .text.toLowerCase()
    .replace(TRAILING_PUNCTUATION, "")
    .trim();
}

function splitAnswerTokens(text: string, language: ChatSftLanguage): string[] {
  if (text.length === 0) return [];
  if (language === "en") {
    return text.split(" ").filter((token) => token.length > 0);
  }
  return Array.from(text.replace(/\s+/g, ""));
}

function multiset(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

/**
 * Multiset token F1 between a normalized prediction and a normalized gold
 * answer. English is whitespace-tokenized; Chinese/mixed is character-tokenized.
 */
export function chatAnswerTokenF1(
  prediction: string,
  gold: string,
  language: ChatSftLanguage
): number {
  const predictionTokens = splitAnswerTokens(prediction, language);
  const goldTokens = splitAnswerTokens(gold, language);
  if (predictionTokens.length === 0 || goldTokens.length === 0) return 0;

  const predictionCounts = multiset(predictionTokens);
  const goldCounts = multiset(goldTokens);
  let overlap = 0;
  for (const [token, count] of predictionCounts) {
    overlap += Math.min(count, goldCounts.get(token) ?? 0);
  }

  const precision = overlap / predictionTokens.length;
  const recall = overlap / goldTokens.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}
