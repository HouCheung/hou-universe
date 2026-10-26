// ============================================================
// BPETokenizer tests
// ============================================================
// Run with: npx tsx src/lib/minimind/tokenizer/BPETokenizer.test.ts
// ============================================================

import { BPETokenizer } from "./BPETokenizer";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEq<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============================================================
// Test suites
// ============================================================

function testConstruction(): void {
  console.log("\n[Construction]");

  const tok = new BPETokenizer();
  assert(tok instanceof BPETokenizer, "creates instance");
  assertEq(tok.isTrained, false, "untrained by default");

  // Special tokens are auto-created
  const vocab = tok.getVocabulary();
  assert(vocab.size >= 4, "has at least special tokens");
  assert(vocab.tokenToId.has("<pad>"), "has <pad> token");
  assert(vocab.tokenToId.has("<unk>"), "has <unk> token");
  assert(vocab.tokenToId.has("<bos>"), "has <bos> token");
  assert(vocab.tokenToId.has("<eos>"), "has <eos> token");
}

function testTrainingBasic(): void {
  console.log("\n[Training — Basic]");

  const tok = new BPETokenizer();
  const corpus = [
    "hello world hello",
    "world hello world",
  ];

  tok.train(corpus, 300); // small vocab

  assert(tok.isTrained, "is trained after train()");
  assert(tok.vocabSize > 4, "vocab grew beyond special tokens");
  assert(tok.vocabSize <= 300, "vocab does not exceed target");
}

function testTrainingProducesMerges(): void {
  console.log("\n[Training — Produces Merges]");

  const tok = new BPETokenizer();
  // Repetitive text to force merges
  const corpus: string[] = [];
  for (let i = 0; i < 100; i++) {
    corpus.push("the cat sat on the mat the dog sat on the log");
  }

  const initialVocab = tok.getVocabulary().size;
  tok.train(corpus, 500);

  assert(tok.vocabSize > initialVocab, "vocab grew from training");
  assert(tok.vocabSize <= 500, "vocab within target");

  // Should create some merges from common patterns
  const state = tok.toState();
  assert(state.merges.length > 0, "created merge rules");
}

function testEncodeDecodeRoundtrip(): void {
  console.log("\n[Encode/Decode — Roundtrip]");

  const tok = new BPETokenizer();
  const corpus = [
    "hello world this is a test of the emergency broadcast system",
    "the quick brown fox jumps over the lazy dog",
    "to be or not to be that is the question",
  ];
  // Repeat to get meaningful merges
  const repeated: string[] = [];
  for (let i = 0; i < 50; i++) {
    repeated.push(...corpus);
  }

  tok.train(repeated, 500);

  const text = "hello world this is a test";
  const encoded = tok.encode(text);
  const decoded = tok.decode(encoded);

  assert(encoded.length > 0, "encode returns non-empty array");
  assertEq(decoded, text, `roundtrip decode matches: "${decoded}" === "${text}"`);
}

function testEncodeEmpty(): void {
  console.log("\n[Encode/Decode — Edge Cases]");

  const tok = new BPETokenizer();

  assertDeepEq(tok.encode(""), [], "encode empty string returns []");
  assertEq(tok.decode([]), "", "decode empty array returns ''");

  // Untrained tokenizer uses byte-level encoding
  const encoded = tok.encode("hello");
  assert(encoded.length > 0, "untrained tokenizer encodes bytes");
  assertEq(tok.decode(encoded), "hello", "untrained roundtrip works");
}

function testSerialization(): void {
  console.log("\n[Serialization]");

  const tok = new BPETokenizer();
  const corpus: string[] = [];
  for (let i = 0; i < 50; i++) {
    corpus.push("the quick brown fox jumps over the lazy dog");
  }
  tok.train(corpus, 400);

  const state = tok.toState();
  assertEq(state.version, 1, "state version is 1");
  assert(state.merges.length > 0, "state has merges");
  assert(Object.keys(state.vocab).length > 0, "state has vocab");

  // Load into new tokenizer
  const tok2 = new BPETokenizer();
  tok2.fromState(state);

  assertEq(tok2.isTrained, true, "loaded tokenizer is trained");
  assertEq(tok2.vocabSize, tok.vocabSize, "vocab size matches");

  // Encode/decode should produce same results
  const text = "the quick brown fox";
  const enc1 = tok.encode(text);
  const enc2 = tok2.encode(text);
  assertDeepEq(enc1, enc2, "encode matches after load");
  assertEq(tok2.decode(enc2), tok.decode(enc1), "decode matches after load");
}

