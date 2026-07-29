// ============================================================
// MiniMind — transformer/examples.ts
// ============================================================
// Phase 15: Transformer Block Foundation — 完整 Block 数据流示例
//
// 演示 3 个 token 的完整 Transformer Block 流程：
//   Input → RMSNorm → Attention → Residual → RMSNorm → FFN → Residual → Output
//
// 运行示例：
//   npx tsx src/lib/minimind/transformer/examples.ts
//
// 或者直接在浏览器 console / Playground 中调用 runTransformerExample()。
// ============================================================

import { MiniTransformerBlock } from "./TransformerBlock";
import { MiniRMSNorm } from "./RMSNorm";
import { MiniAttention } from "../attention/Attention";
import { MiniFeedForward } from "../ffn/FeedForward";
import { MiniEmbedding } from "../embedding/Embedding";
import { MiniTokenizer } from "../tokenizer/MiniTokenizer";

// ============================================================
// 工具函数
// ============================================================

/** 计算 RMS（Root Mean Square），用于验证归一化效果 */
function computeRMS(vector: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  return Math.sqrt(sumSq / vector.length);
}

/** 计算两个矩阵逐元素差的平均值 */
function averageDelta(a: number[][], b: number[][]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a[i].length; j++) {
      sum += Math.abs(a[i][j] - b[i][j]);
      count++;
    }
  }
  return sum / count;
}

// ============================================================
// 示例 1: 完整 Transformer Block Pipeline
// ============================================================

/**
 * runTransformerExample() — 演示完整的 Transformer Block 数据流
 *
 * 步骤：
 *   1. 准备模拟输入（3 个 token × dModel=16 维）
 *   2. Pre-Attention RMSNorm
 *   3. Multi-Head Self-Attention
 *   4. 残差连接 1：x + Attention(Norm(x))
 *   5. Pre-FFN RMSNorm
 *   6. SwiGLU FFN
 *   7. 残差连接 2：x + FFN(Norm(x))
 *
 * 输出结构：
 *   normedForAttention:     [seqLen][dModel] — Pre-Attention RMSNorm 输出
 *   attentionOutput:        [seqLen][dModel] — Attention 子层输出
 *   afterAttentionResidual: [seqLen][dModel] — 第一次残差连接后
 *   normedForFFN:           [seqLen][dModel] — Pre-FFN RMSNorm 输出
 *   ffnOutput:              [seqLen][dModel] — FFN 子层输出
 *   afterFFNResidual:       [seqLen][dModel] — 最终输出
 */
