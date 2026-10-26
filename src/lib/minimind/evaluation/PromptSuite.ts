// ============================================================
// PromptSuite — Predefined prompt sets for generation benchmarks
// ============================================================
// Phase 46: Collections of test prompts for evaluating text
// generation quality before and after training. Each suite
// targets a different evaluation dimension.
//
// Usage:
//   import { DEFAULT_PROMPTS, STORY_PROMPTS } from "./PromptSuite";
//   const genEval = new GenerationEvaluator(model, tokenizer);
//   const result = genEval.evaluate(DEFAULT_PROMPTS);
// ============================================================

/**
 * Default evaluation prompts — simple sentence starters
 * that test basic language modeling capability.
 */
export const DEFAULT_PROMPTS: string[] = [
  "Once upon a time",
  "The little boy",
  "In the forest",
  "The cat sat",
  "I went to",
  "She looked at",
  "The sun was",
  "A long time",
  "He opened the",
  "They walked to",
];

/**
 * Story prompts — slightly longer prompts that test
 * narrative coherence and continuation ability.
 */
export const STORY_PROMPTS: string[] = [
  "Once upon a time there was a",
  "The little girl went to the",
  "In the deep dark forest there lived",
  "The brave knight rode his horse to",
  "She opened the magic book and found",
  "The old wizard cast a spell that",
  "A long time ago in a kingdom far away",
  "The little puppy ran through the garden and",
  "Under the bright blue sky the children",
  "The king called his three sons and said",
];

/**
 * Simple prompts — very short, common sentence starters.
 * Good for testing basic language modeling.
 */
export const SIMPLE_PROMPTS: string[] = [
  "The",
  "I",
  "She",
  "He",
  "We",
  "They",
  "It",
  "A",
  "My",
  "Our",
];

/**
 * GPT-2 style prompts — prompts commonly used for
 * GPT-2 text generation evaluation.
 */
export const GPT2_PROMPTS: string[] = [
  "The quick brown fox jumps over the lazy dog",
  "In a shocking finding, scientists discovered",
  "The president announced a new plan to",
  "According to the latest research, artificial intelligence",
  "The best way to learn a new language is",
];

/**
 * All available prompt suites.
 */
export const PROMPT_SUITES = {
  default: DEFAULT_PROMPTS,
  story: STORY_PROMPTS,
  simple: SIMPLE_PROMPTS,
  gpt2: GPT2_PROMPTS,
} as const;

export type PromptSuiteName = keyof typeof PROMPT_SUITES;

/**
 * Get a prompt suite by name.
 *
 * @param name - Suite name ("default", "story", "simple", "gpt2")
 * @returns Array of prompt strings
 */
export function getPromptSuite(name: PromptSuiteName): readonly string[] {
  return PROMPT_SUITES[name];
}

/**
 * Get the names of all available prompt suites.
 */
export function getAvailablePromptSuites(): PromptSuiteName[] {
  return Object.keys(PROMPT_SUITES) as PromptSuiteName[];
}
