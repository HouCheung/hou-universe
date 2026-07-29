// ============================================================
// MiniMind — ffn/examples.ts
// ============================================================
// Phase 14: FFN Foundation — 完整 SwiGLU FFN 数据流示例
//
// 演示 3 个 token 的完整 FFN 流程：
//   Input → Gate Projection → SiLU → Element-wise Multiply → Down Projection
//
// 运行示例：
//   npx tsx src/lib/minimind/ffn/examples.ts
//
// 或者直接在浏览器 console / Playground 中调用 runFFNExample()。
// ============================================================

import { MiniFeedForward } from "./FeedForward";
import { MiniAttention } from "../attention/Attention";
import { MiniEmbedding } from "../embedding/Embedding";
import { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { silu, sigmoid, swiGLU } from "./math";

// ============================================================
// 示例 1: 完整 FFN Pipeline（Attention Output → FFN → Output）
// ============================================================

/**
 * runFFNExample() — 演示 FFN 对 3 个 token 的完整变换流程
 *
 * 步骤：
 *   1. 准备模拟的 Attention 输出（3 个 token × dModel=16 维）
 *   2. Gate 投影： [seqLen, dModel] → [seqLen, dFF]
 *   3. SiLU 激活：对 Gate 投影逐元素应用 SiLU
 *   4. Up 投影：   [seqLen, dModel] → [seqLen, dFF]
 *   5. 门控乘法：gate ⊙ up → [seqLen, dFF]
 *   6. Down 投影： [seqLen, dFF] → [seqLen, dModel]
 *
 * 输出结构：
 *   gateProjection:  [seqLen][dFF] — 原始 Gate 投影值
 *   gateActivation:  [seqLen][dFF] — SiLU 激活后的门控值
 *   upProjection:    [seqLen][dFF] — Up 投影候选值
 *   gatedHidden:     [seqLen][dFF] — 门控乘法结果
 *   output:          [seqLen][dModel] — 最终输出
 */
export function runFFNExample(): void {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  MiniMind SwiGLU FFN Pipeline Demo  ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ── 配置 ──
  const DMODEL = 16;
  const DFF = 64; // 4 × dModel
  const SEQ_LEN = 3;
  const MAX_SEQ_LEN = 128;

  // ── Step 1: 准备模拟 Attention 输出 ──
  console.log("── Step 1: Simulated Attention Output ──");
  const input: number[][] = [];
  for (let pos = 0; pos < SEQ_LEN; pos++) {
    input[pos] = [];
    for (let d = 0; d < DMODEL; d++) {
      // 模拟经过 Attention + LayerNorm 的 token 表示
      input[pos][d] = Math.sin(pos * 0.5 + d * 0.1) * 0.5;
    }
  }

  console.log(`  Input shape: [${SEQ_LEN} × ${DMODEL}]`);
  for (let i = 0; i < SEQ_LEN; i++) {
    const preview = input[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(`  [${i}] → [${preview}, ...]`);
  }

  // ── Step 2: 创建 FFN ──
  console.log(`\n── Step 2: Create MiniFeedForward (dModel=${DMODEL}, dFF=${DFF}) ──`);
  const ffn = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });
  console.log(`  Parameters: 3 × ${DMODEL} × ${DFF} = ${3 * DMODEL * DFF}`);
  console.log(`  W_gate: [${DMODEL} × ${DFF}]`);
  console.log(`  W_up:   [${DMODEL} × ${DFF}]`);
  console.log(`  W_down: [${DFF} × ${DMODEL}]`);

  // ── Step 3: Forward ──
  console.log("\n── Step 3: FFN Forward Pass ──");
  const result = ffn.forward({ hiddenStates: input });
  const trace = result.trace;

  // ── Step 4: 展示 Gate Projection ──
  console.log("\n── Step 4: Gate Projection (x @ W_gate) ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dFF}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const vals = trace.gateProjection[i];
    const min = vals.reduce((a, b) => Math.min(a, b));
    const max = vals.reduce((a, b) => Math.max(a, b));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    console.log(
      `  [${i}] min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean=${mean.toFixed(4)}`
    );
  }

  // ── Step 5: 展示 SiLU Activation ──
  console.log("\n── Step 5: SiLU Activation — Gate Values ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dFF}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const vals = trace.gateActivation[i];
    const min = vals.reduce((a, b) => Math.min(a, b));
    const max = vals.reduce((a, b) => Math.max(a, b));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const positiveCount = vals.filter((v) => v > 0).length;
    const negativeCount = vals.filter((v) => v < 0).length;
    const zeroCount = vals.filter((v) => v === 0).length;
    console.log(
      `  [${i}] min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean=${mean.toFixed(4)} | +:${positiveCount} -:${negativeCount} 0:${zeroCount}`
    );
  }

  // ── Step 6: 展示 Up Projection ──
  console.log("\n── Step 6: Up Projection (x @ W_up) ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dFF}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const vals = trace.upProjection[i];
    const min = vals.reduce((a, b) => Math.min(a, b));
    const max = vals.reduce((a, b) => Math.max(a, b));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    console.log(
      `  [${i}] min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean=${mean.toFixed(4)}`
    );
  }

  // ── Step 7: 展示 Gated Hidden (gate ⊙ up) ──
  console.log("\n── Step 7: Element-wise Multiply — Gated Hidden ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dFF}]`);
  console.log(`  Formula: gated[i][j] = gateAct[i][j] × upProj[i][j]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const vals = trace.gatedHidden[i];
    const min = vals.reduce((a, b) => Math.min(a, b));
    const max = vals.reduce((a, b) => Math.max(a, b));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    // 计算门控"关闭"了多少维度
    const suppressedCount = vals.filter((v) => Math.abs(v) < 0.01).length;
    console.log(
      `  [${i}] min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean=${mean.toFixed(4)} | suppressed(<0.01): ${suppressedCount}/${vals.length}`
    );
  }

  // ── Step 8: 展示 Output ──
  console.log("\n── Step 8: Down Projection — Final Output ──");
  console.log(`  Shape: [${trace.seqLen} × ${trace.dModel}]`);
  for (let i = 0; i < trace.seqLen; i++) {
    const preview = trace.output[i]
      .slice(0, 4)
      .map((v) => v.toFixed(4))
      .join(", ");
    console.log(`  [${i}] → [${preview}, ...]`);
  }

  // ── Step 9: 验证输入输出形状一致 ──
  console.log("\n── Step 9: Shape Verification ──");
  const inputShapeOk = trace.seqLen === SEQ_LEN && trace.dModel === DMODEL;
  const outputShapeOk =
    trace.output.length === SEQ_LEN &&
    trace.output[0].length === DMODEL;
  console.log(
    `  Input shape:  [${SEQ_LEN} × ${DMODEL}]`
  );
  console.log(
    `  Output shape: [${trace.output.length} × ${trace.output[0].length}]`
  );
  console.log(
    `  Shape match: ${inputShapeOk && outputShapeOk ? "✓ (compatible with residual connection)" : "✗ MISMATCH!"}`
  );

  console.log("\n── FFN Pipeline Complete ✓ ──");
}

// ============================================================
// 示例 2: SiLU 激活函数深入演示
// ============================================================

/**
 * runSiLUExample() — 演示 SiLU 激活函数的特性
 *
 * 展示 SiLU 在不同输入值下的行为：
 *   - 大正值 → 近似线性 (SiLU(x) ≈ x)
 *   - 小负值 → 轻微负输出（非单调特性）
 *   - 大负值 → 趋近于 0（门控关闭）
 *   - x=0   → 恰好为 0
 */
export function runSiLUExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  SiLU Activation Function Deep Dive ║");
  console.log("╚══════════════════════════════════════╝\n");

  const testValues = [-5, -3, -2, -1.278, -1, -0.5, 0, 0.5, 1, 2, 3, 5];

  console.log("SiLU(x) = x · σ(x) = x / (1 + e^(-x))\n");
  console.log(
    `${"x".padEnd(8)} ${"sigmoid(x)".padEnd(12)} ${"SiLU(x)".padEnd(12)} ${"Behavior"}`
  );
  console.log("-".repeat(56));

  for (const x of testValues) {
    const s = sigmoid(x);
    const si = silu(x);
    let behavior: string;
    if (x > 2) behavior = "≈ linear (gate open)";
    else if (x > 0) behavior = "sub-linear (gate partial)";
    else if (x === 0) behavior = "zero crossing";
    else if (x > -1.278) behavior = "negative dip (non-monotonic)";
    else if (x > -3) behavior = "approaching minimum";
    else behavior = "≈ 0 (gate closed)";

    console.log(
      `${x.toFixed(1).padEnd(8)} ${s.toFixed(4).padEnd(12)} ${si.toFixed(4).padEnd(12)} ${behavior}`
    );
  }

  // 对比 SiLU vs ReLU vs GELU
  console.log("\n── Comparison: ReLU vs GELU vs SiLU ──");
  console.log(
    `${"x".padEnd(8)} ${"ReLU".padEnd(12)} ${"GELU*".padEnd(12)} ${"SiLU".padEnd(12)}`
  );
  console.log("-".repeat(48));

  const geluApprox = (x: number): number => {
    // GELU approximation: 0.5 * x * (1 + tanh(sqrt(2/π) * (x + 0.044715 * x^3)))
    const c = Math.sqrt(2 / Math.PI);
    return 0.5 * x * (1 + Math.tanh(c * (x + 0.044715 * x * x * x)));
  };

  for (const x of testValues) {
    const relu = Math.max(0, x);
    const gelu = geluApprox(x);
    const si = silu(x);
    console.log(
      `${x.toFixed(1).padEnd(8)} ${relu.toFixed(4).padEnd(12)} ${gelu.toFixed(4).padEnd(12)} ${si.toFixed(4).padEnd(12)}`
    );
  }

  console.log("\n  * GELU approximation (tanh variant)");
  console.log("  Key differences:");
  console.log("    - ReLU: zero for all x<0 (dead neurons possible)");
  console.log("    - GELU: small non-zero output for x<0 (smooth)");
  console.log("    - SiLU: negative dip for x≈-1.278 (non-monotonic)");
  console.log("── SiLU Deep Dive Complete ✓ ──");
}

// ============================================================
// 示例 3: 纯数学 — SwiGLU 逐步演示
// ============================================================

/**
 * runMathExample() — 演示 SwiGLU 的底层数学计算
 *
 * 使用极小维度（2 token × dModel=3 × dFF=6），
 * 每一步的矩阵和向量都完整打印。
 *
 * 这帮助学生理解 SwiGLU 公式中的每个中间步骤：
 *   xW_gate → SiLU → gate
 *   xW_up            → up
 *   gate ⊙ up        → gated hidden
 */
export function runMathExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  SwiGLU Math Step-by-Step Demo      ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 小维度配置：dModel=3, dFF=6
  const x = [
    [0.5, -0.3, 0.8],
    [-0.2, 0.6, -0.4],
  ];

  // Gate 投影权重 [3 × 6]
  const W_gate = [
    [0.2, -0.1, 0.3, 0.0, -0.2, 0.1],
    [-0.3, 0.4, 0.1, -0.1, 0.2, -0.3],
    [0.1, 0.0, -0.2, 0.3, -0.1, 0.2],
  ];

  // Up 投影权重 [3 × 6]
  const W_up = [
    [0.1, 0.2, -0.1, 0.3, 0.0, -0.2],
    [-0.2, 0.1, 0.3, -0.1, 0.2, 0.0],
    [0.3, -0.1, 0.0, 0.2, -0.2, 0.1],
  ];

  console.log("Input x — [2 × 3]:");
  x.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(1).padStart(5)).join(", ")}]`
    )
  );

  // ── 逐步计算 ──
  const result = swiGLU(x, W_gate, W_up);

  // Step 1: Gate Projection
  console.log("\n── ① Gate Projection (x @ W_gate) — [2 × 6]:");
  result.gateProj.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // Step 2: SiLU Activation
  console.log("\n── ② SiLU Activation — [2 × 6]:");
  console.log("  Formula: SiLU(v) = v · sigmoid(v) = v / (1 + e^(-v))");
  result.gateAct.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // Step 3: Up Projection
  console.log("\n── ③ Up Projection (x @ W_up) — [2 × 6]:");
  result.upProj.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // Step 4: Element-wise Multiply
  console.log("\n── ④ Gate ⊙ Up (Element-wise Multiply) — [2 × 6]:");
  result.gated.forEach((row, i) =>
    console.log(
      `  [${i}] [${row.map((v) => v.toFixed(4).padStart(8)).join(", ")}]`
    )
  );

  // 验证：逐元素展示 gated = gate × up
  console.log("\n── Verification: gated[i][j] === gate[i][j] × up[i][j] ──");
  let allMatch = true;
  for (let i = 0; i < result.gated.length; i++) {
    for (let j = 0; j < result.gated[i].length; j++) {
      const expected = result.gateAct[i][j] * result.upProj[i][j];
      const actual = result.gated[i][j];
      if (Math.abs(expected - actual) > 1e-10) {
        console.log(
          `  ✗ [${i}][${j}]: gate×up=${expected} ≠ gated=${actual}`
        );
        allMatch = false;
      }
    }
  }
  console.log(`  All elements match: ${allMatch ? "✓" : "✗"}`);

  console.log("── SwiGLU Math Demo Complete ✓ ──");
}

