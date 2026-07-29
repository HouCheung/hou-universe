// ============================================================
// MiniMind — attention/examples.ts
// ============================================================
// Phase 13: Attention Foundation — 完整 Attention 数据流示例
//
// 演示 3 个 token embedding 的完整 Attention 流程：
//   Embedding → QKV 投影 → Attention Scores → Softmax → Output
//
// 运行示例：
//   npx tsx src/lib/minimind/attention/examples.ts
//
// 或者直接在浏览器 console / Playground 中调用 runAttentionExample()。
// ============================================================

import { MiniAttention } from "./Attention";
import { MiniEmbedding } from "../embedding/Embedding";
import { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { softmax, scaledDotProductAttention } from "./math";

// ============================================================
// 示例 1: 完整 Attention Pipeline（Text → Tokenizer → Embedding → Attention）
// ============================================================

/**
 * runAttentionExample() — 演示 "I love AI" 的完整 Attention 流程
 *
 * 步骤：
 *   1. Tokenizer: "I love AI" → token IDs [4, 5, 6]
 *   2. Embedding: token IDs → 3 个 dModel 维向量
 *   3. Attention: Q/K/V 投影 → 分头 → Scaled Dot-Product Attention → 合并
 *   4. 逐层展示结果
 *
 * 输出结构：
 *   inputText:         "I love AI"
 *   tokens:            ["I", "love", "AI"]
 *   tokenIds:          [4, 5, 6]
 *   embeddings:        [number[], number[], number[]]
 *   attentionOutput:   [number[][], ...]  — [seqLen, dModel]
 *   attentionWeights:  [numHeads][seqLen][seqLen]
 */
export function runAttentionExample(): void {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  MiniMind Attention Pipeline Demo   ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ── 配置 ──
  const DMODEL = 16; // 小维度，输出可读
  const NUM_HEADS = 4;
  const HEAD_DIM = DMODEL / NUM_HEADS; // 4
  const MAX_SEQ_LEN = 128;

  // ── Step 1: Tokenizer ──
  console.log("── Step 1: Tokenizer ──");
  const tokenizer = new MiniTokenizer();
  tokenizer.addToken("I");
  tokenizer.addToken("love");
  tokenizer.addToken("AI");

  const INPUT = "I love AI";
  const tokenIds = tokenizer.encode(INPUT);
  const tokens = tokenizer.tokenize(INPUT);

  console.log(`  Input: "${INPUT}"`);
  console.log(`  Tokens: [${tokens.map((t) => `"${t}"`).join(", ")}]`);
  console.log(`  Token IDs: [${tokenIds.join(", ")}]`);

  // ── Step 2: Embedding ──
  console.log("\n── Step 2: Embedding ──");
  const embedding = new MiniEmbedding({
    vocabSize: 8,
    embeddingDim: DMODEL,
  });

  const embedVectors = embedding.getEmbeddings(tokenIds);

  console.log(`  Embedding dim: ${DMODEL}`);
  console.log(`  Vectors: ${embedVectors.length}`);

  // 展示每个 token 的 embedding 向量（截取前 4 维）
  for (let i = 0; i < embedVectors.length; i++) {
    const preview = embedVectors[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(
      `  [${i}] "${tokens[i]}" (id=${tokenIds[i]}) → [${preview}, ...]`
    );
  }

  // ── Step 3: Attention ──
  console.log(`\n── Step 3: Multi-Head Attention (dModel=${DMODEL}, heads=${NUM_HEADS}, headDim=${HEAD_DIM}) ──`);

  const attention = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });

  // embedding 输出直接作为 Q/K/V 输入（Self-Attention）
  const input = {
    queries: embedVectors,
    keys: embedVectors,
    values: embedVectors,
    mask: "causal" as const,
  };

  const result = attention.forward(input);

  // ── Step 4: 展示 Attention Weights ──
  console.log("\n── Step 4: Attention Weights (per head) ──");

  for (let h = 0; h < NUM_HEADS; h++) {
    console.log(`\n  Head ${h}:`);
    console.log(`    ${" ".repeat(10)}${tokens.map((t) => `"${t}"`.padEnd(10)).join("")}`);
    for (let i = 0; i < result.trace.seqLen; i++) {
      const row = result.trace.attentionWeights[h][i]
        .map((w) => w.toFixed(4).padEnd(10))
        .join("");
      console.log(`    "${tokens[i]}"`.padEnd(10) + ` ${row}`);
    }
  }

  // ── Step 5: 验证 Causal Mask ──
  console.log("\n── Step 5: Causal Mask Verification ──");
  let causalCorrect = true;
  for (let h = 0; h < NUM_HEADS; h++) {
    for (let i = 0; i < result.trace.seqLen; i++) {
      for (let j = i + 1; j < result.trace.seqLen; j++) {
        if (result.trace.attentionWeights[h][i][j] !== 0) {
          console.log(
            `  ✗ Head ${h}: token[${i}] attends to future token[${j}] with weight ${result.trace.attentionWeights[h][i][j]}`
          );
          causalCorrect = false;
        }
      }
    }
  }
  console.log(
    `  Causal mask correct: ${causalCorrect ? "✓" : "✗"} (all future positions have weight 0)`
  );

  // ── Step 6: 输出概览 ──
  console.log("\n── Step 6: Output Summary ──");
  console.log(`  Output shape: [${result.trace.seqLen} × ${DMODEL}]`);
  console.log(`  Scale factor (√dk): ${result.trace.scaleFactor.toFixed(4)}`);
  console.log(`  Causal mask applied: ${result.trace.causalMaskApplied}`);

  // 展示每个位置的输出（截取前 4 维）
  for (let i = 0; i < result.trace.seqLen; i++) {
    const preview = result.trace.output[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(`  [${i}] "${tokens[i]}" → [${preview}, ...]`);
  }

  console.log("\n── Pipeline Complete ✓ ──");
}

// ============================================================
// 示例 2: 纯数学 — Scaled Dot-Product Attention 逐步演示
// ============================================================

/**
 * runMathExample() — 演示 Attention 的底层数学计算
 *
 * 使用极小维度（3 token × 4 headDim），
 * 每一步的矩阵和向量都完整打印。
 *
 * 这帮助学生理解 Attention 公式中的每个中间步骤：
 *   Q@K^T → /√dk → Causal Mask → Softmax → @V
 */
export function runMathExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Attention Math Step-by-Step Demo   ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 3 个 token，每个 4 维（headDim=4）
  const Q = [
    [1.0, 0.5, -0.3, 0.8],
    [0.2, -0.7, 1.1, -0.4],
    [-0.5, 0.9, 0.1, -0.6],
  ];

  const K = [
    [0.3, 0.9, -0.2, 0.5],
    [-0.6, 0.1, 0.8, -0.3],
    [0.7, -0.4, 0.6, 0.2],
  ];

  const V = [
    [0.5, 0.5, 0.5, 0.5],
    [1.0, 1.0, 1.0, 1.0],
    [2.0, 2.0, 2.0, 2.0],
  ];

  console.log("Q (Queries) — [3 × 4]:");
  Q.forEach((row, i) =>
    console.log(`  [${i}] [${row.map((v) => v.toFixed(1).padStart(5)).join(", ")}]`)
  );

  console.log("\nK (Keys) — [3 × 4]:");
  K.forEach((row, i) =>
    console.log(`  [${i}] [${row.map((v) => v.toFixed(1).padStart(5)).join(", ")}]`)
  );

  console.log("\nV (Values) — [3 × 4]:");
  V.forEach((row, i) =>
    console.log(`  [${i}] [${row.map((v) => v.toFixed(1).padStart(5)).join(", ")}]`)
  );

  // ── 逐步计算 ──
  const result = scaledDotProductAttention(Q, K, V, "causal");

  // Step 1: Raw scores
  console.log("\n── ① Raw Scores (Q @ K^T) — [3 × 3]:");
  result.scores.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // Step 2: Scaled
  console.log(`\n── ② Scaled (÷ √${result.dk} = ÷ ${Math.sqrt(result.dk).toFixed(4)}) — [3 × 3]:`);
  result.scaled.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // Step 3: Weights (after Causal Mask + Softmax)
  console.log("\n── ③ Attention Weights (Causal Mask + Softmax) — [3 × 3]:");
  result.weights.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // 验证：每行和为 1（或接近 1，对于全是 -1e9 的行和为 0）
  console.log("\n── Row Sum Check:");
  result.weights.forEach((row, i) => {
    const sum = row.reduce((a, b) => a + b, 0);
    // 第一行只有 j=0 可关注，其余为 0 → sum 应接近 1
    console.log(`  Row ${i}: sum = ${sum.toFixed(6)} ${Math.abs(sum - 1) < 1e-6 ? "✓" : "(causal: first row may be fully masked)"}`);
  });

  // Step 4: Output
  console.log("\n── ④ Output (weights @ V) — [3 × 4]:");
  result.output.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  console.log(`\n  Mask applied: ${result.maskApplied}`);
  console.log("── Math Demo Complete ✓ ──");
}