export function runTransformerExample(): void {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  MiniMind Transformer Block Demo     ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ── 配置 ──
  const DMODEL = 16;
  const NUM_HEADS = 4;
  const HEAD_DIM = DMODEL / NUM_HEADS; // 4
  const DFF = 64; // 4 × dModel
  const SEQ_LEN = 3;
  const MAX_SEQ_LEN = 128;
  const NORM_EPS = 1e-6;

  // ── Step 1: 准备模拟输入 ──
  console.log("── Step 1: Prepare Input ──");
  const input: number[][] = [];
  for (let pos = 0; pos < SEQ_LEN; pos++) {
    input[pos] = [];
    for (let d = 0; d < DMODEL; d++) {
      // 模拟 Embedding 输出（含位置信息）
      input[pos][d] = Math.sin(pos * 0.7 + d * 0.15) * 0.5;
    }
  }

  console.log(`  Input shape: [${SEQ_LEN} × ${DMODEL}]`);
  for (let i = 0; i < SEQ_LEN; i++) {
    const rms = computeRMS(input[i]);
    const preview = input[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(`  [${i}] → [${preview}, ...] | RMS=${rms.toFixed(4)}`);
  }

  // ── Step 2: 创建模块 ──
  console.log(`\n── Step 2: Create Modules ──`);
  const attention = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const ffn = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });

  const block = new MiniTransformerBlock(
    {
      dModel: DMODEL,
      numHeads: NUM_HEADS,
      headDim: HEAD_DIM,
      dFF: DFF,
      maxSeqLen: MAX_SEQ_LEN,
      normEps: NORM_EPS,
    },
    attention,
    ffn
  );

  console.log(`  Attention:  dModel=${DMODEL}, heads=${NUM_HEADS}, headDim=${HEAD_DIM}`);
  console.log(`  FFN:        dModel=${DMODEL}, dFF=${DFF} (SwiGLU)`);
  console.log(`  RMSNorm:    eps=${NORM_EPS} (Pre-Attention + Pre-FFN)`);
  console.log(`  Architecture: Pre-Norm Decoder Block`);

  // ── Step 3: Forward ──
  console.log(`\n── Step 3: Block Forward Pass ──`);
  console.log(`  Data Flow:`);
  console.log(`    Input → RMSNorm → Attention → (+) → RMSNorm → FFN → (+) → Output`);

  const result = block.forward({
    hiddenStates: input,
    mask: "causal",
  });
  const trace = result.trace;

  // ── Step 4: Pre-Attention RMSNorm ──
  console.log("\n── Step 4: Pre-Attention RMSNorm ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  console.log(`  Formula: x̂ = x / RMS(x) * γ`);
  for (let i = 0; i < trace.seqLen; i++) {
    const rmsBefore = computeRMS(input[i]);
    const rmsAfter = computeRMS(trace.normedForAttention[i]);
    console.log(
      `  [${i}] RMS before=${rmsBefore.toFixed(4)} → after=${rmsAfter.toFixed(4)} (≈1.0 after γ scaling)`
    );
  }

  // ── Step 5: Attention Output ──
  console.log("\n── Step 5: Multi-Head Self-Attention ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const preview = trace.attentionOutput[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(`  [${i}] → [${preview}, ...]`);
  }

  // ── Step 6: 残差连接 1 ──
  console.log("\n── Step 6: Residual Connection 1 (x + Attention) ──");
  console.log(`  Formula: y = x + Attention(RMSNorm(x))`);
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const attnDelta = averageDelta(
      [trace.attentionOutput[i]],
      [input[i]]
    );
    const residualDelta = averageDelta(
      [trace.afterAttentionResidual[i]],
      [input[i]]
    );
    console.log(
      `  [${i}] ‖attn_out - input‖ ≈ ${attnDelta.toFixed(4)} | after residual Δ ≈ ${residualDelta.toFixed(4)}`
    );
  }

  // ── Step 7: Pre-FFN RMSNorm ──
  console.log("\n── Step 7: Pre-FFN RMSNorm ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const rmsBefore = computeRMS(trace.afterAttentionResidual[i]);
    const rmsAfter = computeRMS(trace.normedForFFN[i]);
    console.log(
      `  [${i}] RMS before=${rmsBefore.toFixed(4)} → after=${rmsAfter.toFixed(4)} (≈1.0 after γ scaling)`
    );
  }

  // ── Step 8: FFN Output ──
  console.log("\n── Step 8: SwiGLU Feed-Forward ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const preview = trace.ffnOutput[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(`  [${i}] → [${preview}, ...]`);
  }

  // ── Step 9: 残差连接 2 ──
  console.log("\n── Step 9: Residual Connection 2 (x + FFN) ──");
  console.log(`  Formula: y = x + FFN(RMSNorm(x))`);
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const ffnDelta = averageDelta(
      [trace.ffnOutput[i]],
      [trace.afterAttentionResidual[i]]
    );
    const residualDelta = averageDelta(
      [trace.afterFFNResidual[i]],
      [trace.afterAttentionResidual[i]]
    );
    console.log(
      `  [${i}] ‖ffn_out - mid‖ ≈ ${ffnDelta.toFixed(4)} | after residual Δ ≈ ${residualDelta.toFixed(4)}`
    );
  }

  // ── Step 10: 最终输出 ──
  console.log("\n── Step 10: Final Output ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const preview = trace.afterFFNResidual[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    const totalChange = averageDelta(
      [trace.afterFFNResidual[i]],
      [input[i]]
    );
    console.log(
      `  [${i}] → [${preview}, ...] | total Δ from input ≈ ${totalChange.toFixed(4)}`
    );
  }

  // ── 验证 ──
  console.log("\n── Verification ──");
  const inputShapeOk = trace.seqLen === SEQ_LEN && trace.dModel === DMODEL;
  const outputShapeOk =
    trace.afterFFNResidual.length === SEQ_LEN &&
    trace.afterFFNResidual[0].length === DMODEL;
  console.log(
    `  Input shape:  [${SEQ_LEN} × ${DMODEL}]`
  );
  console.log(
    `  Output shape: [${trace.afterFFNResidual.length} × ${trace.afterFFNResidual[0].length}]`
  );
  console.log(
    `  Shape match: ${inputShapeOk && outputShapeOk ? "✓ (compatible with next block)" : "✗ MISMATCH!"}`
  );
  console.log("── Transformer Block Demo Complete ✓ ──");
}