// ============================================================
// 示例 4: Gate Value 分析 — 门控信号分布
// ============================================================

/**
 * runGateAnalysisExample() — 分析门控信号在不同输入下的分布
 *
 * 对比两个不同 token 的 gate values，
 * 展示 SwiGLU 如何根据输入内容动态调整信息流。
 */
export function runGateAnalysisExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Gate Value Distribution Analysis   ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 16;
  const DFF = 64;

  const ffn = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: 128,
  });

  // Token A: 全正值（"强信号"）
  const tokenA: number[][] = [[
    0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
    0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2,
  ]];

  // Token B: 混合正负（"弱/混合信号"）
  const tokenB: number[][] = [[
    0.5, -0.4, 0.3, -0.6, 0.2, -0.5, 0.1, -0.3,
    -0.2, 0.4, -0.1, 0.6, -0.3, 0.5, -0.4, 0.2,
  ]];

  const resultA = ffn.forward({ hiddenStates: tokenA });
  const resultB = ffn.forward({ hiddenStates: tokenB });

  const gateA = resultA.trace.gateActivation[0];
  const gateB = resultB.trace.gateActivation[0];

  // 统计分布
  function stats(vals: number[]): {
    min: number;
    max: number;
    mean: number;
    posPct: number;
    negPct: number;
    suppressedPct: number;
  } {
    const min = vals.reduce((a, b) => Math.min(a, b));
    const max = vals.reduce((a, b) => Math.max(a, b));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pos = vals.filter((v) => v > 0.01).length;
    const neg = vals.filter((v) => v < -0.01).length;
    const sup = vals.filter((v) => Math.abs(v) < 0.01).length;
    return {
      min,
      max,
      mean,
      posPct: (pos / vals.length) * 100,
      negPct: (neg / vals.length) * 100,
      suppressedPct: (sup / vals.length) * 100,
    };
  }

  const statsA = stats(gateA);
  const statsB = stats(gateB);

  console.log("Token A (all positive — 'strong signal'):");
  console.log(
    `  Gate values: min=${statsA.min.toFixed(4)}, max=${statsA.max.toFixed(4)}, mean=${statsA.mean.toFixed(4)}`
  );
  console.log(
    `  Distribution: +:${statsA.posPct.toFixed(1)}%  -:${statsA.negPct.toFixed(1)}%  ~0:${statsA.suppressedPct.toFixed(1)}%`
  );

  console.log("\nToken B (mixed signs — 'weak/mixed signal'):");
  console.log(
    `  Gate values: min=${statsB.min.toFixed(4)}, max=${statsB.max.toFixed(4)}, mean=${statsB.mean.toFixed(4)}`
  );
  console.log(
    `  Distribution: +:${statsB.posPct.toFixed(1)}%  -:${statsB.negPct.toFixed(1)}%  ~0:${statsB.suppressedPct.toFixed(1)}%`
  );

  console.log("\n── Analysis ──");
  console.log(
    `  Gate mean diff: ${(statsA.mean - statsB.mean).toFixed(4)} (token A has ${statsA.mean > statsB.mean ? "stronger" : "weaker"} gate activation)`
  );
  console.log(
    "  Different inputs → different gate patterns → data-dependent information flow"
  );
  console.log(
    "  This is the key advantage of SwiGLU over standard (non-gated) FFN."
  );

  console.log("── Gate Analysis Complete ✓ ──");
}

