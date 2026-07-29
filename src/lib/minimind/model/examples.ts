// ============================================================
// MiniMind — model/examples.ts
// ============================================================
// 完整的前向传播示例
//
// 展示 "Hello HOU Universe" 经过 MiniMind 完整管道的
// 每一步中间结果。用于教学演示和验证 pipeline 正确性。
// ============================================================

import { MiniMindModel } from "./MiniMindModel";
import { MiniLMHead } from "./LMHead";
import { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { MiniEmbedding } from "../embedding/Embedding";
import { RotaryEmbedding } from "../rope/RotaryEmbedding";
import { MiniTransformerBlock } from "../transformer/TransformerBlock";
import { MiniAttention } from "../attention/Attention";
import { MiniFeedForward } from "../ffn/FeedForward";
import type { ModelConfig } from "./types";

/**
 * runForwardExample() — 演示完整的 Text → Logits 管道
 *
 * 使用 "Hello HOU Universe" 作为输入，
 * 展示从 Tokenizer 到 LM Head 的每一步输出。
 *
 * 这是 MiniMind Forward Model 的端到端验证示例。
 * 运行此函数可以：
 *   - 验证所有子模块正确组装
 *   - 观察每个阶段的数据变换
 *   - 理解 logits 的含义
 *
 * 示例输出：
 *   Text: "Hello HOU Universe"
 *   ↓ Tokenizer
 *   Tokens: ["Hello", "HOU", "Universe"]
 *   Token IDs: [123, 456, 789]
 *   ↓ Embedding
 *   Embeddings: [3][512]
 *   ↓ RoPE
 *   Rotated: [3][512]
 *   ↓ Transformer Block × 1
 *   Hidden States: [3][512]
 *   ↓ LM Head
 *   Logits: [1000]
 */
export function runForwardExample(): void {
  // ── 配置 ──
  const config: ModelConfig = {
    vocabSize: 1000,
    dModel: 512,
    numHeads: 8,
    headDim: 64,
    dFF: 2048,
    numLayers: 1,
    maxSeqLen: 128,
    normEps: 1e-6,
    ropeTheta: 10000,
  };

  // ── 构造子模块（依赖注入） ──
  const tokenizer = new MiniTokenizer({ addSpecialTokens: false });
  const embedding = new MiniEmbedding({
    vocabSize: config.vocabSize,
    embeddingDim: config.dModel,
  });
  const rope = new RotaryEmbedding({
    headDim: config.headDim,
    theta: config.ropeTheta,
    maxSeqLen: config.maxSeqLen,
  });
  const attention = new MiniAttention({
    dModel: config.dModel,
    numHeads: config.numHeads,
    headDim: config.headDim,
    maxSeqLen: config.maxSeqLen,
  });
  const ffn = new MiniFeedForward({
    dModel: config.dModel,
    dFF: config.dFF,
    maxSeqLen: config.maxSeqLen,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: config.dModel,
      numHeads: config.numHeads,
      headDim: config.headDim,
      dFF: config.dFF,
      maxSeqLen: config.maxSeqLen,
      normEps: config.normEps,
    },
    attention,
    ffn
  );
  const lmHead = new MiniLMHead({
    dModel: config.dModel,
    vocabSize: config.vocabSize,
    seed: 42,
  });

  // ── 组装模型（组合根） ──
  const model = new MiniMindModel(config, {
    tokenizer,
    embedding,
    rope,
    blocks: [block],
    lmHead,
  });

  // ── 前向传播 ──
  const inputText = "Hello HOU Universe";
  console.log("=".repeat(60));
  console.log("MiniMind Forward Pass Example");
  console.log("=".repeat(60));
  console.log(`\nInput Text: "${inputText}"\n`);

  const result = model.forward({ inputText });

  // ── 展示结果 ──
  console.log("Stage 1 — Tokenizer:");
  console.log(
    `  Tokens:    [${result.trace.tokens.map((t) => `"${t}"`).join(", ")}]`
  );
  console.log(`  Token IDs: [${result.trace.tokenIds.join(", ")}]`);
  console.log(`  Seq Len:   ${result.trace.seqLen}\n`);

  console.log("Stage 2 — Embedding:");
  console.log(
    `  Shape:     [${result.trace.seqLen}][${result.trace.dModel}]`
  );
  console.log(`  E[0][0]:   ${result.trace.embeddings[0][0].toFixed(6)}\n`);

  console.log("Stage 3 — RoPE:");
  console.log(
    `  Shape:     [${result.trace.seqLen}][${result.trace.dModel}]`
  );
  console.log(
    `  R[0][0]:   ${result.trace.rotatedEmbeddings[0][0].toFixed(6)}`
  );
  console.log("  (Position info injected via 2D rotation per head)\n");

  console.log(
    `Stage 4 — Transformer Blocks (${config.numLayers} layer(s)):`
  );
  result.trace.blockTraces.forEach((bt, i) => {
    console.log(
      `  Block ${i}: output[0][0] = ${bt.afterFFNResidual[0][0].toFixed(6)}`
    );
  });
  console.log();

  console.log("Stage 5 — LM Head:");
  console.log(`  Logits shape: [${result.logits.length}]`);
  console.log(
    `  Logits[0..4]: [${result.logits
      .slice(0, 5)
      .map((v) => v.toFixed(4))
      .join(", ")}, ...]`
  );
  console.log(`  Max logit:    ${Math.max(...result.logits).toFixed(4)}`);
  console.log(`  Min logit:    ${Math.min(...result.logits).toFixed(4)}\n`);

  console.log("=".repeat(60));
  console.log("Forward pass complete.");
  console.log("=".repeat(60));
}