// ============================================================
// 示例 2: RMSNorm 深入演示
// ============================================================

/**
 * runRMSNormExample() — 演示 RMSNorm 的归一化效果
 *
 * 对比归一化前后的 RMS 值，验证 normalize() 的
 * 输出 RMS ≈ 1 的 invariant property。
 */
export function runRMSNormExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  RMSNorm Deep Dive                   ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 8;
  const EPS = 1e-6;
  const norm = new MiniRMSNorm({ dModel: DMODEL, normEps: EPS });

  // 测试向量 1: 正负混合
  const vec1 = [2.0, -1.5, 0.3, -0.8, 4.0, -2.0, 1.0, -0.5];
  // 测试向量 2: 全正值
  const vec2 = [5.0, 3.0, 1.0, 0.5, 2.0, 4.0, 0.1, 6.0];
  // 测试向量 3: 小值
  const vec3 = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03, 0.01, -0.02];
  // 测试向量 4: 全零（边界条件）
  const vec4 = [0, 0, 0, 0, 0, 0, 0, 0];

  const testVectors = [
    { name: "Mixed ±", vec: vec1 },
    { name: "All positive", vec: vec2 },
    { name: "Small values", vec: vec3 },
    { name: "All zeros", vec: vec4 },
  ];

  console.log("RMSNorm(x) = x / RMS(x) * γ\n");
  console.log("Verification: RMS of normalized output ≈ γ_mean ≈ 1.0\n");

  for (const { name, vec } of testVectors) {
    const rmsBefore = computeRMS(vec);
    const output = norm.forward([vec])[0];
    const normedOnly = norm.normalize([vec])[0];
    const rmsAfterNorm = computeRMS(normedOnly);
    const rmsAfterFull = computeRMS(output);

    console.log(`── ${name} ──`);
    console.log(`  Input:     [${vec.map((v) => v.toFixed(2)).join(", ")}]`);
    console.log(`  RMS before: ${rmsBefore.toFixed(6)}`);
    console.log(
      `  After normalize():  [${normedOnly.map((v) => v.toFixed(4)).join(", ")}]`
    );
    console.log(`  RMS after normalize(): ${rmsAfterNorm.toFixed(6)} (target: ≈1.0)`);
    console.log(
      `  After forward():     [${output.map((v) => v.toFixed(4)).join(", ")}]`
    );
    console.log(`  RMS after forward():  ${rmsAfterFull.toFixed(6)}`);
    console.log(
      `  normalize() RMS≈1: ${Math.abs(rmsAfterNorm - 1.0) < 0.01 ? "✓" : "✗"}`
    );
    console.log();
  }

  // 展示 γ 权重
  console.log("── Gamma (γ) Parameters ──");
  const gamma = norm.getWeights();
  console.log(`  γ = [${gamma.map((v) => v.toFixed(1)).join(", ")}]`);
  console.log("  (initialized to all 1.0 — no scaling at start)");
  console.log("── RMSNorm Deep Dive Complete ✓ ──");
}

// ============================================================
// 示例 3: 残差流分析
// ============================================================

/**
 * runResidualFlowExample() — 分析残差连接的信息流动
 *
 * 追踪从输入到输出的完整残差流，
 * 展示每个子层（Attention/FFN）对表示的贡献量。
 */