// ============================================================
// 示例 5: 完整数据流 — Tokenizer → Embedding → Attention → FFN
// ============================================================

/**
 * runFullPipelineExample() — 演示从 Text 到 FFN 输出的完整流程
 *
 * 串联 Tokenizer → Embedding → Attention → FFN，
 * 展示 FFN 在 Transformer Block 中的位置和作用。
 */
export function runFullPipelineExample(): void {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  Full Pipeline: Text → FFN Output   ║");
  console.log("╚══════════════════════════════════════╝\n");

  const DMODEL = 16;
  const NUM_HEADS = 4;
  const HEAD_DIM = DMODEL / NUM_HEADS;
  const DFF = 64;
  const MAX_SEQ_LEN = 128;

  // ── Tokenizer ──
  console.log("── ① Tokenizer ──");
  const tokenizer = new MiniTokenizer();
  ["The", "cat", "sat"].forEach((t) => tokenizer.addToken(t));
  const INPUT = "The cat sat";
  const tokenIds = tokenizer.encode(INPUT);
  const tokens = tokenizer.tokenize(INPUT);
  console.log(`  "${INPUT}" → tokens: [${tokens.map((t) => `"${t}"`).join(", ")}]`);
  console.log(`  Token IDs: [${tokenIds.join(", ")}]`);

  // ── Embedding ──
  console.log("\n── ② Embedding ──");
  const embedding = new MiniEmbedding({
    vocabSize: 8,
    embeddingDim: DMODEL,
  });
  const embedVectors = embedding.getEmbeddings(tokenIds);
  console.log(`  Embedding shape: [${embedVectors.length} × ${DMODEL}]`);

  // ── Attention ──
  console.log("\n── ③ Attention (Self-Attention) ──");
  const attention = new MiniAttention({
    dModel: DMODEL,
    numHeads: NUM_HEADS,
    headDim: HEAD_DIM,
    maxSeqLen: MAX_SEQ_LEN,
  });
  const attnResult = attention.forward({
    queries: embedVectors,
    keys: embedVectors,
    values: embedVectors,
    mask: "causal",
  });
  console.log(`  Attention output shape: [${attnResult.trace.seqLen} × ${DMODEL}]`);

  // ── FFN ──
  console.log("\n── ④ FFN (SwiGLU) ──");
  const ffn = new MiniFeedForward({
    dModel: DMODEL,
    dFF: DFF,
    maxSeqLen: MAX_SEQ_LEN,
  });

  const ffnResult = ffn.forward({
    hiddenStates: attnResult.output,
  });

  console.log(`  FFN input shape:  [${attnResult.output.length} × ${attnResult.output[0].length}]`);
  console.log(`  FFN output shape: [${ffnResult.output.length} × ${ffnResult.output[0].length}]`);

  // ── 逐 token 展示输出变化 ──
  console.log("\n── ⑤ Output Comparison: Before FFN vs After FFN ──");
  for (let i = 0; i < ffnResult.trace.seqLen; i++) {
    const beforePreview = attnResult.output[i]
      .slice(0, 3)
      .map((v) => v.toFixed(4))
      .join(", ");
    const afterPreview = ffnResult.output[i]
      .slice(0, 3)
      .map((v) => v.toFixed(4))
      .join(", ");
    // 计算变化幅度
    let diffSum = 0;
    for (let d = 0; d < DMODEL; d++) {
      diffSum += Math.abs(ffnResult.output[i][d] - attnResult.output[i][d]);
    }
    const avgDiff = diffSum / DMODEL;
    console.log(
      `  [${i}] "${tokens[i]}" | Before: [${beforePreview}, ...] | After: [${afterPreview}, ...] | Δavg=${avgDiff.toFixed(4)}`
    );
  }

  // ── 验证 ──
  console.log("\n── ⑥ Verification ──");
  const shapeOk =
    ffnResult.output.length === attnResult.output.length &&
    ffnResult.output[0].length === attnResult.output[0].length;
  console.log(
    `  FFN preserves input-output shape: ${shapeOk ? "✓" : "✗"}`
  );
  console.log(
    `  Ready for residual connection: FFN_output + Attention_output`
  );
  console.log("── Full Pipeline Complete ✓ ──");
}

// ============================================================
// 直接运行（Node.js / tsx）
// ============================================================

// 仅在直接执行时运行示例，import 时不执行
if (typeof require !== "undefined" && require.main === module) {
  runFFNExample();
  runSiLUExample();
  runMathExample();
  runGateAnalysisExample();
  runFullPipelineExample();
}
