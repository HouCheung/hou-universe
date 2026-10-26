// ============================================================
// Phase 113 — Minimal Chat SFT (contract suite)
// ============================================================
// Static contracts: dataset schema/counts, split leakage, chat
// template, assistant-only mask, EOS placement, control mapping.
// Artifact contracts: skip-with-report if a Phase-113 artifact is
// absent. Nothing here trains, generates, or loads a checkpoint.
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

import {
  chatAnswerComparisonKey,
  chatAnswerTokenF1,
  normalizeAnswer,
  normalizeChatAnswer,
} from "../../data/chatSftMetrics";
import {
  CHAT_SFT_BLOCK_SIZE,
  CHAT_SFT_EOS_TOKEN_ID,
  ChatSftDataset,
  applyChatSftControlMapping,
  auditChatSftDataset,
  buildChatSftControlMapping,
  encodeChatSftSample,
  formatAnswerContinuation,
  formatFullText,
  formatPrompt,
  parseChatSftControlMapping,
  parseChatSftDatasetFile,
  type ChatSftDatasetFile,
  type ChatSftSampleData,
} from "../../data/ChatSftDataset";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { Random } from "../../core/random/Random";
import { getDatasetTexts, loadProductionDataset } from "../../data/datasetLoader";

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
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
      `Assertion failed: ${msg}\n    Expected: ${JSON.stringify(expected)}\n    Actual:   ${JSON.stringify(actual)}`
    );
  }
}

let cachedTokenizer: BPETokenizer | null = null;
function getTokenizer(): BPETokenizer {
  if (cachedTokenizer === null) {
    Random.setSeed(42);
    cachedTokenizer = new BPETokenizer();
    cachedTokenizer.train(getDatasetTexts(loadProductionDataset()), 300);
  }
  return cachedTokenizer;
}

const SINGLE_SAMPLE: ChatSftSampleData = {
  id: "sft-en-train-001",
  language: "en",
  split: "train",
  category: "factual",
  turns: [{ user: "What is the capital of France?", assistant: "Paris." }],
};

const TWO_TURN_SAMPLE: ChatSftSampleData = {
  id: "sft-en-train-002",
  language: "en",
  split: "train",
  category: "daily",
  turns: [
    { user: "I am going to Paris.", assistant: "That sounds nice." },
    { user: "What should I visit?", assistant: "The Eiffel Tower." },
  ],
};

const DATASET_PATH = path.join(
  __dirname,
  "../../../../data/minimind/datasets/chat-sft.json"
);