// ============================================================
// 示例 3: Softmax 数值稳定性演示
// ============================================================

/**
 * runSoftmaxStabilityExample() — 演示数值稳定 softmax 的必要性
 *
 * 对比大值输入的两种行为：
 *   - 不稳定版本（直接 exp）：可能产生 Infinity/NaN
 *   - 稳定版本（减最大值后 exp）：始终产生正确的概率分布
 */
export function runSoftmaxStabilityExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Softmax Numerical Stability Demo   ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 正常值 — 两种方法结果一致
  const normalInput = [1.0, 2.0, 3.0];
  const normalResult = softmax(normalInput);
  console.log("Normal input [1, 2, 3]:");
  console.log(
    `  softmax → [${normalResult.map((v) => v.toFixed(4)).join(", ")}]`
  );
  console.log(`  sum = ${normalResult.reduce((a, b) => a + b, 0).toFixed(6)} ✓`);

  // 大值 — 不稳定版本会溢出，稳定版本正常工作
  const largeInput = [1000.0, 1000.0, 1000.0];
  const largeResult = softmax(largeInput);
  console.log("\nLarge input [1000, 1000, 1000]:");
  console.log(
    `  stable softmax → [${largeResult.map((v) => v.toFixed(4)).join(", ")}]`
  );
  console.log(`  sum = ${largeResult.reduce((a, b) => a + b, 0).toFixed(6)} ✓`);
  console.log(
    "  (unstable: exp(1000) = Infinity → NaN/Infinity in output)"
  );

  // 极大跨度 — 一个值远超其余
  const skewedInput = [1.0, 2.0, 1000.0];
  const skewedResult = softmax(skewedInput);
  console.log("\nSkewed input [1, 2, 1000]:");
  console.log(
    `  stable softmax → [${skewedResult.map((v) => v.toExponential(4)).join(", ")}]`
  );
  console.log(
    `  Note: The largest value (1000) gets ~100% weight, others effectively 0.`
  );

  console.log("── Stability Demo Complete ✓ ──");
}