export function runResidualFlowExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Residual Flow Analysis              ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 16;
  const NUM_HEADS = 4;
  const HEAD_DIM = DMODEL / NUM_HEADS;
  const DFF = 64;
  const SEQ_LEN = 4;
  const MAX_SEQ_LEN = 128;

  // 创建模块
  const attention = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const ffn = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: DMODEL,
      numHeads: NUM_HEADS,
      headDim: HEAD_DIM,
      dFF: DFF,
      maxSeqLen: MAX_SEQ_LEN,
      normEps: 1e-6,
    },
    attention,
    ffn
  );

  // 准备输入
  const input: number[][] = [];
  for (let pos = 0; pos < SEQ_LEN; pos++) {
    input[pos] = [];
    for (let d = 0; d < DMODEL; d++) {
      input[pos][d] = Math.sin(pos * 0.8 + d * 0.2) * 0.5;
    }
  }

  // Forward
  const result = block.forward({ hiddenStates: input, mask: "causal" });
  const trace = result.trace;

  console.log("Residual Stream Analysis — per token:\n");

  for (let pos = 0; pos < SEQ_LEN; pos++) {
    console.log(`── Token ${pos} ──`);

    // Input → After Attention Residual
    const attnContribution = averageDelta(
      [trace.afterAttentionResidual[pos]],
      [input[pos]]
    );
    // After Attention → After FFN Residual (final)
    const ffnContribution = averageDelta(
      [trace.afterFFNResidual[pos]],
      [trace.afterAttentionResidual[pos]]
    );
    // Total
    const totalContribution = averageDelta(
      [trace.afterFFNResidual[pos]],
      [input[pos]]
    );

    console.log(`  Input RMS:                         ${computeRMS(input[pos]).toFixed(4)}`);
    console.log(`  After RMSNorm (pre-Attention):     ${computeRMS(trace.normedForAttention[pos]).toFixed(4)}`);
    console.log(`  After Attention:                   ${computeRMS(trace.attentionOutput[pos]).toFixed(4)}`);
    console.log(`  After Residual 1 (x + Attention):  ${computeRMS(trace.afterAttentionResidual[pos]).toFixed(4)}`);
    console.log(`  After RMSNorm (pre-FFN):           ${computeRMS(trace.normedForFFN[pos]).toFixed(4)}`);
    console.log(`  After FFN:                         ${computeRMS(trace.ffnOutput[pos]).toFixed(4)}`);
    console.log(`  After Residual 2 (x + FFN):        ${computeRMS(trace.afterFFNResidual[pos]).toFixed(4)}`);

    console.log(`  ── Contributions ──`);
    console.log(`  Attention Δ:  ${attnContribution.toFixed(6)}`);
    console.log(`  FFN Δ:        ${ffnContribution.toFixed(6)}`);
    console.log(`  Total Δ:      ${totalContribution.toFixed(6)}`);
    console.log(
      `  Attn/FFN ratio: ${(attnContribution / (ffnContribution || 1e-10)).toFixed(2)}`
    );
    console.log();
  }

  // 整体分析
  console.log("── Block-Level Analysis ──");
  const avgInputRMS =
    input.reduce((sum, row) => sum + computeRMS(row), 0) / SEQ_LEN;
  const avgOutputRMS =
    trace.afterFFNResidual.reduce(
      (sum, row) => sum + computeRMS(row),
      0
    ) / SEQ_LEN;

  console.log(`  Average input RMS:  ${avgInputRMS.toFixed(4)}`);
  console.log(`  Average output RMS: ${avgOutputRMS.toFixed(4)}`);
  console.log(
    `  RMS change: ${(avgOutputRMS - avgInputRMS).toFixed(4)} ` +
    `(${avgInputRMS > 0 ? (((avgOutputRMS - avgInputRMS) / avgInputRMS) * 100).toFixed(1) : "∞"}%)`
  );

  console.log("\n── Key Insight ──");
  console.log("  Residual connections preserve the input signal while adding");
  console.log("  learned transformations. The output = input + attn_delta + ffn_delta.");
  console.log("  Even if attn_delta or ffn_delta is small, the input passes through.");
  console.log("── Residual Flow Analysis Complete ✓ ──");
}

// ============================================================
// 示例 4: Pre-Norm vs 无 Norm 对比
// ============================================================

/**
 * runNormComparisonExample() — 对比有/无 RMSNorm 的 Block 行为
 *
 * 通过对比 RMS 值的变化，展示 RMSNorm 如何
 * 稳定激活值的尺度，防止数值发散。
 */
