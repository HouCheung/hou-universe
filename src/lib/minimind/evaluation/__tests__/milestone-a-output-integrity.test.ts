// ============================================================
// Milestone A — Output integrity + determinism
// ============================================================
// Covers:
//   1. P012 UTF-8 candidate legality at the production sampling boundary
//   2. Empty-candidate handling (never sample from an empty distribution)
//   3. Byte-aware incremental decoding (no per-token U+FFFD)
//   4. EOS is a control token: never displayed, never counted
//   5. Streamed text === final decoded text, byte for byte
//   6. Seed 42 determinism on the real evaluator
// ============================================================

import { describe, it, expect, run } from "../../test-harness";
import { GenerationEvaluator } from "../GenerationEvaluator";
import {
  BOUNDARY_STATE,
  IncrementalUtf8Decoder,
  appendUtf8Bytes,
  buildLegalCandidateMask,
  isControlTokenId,
} from "../utf8Constrained";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { Tensor } from "../../core/Tensor";
import { TINY_TRAINING_CORPUS } from "../../research/worker/training-data";

// ============================================================
// Helpers
// ============================================================

/** Byte-token id for a raw byte value (BPETokenizer: id = 4 + byte). */
function byteId(byte: number): number {
  return 4 + byte;
}

/** A deterministic logits source: one row per generation step. */
function fakeModel(rows: number[][]): TensorMiniMindModel {
  let step = 0;
  const model = {
    forward: (): Tensor => {
      const row = rows[Math.min(step, rows.length - 1)];
      step += 1;
      return Tensor.fromArray([[row]]);
    },
  };
  return model as unknown as TensorMiniMindModel;
}

/** Vocabulary map matching BPETokenizer's id → token convention. */
function buildIdToToken(vocabSize: number): ReadonlyMap<number, string> {
  const map = new Map<number, string>();
  map.set(0, "<pad>");
  map.set(1, "<unk>");
  map.set(2, "<bos>");
  map.set(3, "<eos>");
  for (let byte = 0; byte < 256 && 4 + byte < vocabSize; byte++) {
    map.set(4 + byte, String.fromCharCode(byte));
  }
  return map;
}

function makeRow(vocabSize: number, favored: Record<number, number>): number[] {
  const row = new Array<number>(vocabSize).fill(-10);
  for (const [id, value] of Object.entries(favored)) {
    row[Number(id)] = value;
  }
  return row;
}

function createTestTokenizer(): BPETokenizer {
  const tokenizer = new BPETokenizer();
  tokenizer.train(TINY_TRAINING_CORPUS, 260);
  return tokenizer;
}

function createTestModel(vocabSize = 260): TensorMiniMindModel {
  return new TensorMiniMindModel({
    vocabSize,
    dModel: 64,
    numHeads: 2,
    dFF: 128,
    numLayers: 1,
    maxSeqLen: 64,
  });
}

const SPECIAL_LITERALS = ["<pad>", "<unk>", "<bos>", "<eos>"];

// ============================================================
// 1. Candidate legality
// ============================================================

describe("Milestone A — P012 candidate legality", () => {
  const vocabSize = 300;
  const idToToken = buildIdToToken(vocabSize);

  it("accepts a legal lead byte at a character boundary", () => {
    const result = appendUtf8Bytes(BOUNDARY_STATE, [0xe4]);
    expect(result.invalidAt).toBe(-1);
    expect(result.state.need).toBe(2);
  });

  it("rejects a bare continuation byte at a character boundary", () => {
    const mask = buildLegalCandidateMask(
      idToToken,
      vocabSize,
      BOUNDARY_STATE,
      3
    );
    expect(mask.allowed[byteId(0x80)]).toBe(false);
  });

  it("rejects overlong leads and out-of-range leads", () => {
    const mask = buildLegalCandidateMask(
      idToToken,
      vocabSize,
      BOUNDARY_STATE,
      3
    );
    expect(mask.allowed[byteId(0xc0)]).toBe(false);
    expect(mask.allowed[byteId(0xc1)]).toBe(false);
    expect(mask.allowed[byteId(0xf5)]).toBe(false);
    expect(mask.allowed[byteId(0xff)]).toBe(false);
  });

  it("accepts only continuation bytes while a character is open", () => {
    const open = { need: 2, recoverable: true };
    const mask = buildLegalCandidateMask(idToToken, vocabSize, open, 3);
    expect(mask.allowed[byteId(0xb8)]).toBe(true);
    expect(mask.allowed[byteId(0x41)]).toBe(false);
  });

  it("never allows control tokens except EOS at a character boundary", () => {
    const boundary = buildLegalCandidateMask(
      idToToken,
      vocabSize,
      BOUNDARY_STATE,
      3
    );
    expect(isControlTokenId(0)).toBe(true);
    expect(boundary.allowed[0]).toBe(false);
    expect(boundary.allowed[1]).toBe(false);
    expect(boundary.allowed[2]).toBe(false);
    expect(boundary.allowed[3]).toBe(true);

    const open = buildLegalCandidateMask(
      idToToken,
      vocabSize,
      { need: 1, recoverable: true },
      3
    );
    expect(open.allowed[3]).toBe(false);
  });

  it("reports an empty candidate set explicitly", () => {
    const tiny = new Map<number, string>([
      [0, "<pad>"],
      [1, "<unk>"],
      [2, "<bos>"],
      [3, "<eos>"],
    ]);
    const mask = buildLegalCandidateMask(
      tiny,
      4,
      { need: 1, recoverable: true },
      3
    );
    expect(mask.empty).toBe(true);
    expect(mask.legalCount).toBe(0);
  });

  it("handles multi-byte tokens that cross a character boundary", () => {
    const map = new Map<number, string>(buildIdToToken(300));
    // A merged token whose bytes are 'A' + the first byte of '中' (E4).
    map.set(260, String.fromCharCode(0x41, 0xe4));
    const mask = buildLegalCandidateMask(map, 261, BOUNDARY_STATE, 3);
    expect(mask.allowed[260]).toBe(true);
  });
});

