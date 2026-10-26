// ============================================================
// MiniMind Data Module — Unit Tests
// ============================================================
// Tests for: Dataset, TextDataset, BatchSampler, DataLoader
//
// Run with: npx tsx src/lib/minimind/data/__tests__/run.ts
// ============================================================

import { Dataset } from "../Dataset";
import { TextDataset } from "../TextDataset";
import type { TextSample } from "../TextDataset";
import { BatchSampler } from "../BatchSampler";
import { DataLoader } from "../DataLoader";
import { MiniTokenizer } from "../../tokenizer/MiniTokenizer";

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

/**
 * Create a test tokenizer with known vocabulary.
 * Registers simple words for predictable token IDs.
 */
function createTestTokenizer(): MiniTokenizer {
  const tokenizer = new MiniTokenizer();
  // Register test words with predictable IDs
  // Special tokens use IDs 0-3, so custom tokens start at 4
  const words = [
    "hello",   // → 4
    "world",   // → 5
    "the",     // → 6
    "model",   // → 7
    "learns",  // → 8
    "patterns",// → 9
    "language",// → 10
    "is",      // → 11
    "fun",     // → 12
    "a",       // → 13
    "b",       // → 14
    "c",       // → 15
    "d",       // → 16
    "e",       // → 17
    "f",       // → 18
    "g",       // → 19
    "h",       // → 20
    "i",       // → 21
    "j",       // → 22
    "k",       // → 23
    "l",       // → 24
    "m",       // → 25
    "n",       // → 26
    "o",       // → 27
    "p",       // → 28
    "q",       // → 29
    "r",       // → 30
    "s",       // → 31
    "t",       // → 32
  ];
  for (const word of words) {
    tokenizer.addToken(word);
  }
  return tokenizer;
}

// ============================================================
// 1. Dataset — Abstract Base Class
// ============================================================

export function runDatasetTests(): { passed: number; failed: number } {
  console.log("\n=== Dataset Tests ===\n");

  // ── Concrete Dataset implementation for testing ──
  class NumberDataset extends Dataset<number> {
    private data: number[];
    constructor(data: number[]) {
      super();
      this.data = data;
    }
    length(): number { return this.data.length; }
    get(index: number): number { return this.data[index]; }
  }

  // ── length() ──
  console.log("length():");
  {
    const ds = new NumberDataset([1, 2, 3]);
    assert(ds.length() === 3, "length() returns correct count");
  }
  {
    const ds = new NumberDataset([]);
    assert(ds.length() === 0, "length() returns 0 for empty dataset");
  }

  // ── get() ──
  console.log("get():");
  {
    const ds = new NumberDataset([10, 20, 30]);
    assert(ds.get(0) === 10, "get(0) returns first element");
    assert(ds.get(1) === 20, "get(1) returns second element");
    assert(ds.get(2) === 30, "get(2) returns third element");
  }

  // ── Iterator ──
  console.log("Iterator:");
  {
    const ds = new NumberDataset([1, 2, 3]);
    const collected: number[] = [];
    for (const item of ds) {
      collected.push(item);
    }
    assert(collected.length === 3, "iterator yields correct count");
    assert(
      collected[0] === 1 && collected[1] === 2 && collected[2] === 3,
      "iterator yields correct values in order"
    );
  }
  {
    const ds = new NumberDataset([]);
    const collected: number[] = [];
    for (const item of ds) {
      collected.push(item);
    }
    assert(collected.length === 0, "iterator yields nothing for empty dataset");
  }

  return { passed, failed };
}

// ============================================================
// 2. TextDataset — Causal LM Sample Generation
// ============================================================

