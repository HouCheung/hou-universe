// ============================================================
// ChatSftDataset — Phase 113 assistant-only SFT dataset
// ============================================================
// This module is intentionally separate from TextDataset and from
// datasetSchema.ts. It parses the new chat-sft.json envelope, builds
// chat-formatted samples, and masks loss to the final assistant answer
// plus the terminating <eos>.
//
// The mask is aligned to the PRODUCTION Trainer contract:
//   Trainer passes unshifted inputIds and shifts internally, so
//   mask[s] = 1 means "the prediction at position s of token s+1
//   contributes". There is no second target shift.
// ============================================================

import { Dataset } from "./Dataset";
import type { TextSample } from "./TextDataset";
import type { BPETokenizer } from "../tokenizer/BPETokenizer";
import { chatAnswerComparisonKey, type ChatSftLanguage } from "./chatSftMetrics";

export type ChatSftSplit = "train" | "validation" | "test";
export type ChatSftCategory =
  | "factual"
  | "definition"
  | "arithmetic"
  | "translation"
  | "daily"
  | "technology";

export interface ChatSftTurn {
  user: string;
  assistant: string;
}

export interface ChatSftSampleData {
  id: string;
  language: ChatSftLanguage;
  split: ChatSftSplit;
  category: ChatSftCategory;
  turns: ChatSftTurn[];
}

export interface ChatSftTemplate {
  user: string;
  assistant: string;
  separator: string;
}

export interface ChatSftDatasetFile {
  dataset: string;
  version: string;
  schemaVersion: number;
  purpose: string;
  template: ChatSftTemplate;
  createdAt: string;
  samples: ChatSftSampleData[];
}

export interface ChatSftEncoding {
  inputIds: number[];
  targetIds: number[];
  mask: number[];
  promptTokenCount: number;
  answerTokenCount: number;
  eosIndex: number;
  supervisedCount: number;
  fullTextTokenizationMatches: boolean;
}

export const CHAT_SFT_BLOCK_SIZE = 128;
export const CHAT_SFT_EOS_TOKEN_ID = 3;
export const CHAT_SFT_PAD_TOKEN_ID = 0;

const TEMPLATE: ChatSftTemplate = {
  user: "User: ",
  assistant: "Assistant: ",
  separator: "\n",
};

const LANGUAGES: ChatSftLanguage[] = ["en", "zh", "mixed"];
const SPLITS: ChatSftSplit[] = ["train", "validation", "test"];
const CATEGORIES: ChatSftCategory[] = [
  "factual",
  "definition",
  "arithmetic",
  "translation",
  "daily",
  "technology",
];

// ============================================================
// Template
// ============================================================

function turnParts(sample: ChatSftSampleData): string[] {
  const parts: string[] = [];
  for (const turn of sample.turns) {
    parts.push(`${TEMPLATE.user}${turn.user}`);
    parts.push(`${TEMPLATE.assistant}${turn.assistant}`);
  }
  return parts;
}

export function formatFullText(sample: ChatSftSampleData): string {
  return turnParts(sample).join(TEMPLATE.separator);
}

export function formatPrompt(sample: ChatSftSampleData): string {
  const parts = turnParts(sample);
  return [...parts.slice(0, -1), TEMPLATE.assistant.trimEnd()].join(
    TEMPLATE.separator
  );
}

export function formatAnswerContinuation(sample: ChatSftSampleData): string {
  const lastTurn = sample.turns[sample.turns.length - 1];
  return ` ${lastTurn.assistant}`;
}

export function replaceFinalAnswer(
  sample: ChatSftSampleData,
  finalAnswer: string
): ChatSftSampleData {
  const turns = sample.turns.map((turn) => ({ ...turn }));
  turns[turns.length - 1].assistant = finalAnswer;
  return { ...sample, turns };
}

// ============================================================
// Encoding and assistant-only mask
// ============================================================

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Build one padded TextSample from a chat sample.
 *
 * Normative sequence:
 *   encode(promptText) ++ encode(" " + finalAnswer) ++ [<eos>]
 *
 * Segment-wise encoding guarantees the training prefix is exactly the
 * token sequence the inference path sees. Whether the tokenizer would
 * have produced the same sequence from the literal full text is recorded
 * as a diagnostic, never used to reject a sample.
 */
