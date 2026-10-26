// ============================================================
// MiniMind — data/__tests__/corpus.test.ts
// ============================================================
// Tests for TextCorpus, TinyStoriesDataset, and ITokenizer adapter
// ============================================================

import { TextCorpus } from "../TextCorpus";
import { TinyStoriesDataset } from "../TinyStoriesDataset";
import { TextDataset } from "../TextDataset";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";
import type { ITokenizer } from "../ITokenizer";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function assertDeepEq<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

// ============================================================
// TextCorpus tests
// ============================================================

function testTextCorpusInline(): void {
  console.log("\n[TextCorpus — Inline]");

  const corpus = new TextCorpus({
    type: "inline",
    texts: ["hello world", "goodbye moon"],
  });

  assertEq(corpus.length, 2, "has 2 documents");
  assertEq(corpus.get(0), "hello world", "get(0) works");
  assertEq(corpus.get(1), "goodbye moon", "get(1) works");

  const docs = corpus.documents();
  assertEq(docs.length, 2, "documents() returns all");

  // Iteration
  const iterated: string[] = [];
  for (const doc of corpus) {
    iterated.push(doc);
  }
  assertDeepEq(iterated, ["hello world", "goodbye moon"], "iteration works");
}

function testTextCorpusMaxDocuments(): void {
  console.log("\n[TextCorpus — Max Documents]");

  const corpus = new TextCorpus(
    { type: "inline", texts: ["a", "b", "c", "d", "e"] },
    { maxDocuments: 3 }
  );

  assertEq(corpus.length, 3, "respects maxDocuments");
}

function testTextCorpusEmpty(): void {
  console.log("\n[TextCorpus — Empty]");

  const corpus = new TextCorpus({
    type: "inline",
    texts: [],
  });

  assertEq(corpus.length, 0, "empty corpus has length 0");
}

function testTextCorpusGetError(): void {
  console.log("\n[TextCorpus — Error Handling]");

  const corpus = new TextCorpus({
    type: "inline",
    texts: ["only one"],
  });

  let threw = false;
  try {
    corpus.get(5);
  } catch {
    threw = true;
  }
  assert(threw, "throws on out-of-bounds index");
}

// ============================================================
// TinyStoriesDataset tests (using inline data for testing)
// ============================================================

function testTinyStoriesFromTexts(): void {
  console.log("\n[TinyStories — From Texts]");

  const stories = [
    "Once upon a time, a cat sat on a mat.",
    "The dog ran fast to the park.",
    "A bird flew high in the sky.",
  ];

  const ds = TinyStoriesDataset.fromTexts(stories);

  assertEq(ds.length, 3, "has 3 stories");
  assertEq(ds.split, "train", "default split is train");
  assertEq(ds.getStory(0), stories[0], "getStory works");

  const all = ds.stories();
  assertEq(all.length, 3, "stories() returns all");
}

function testTinyStoriesIteration(): void {
  console.log("\n[TinyStories — Iteration]");

  const stories = ["story one", "story two"];
  const ds = TinyStoriesDataset.fromTexts(stories);

  const collected: string[] = [];
  for (const story of ds) {
    collected.push(story);
  }
  assertDeepEq(collected, stories, "iteration yields all stories");
}

function testTinyStoriesEncodeAll(): void {
  console.log("\n[TinyStories — EncodeAll]");

  const stories = ["hello world", "foo bar"];
  const ds = TinyStoriesDataset.fromTexts(stories);

  // Use MiniTokenizer with known vocabulary
  const tok = new MiniTokenizer();
  tok.addToken("hello");
  tok.addToken("world");
  tok.addToken("foo");
  tok.addToken("bar");

  const ids = ds.encodeAll(tok);
  assert(ids.length > 0, "encodeAll returns IDs");
  // Should contain tokens for "hello", "world", "foo", "bar"
  const decoded = tok.decode(ids);
  assert(decoded.includes("hello"), "decoded contains hello");
}

function testTinyStoriesWithConfig(): void {
  console.log("\n[TinyStories — Config]");

  const stories = Array.from({ length: 10 }, (_, i) => `story ${i}`);
  const ds = TinyStoriesDataset.fromTexts(stories, {
    split: "validation",
    maxStories: 5,
  });

  assertEq(ds.length, 5, "respects maxStories");
  assertEq(ds.split, "validation", "respects split config");
}

// ============================================================
// Tokenizer Adapter — TextDataset with BPETokenizer
// ============================================================

function testTextDatasetWithBPETokenizer(): void {
  console.log("\n[Tokenizer Adapter — TextDataset + BPE]");

  // Train a BPE tokenizer on some text
  const bpe = new BPETokenizer();
  const trainingCorpus: string[] = [];
  for (let i = 0; i < 50; i++) {
    trainingCorpus.push("the cat sat on the mat the dog sat on the log");
  }
  bpe.train(trainingCorpus, 500);

  // Create TextDataset with BPE tokenizer
  const ds = new TextDataset({
    tokenizer: bpe as ITokenizer,
    corpus: "the cat sat on the mat",
    blockSize: 4,
  });

  assert(ds.length() > 0, "TextDataset works with BPE tokenizer");

  const sample = ds.get(0);
  assert(sample.inputIds.length === 4, "inputIds length matches blockSize");
  assert(sample.targetIds.length === 4, "targetIds length matches blockSize");

  // Round-trip: decode input IDs back to text
  const decoded = bpe.decode(sample.inputIds);
  assert(decoded.length > 0, "can decode BPE-encoded samples");
}

function testTextDatasetWithMiniTokenizer(): void {
  console.log("\n[Tokenizer Adapter — TextDataset + MiniTokenizer]");

  const tok = new MiniTokenizer();
  tok.addToken("hello");
  tok.addToken("world");
  tok.addToken("this");
  tok.addToken("is");
  tok.addToken("a");
  tok.addToken("test");

  const ds = new TextDataset({
    tokenizer: tok as ITokenizer,
    corpus: "hello world this is a test",
    blockSize: 3,
  });

  assert(ds.length() > 0, "TextDataset works with MiniTokenizer via adapter");

  const sample = ds.get(0);
  assertEq(sample.inputIds.length, 3, "sample has correct length");
}

// ============================================================
// Runner
// ============================================================

export function runCorpusTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n" + "=".repeat(60));
  console.log("Corpus & Dataset Adapter Tests");
  console.log("=".repeat(60));

  testTextCorpusInline();
  testTextCorpusMaxDocuments();
  testTextCorpusEmpty();
  testTextCorpusGetError();
  testTinyStoriesFromTexts();
  testTinyStoriesIteration();
  testTinyStoriesEncodeAll();
  testTinyStoriesWithConfig();
  testTextDatasetWithBPETokenizer();
  testTextDatasetWithMiniTokenizer();

  console.log(`\nCorpus & Dataset: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

if (require.main === module) {
  const result = runCorpusTests();
  if (result.failed > 0) process.exit(1);
}