// ============================================================
// 示例 4: Causal Mask 可视化
// ============================================================

/**
 * runCausalMaskExample() — 演示 Causal Mask 对 Attention 的影响
 *
 * 对比同一组 Q/K/V 在有/无 causal mask 下的 attention weights。
 */
export function runCausalMaskExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Causal Mask Comparison Demo        ║");
  console.log("╚══════════════════════════════════════╝\n");

  const Q = [
    [0.5, 0.3, -0.2, 0.7],
    [0.1, -0.6, 0.9, -0.3],
    [-0.4, 0.8, 0.2, -0.5],
  ];

  const K = [
    [0.4, 0.7, -0.1, 0.6],
    [-0.5, 0.2, 0.7, -0.4],
    [0.6, -0.3, 0.5, 0.1],
  ];

  const V = [
    [1.0, 1.0, 1.0, 1.0],
    [2.0, 2.0, 2.0, 2.0],
    [3.0, 3.0, 3.0, 3.0],
  ];

  // 无 mask
  const unmasked = scaledDotProductAttention(Q, K, V, null);
  console.log("── Without Causal Mask ──");
  console.log("Attention Weights (full attention):");
  unmasked.weights.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]  sum=${row.reduce((a, b) => a + b, 0).toFixed(4)}`
    )
  );

  // 有 causal mask
  const masked = scaledDotProductAttention(Q, K, V, "causal");
  console.log("\n── With Causal Mask ──");
  console.log("Attention Weights (causal — upper triangle masked):");
  masked.weights.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]  sum=${row.reduce((a, b) => a + b, 0).toFixed(4)}`
    )
  );

  // 对比分析
  console.log("\n── Analysis ──");
  console.log(
    `  Position 0: unmasked sees all, masked sees only [0]   → ${unmasked.weights[0].length} vs ${masked.weights[0].filter((w) => w > 0).length} non-zero`
  );
  console.log(
    `  Position 1: unmasked sees all, masked sees [0,1]      → ${unmasked.weights[1].length} vs ${masked.weights[1].filter((w) => w > 0).length} non-zero`
  );
  console.log(
    `  Position 2: unmasked sees all, masked sees [0,1,2]    → ${unmasked.weights[2].length} vs ${masked.weights[2].filter((w) => w > 0).length} non-zero`
  );

  console.log("── Causal Mask Demo Complete ✓ ──");
}