function testAddToken(): void {
  console.log("\n[Token Management]");

  const tok = new BPETokenizer();

  const id = tok.addToken("custom_token");
  assert(id >= 4, "custom token gets ID >= 4 (after special tokens)");

  const id2 = tok.addToken("custom_token");
  assertEq(id, id2, "adding same token returns same ID (idempotent)");

  assert(tok.hasToken("custom_token"), "hasToken works");
  assertEq(tok.getTokenId("custom_token"), id, "getTokenId works");
  assertEq(tok.getTokenId("nonexistent"), undefined, "getTokenId returns undefined for unknown");
}

function testVocabSizeAfterTraining(): void {
  console.log("\n[Training — Vocab Size Control]");

  // Use a large, varied corpus so that higher vocab targets actually
  // produce more merges
  const corpus: string[] = [];
  const words = [
    "the", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog",
    "hello", "world", "this", "is", "a", "test", "of", "the", "tokenizer",
    "machine", "learning", "deep", "neural", "network", "training", "data",
    "language", "model", "transformer", "attention", "mechanism",
  ];
  for (let i = 0; i < 200; i++) {
    corpus.push(words.join(" "));
  }

  // Test with small target
  const tok1 = new BPETokenizer();
  tok1.train(corpus, 300);
  assert(tok1.vocabSize <= 300, "small target: vocab <= 300");

  // Test with larger target
  const tok2 = new BPETokenizer();
  tok2.train(corpus, 600);
  assert(tok2.vocabSize <= 600, "large target: vocab <= 600");
  assert(tok2.vocabSize > tok1.vocabSize, "larger target produces larger vocab");
}

function testEncodeDecodeUntrained(): void {
  console.log("\n[Encode/Decode — Untrained Byte-Level]");

  const tok = new BPETokenizer();

  // Untrained tokenizer should work at byte level
  const text = "Hello, 世界!";
  const encoded = tok.encode(text);
  const decoded = tok.decode(encoded);

  assertEq(decoded, text, "untrained roundtrip preserves Unicode");
  assert(encoded.length > 0, "produces tokens");
}

function testTrainingEmptyCorpus(): void {
  console.log("\n[Training — Error Handling]");

  const tok = new BPETokenizer();

  let threw = false;
  try {
    tok.train([], 300);
  } catch {
    threw = true;
  }
  assert(threw, "throws on empty corpus");
}

function testTrainingVocabTooSmall(): void {
  console.log("\n[Training — Validation]");

  const tok = new BPETokenizer();

  let threw = false;
  try {
    tok.train(["hello"], 100); // < 260 minimum
  } catch {
    threw = true;
  }
  assert(threw, "throws on vocabSize < 260");
}

function testSpecialTokenIds(): void {
  console.log("\n[Special Tokens]");

  const tok = new BPETokenizer();

  const vocab = tok.getVocabulary();
  assertEq(vocab.tokenToId.get("<pad>"), 0, "<pad> is ID 0");
  assertEq(vocab.tokenToId.get("<unk>"), 1, "<unk> is ID 1");
  assertEq(vocab.tokenToId.get("<bos>"), 2, "<bos> is ID 2");
  assertEq(vocab.tokenToId.get("<eos>"), 3, "<eos> is ID 3");
}

function testTrainingWithProgress(): void {
  console.log("\n[Training — Progress Callback]");

  const tok = new BPETokenizer();
  const corpus: string[] = [];
  for (let i = 0; i < 30; i++) {
    corpus.push("the quick brown fox jumps over the lazy dog");
  }

  const progressCalls: { current: number; target: number }[] = [];
  tok.train(corpus, 400, (current, target) => {
    progressCalls.push({ current, target });
  });

  assert(progressCalls.length > 0, "progress callback was called");
  assertEq(progressCalls[progressCalls.length - 1].target, 400, "final callback has correct target");
}

// ============================================================
// Runner
// ============================================================

export function runBPETokenizerTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n" + "=".repeat(60));
  console.log("BPETokenizer Tests");
  console.log("=".repeat(60));

  testConstruction();
  testTrainingBasic();
  testTrainingProducesMerges();
  testEncodeDecodeRoundtrip();
  testEncodeEmpty();
  testSerialization();
  testAddToken();
  testVocabSizeAfterTraining();
  testEncodeDecodeUntrained();
  testTrainingEmptyCorpus();
  testTrainingVocabTooSmall();
  testSpecialTokenIds();
  testTrainingWithProgress();

  console.log(`\nBPETokenizer: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Allow direct execution
if (require.main === module) {
  const result = runBPETokenizerTests();
  if (result.failed > 0) {
    process.exit(1);
  }
}
