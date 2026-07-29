// ============================================================
// MiniMind — pipeline/examples.ts
// ============================================================
// Phase 11: Forward Pipeline — 完整数据流示例
//
// 演示 Text → Tokenizer → Token IDs → Embedding → Vectors
// 的完整 forward pipeline。
//
// 运行示例：
//   npx tsx src/lib/minimind/pipeline/examples.ts
//
// 或者直接在浏览器 console / Playground 中调用 runPipelineExample()。
// ============================================================

import { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { MiniEmbedding } from "../embedding/Embedding";
import { MiniMindPipeline } from "./MiniMindPipeline";
import type { PipelineResult } from "./types";

// ============================================================
// 示例：Hello HOU Universe — 完整 Forward Pipeline
// ============================================================

/**
 * runPipelineExample() — 演示 "Hello HOU Universe" 的完整数据流
 *
 * 步骤：
 *   1. 创建 MiniTokenizer，注册自定义 token
 *   2. 创建 MiniEmbedding（vocabSize 需覆盖 tokenizer 词汇量）
 *   3. 创建 MiniMindPipeline，传入 tokenizer + embedding
 *   4. 调用 forward("Hello HOU Universe")
 *   5. 逐层展示结果
 *
 * 输出结构：
 *   inputText:       "Hello HOU Universe"
 *   tokens:          ["Hello", "HOU", "Universe"]
 *   tokenIds:        [4, 5, 6]
 *   embeddings:      [number[], number[], number[]]  — 每个长度 = vectorDimension
 *   vectorDimension: 8
 */
export function runPipelineExample(): PipelineResult {
  // ── Step 1: 创建 Tokenizer ──
  //
  // MiniTokenizer 内置 4 个特殊 token：
  //   <pad>:0  <unk>:1  <bos>:2  <eos>:3
  //
  // 自定义 token 从 id=4 开始分配。
  const tokenizer = new MiniTokenizer();

  // 注册示例文本中需要的 token
  tokenizer.addToken("Hello");
  tokenizer.addToken("HOU");
  tokenizer.addToken("Universe");

  const vocabInfo = tokenizer.getVocabulary();
  console.log("=== Tokenizer Vocabulary ===");
  console.log(`  Size: ${vocabInfo.size}`);
  console.log("  Token → ID map:");
  vocabInfo.tokenToId.forEach((id, token) => {
    console.log(`    "${token}" → ${id}`);
  });

  // ── Step 2: 创建 Embedding ──
  //
  // vocabSize = 8（4 特殊 token + 3 自定义 token + 1 余量）
  // embeddingDim = 8（为演示清晰，使用小维度）
  const VOCAB_SIZE = 8;
  const EMBEDDING_DIM = 8;

  const embedding = new MiniEmbedding({
    vocabSize: VOCAB_SIZE,
    embeddingDim: EMBEDDING_DIM,
  });

  const matrixInfo = embedding.getMatrixInfo();
  console.log("\n=== Embedding Matrix Info ===");
  console.log(`  Vocab size:    ${matrixInfo.vocabSize}`);
  console.log(`  Embedding dim: ${matrixInfo.embeddingDim}`);
  console.log(`  Total params:  ${matrixInfo.totalParameters}`);

  // ── Step 3: 创建 Pipeline ──
  const pipeline = new MiniMindPipeline(tokenizer, embedding);

  // ── Step 4: 执行 Forward ──
  const INPUT_TEXT = "Hello HOU Universe";

  console.log(`\n=== Forward Pipeline ===`);
  console.log(`  Input: "${INPUT_TEXT}"`);

  const result = pipeline.forward(INPUT_TEXT);

  // ── Step 5: 逐层展示结果 ──

  // Layer 1: 原始文本
  console.log(`\n--- Layer 0: Input Text ---`);
  console.log(`  "${result.inputText}"`);

  // Layer 2: Tokenization
  console.log(`\n--- Layer 1: Tokenizer → Tokens ---`);
  result.tokens.forEach((token, i) => {
    console.log(`  [${i}] "${token}"`);
  });

  // Layer 3: Encoding
  console.log(`\n--- Layer 2: Tokenizer → Token IDs ---`);
  result.tokens.forEach((token, i) => {
    console.log(`  [${i}] "${token}" → id=${result.tokenIds[i]}`);
  });

  // Layer 4: Embedding（只展示前 3 维 + 向量长度，保持输出可读）
  console.log(
    `\n--- Layer 3: Embedding → Vectors (dim=${result.vectorDimension}) ---`
  );
  result.embeddings.forEach((vec, i) => {
    const preview = vec
      .slice(0, 3)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(
      `  [${i}] tokenId=${result.tokenIds[i]} "${result.tokens[i]}" → ` +
        `[${preview}, ...] (${vec.length} dims)`
    );
  });

  // Layer 5: 完整结构概览
  console.log(`\n=== PipelineResult Summary ===`);
  console.log(`  inputText:       "${result.inputText}"`);
  console.log(`  tokens:          [${result.tokens.map((t) => `"${t}"`).join(", ")}]`);
  console.log(`  tokenIds:        [${result.tokenIds.join(", ")}]`);
  console.log(`  embeddings:      ${result.embeddings.length} vectors`);
  console.log(`  vectorDimension: ${result.vectorDimension}`);

  // 验证数据一致性
  console.log(`\n=== Consistency Checks ===`);
  console.log(`  tokens.length === tokenIds.length:  ${result.tokens.length === result.tokenIds.length ? "✓" : "✗"}`);
  console.log(`  tokenIds.length === embeddings.length: ${result.tokenIds.length === result.embeddings.length ? "✓" : "✗"}`);
  console.log(
    `  All vectors have dim=${result.vectorDimension}: ` +
      `${result.embeddings.every((v) => v.length === result.vectorDimension) ? "✓" : "✗"}`
  );

  return result;
}

// ============================================================
// 示例：空输入 — 边界行为演示
// ============================================================

/**
 * runEmptyInputExample() — 演示空字符串输入的处理
 *
 * 空输入 → 空 tokens → 空 tokenIds → 空 embeddings。
 * Pipeline 将空输入透明传递，不抛异常。
 */
export function runEmptyInputExample(): PipelineResult {
  const tokenizer = new MiniTokenizer();
  const embedding = new MiniEmbedding({ vocabSize: 4, embeddingDim: 4 });
  const pipeline = new MiniMindPipeline(tokenizer, embedding);

  const result = pipeline.forward("");

  console.log("=== Empty Input Example ===");
  console.log(`  inputText:       ""`);
  console.log(`  tokens.length:   ${result.tokens.length}`);
  console.log(`  tokenIds.length: ${result.tokenIds.length}`);
  console.log(`  embeddings.length: ${result.embeddings.length}`);
  console.log(`  vectorDimension: ${result.vectorDimension}`);

  return result;
}

// ============================================================
// 示例：未知词 — Tokenizer 回退行为演示
// ============================================================

/**
 * runUnknownTokenExample() — 演示未知词的回退行为
 *
 * 未注册的单词被 MiniTokenizer 映射为 <unk> (id=1)，
 * MiniEmbedding 返回 token 1 对应的向量（零向量）。
 */
export function runUnknownTokenExample(): PipelineResult {
  const tokenizer = new MiniTokenizer();
  // 只注册 "Hello"，不注册 "World"
  tokenizer.addToken("Hello");

  const embedding = new MiniEmbedding({ vocabSize: 8, embeddingDim: 8 });
  const pipeline = new MiniMindPipeline(tokenizer, embedding);

  const result = pipeline.forward("Hello World");

  console.log("=== Unknown Token Example ===");
  console.log(`  Input: "Hello World"`);
  console.log(`  tokens:   [${result.tokens.map((t) => `"${t}"`).join(", ")}]`);
  console.log(`  tokenIds: [${result.tokenIds.join(", ")}]`);
  console.log(`  Note: "World" not in vocabulary → mapped to "<unk>" (id=1)`);

  return result;
}

// ============================================================
// 直接运行（Node.js / tsx）
// ============================================================

// 仅在直接执行时运行示例，import 时不执行
if (typeof require !== "undefined" && require.main === module) {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  MiniMind Forward Pipeline Example  ║");
  console.log("╚══════════════════════════════════════╝\n");

  runPipelineExample();
  console.log("\n");

  runEmptyInputExample();
  console.log("\n");

  runUnknownTokenExample();
}