export function runNormComparisonExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  RMSNorm Impact Analysis             ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 16;
  const NUM_HEADS = 4;
  const HEAD_DIM = DMODEL / NUM_HEADS;
  const DFF = 64;
  const MAX_SEQ_LEN = 128;

  // 准备输入
  const input: number[][] = [];
  for (let pos = 0; pos < 3; pos++) {
    input[pos] = [];
    for (let d = 0; d < DMODEL; d++) {
      input[pos][d] = Math.sin(pos * 0.6 + d * 0.2) * 2.0; // 稍大的值
    }
  }

  console.log("Question: What happens WITHOUT RMSNorm?\n");

  // ── 有 RMSNorm ──
  const attnWithNorm = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const ffnWithNorm = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const blockWithNorm = new MiniTransformerBlock(
    {
      dModel: DMODEL,
      numHeads: NUM_HEADS,
      headDim: HEAD_DIM,
      dFF: DFF,
      maxSeqLen: MAX_SEQ_LEN,
      normEps: 1e-6,
    },
    attnWithNorm,
    ffnWithNorm
  );

  const resultWithNorm = blockWithNorm.forward({
    hiddenStates: input,
    mask: "causal",
  });
  const trace = resultWithNorm.trace;

  console.log("── WITH RMSNorm ──");
  for (let i = 0; i < 3; i++) {
    console.log(
      `  Token ${i}: input RMS=${computeRMS(input[i]).toFixed(4)} → ` +
      `after Norm (pre-Attn)=${computeRMS(trace.normedForAttention[i]).toFixed(4)} → ` +
      `after Norm (pre-FFN)=${computeRMS(trace.normedForFFN[i]).toFixed(4)} → ` +
      `output RMS=${computeRMS(trace.afterFFNResidual[i]).toFixed(4)}`
    );
  }

  // ── 无 RMSNorm（直接传原始值给 Attention/FFN） ──
  console.log("\n── WITHOUT RMSNorm (simulated) ──");
  console.log("  (Passing raw input directly to sub-layers)");

  const attnNoNorm = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const ffnNoNorm = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });

  // 直接传输入给 Attention（跳过 Norm）
  const rawAttnResult = attnNoNorm.forward({
    queries: input,
    keys: input,
    values: input,
    mask: "causal",
  });

  // 模拟残差
  const rawAfterAttn: number[][] = [];
  for (let i = 0; i < 3; i++) {
    rawAfterAttn[i] = [];
    for (let d = 0; d < DMODEL; d++) {
      rawAfterAttn[i][d] = input[i][d] + rawAttnResult.output[i][d];
    }
  }

  // 直接传中间结果给 FFN（跳过 Norm）
  const rawFFNResult = ffnNoNorm.forward({
    hiddenStates: rawAfterAttn,
  });

  // 模拟残差
  const rawFinal: number[][] = [];
  for (let i = 0; i < 3; i++) {
    rawFinal[i] = [];
    for (let d = 0; d < DMODEL; d++) {
      rawFinal[i][d] = rawAfterAttn[i][d] + rawFFNResult.output[i][d];
    }
  }

  for (let i = 0; i < 3; i++) {
    console.log(
      `  Token ${i}: input RMS=${computeRMS(input[i]).toFixed(4)} → ` +
      `after Attn (no norm)=${computeRMS(rawAfterAttn[i]).toFixed(4)} → ` +
      `after FFN (no norm)=${computeRMS(rawFinal[i]).toFixed(4)}`
    );
  }

  // ── 对比分析 ──
  console.log("\n── Analysis ──");
  const withNormOutputRMS =
    trace.afterFFNResidual.reduce(
      (sum, row) => sum + computeRMS(row),
      0
    ) / 3;
  const withoutNormOutputRMS =
    rawFinal.reduce((sum, row) => sum + computeRMS(row), 0) / 3;

  console.log(
    `  Average output RMS — With Norm:    ${withNormOutputRMS.toFixed(4)}`
  );
  console.log(
    `  Average output RMS — Without Norm: ${withoutNormOutputRMS.toFixed(4)}`
  );
  console.log(
    `  RMS difference: ${Math.abs(withNormOutputRMS - withoutNormOutputRMS).toFixed(4)}`
  );

  const normEffect =
    withoutNormOutputRMS > 0
      ? `Without Norm output is ${(withoutNormOutputRMS / withNormOutputRMS).toFixed(2)}× larger`
      : "N/A";

  console.log(`  ${normEffect}`);

  console.log("\n  Key Insight:");
  console.log("  Without normalization, activation values can grow or shrink");
  console.log("  unpredictably across layers. RMSNorm keeps the scale stable");
  console.log("  (RMS ≈ 1.0) at each sub-layer input, preventing numerical");
  console.log("  instability in deep Transformer stacks.");
  console.log("── RMSNorm Impact Analysis Complete ✓ ──");
}

// ============================================================
// 示例 5: 完整数据流 — Tokenizer → Embedding → Transformer Block
// ============================================================

/**
 * runFullTransformerPipelineExample() — 从 Text 到 Block 输出的完整流程
 *
 * 串联 Tokenizer → Embedding → TransformerBlock，
 * 展示 Transformer Block 在完整 MiniMind 管线中的位置。
 */