// ============================================================
// 2. Incremental decoder
// ============================================================

describe("Milestone A — incremental UTF-8 decoding", () => {
  const idToToken = buildIdToToken(300);

  it("emits nothing until a multi-byte character is complete", () => {
    const decoder = new IncrementalUtf8Decoder(idToToken);
    expect(decoder.pushToken(byteId(0xe4))).toBe("");
    expect(decoder.pushToken(byteId(0xb8))).toBe("");
    expect(decoder.pushToken(byteId(0xad))).toBe("中");
    expect(decoder.text).toBe("中");
    const finish = decoder.finish();
    expect(finish.text).toBe("中");
    expect(finish.droppedIncompleteTail).toBe(false);
  });

  it("emits the complete prefix of a token that spans a boundary", () => {
    const map = new Map<number, string>(idToToken);
    map.set(260, String.fromCharCode(0x41, 0xe4));
    const decoder = new IncrementalUtf8Decoder(map);
    expect(decoder.pushToken(260)).toBe("A");
    expect(decoder.pushToken(byteId(0xb8))).toBe("");
    expect(decoder.pushToken(byteId(0xad))).toBe("中");
    expect(decoder.text).toBe("A中");
  });

  it("withholds a trailing incomplete sequence at finish", () => {
    const decoder = new IncrementalUtf8Decoder(idToToken);
    decoder.pushToken(byteId(0xe4));
    decoder.pushToken(byteId(0xb8));
    const finish = decoder.finish();
    expect(finish.text).toBe("");
    expect(finish.droppedIncompleteTail).toBe(true);
  });

  it("flags interior malformed bytes instead of silently hiding them", () => {
    const decoder = new IncrementalUtf8Decoder(idToToken);
    decoder.pushToken(byteId(0x80));
    const finish = decoder.finish();
    expect(finish.invalidByteOffset).toBe(0);
    expect(finish.text).toContain("�");
  });
});

// ============================================================
// 3. Sampler integration (real GenerationEvaluator)
// ============================================================