function loadDatasetIfPresent(): ChatSftDatasetFile | null {
  if (!fs.existsSync(DATASET_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8")) as unknown;
  return parseChatSftDatasetFile(raw);
}

export function runPhase113Tests(): { passed: number; failed: number; skipped: number } {
  passed = 0;
  failed = 0;
  skipped = 0;

  console.log("\nPhase 113: Minimal Chat SFT");

  // ── Metrics ──────────────────────────────────────────────

  test("normalize preserves case and trailing punctuation while trimming", () => {
    assertEqual(normalizeAnswer("  Paris.  "), "Paris.", "case and period preserved");
    assertEqual(normalizeAnswer("巴黎。"), "巴黎。", "Chinese period preserved");
    assert(
      normalizeAnswer("Paris") !== normalizeAnswer("Paris."),
      "punctuation is meaningful"
    );
  });

  test("normalize collapses internal whitespace to one ASCII space", () => {
    assertEqual(normalizeAnswer("A \t  week"), "A week", "runs collapsed, case preserved");
    assertEqual(normalizeAnswer("十二   加   三"), "十二 加 三", "CJK runs collapsed");
  });

  test("normalize applies Unicode NFC", () => {
    assertEqual(normalizeAnswer("é"), "é", "decomposed e-acute composes");
  });

  test("normalize converts CRLF and CR line endings before collapsing", () => {
    assertEqual(normalizeAnswer("A\r\nB\rC"), "A B C", "all line endings become one space");
  });

  test("normalize cuts at a turn marker and flags the leak", () => {
    const result = normalizeChatAnswer("Paris.\nUser: another question");
    assertEqual(result.text, "Paris.", "cut at User marker");
    assert(result.turnLeak, "turn leak flagged");
  });

  test("comparison key folds case and trailing punctuation for non-EM checks", () => {
    assertEqual(chatAnswerComparisonKey("  Paris.  "), "paris", "non-EM key");
    assertEqual(chatAnswerComparisonKey("巴黎。"), "巴黎", "Chinese non-EM key");
    assert(
      normalizeAnswer("Paris.") !== "paris",
      "EM normalizer stays case- and punctuation-sensitive"
    );
  });

  test("token F1 is 1 for identical English answers", () => {
    assertEqual(chatAnswerTokenF1("A week", "A week", "en"), 1, "identical en");
  });

  test("token F1 is 0 for disjoint answers", () => {
    assertEqual(chatAnswerTokenF1("Paris.", "London.", "en"), 0, "disjoint en");
  });

  test("token F1 compares Chinese answers by character", () => {
    const f1 = chatAnswerTokenF1("十二", "十二", "zh");
    assertEqual(f1, 1, "identical zh");
  });

  // ── Chat template and assistant-only mask ────────────────

  test("chat template matches the existing chatAdapter layout", () => {
    assertEqual(
      formatPrompt(SINGLE_SAMPLE),
      "User: What is the capital of France?\nAssistant:",
      "single-turn prompt"
    );
    assertEqual(
      formatAnswerContinuation(SINGLE_SAMPLE),
      " Paris.",
      "continuation carries the template space"
    );
    assertEqual(
      formatFullText(SINGLE_SAMPLE),
      "User: What is the capital of France?\nAssistant: Paris.",
      "full text"
    );
    assertEqual(
      formatPrompt(TWO_TURN_SAMPLE),
      "User: I am going to Paris.\nAssistant: That sounds nice.\nUser: What should I visit?\nAssistant:",
      "two-turn prompt keeps history"
    );
  });

  test("single-turn mask supervises exactly the answer plus EOS", () => {
    const tokenizer = getTokenizer();
    const encoded = encodeChatSftSample(SINGLE_SAMPLE, tokenizer);
    assertEqual(encoded.inputIds.length, CHAT_SFT_BLOCK_SIZE, "padded to block size");
    assertEqual(
      encoded.promptTokenCount,
      tokenizer.encode(formatPrompt(SINGLE_SAMPLE)).length,
      "prompt length"
    );
    assertEqual(
      encoded.answerTokenCount,
      tokenizer.encode(" Paris.").length,
      "answer length"
    );
    assertEqual(encoded.inputIds[encoded.eosIndex], CHAT_SFT_EOS_TOKEN_ID, "EOS at eosIndex");
    assertEqual(encoded.mask[CHAT_SFT_BLOCK_SIZE - 1], 0, "last position never supervised");
    assertEqual(encoded.supervisedCount, encoded.answerTokenCount + 1, "answer tokens plus EOS");
    for (let s = 0; s < encoded.promptTokenCount - 1; s++) {
      assertEqual(encoded.mask[s], 0, `prompt-internal position ${s} is masked`);
    }
    for (let s = encoded.promptTokenCount - 1; s <= encoded.eosIndex - 1; s++) {
      assertEqual(encoded.mask[s], 1, `supervised position ${s}`);
    }
    assertEqual(
      encoded.mask[encoded.eosIndex],
      0,
      "EOS position predicts padding and is not supervised"
    );
    for (let s = encoded.eosIndex + 1; s < CHAT_SFT_BLOCK_SIZE; s++) {
      assertEqual(encoded.mask[s], 0, `pad position ${s} is masked`);
    }
  });

  test("two-turn mask does not supervise the first assistant answer", () => {
    // Character-level stub: one token per code point, so positions are exact and
    // the test measures the mask contract rather than BPE boundary behavior.
    const charTokenizer = {
      encode: (text: string): number[] =>
        Array.from(text).map(
          (character) => 4 + ((character.codePointAt(0) ?? 0) % 200)
        ),
    } as unknown as BPETokenizer;

    const encoded = encodeChatSftSample(TWO_TURN_SAMPLE, charTokenizer);
    const firstAnswer = "That sounds nice.";
    const firstAnswerStart = Array.from(
      "User: I am going to Paris.\nAssistant:"
    ).length;
    const firstAnswerTokens = Array.from(" " + firstAnswer);

    for (let i = 0; i < firstAnswerTokens.length; i++) {
      const position = firstAnswerStart + i - 1;
      assertEqual(encoded.mask[position], 0, `first answer token ${i} is context`);
    }
    assertEqual(
      encoded.supervisedCount,
      encoded.answerTokenCount + 1,
      "only the final answer and EOS are supervised"
    );
  });

  test("targetIds follow the TextSample pre-shift contract", () => {
    const encoded = encodeChatSftSample(SINGLE_SAMPLE, getTokenizer());
    for (let s = 0; s < CHAT_SFT_BLOCK_SIZE - 1; s++) {
      assertEqual(encoded.targetIds[s], encoded.inputIds[s + 1], `target shift at ${s}`);
    }
    assertEqual(encoded.targetIds[CHAT_SFT_BLOCK_SIZE - 1], 0, "last target is pad");
  });

  test("parser rejects an unknown language", () => {
    const invalid = JSON.parse(JSON.stringify({
      dataset: "chat-sft",
      version: "1.0.0",
      schemaVersion: 1,
      purpose: "instruction",
      template: { user: "User: ", assistant: "Assistant: ", separator: "\n" },
      createdAt: "2026-10-20",
      samples: [{ ...SINGLE_SAMPLE, language: "fr" }],
    })) as unknown;
    let threw = false;
    try {
      parseChatSftDatasetFile(invalid);
    } catch {
      threw = true;
    }
    assert(threw, "unknown language rejected");
  });

  // ── Dataset split/count, leakage, and control mapping ────

  test("dataset has the frozen split and language counts", () => {
    const dataset = loadDatasetIfPresent();
    if (!dataset) {
      skip("dataset counts", "chat-sft.json is absent");
      return;
    }
    const tokenizer = getTokenizer();
    const audit = auditChatSftDataset(dataset, tokenizer);
    const details = audit.issues.length > 0 ? `\n${audit.issues.join("\n")}` : "";
    assert(audit.issues.length === 0, `dataset audit is clean${details}`);
    assertEqual(audit.total, 132, "total samples");
    assertEqual(audit.bySplit.train, 84, "train samples");
    assertEqual(audit.bySplit.validation, 21, "validation samples");
    assertEqual(audit.bySplit.test, 27, "test samples");
    assertEqual(audit.byLanguage.en, 44, "en samples");
    assertEqual(audit.byLanguage.zh, 44, "zh samples");
    assertEqual(audit.byLanguage.mixed, 44, "mixed samples");
  });

  test("ChatSftDataset exposes padded samples for a split", () => {
    const dataset = loadDatasetIfPresent();
    if (!dataset) {
      skip("ChatSftDataset split access", "chat-sft.json is absent");
      return;
    }
    const train = new ChatSftDataset({
      tokenizer: getTokenizer(),
      dataset,
      split: "train",
    });
    assertEqual(train.length(), 84, "train length");
    const sample = train.get(0);
    assertEqual(sample.inputIds.length, CHAT_SFT_BLOCK_SIZE, "padded input length");
    assertEqual(sample.mask?.length, CHAT_SFT_BLOCK_SIZE, "mask length");
    assert(
      sample.mask?.every((value) => value === 0 || value === 1) ?? false,
      "mask values are 0/1"
    );
  });

  test("control mapping is deterministic and leaves test samples untouched", () => {
    const dataset = loadDatasetIfPresent();
    if (!dataset) {
      skip("control mapping", "chat-sft.json is absent");
      return;
    }
    const tokenizer = getTokenizer();
    const first = buildChatSftControlMapping(dataset, tokenizer, "sha", "fp");
    const second = buildChatSftControlMapping(dataset, tokenizer, "sha", "fp");
    assertEqual(
      JSON.stringify(first),
      JSON.stringify(second),
      "mapping is deterministic"
    );
    const testIds = new Set(
      dataset.samples.filter((sample) => sample.split === "test").map((sample) => sample.id)
    );
    for (const entry of first.entries) {
      assert(!testIds.has(entry.sampleId), `test sample ${entry.sampleId} is not mapped`);
      assert(entry.sampleId !== entry.sourceSampleId, "no fixed points");
    }
    const control = applyChatSftControlMapping(dataset, first);
    assertEqual(
      control.samples.filter((sample) => sample.split === "test").length,
      27,
      "test split preserved"
    );
  });

  test("control mapping parser rejects a malformed object", () => {
    let threw = false;
    try {
      parseChatSftControlMapping({ entries: [] });
    } catch {
      threw = true;
    }
    assert(threw, "malformed mapping rejected");
  });

  console.log(`  Phase 113: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return { passed, failed, skipped };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase113-chat-sft.test.ts")) {
  const result = runPhase113Tests();
  if (result.failed > 0) process.exitCode = 1;
}