export function runFullTransformerPipelineExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Full Pipeline: Text → Block Output  ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 16;
  const NUM_HEADS = 4;
  const HEAD_DIM = DMODEL / NUM_HEADS;
  const DFF = 64;
  const MAX_SEQ_LEN = 128;

  // ── ① Tokenizer ──
  console.log("── ① Tokenizer ──");
  const tokenizer = new MiniTokenizer();
  ["The", "transformer", "block", "processes", "tokens"].forEach((t) =>
    tokenizer.addToken(t)
  );
  const INPUT = "The transformer block";
  const tokenIds = tokenizer.encode(INPUT);
  const tokens = tokenizer.tokenize(INPUT);
  console.log(`  "${INPUT}" → tokens: [${tokens.map((t) => `"${t}"`).join(", ")}]`);
  console.log(`  Token IDs: [${tokenIds.join(", ")}]`);

  // ── ② Embedding ──
  console.log("\n── ② Embedding ──");
  const embedding = new MiniEmbedding({
    vocabSize: 8,
    embeddingDim: DMODEL,
  });
  const embedVectors = embedding.getEmbeddings(tokenIds);
  console.log(`  Embedding shape: [${embedVectors.length} × ${DMODEL}]`);

  // ── ③ Transformer Block ──
  console.log("\n── ③ Transformer Block (Pre-Norm Decoder) ──");
  const attention = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const ffn = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const block = new MiniTransformerBlock(
    {
      dModel: DMODEL,
      numHeads: NUM_HEADS,
      headDim: HEAD_DIM,
      dFF: DFF,
      maxSeqLen: MAX_SEQ_LEN,
      normEps: 1e-6,
    },
    attention,
    ffn
  );

  const result = block.forward({
    hiddenStates: embedVectors,
    mask: "causal",
  });
  const trace = result.trace;

  console.log(`  Block input shape:  [${embedVectors.length} × ${DMODEL}]`);
  console.log(`  Block output shape: [${result.output.length} × ${result.output[0].length}]`);

  // ── ④ 逐 token 输出分析 ──
  console.log("\n── ④ Output Analysis — Per Token ──");
  for (let i = 0; i < trace.seqLen; i++) {
    const embedRMS = computeRMS(embedVectors[i]);
    const outputRMS = computeRMS(trace.afterFFNResidual[i]);
    const delta = averageDelta(
      [trace.afterFFNResidual[i]],
      [embedVectors[i]]
    );

    console.log(
      `  [${i}] "${tokens[i]}" | Embed RMS=${embedRMS.toFixed(4)} → Output RMS=${outputRMS.toFixed(4)} | Δ=${delta.toFixed(4)}`
    );
  }

  // ── ⑤ Step-by-step trace ──
  console.log("\n── ⑤ Step-by-Step Trace ──");
  console.log("  Data flow per token:");
  console.log("    Embedding");
  console.log("      ↓");
  console.log("    RMSNorm (pre-Attention)  — scale to RMS≈1");
  console.log("      ↓");
  console.log("    Multi-Head Attention     — token interaction");
  console.log("      ↓");
  console.log("    Residual Add (+)         — x + attention (gradient highway)");
  console.log("      ↓");
  console.log("    RMSNorm (pre-FFN)        — scale to RMS≈1");
  console.log("      ↓");
  console.log("    SwiGLU FFN               — token-wise transformation");
  console.log("      ↓");
  console.log("    Residual Add (+)         — x + ffn (gradient highway)");
  console.log("      ↓");
  console.log("    Output → Next Block (or Final Norm → LM Head)");

  // ── ⑥ 验证 ──
  console.log("\n── ⑥ Verification ──");
  const shapeOk =
    result.output.length === embedVectors.length &&
    result.output[0].length === DMODEL;
  console.log(
    `  Input/Output shape match: ${shapeOk ? "✓" : "✗"}`
  );
  console.log(
    `  Ready for stacking: output can feed into next TransformerBlock`
  );
  console.log(
    `  Ready for LM Head: output → RMSNorm → Linear(vocabSize) → logits`
  );
  console.log("── Full Pipeline Complete ✓ ──");
}

// ============================================================
// 直接运行（Node.js / tsx）
// ============================================================

// 仅在直接执行时运行示例，import 时不执行
if (typeof require !== "undefined" && require.main === module) {
  runTransformerExample();
  runRMSNormExample();
  runResidualFlowExample();
  runNormComparisonExample();
  runFullTransformerPipelineExample();
}