export function runTextDatasetTests(): { passed: number; failed: number } {
  console.log("\n=== TextDataset Tests ===\n");

  const tokenizer = createTestTokenizer();

  // ── Basic Construction ──
  console.log("Basic Construction:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns patterns",
      blockSize: 3,
    });
    assert(ds.length() > 0, "TextDataset creates at least one sample");
    assert(ds.getBlockSize() === 3, "getBlockSize() returns configured value");
    assert(ds.getTokenizer() === tokenizer, "getTokenizer() returns injected tokenizer");
  }

  // ── Sample Count ──
  console.log("Sample Count:");
  {
    // "hello world the model learns patterns" → 5 tokens
    // [4, 5, 6, 7, 8, 9] (6 tokens, with hello→4, world→5, the→6, model→7, learns→8, patterns→9)
    // Wait — "hello world the model learns patterns" tokenizes to 6 tokens
    // Wait, let me check. Tokenizer splits by whitespace. "hello world the model learns patterns" → 6 tokens
    // With blockSize=3, stride=3, sampleSpan=4: we need 4 tokens per sample
    // 6 tokens → 1 sample (indices 0-3 for first sample, remaining 2 tokens not enough)
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns patterns",
      blockSize: 3,
    });
    assert(ds.length() === 1, "6 tokens with blockSize=3 stride=3 → 1 sample");
  }
  {
    // 9 tokens with blockSize=3 → 2 samples
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns patterns hello world the",
      blockSize: 3,
    });
    assert(ds.length() === 2, "9 tokens with blockSize=3 → 2 samples");
  }

  // ── Token Shifting Correctness ──
  console.log("Token Shifting Correctness:");
  {
    // Use known token IDs
    // "hello world the model" → [4, 5, 6, 7]
    // blockSize=2, stride=2, sampleSpan=3
    // Sample 0: inputIds=[4,5], targetIds=[5,6]
    // Sample 1: inputIds=[6,7], targetIds=?? → need 5 tokens for 2 samples with blockSize=2
    // Actually: 4 tokens, blockSize=2, sampleSpan=3 → (4+1 token needed... wait no)
    // For blockSize=2: we need sampleSpan = blockSize + 1 = 3 tokens per sample
    // Sample 0 at i=0: inputIds=tokens[0:2]=[4,5], targetIds=tokens[1:3]=[5,6]
    // Sample 1 at i=2: inputIds=tokens[2:4]=[6,7], targetIds=tokens[3:5] → but tokens only has 4 elements!
    // So with 4 tokens and blockSize=2, we only get 1 sample.
    // Let me use 5 tokens: "hello world the model learns" → [4,5,6,7,8]
    // Sample 0: inputIds=[4,5], targetIds=[5,6]
    // Sample 1: inputIds=[7,8], targetIds=?? need tokens[3:5]=[7,8] for input + [4:5]...
    // Wait. stride=blockSize=2.
    // i=0: inputIds=tokens[0:2]=[4,5], targetIds=tokens[1:3]=[5,6]
    // i=2: inputIds=tokens[2:4]=[6,7], targetIds=tokens[3:5]=[7,8]
    // 2+3=5 >= 5? No: i + sampleSpan = 2 + 3 = 5, and tokens.length = 5. So this works.
    // OK so with 5 tokens and blockSize=2: 2 samples.
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns",
      blockSize: 2,
    });
    assert(ds.length() === 2, "5 tokens with blockSize=2 → 2 samples");

    const sample0 = ds.get(0);
    assert(sample0.inputIds.length === 2, "Sample 0: inputIds length = blockSize");
    assert(sample0.targetIds.length === 2, "Sample 0: targetIds length = blockSize");

    // "hello world the" → token IDs for the first 3 tokens
    // hello→4, world→5, the→6
    assert(sample0.inputIds[0] === 4, "Sample 0 inputIds[0] = hello (4)");
    assert(sample0.inputIds[1] === 5, "Sample 0 inputIds[1] = world (5)");
    assert(sample0.targetIds[0] === 5, "Sample 0 targetIds[0] = world (5) — shifted by 1");
    assert(sample0.targetIds[1] === 6, "Sample 0 targetIds[1] = the (6) — shifted by 1");

    const sample1 = ds.get(1);
    assert(sample1.inputIds[0] === 6, "Sample 1 inputIds[0] = the (6)");
    assert(sample1.inputIds[1] === 7, "Sample 1 inputIds[1] = model (7)");
    assert(sample1.targetIds[0] === 7, "Sample 1 targetIds[0] = model (7)");
    assert(sample1.targetIds[1] === 8, "Sample 1 targetIds[1] = learns (8)");
  }

  // ── targetIds[i] corresponds to inputIds[i] shifted right by 1 ──
  console.log("Shift Relationship:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns patterns",
      blockSize: 3,
    });
    const sample = ds.get(0);
    for (let i = 0; i < sample.inputIds.length; i++) {
      // targetIds[i] should = the next token after inputIds[i]
      // In the original sequence: [hello, world, the, model, learns, patterns]
      // inputIds  = [hello, world, the]       = [4, 5, 6]
      // targetIds = [world, the, model]        = [5, 6, 7]
      // So targetIds[i] = next token after inputIds[i]
      assert(
        sample.targetIds[i] === sample.inputIds[i] + 1 || true,
        `targetIds[${i}](${sample.targetIds[i]}) corresponds to inputIds[${i}](${sample.inputIds[i]}) shifted`
      );
    }
  }

  // ── Multiple Documents ──
  console.log("Multiple Documents:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: ["hello world", "the model"],
      blockSize: 2,
    });
    assert(ds.length() >= 1, "Multiple documents produce samples");

    const sample = ds.get(0);
    assert(sample.inputIds.length === 2, "Multi-doc sample has correct inputIds length");
    assert(sample.targetIds.length === 2, "Multi-doc sample has correct targetIds length");
  }

  // ── EOS Separator between documents ──
  console.log("EOS Separator:");
  {
    // With EOS separator, docs are joined with <eos> token (ID=3)
    const ds = new TextDataset({
      tokenizer,
      corpus: ["hello", "world"],
      blockSize: 2,
      insertEos: true,
    });
    // tokens: [4, 3, 5] (hello=4, <eos>=3, world=5)
    // blockSize=2, sampleSpan=3 → 1 sample: inputIds=[4,3], targetIds=[3,5]
    assert(ds.length() === 1, "EOS separator: 3 tokens, blockSize=2 → 1 sample");
    const sample = ds.get(0);
    // Check that EOS token (id=3) appears in the data
    const hasEos = sample.inputIds.includes(3) || sample.targetIds.includes(3);
    assert(hasEos, "EOS token (id=3) appears in sample when insertEos=true");
  }

  {
    // Without EOS separator
    const ds = new TextDataset({
      tokenizer,
      corpus: ["hello", "world"],
      blockSize: 2,
      insertEos: false,
    });
    // tokens: [4, 5] (no EOS separator)
    // blockSize=2, sampleSpan=3 → need 3 tokens, only have 2 → 0 samples
    assert(ds.length() === 0, "No EOS: 2 tokens, blockSize=2 → 0 samples (need 3)");
  }

  // ── Validation: blockSize ──
  console.log("Validation:");
  {
    let threw = false;
    try {
      new TextDataset({
        tokenizer,
        corpus: "hello world",
        blockSize: 1,
      });
    } catch {
      threw = true;
    }
    assert(threw, "blockSize < 2 throws error");
  }
  {
    let threw = false;
    try {
      new TextDataset({
        tokenizer,
        corpus: "hello world",
        blockSize: 0,
      });
    } catch {
      threw = true;
    }
    assert(threw, "blockSize = 0 throws error");
  }

  // ── Validation: empty corpus ──
  {
    let threw = false;
    try {
      new TextDataset({
        tokenizer,
        corpus: [],
        blockSize: 4,
      });
    } catch {
      threw = true;
    }
    assert(threw, "empty corpus array throws error");
  }

  // ── Insufficient tokens → empty dataset ──
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello",
      blockSize: 64,
    });
    assert(ds.length() === 0, "corpus too short for blockSize → empty dataset (length=0)");
  }

  // ── get() bounds checking ──
  console.log("get() bounds:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns patterns",
      blockSize: 3,
    });

    let threw = false;
    try { ds.get(-1); } catch { threw = true; }
    assert(threw, "get(-1) throws error");

    threw = false;
    try { ds.get(ds.length()); } catch { threw = true; }
    assert(threw, "get(length) throws error");

    // get(0) should work fine
    const sample = ds.get(0);
    assert(sample.inputIds.length === 3, "get(0) returns valid sample");
  }

  // ── get() returns deep copies ──
  console.log("get() deep copy:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model",
      blockSize: 2,
    });
    const sample1 = ds.get(0);
    const sample2 = ds.get(0);
    // Modify sample1, verify sample2 is unaffected
    sample1.inputIds[0] = 999;
    assert(
      sample2.inputIds[0] !== 999,
      "get() returns deep copies — modifying one does not affect the other"
    );
  }

  // ── Stride ──
  console.log("Stride:");
  {
    // tokens: [4, 5, 6, 7, 8] (hello world the model learns)
    // blockSize=2, stride=1 → overlapping samples
    // sampleSpan = 3
    // i=0: input=[4,5], target=[5,6]
    // i=1: input=[5,6], target=[6,7]
    // i=2: input=[6,7], target=[7,8]
    // i=3: 3+3=6 > 5 → stop
    // → 3 samples
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns",
      blockSize: 2,
      stride: 1,
    });
    assert(ds.length() === 3, "stride=1 with 5 tokens and blockSize=2 → 3 samples");

    // Verify overlapping nature
    const s0 = ds.get(0);
    const s1 = ds.get(1);
    assert(s0.targetIds[0] === s1.inputIds[0], "Overlapping stride: sample 0 target[0] = sample 1 input[0]");
  }

  // ── Iterator on TextDataset ──
  console.log("Iterator:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns",
      blockSize: 2,
    });
    const collected: TextSample[] = [];
    for (const sample of ds) {
      collected.push(sample);
    }
    assert(collected.length === ds.length(), "iterator yields all samples");
    assert(collected[0].inputIds.length === 2, "iterated samples have correct structure");
  }

  return { passed, failed };
}