export function encodeChatSftSample(
  sample: ChatSftSampleData,
  tokenizer: BPETokenizer,
  blockSize: number = CHAT_SFT_BLOCK_SIZE
): ChatSftEncoding {
  if (sample.turns.length === 0) {
    throw new Error(`ChatSftDataset: sample ${sample.id} has no turns`);
  }

  const promptText = formatPrompt(sample);
  const continuation = formatAnswerContinuation(sample);
  const fullText = formatFullText(sample);

  const promptIds = tokenizer.encode(promptText);
  const answerIds = tokenizer.encode(continuation);
  const fullIds = tokenizer.encode(fullText);
  const expected = [...promptIds, ...answerIds];

  if (promptIds.length === 0 || answerIds.length === 0) {
    throw new Error(`ChatSftDataset: sample ${sample.id} encoded to an empty segment`);
  }

  const ids = [...expected, CHAT_SFT_EOS_TOKEN_ID];
  if (ids.length > blockSize) {
    throw new Error(
      `ChatSftDataset: sample ${sample.id} needs ${ids.length} tokens, ` +
      `block size is ${blockSize}`
    );
  }

  const inputIds = new Array<number>(blockSize).fill(CHAT_SFT_PAD_TOKEN_ID);
  const targetIds = new Array<number>(blockSize).fill(CHAT_SFT_PAD_TOKEN_ID);
  const mask = new Array<number>(blockSize).fill(0);

  for (let i = 0; i < ids.length; i++) inputIds[i] = ids[i];
  for (let s = 0; s < blockSize - 1; s++) targetIds[s] = inputIds[s + 1];

  const eosIndex = ids.length - 1;
  // mask[s] = 1 means the prediction at s targets ids[s+1].
  // The first answer token is at P and is predicted at P-1.
  // EOS is at N-1 and is predicted at N-2. The EOS position itself
  // predicts padding and is never supervised.
  for (let s = promptIds.length - 1; s <= eosIndex - 1; s++) {
    mask[s] = 1;
  }
  // Position blockSize-1 has no target; the loss never reads it.
  mask[blockSize - 1] = 0;

  const supervisedCount = mask.reduce((sum, value) => sum + value, 0);

  return {
    inputIds,
    targetIds,
    mask,
    promptTokenCount: promptIds.length,
    answerTokenCount: answerIds.length,
    eosIndex,
    supervisedCount,
    fullTextTokenizationMatches: arraysEqual(fullIds, expected),
  };
}

// ============================================================
// Parsing
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): string {
  const value = object[key];
  if (typeof value !== "string") {
    issues.push(`${path}.${key} must be a string`);
    return "";
  }
  return value;
}