// ============================================================
// 示例 5: Multi-Head 多样性检查
// ============================================================

/**
 * runHeadDiversityExample() — 检查不同 head 的 attention pattern 差异
 *
 * 在 Multi-Head Attention 中，不同 head 应该学到不同的
 * attention pattern。如果多个 head 的 weights 高度相似，
 * 说明容量没有被充分利用。
 */
export function runHeadDiversityExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Head Diversity Check Demo          ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 16;
  const NUM_HEADS = 4;
  const HEAD_DIM = 4;

  const attention = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: 128,
  });

  // 6 个 token 的随机 embedding
  const seqLen = 6;
  const embedding = new MiniEmbedding({ vocabSize: 10, embeddingDim: DMODEL });
  const tokens = [1, 3, 5, 7, 9, 2];
  const vectors = embedding.getEmbeddings(tokens);

  const input = {
    queries: vectors,
    keys: vectors,
    values: vectors,
    mask: null as null, // 不用 causal mask，看完整的 attention pattern
  };

  const result = attention.forward(input);

  console.log(`Sequence length: ${seqLen}, Heads: ${NUM_HEADS}\n`);

  // 计算 pairwise head similarity
  console.log("── Pairwise Head Similarity (cosine between weight matrices) ──");
  for (let h1 = 0; h1 < NUM_HEADS; h1++) {
    for (let h2 = h1 + 1; h2 < NUM_HEADS; h2++) {
      // 将 attention weights 展平为一维数组
      const flat1: number[] = [];
      const flat2: number[] = [];
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
          flat1.push(result.trace.attentionWeights[h1][i][j]);
          flat2.push(result.trace.attentionWeights[h2][i][j]);
        }
      }

      // Cosine similarity
      let dot = 0,
        norm1 = 0,
        norm2 = 0;
      for (let k = 0; k < flat1.length; k++) {
        dot += flat1[k] * flat2[k];
        norm1 += flat1[k] * flat1[k];
        norm2 += flat2[k] * flat2[k];
      }
      const similarity = dot / (Math.sqrt(norm1) * Math.sqrt(norm2));

      console.log(
        `  Head ${h1} vs Head ${h2}: ${similarity.toFixed(4)} ${similarity > 0.95 ? "⚠ Very similar!" : similarity > 0.5 ? "○ Some overlap" : "✓ Diverse"}`
      );
    }
  }

  // 每头最关注的 token 对
  console.log("\n── Top-3 Token Pairs per Head ──");
  for (let h = 0; h < NUM_HEADS; h++) {
    const pairs: { i: number; j: number; weight: number }[] = [];
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        pairs.push({ i, j, weight: result.trace.attentionWeights[h][i][j] });
      }
    }
    pairs.sort((a, b) => b.weight - a.weight);

    console.log(`  Head ${h}:`);
    for (let k = 0; k < 3; k++) {
      console.log(
        `    token[${pairs[k].i}] → token[${pairs[k].j}]: ${pairs[k].weight.toFixed(4)}`
      );
    }
  }

  console.log("\n── Head Diversity Demo Complete ✓ ──");
}

// ============================================================
// 直接运行（Node.js / tsx）
// ============================================================

// 仅在直接执行时运行示例，import 时不执行
if (typeof require !== "undefined" && require.main === module) {
  runAttentionExample();
  runMathExample();
  runSoftmaxStabilityExample();
  runCausalMaskExample();
  runHeadDiversityExample();
}