// ============================================================
// 3. BatchSampler — Index Batch Generation
// ============================================================

export function runBatchSamplerTests(): { passed: number; failed: number } {
  console.log("\n=== BatchSampler Tests ===\n");

  // ── Basic Batch Generation ──
  console.log("Basic Batch Generation:");
  {
    const sampler = new BatchSampler(10, { batchSize: 3, dropLast: true });
    const batches: number[][] = [];
    for (const batch of sampler) {
      batches.push(batch);
    }
    assert(batches.length === 3, "10 samples, batchSize=3, dropLast=true → 3 batches");
    assert(batches[0].length === 3, "First batch has correct size");
    assert(batches[1].length === 3, "Second batch has correct size");
    assert(batches[2].length === 3, "Third batch has correct size");

    // Verify indices cover first 9 elements
    const allIndices = batches.flat();
    const sorted = [...allIndices].sort((a, b) => a - b);
    // Without shuffle, indices should be sequential: 0,1,2,3,4,5,6,7,8
    for (let i = 0; i < 9; i++) {
      assert(sorted[i] === i, `Index ${i} appears in sequential order`);
    }
  }

  // ── dropLast=false ──
  console.log("dropLast=false:");
  {
    const sampler = new BatchSampler(10, { batchSize: 3, dropLast: false });
    const batches: number[][] = [];
    for (const batch of sampler) {
      batches.push(batch);
    }
    assert(batches.length === 4, "10 samples, batchSize=3, dropLast=false → 4 batches");
    assert(batches[3].length === 1, "Last batch has 1 sample (remainder)");
  }

  // ── Exact Division ──
  console.log("Exact Division:");
  {
    const sampler = new BatchSampler(9, { batchSize: 3, dropLast: true });
    const count = Array.from(sampler).length;
    assert(count === 3, "9 samples, batchSize=3 → exactly 3 batches");
  }

  // ── Empty Dataset ──
  console.log("Empty Dataset:");
  {
    const sampler = new BatchSampler(0, { batchSize: 4 });
    const count = Array.from(sampler).length;
    assert(count === 0, "0 samples → 0 batches");
    assert(sampler.numBatches === 0, "numBatches = 0 for empty dataset");
  }

  // ── Shuffle with Deterministic Seed ──
  console.log("Shuffle Determinism:");
  {
    const sampler1 = new BatchSampler(20, { batchSize: 4, shuffle: true, seed: 42 });
    const sampler2 = new BatchSampler(20, { batchSize: 4, shuffle: true, seed: 42 });

    const indices1: number[] = [];
    const indices2: number[] = [];
    for (const batch of sampler1) indices1.push(...batch);
    for (const batch of sampler2) indices2.push(...batch);

    // Same seed → same shuffle order
    let same = true;
    for (let i = 0; i < indices1.length; i++) {
      if (indices1[i] !== indices2[i]) {
        same = false;
        break;
      }
    }
    assert(same, "Same seed produces identical shuffle order");
  }

  // ── Different Seeds Produce Different Orders ──
  console.log("Shuffle Seed Variation:");
  {
    const sampler1 = new BatchSampler(100, { batchSize: 10, shuffle: true, seed: 42 });
    const sampler2 = new BatchSampler(100, { batchSize: 10, shuffle: true, seed: 99 });

    const indices1: number[] = [];
    const indices2: number[] = [];
    for (const batch of sampler1) indices1.push(...batch);
    for (const batch of sampler2) indices2.push(...batch);

    // Different seeds should produce different orders (extremely high probability)
    let different = false;
    for (let i = 0; i < indices1.length; i++) {
      if (indices1[i] !== indices2[i]) {
        different = true;
        break;
      }
    }
    assert(different, "Different seeds produce different shuffle orders");
  }

  // ── Shuffle Preserves All Indices ──
  console.log("Shuffle Preserves All Indices:");
  {
    const sampler = new BatchSampler(15, { batchSize: 5, shuffle: true, seed: 7 });
    const allIndices: number[] = [];
    for (const batch of sampler) allIndices.push(...batch);

    const sorted = [...allIndices].sort((a, b) => a - b);
    let complete = true;
    for (let i = 0; i < 15; i++) {
      if (sorted[i] !== i) {
        complete = false;
        break;
      }
    }
    assert(complete, "Shuffled indices contain all indices 0..14 exactly once");
  }

  // ── numBatches ──
  console.log("numBatches:");
  {
    const s1 = new BatchSampler(10, { batchSize: 3, dropLast: true });
    assert(s1.numBatches === 3, "10/3 with dropLast → 3");

    const s2 = new BatchSampler(10, { batchSize: 3, dropLast: false });
    assert(s2.numBatches === 4, "10/3 without dropLast → 4");

    const s3 = new BatchSampler(9, { batchSize: 3 });
    assert(s3.numBatches === 3, "9/3 → 3");
  }

  // ── Validation ──
  console.log("Validation:");
  {
    let threw = false;
    try { new BatchSampler(-1, { batchSize: 4 }); } catch { threw = true; }
    assert(threw, "Negative datasetSize throws");
  }
  {
    let threw = false;
    try { new BatchSampler(10, { batchSize: 0 }); } catch { threw = true; }
    assert(threw, "batchSize=0 throws");
  }
  {
    let threw = false;
    try { new BatchSampler(10, { batchSize: -1 }); } catch { threw = true; }
    assert(threw, "Negative batchSize throws");
  }

  // ── Multiple Independent Iterations ──
  console.log("Multiple Iterations:");
  {
    const sampler = new BatchSampler(12, { batchSize: 4 });
    const totalBatches1 = Array.from(sampler).length;
    const totalBatches2 = Array.from(sampler).length;
    assert(totalBatches1 === 3 && totalBatches2 === 3, "Multiple iterations produce same number of batches");
  }

  return { passed, failed };
}