function readNumber(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[]
): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${path}.${key} must be a finite number`);
    return 0;
  }
  return value;
}

function isLanguage(value: string): value is ChatSftLanguage {
  return LANGUAGES.includes(value as ChatSftLanguage);
}

function isSplit(value: string): value is ChatSftSplit {
  return SPLITS.includes(value as ChatSftSplit);
}

function isCategory(value: string): value is ChatSftCategory {
  return CATEGORIES.includes(value as ChatSftCategory);
}

const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;
const ID_PATTERN = /^sft-(en|zh|mixed)-(train|validation|test)-\d{3}$/;
const FORBIDDEN_CONTENT = [
  "\n",
  "\r",
  "User:",
  "Assistant:",
  "<pad>",
  "<unk>",
  "<bos>",
  "<eos>",
];

function contentIssue(text: string): string | null {
  if (text.length === 0) return "must not be empty";
  if (text !== text.trim()) return "must not have leading or trailing whitespace";
  for (const token of FORBIDDEN_CONTENT) {
    if (text.includes(token)) return `must not contain ${JSON.stringify(token)}`;
  }
  return null;
}

function languageMatches(language: ChatSftLanguage, userText: string): boolean {
  const hasHan = HAN.test(userText);
  const hasLatin = LATIN.test(userText);
  switch (language) {
    case "en":
      return !hasHan;
    case "zh":
      return hasHan && !hasLatin;
    case "mixed":
      return hasHan && hasLatin;
  }
}

function parseSample(
  raw: unknown,
  index: number,
  issues: string[]
): ChatSftSampleData | null {
  const path = `$.samples[${index}]`;
  const issueCountBefore = issues.length;
  if (!isRecord(raw)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const id = readString(raw, "id", path, issues);
  const languageText = readString(raw, "language", path, issues);
  const splitText = readString(raw, "split", path, issues);
  const categoryText = readString(raw, "category", path, issues);

  if (!ID_PATTERN.test(id)) issues.push(`${path}.id has an invalid format`);
  if (!isLanguage(languageText)) issues.push(`${path}.language is invalid`);
  if (!isSplit(splitText)) issues.push(`${path}.split is invalid`);
  if (!isCategory(categoryText)) issues.push(`${path}.category is invalid`);

  const turnsRaw = raw["turns"];
  const turns: ChatSftTurn[] = [];
  if (!Array.isArray(turnsRaw) || (turnsRaw.length !== 1 && turnsRaw.length !== 2)) {
    issues.push(`${path}.turns must contain 1 or 2 turns`);
  } else {
    turnsRaw.forEach((turnRaw, turnIndex) => {
      const turnPath = `${path}.turns[${turnIndex}]`;
      if (!isRecord(turnRaw)) {
        issues.push(`${turnPath} must be an object`);
        return;
      }
      const user = readString(turnRaw, "user", turnPath, issues);
      const assistant = readString(turnRaw, "assistant", turnPath, issues);
      const userIssue = contentIssue(user);
      const assistantIssue = contentIssue(assistant);
      if (userIssue) issues.push(`${turnPath}.user ${userIssue}`);
      if (assistantIssue) issues.push(`${turnPath}.assistant ${assistantIssue}`);
      if (isLanguage(languageText) && !languageMatches(languageText, user)) {
        issues.push(`${turnPath}.user does not match language "${languageText}"`);
      }
      turns.push({ user, assistant });
    });
  }

  if (isLanguage(languageText) && isSplit(splitText) && ID_PATTERN.test(id)) {
    const expectedPrefix = `sft-${languageText}-${splitText}-`;
    if (!id.startsWith(expectedPrefix)) {
      issues.push(`${path}.id does not agree with language/split`);
    }
  }

  if (
    issues.length > issueCountBefore ||
    !isLanguage(languageText) ||
    !isSplit(splitText) ||
    !isCategory(categoryText) ||
    !ID_PATTERN.test(id) ||
    turns.length === 0
  ) {
    return null;
  }

  return {
    id,
    language: languageText,
    split: splitText,
    category: categoryText,
    turns,
  };
}

/**
 * Parse and structurally validate a chat-sft dataset file.
 * @throws with every structural issue, joined by newlines.
 */
export function parseChatSftDatasetFile(value: unknown): ChatSftDatasetFile {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new Error("chat-sft dataset must be a JSON object");
  }

  const dataset = readString(value, "dataset", "$", issues);
  const version = readString(value, "version", "$", issues);
  const schemaVersion = readNumber(value, "schemaVersion", "$", issues);
  const purpose = readString(value, "purpose", "$", issues);
  const createdAt = readString(value, "createdAt", "$", issues);

  if (dataset !== "chat-sft") issues.push('$.dataset must be "chat-sft"');
  if (schemaVersion !== 1) issues.push("$.schemaVersion must be 1");
  if (purpose !== "instruction") issues.push('$.purpose must be "instruction"');

  const templateRaw = value["template"];
  let template: ChatSftTemplate = { user: "", assistant: "", separator: "" };
  if (!isRecord(templateRaw)) {
    issues.push("$.template must be an object");
  } else {
    template = {
      user: readString(templateRaw, "user", "$.template", issues),
      assistant: readString(templateRaw, "assistant", "$.template", issues),
      separator: readString(templateRaw, "separator", "$.template", issues),
    };
    if (
      template.user !== TEMPLATE.user ||
      template.assistant !== TEMPLATE.assistant ||
      template.separator !== TEMPLATE.separator
    ) {
      issues.push("$.template does not match the frozen chat template");
    }
  }

  const samplesRaw = value["samples"];
  const samples: ChatSftSampleData[] = [];
  if (!Array.isArray(samplesRaw)) {
    issues.push("$.samples must be an array");
  } else {
    samplesRaw.forEach((raw, index) => {
      const sample = parseSample(raw, index, issues);
      if (sample) samples.push(sample);
    });
  }

  const ids = new Set<string>();
  for (const sample of samples) {
    if (ids.has(sample.id)) issues.push(`duplicate sample id "${sample.id}"`);
    ids.add(sample.id);
  }

  if (issues.length > 0) {
    throw new Error(`Invalid chat-sft dataset:\n- ${issues.join("\n- ")}`);
  }

  return { dataset, version, schemaVersion, purpose, template, createdAt, samples };
}

// ============================================================
// Dataset class
// ============================================================

export class ChatSftDataset extends Dataset<TextSample> {
  private readonly encoded: ChatSftEncoding[];
  private readonly blockSize: number;
  private readonly split: ChatSftSplit;

  constructor(options: {
    tokenizer: BPETokenizer;
    dataset: ChatSftDatasetFile;
    split: ChatSftSplit;
    blockSize?: number;
  }) {
    super();
    const blockSize = options.blockSize ?? CHAT_SFT_BLOCK_SIZE;
    const samples = options.dataset.samples.filter(
      (sample) => sample.split === options.split
    );
    if (samples.length === 0) {
      throw new Error(`ChatSftDataset: split "${options.split}" is empty`);
    }
    this.blockSize = blockSize;
    this.split = options.split;
    this.encoded = samples.map((sample) =>
      encodeChatSftSample(sample, options.tokenizer, blockSize)
    );
  }

  length(): number {
    return this.encoded.length;
  }

  get(index: number): TextSample {
    if (index < 0 || index >= this.encoded.length) {
      throw new Error(
        `ChatSftDataset.get: index ${index} out of range ` +
        `[0, ${this.encoded.length}) for split "${this.split}"`
      );
    }
    const sample = this.encoded[index];
    return {
      inputIds: [...sample.inputIds],
      targetIds: [...sample.targetIds],
      mask: [...sample.mask],
    };
  }

  getBlockSize(): number {
    return this.blockSize;
  }
}

// ============================================================
// Audit
// ============================================================

export interface ChatSftAudit {
  total: number;
  bySplit: Record<ChatSftSplit, number>;
  bySplitLanguage: Record<string, number>;
  byLanguage: Record<ChatSftLanguage, number>;
  byCategory: Record<ChatSftCategory, number>;
  singleTurn: number;
  twoTurn: number;
  boundary: { exact: number; segmented: number };
  /** Per-sample diagnostic: does encode(fullText) equal the segment-wise sequence? */
  boundaryDetails: Array<{ id: string; matches: boolean }>;
  maxTestPromptTokens: number;
  issues: string[];
}

const EXPECTED_SPLIT_LANGUAGE: Record<ChatSftSplit, Record<ChatSftLanguage, number>> = {
  train: { en: 28, zh: 28, mixed: 28 },
  validation: { en: 7, zh: 7, mixed: 7 },
  test: { en: 9, zh: 9, mixed: 9 },
};

const EXPECTED_TURNS: Record<
  ChatSftSplit,
  Record<ChatSftLanguage, { single: number; two: number }>
> = {
  train: {
    en: { single: 18, two: 10 },
    zh: { single: 18, two: 10 },
    mixed: { single: 18, two: 10 },
  },
  validation: {
    en: { single: 5, two: 2 },
    zh: { single: 5, two: 2 },
    mixed: { single: 5, two: 2 },
  },
  test: {
    en: { single: 9, two: 0 },
    zh: { single: 9, two: 0 },
    mixed: { single: 9, two: 0 },
  },
};

const EXPECTED_CATEGORY: Record<ChatSftSplit, Record<ChatSftCategory, number>> = {
  train: {
    factual: 6,
    definition: 4,
    arithmetic: 5,
    translation: 4,
    daily: 5,
    technology: 4,
  },
  validation: {
    factual: 2,
    definition: 1,
    arithmetic: 1,
    translation: 1,
    daily: 1,
    technology: 1,
  },
  test: {
    factual: 2,
    definition: 1,
    arithmetic: 2,
    translation: 1,
    daily: 2,
    technology: 1,
  },
};

/**
 * Audit split/language counts, turn mix, category quotas, leakage,
 * tokenization boundaries, and held-out prompt length.
 */
export function auditChatSftDataset(
  dataset: ChatSftDatasetFile,
  tokenizer: BPETokenizer
): ChatSftAudit {
  const issues: string[] = [];

  const bySplit: Record<ChatSftSplit, number> = { train: 0, validation: 0, test: 0 };
  const byLanguage: Record<ChatSftLanguage, number> = { en: 0, zh: 0, mixed: 0 };
  const byCategory: Record<ChatSftCategory, number> = {
    factual: 0,
    definition: 0,
    arithmetic: 0,
    translation: 0,
    daily: 0,
    technology: 0,
  };
  const bySplitLanguage: Record<string, number> = {};
  const turnCounts = new Map<string, { single: number; two: number }>();

  for (const sample of dataset.samples) {
    bySplit[sample.split] += 1;
    byLanguage[sample.language] += 1;
    byCategory[sample.category] += 1;

    const splitLanguageKey = `${sample.split}/${sample.language}`;
    bySplitLanguage[splitLanguageKey] = (bySplitLanguage[splitLanguageKey] ?? 0) + 1;

    const turnKey = `${sample.split}/${sample.language}`;
    const counts = turnCounts.get(turnKey) ?? { single: 0, two: 0 };
    if (sample.turns.length === 1) counts.single += 1;
    else counts.two += 1;
    turnCounts.set(turnKey, counts);
  }

  for (const split of SPLITS) {
    for (const language of LANGUAGES) {
      const actual = bySplitLanguage[`${split}/${language}`] ?? 0;
      const expected = EXPECTED_SPLIT_LANGUAGE[split][language];
      if (actual !== expected) {
        issues.push(
          `${split}/${language}: expected ${expected} samples, found ${actual}`
        );
      }

      const counts = turnCounts.get(`${split}/${language}`) ?? { single: 0, two: 0 };
      const expectedTurns = EXPECTED_TURNS[split][language];
      if (counts.single !== expectedTurns.single) {
        issues.push(
          `${split}/${language}: expected ${expectedTurns.single} single-turn, ` +
          `found ${counts.single}`
        );
      }
      if (counts.two !== expectedTurns.two) {
        issues.push(
          `${split}/${language}: expected ${expectedTurns.two} two-turn, ` +
          `found ${counts.two}`
        );
      }

      for (const category of CATEGORIES) {
        const categoryCount = dataset.samples.filter(
          (sample) =>
            sample.split === split &&
            sample.language === language &&
            sample.category === category
        ).length;
        const expectedCategory = EXPECTED_CATEGORY[split][category];
        if (categoryCount !== expectedCategory) {
          issues.push(
            `${split}/${language}/${category}: expected ${expectedCategory}, ` +
            `found ${categoryCount}`
          );
        }
      }
    }
  }

  const trainingValidation = dataset.samples.filter(
    (sample) => sample.split !== "test"
  );
  const heldOut = dataset.samples.filter((sample) => sample.split === "test");

  const seenQuestions = new Map<string, string>();
  const seenAnswers = new Map<string, string>();
  for (const sample of trainingValidation) {
    for (const turn of sample.turns) {
      const question = chatAnswerComparisonKey(turn.user);
      const answer = chatAnswerComparisonKey(turn.assistant);
      const questionOwner = seenQuestions.get(question);
      if (questionOwner !== undefined) {
        issues.push(`duplicate training question in ${questionOwner} and ${sample.id}`);
      } else {
        seenQuestions.set(question, sample.id);
      }
      const answerOwner = seenAnswers.get(answer);
      if (answerOwner !== undefined) {
        issues.push(`duplicate training answer in ${answerOwner} and ${sample.id}`);
      } else {
        seenAnswers.set(answer, sample.id);
      }
    }
  }

  const trainingPrompts = new Set(
    trainingValidation.map((sample) => chatAnswerComparisonKey(formatPrompt(sample)))
  );

  for (const sample of heldOut) {
    for (const turn of sample.turns) {
      const question = chatAnswerComparisonKey(turn.user);
      const answer = chatAnswerComparisonKey(turn.assistant);
      if (seenQuestions.has(question)) {
        issues.push(`held-out question of ${sample.id} occurs in training`);
      }
      if (seenAnswers.has(answer)) {
        issues.push(`held-out answer of ${sample.id} occurs in training`);
      }
    }
    if (trainingPrompts.has(chatAnswerComparisonKey(formatPrompt(sample)))) {
      issues.push(`held-out prompt of ${sample.id} occurs in training`);
    }
  }

  let exact = 0;
  let segmented = 0;
  let maxTestPromptTokens = 0;
  const boundaryDetails: Array<{ id: string; matches: boolean }> = [];

  for (const sample of dataset.samples) {
    const encoded = encodeChatSftSample(sample, tokenizer);
    if (encoded.fullTextTokenizationMatches) exact += 1;
    else segmented += 1;
    boundaryDetails.push({
      id: sample.id,
      matches: encoded.fullTextTokenizationMatches,
    });
    if (sample.split === "test") {
      maxTestPromptTokens = Math.max(maxTestPromptTokens, encoded.promptTokenCount);
      if (encoded.promptTokenCount > 88) {
        issues.push(
          `${sample.id}: prompt is ${encoded.promptTokenCount} tokens ` +
          `(maximum 88 so prompt + 40 never truncates context)`
        );
      }
    }
  }

  const singleTurn = dataset.samples.filter((sample) => sample.turns.length === 1).length;
  const twoTurn = dataset.samples.length - singleTurn;

  return {
    total: dataset.samples.length,
    bySplit,
    bySplitLanguage,
    byLanguage,
    byCategory,
    singleTurn,
    twoTurn,
    boundary: { exact, segmented },
    boundaryDetails,
    maxTestPromptTokens,
    issues,
  };
}

// ============================================================
// Control mapping
// ============================================================

export interface ChatSftControlEntry {
  sampleId: string;
  sourceSampleId: string;
  offset: number;
  finalAnswer: string;
}

export interface ChatSftControlStratum {
  split: "train" | "validation";
  language: ChatSftLanguage;
  turnCount: number;
  size: number;
  offset: number;
}

export interface ChatSftControlMapping {
  datasetSha256: string;
  tokenizerFingerprint: string;
  strata: ChatSftControlStratum[];
  entries: ChatSftControlEntry[];
}

/**
 * Build the deterministic mismatched-answer mapping for train/validation.
 *
 * Within each (split, language, turnCount) stratum, samples are sorted by
 * id and final answers are cyclically shifted by the smallest offset that
 * (a) never maps an answer to itself and (b) fits the block size. Only the
 * final supervised answer changes; prompts stay byte-identical to B.
 */
export function buildChatSftControlMapping(
  dataset: ChatSftDatasetFile,
  tokenizer: BPETokenizer,
  datasetSha256: string,
  tokenizerFingerprint: string,
  blockSize: number = CHAT_SFT_BLOCK_SIZE
): ChatSftControlMapping {
  const strata: ChatSftControlStratum[] = [];
  const entries: ChatSftControlEntry[] = [];

  for (const split of ["train", "validation"] as const) {
    for (const language of LANGUAGES) {
      for (const turnCount of [1, 2]) {
        const group = dataset.samples
          .filter(
            (sample) =>
              sample.split === split &&
              sample.language === language &&
              sample.turns.length === turnCount
          )
          .sort((a, b) => a.id.localeCompare(b.id));

        if (group.length === 0) continue;
        if (group.length === 1) {
          throw new Error(
            `Control mapping: stratum ${split}/${language}/${turnCount} has one sample`
          );
        }

        let chosen = -1;
        for (let offset = 1; offset < group.length; offset++) {
          const valid = group.every((target, index) => {
            const source = group[(index + offset) % group.length];
            const sourceAnswer = source.turns[source.turns.length - 1].assistant;
            const targetAnswer = target.turns[target.turns.length - 1].assistant;
            if (
              chatAnswerComparisonKey(sourceAnswer) ===
              chatAnswerComparisonKey(targetAnswer)
            ) {
              return false;
            }
            try {
              encodeChatSftSample(
                replaceFinalAnswer(target, sourceAnswer),
                tokenizer,
                blockSize
              );
              return true;
            } catch {
              return false;
            }
          });
          if (valid) {
            chosen = offset;
            break;
          }
        }

        if (chosen === -1) {
          throw new Error(
            `Control mapping: no valid offset for ${split}/${language}/${turnCount}`
          );
        }

        strata.push({
          split,
          language,
          turnCount,
          size: group.length,
          offset: chosen,
        });

        group.forEach((target, index) => {
          const source = group[(index + chosen) % group.length];
          entries.push({
            sampleId: target.id,
            sourceSampleId: source.id,
            offset: chosen,
            finalAnswer: source.turns[source.turns.length - 1].assistant,
          });
        });
      }
    }
  }

  return { datasetSha256, tokenizerFingerprint, strata, entries };
}

/** Apply a control mapping to train/validation; test samples are untouched. */
export function applyChatSftControlMapping(
  dataset: ChatSftDatasetFile,
  mapping: ChatSftControlMapping
): ChatSftDatasetFile {
  const entryById = new Map(mapping.entries.map((entry) => [entry.sampleId, entry]));
  const sourceById = new Map(dataset.samples.map((sample) => [sample.id, sample]));

  return {
    ...dataset,
    samples: dataset.samples.map((sample) => {
      if (sample.split === "test") return sample;
      const entry = entryById.get(sample.id);
      if (!entry) {
        throw new Error(`Control mapping: no entry for ${sample.id}`);
      }
      const source = sourceById.get(entry.sourceSampleId);
      if (!source) {
        throw new Error(`Control mapping: unknown source ${entry.sourceSampleId}`);
      }
      const sourceAnswer = source.turns[source.turns.length - 1].assistant;
      if (sourceAnswer !== entry.finalAnswer) {
        throw new Error(`Control mapping: answer drift for ${sample.id}`);
      }
      return replaceFinalAnswer(sample, entry.finalAnswer);
    }),
  };
}

/** Validate a control-mapping JSON object. */
export function parseChatSftControlMapping(value: unknown): ChatSftControlMapping {
  if (!isRecord(value)) {
    throw new Error("control mapping must be an object");
  }
  const datasetSha256 = value["datasetSha256"];
  const tokenizerFingerprint = value["tokenizerFingerprint"];
  const strataRaw = value["strata"];
  const entriesRaw = value["entries"];

  if (typeof datasetSha256 !== "string") {
    throw new Error("control mapping datasetSha256 must be a string");
  }
  if (typeof tokenizerFingerprint !== "string") {
    throw new Error("control mapping tokenizerFingerprint must be a string");
  }
  if (!Array.isArray(strataRaw) || !Array.isArray(entriesRaw)) {
    throw new Error("control mapping strata/entries must be arrays");
  }

  const strata: ChatSftControlStratum[] = [];
  for (const raw of strataRaw) {
    if (!isRecord(raw)) throw new Error("control mapping stratum must be an object");
    const split = raw["split"];
    const language = raw["language"];
    const turnCount = raw["turnCount"];
    const size = raw["size"];
    const offset = raw["offset"];
    if (split !== "train" && split !== "validation") {
      throw new Error("control mapping stratum split is invalid");
    }
    if (typeof language !== "string" || !isLanguage(language)) {
      throw new Error("control mapping stratum language is invalid");
    }
    if (
      typeof turnCount !== "number" ||
      typeof size !== "number" ||
      typeof offset !== "number"
    ) {
      throw new Error("control mapping stratum counts must be numbers");
    }
    strata.push({ split, language, turnCount, size, offset });
  }

  const entries: ChatSftControlEntry[] = [];
  for (const raw of entriesRaw) {
    if (!isRecord(raw)) throw new Error("control mapping entry must be an object");
    const sampleId = raw["sampleId"];
    const sourceSampleId = raw["sourceSampleId"];
    const offset = raw["offset"];
    const finalAnswer = raw["finalAnswer"];
    if (
      typeof sampleId !== "string" ||
      typeof sourceSampleId !== "string" ||
      typeof offset !== "number" ||
      typeof finalAnswer !== "string"
    ) {
      throw new Error("control mapping entry has invalid fields");
    }
    entries.push({ sampleId, sourceSampleId, offset, finalAnswer });
  }

  return { datasetSha256, tokenizerFingerprint, strata, entries };
}