describe("Milestone A — constrained sampling through GenerationEvaluator", () => {
  it("never selects EOS in the middle of a character", () => {
    const tokenizer = createTestTokenizer();
    const vocabSize = tokenizer.vocabSize;
    const rows = [
      makeRow(vocabSize, { [byteId(0xe4)]: 10 }),
      makeRow(vocabSize, { 3: 10, [byteId(0xb8)]: 5 }),
      makeRow(vocabSize, { [byteId(0xad)]: 10 }),
    ];
    const evaluator = new GenerationEvaluator(fakeModel(rows), tokenizer);

    const result = evaluator.evaluate(["x"], {
      maxTokens: 3,
      temperature: 0,
      seed: 42,
    })[0];

    expect(result.generatedIds).toEqual([
      byteId(0xe4),
      byteId(0xb8),
      byteId(0xad),
    ]);
    expect(result.generatedText).toBe("x中");
    expect(result.stopReason).toBe("maxTokens");
  });

  it("excludes EOS from generated ids, text and token count", () => {
    const tokenizer = createTestTokenizer();
    const rows = [makeRow(tokenizer.vocabSize, { 3: 10 })];
    const evaluator = new GenerationEvaluator(fakeModel(rows), tokenizer);

    const streamed: string[] = [];
    const result = evaluator.evaluate(["x"], {
      maxTokens: 4,
      temperature: 0,
      seed: 42,
      onToken: (token) => streamed.push(token),
    })[0];

    expect(result.generatedIds).toEqual([]);
    expect(result.generatedText).toBe("x");
    expect(result.tokenCount).toBe(0);
    expect(result.stopReason).toBe("eos");
    expect(streamed).toEqual([]);
    expect(requireNoSpecialLiterals(result.generatedText)).toBe(true);
  });

  it("never emits <pad>, <unk> or <bos>", () => {
    const tokenizer = createTestTokenizer();
    const rows = [makeRow(tokenizer.vocabSize, { 0: 10, [byteId(0x41)]: 5 })];
    const evaluator = new GenerationEvaluator(fakeModel(rows), tokenizer);

    const result = evaluator.evaluate(["x"], {
      maxTokens: 1,
      temperature: 0,
      seed: 42,
    })[0];

    expect(result.generatedIds).toEqual([byteId(0x41)]);
    expect(result.generatedText).toBe("xA");
  });

  it("stops safely when the legal candidate set is empty", () => {
    const idToToken = new Map<number, string>([
      [0, "<pad>"],
      [1, "<unk>"],
      [2, "<bos>"],
    ]);
    const tokenizerLike = {
      vocabSize: 3,
      encode: () => [0],
      decode: () => "",
      getVocabulary: () => ({
        size: 3,
        tokenToId: new Map([
          ["<pad>", 0],
          ["<unk>", 1],
          ["<bos>", 2],
        ]),
        idToToken,
      }),
    } as unknown as BPETokenizer;

    const evaluator = new GenerationEvaluator(
      fakeModel([[-10, -10, -10]]),
      tokenizerLike
    );
    const result = evaluator.evaluate(["x"], {
      maxTokens: 2,
      temperature: 0,
      seed: 42,
    })[0];

    expect(result.generatedIds).toEqual([]);
    expect(result.tokenCount).toBe(0);
    expect(result.stopReason).toBe("error");
    expect(result.utf8?.emptyCandidateStop).toBe(true);
  });

  it("streamed text equals the final decoded text exactly", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer();
    const evaluator = new GenerationEvaluator(model, tokenizer);

    const streamed: string[] = [];
    const result = evaluator.evaluate(["hello world"], {
      maxTokens: 24,
      temperature: 0.8,
      seed: 42,
      onToken: (token) => streamed.push(token),
    })[0];

    const finalContinuation = result.generatedText.slice("hello world".length);
    expect(streamed.join("")).toBe(finalContinuation);
    expect(finalContinuation).not.toContain("�");
    expect(requireNoSpecialLiterals(finalContinuation)).toBe(true);
    expect(result.generatedIds.every((id) => id !== 3)).toBe(true);
    expect(result.tokenCount).toBe(result.generatedIds.length);
  });

  it("reproduces identical tokens and text for seed 42", () => {
    const model = createTestModel();
    const tokenizer = createTestTokenizer();
    const evaluator = new GenerationEvaluator(model, tokenizer);

    const runOnce = () => {
      const streamed: string[] = [];
      const result = evaluator.evaluate(["once upon a time"], {
        maxTokens: 16,
        temperature: 0.8,
        seed: 42,
        onToken: (token) => streamed.push(token),
      })[0];
      return { result, streamed };
    };

    const first = runOnce();
    const second = runOnce();

    expect(first.result.generatedIds).toEqual(second.result.generatedIds);
    expect(first.result.generatedText).toBe(second.result.generatedText);
    expect(first.streamed.join("")).toBe(second.streamed.join(""));
  });
});

function requireNoSpecialLiterals(text: string): boolean {
  for (const literal of SPECIAL_LITERALS) {
    if (text.includes(literal)) return false;
  }
  return true;
}

// ============================================================
// Standalone runner — npx tsx milestone-a-output-integrity.test.ts
// ============================================================

if (
  (typeof require !== "undefined" && require.main === module) ||
  process.argv[1]?.includes("milestone-a-output-integrity")
) {
  run().then((result) => {
    console.log("\n" + "=".repeat(60));
    console.log(
      `Milestone A output integrity: ${result.passed} passed, ${result.failed} failed`
    );
    console.log("=".repeat(60));
    if (result.failed > 0) process.exit(1);
  });
}