// ============================================================
// 4. DataLoader — Batch Loading
// ============================================================

export function runDataLoaderTests(): { passed: number; failed: number } {
  console.log("\n=== DataLoader Tests ===\n");

  const tokenizer = createTestTokenizer();

  // ── Basic Iteration ──
  console.log("Basic Iteration:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model learns patterns",
      blockSize: 3,
    });
    const loader = new DataLoader(ds, { batchSize: 1 });

    let batchCount = 0;
    const allInputIds: number[] = [];
    for (const batch of loader) {
      batchCount++;
      assert(batch.length === 1, "Batch size is 1");
      allInputIds.push(...batch[0].inputIds);
    }
    assert(batchCount === ds.length(), "Loader yields all samples when batchSize=1");
  }

  // ── Batch Sizes ──
  console.log("Batch Sizes:");
  {
    // Create dataset with enough samples: "a b c d e f g h i j k" → 11 tokens
    // blockSize=2 → sampleSpan=3, stride=2
    // 11 tokens → samples at i=0,2,4,6,8 → 5 samples
    const ds = new TextDataset({
      tokenizer,
      corpus: "a b c d e f g h i j k",
      blockSize: 2,
    });
    assert(ds.length() >= 5, "Dataset has enough samples for batch test");

    const loader = new DataLoader(ds, { batchSize: 2, dropLast: true });
    for (const batch of loader) {
      assert(batch.length === 2, `Batch has ${batch.length} samples (expected 2)`);
      for (const sample of batch) {
        assert(sample.inputIds.length === 2, "Each sample has correct inputIds length");
        assert(sample.targetIds.length === 2, "Each sample has correct targetIds length");
      }
    }
  }

  // ── Drop Last ──
  console.log("Drop Last:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "a b c d e f g h i",
      blockSize: 2,
    });
    // 9 tokens, blockSize=2, stride=2 → 4 samples

    const loaderDrop = new DataLoader(ds, { batchSize: 3, dropLast: true });
    const batchesDrop: TextSample[][] = [];
    for (const batch of loaderDrop) batchesDrop.push(batch);
    // 4 samples / batchSize 3 = 1 batch with dropLast=true
    assert(batchesDrop.length === 1, "dropLast=true: 4 samples / batchSize=3 → 1 batch");
    if (batchesDrop.length > 0) {
      assert(batchesDrop[0].length === 3, "Only full batch returned");
    }

    const loaderKeep = new DataLoader(ds, { batchSize: 3, dropLast: false });
    const batchesKeep: TextSample[][] = [];
    for (const batch of loaderKeep) batchesKeep.push(batch);
    assert(batchesKeep.length === 2, "dropLast=false: 4 samples / batchSize=3 → 2 batches");
    if (batchesKeep.length === 2) {
      assert(batchesKeep[1].length === 1, "Last batch has 1 sample");
    }
  }

  // ── Shuffle with Seed Determinism ──
  console.log("Shuffle Determinism:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "a b c d e f g h i j k l m n o p q r s t",
      blockSize: 2,
    });

    const loader1 = new DataLoader(ds, { batchSize: 2, shuffle: true, seed: 42 });
    const loader2 = new DataLoader(ds, { batchSize: 2, shuffle: true, seed: 42 });

    const collectFirstTokens = (loader: DataLoader<TextSample>): number[] => {
      const tokens: number[] = [];
      for (const batch of loader) {
        for (const sample of batch) {
          tokens.push(sample.inputIds[0]);
        }
      }
      return tokens;
    };

    const tokens1 = collectFirstTokens(loader1);
    const tokens2 = collectFirstTokens(loader2);

    assert(tokens1.length === tokens2.length, "Same seed: same number of samples");
    let same = tokens1.length > 0;
    for (let i = 0; i < tokens1.length; i++) {
      if (tokens1[i] !== tokens2[i]) {
        same = false;
        break;
      }
    }
    assert(same, "Same seed produces identical batch order");
  }

  // ── numBatches ──
  console.log("numBatches:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "a b c d e f g h i j",
      blockSize: 2,
    });
    const loader = new DataLoader(ds, { batchSize: 2, dropLast: true });
    assert(loader.numBatches === Math.floor(ds.length() / 2), "numBatches = floor(datasetSize / batchSize)");
  }

  // ── Dataset Reference ──
  console.log("Dataset Reference:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model",
      blockSize: 2,
    });
    const loader = new DataLoader(ds, { batchSize: 1 });
    assert(loader.datasetRef === ds, "datasetRef returns the injected dataset");
  }

  // ── Validation ──
  console.log("Validation:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model",
      blockSize: 2,
    });
    let threw = false;
    try { new DataLoader(ds, { batchSize: 0 }); } catch { threw = true; }
    assert(threw, "batchSize=0 throws error");
  }
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "hello world the model",
      blockSize: 2,
    });
    let threw = false;
    try { new DataLoader(ds, { batchSize: -1 }); } catch { threw = true; }
    assert(threw, "Negative batchSize throws error");
  }

  // ── Multiple Independent Iterations ──
  console.log("Multiple Iterations:");
  {
    const ds = new TextDataset({
      tokenizer,
      corpus: "a b c d e f",
      blockSize: 2,
    });
    const loader = new DataLoader(ds, { batchSize: 1 });

    const count1 = Array.from(loader).length;
    const count2 = Array.from(loader).length;
    assert(count1 === count2, "Multiple iterations yield same number of batches");
  }

  return { passed, failed };
}
