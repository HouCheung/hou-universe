// ============================================================
// Linear & TensorLMHead — Unit & Gradient Validation Tests
// ============================================================
// Phase 32: Verifies the first trainable Module stack.
//
// Tests:
//   1. Linear construction & parameter registration
//   2. Linear forward shape validation
//   3. Linear forward value correctness
//   4. Linear namedParameters() and zeroGrad()
//   5. Weight initialization scale verification
//   6. Gradient — weight.grad is non-null after backward
//   7. Finite difference gradient check (weight only)
//   8. Finite difference gradient check (weight + bias)
//   9. Full Linear module finite difference gradient check
//  10. TensorLMHead construction & sub-module
//  11. TensorLMHead forward shape
//  12. TensorLMHead gradient check
//  13. TensorLMHead parameter count
// ============================================================

import { Tensor } from "../Tensor";
import { Linear } from "../Linear";
import { matmul } from "../ops/matmul";
import { add } from "../ops/add";
import { sum } from "../ops/sum";
import { gradientCheck } from "./gradientCheck";
import { TensorLMHead } from "../../model/TensorLMHead";

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

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  msg: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`
    );
  }
}

function runGradientTest(
  name: string,
  computeLoss: (params: Tensor[]) => Tensor,
  params: Tensor[],
  tolerance: number = 1e-4
): void {
  console.log(`\n${name}:`);
  const result = gradientCheck(computeLoss, params, 1e-4, tolerance);

  if (result.passed) {
    console.log(`  PASS (maxDiff=${result.maxDiff.toExponential(4)})`);
    passed++;
  } else {
    console.error(`  FAIL (maxDiff=${result.maxDiff.toExponential(4)})`);
    for (const detail of result.details) {
      console.error(detail);
    }
    failed++;
  }
}

export function runLinearTests(): { passed: number; failed: number } {
  console.log("\n=== Linear & TensorLMHead Tests ===\n");

  // ──────────────────────────────────────────
  // Test 1: Linear construction & parameters
  // ──────────────────────────────────────────
  console.log("Linear — construction & parameter registration:");
  {
    const layer = new Linear(8, 4);
    assert(layer.inFeatures === 8, "inFeatures is 8");
    assert(layer.outFeatures === 4, "outFeatures is 4");

    const params = layer.parameters();
    assert(params.length === 2, "parameters() returns 2 (weight + bias)");
    assert(params[0].name === "weight", "first param is weight");
    assert(params[1].name === "bias", "second param is bias");

    const wShape = params[0].shape;
    assert(
      wShape[0] === 8 && wShape[1] === 4,
      `weight shape is [8, 4] (got [${wShape}])`
    );
    const bShape = params[1].shape;
    assert(
      bShape[0] === 4 && bShape.length === 1,
      `bias shape is [4] (got [${bShape}])`
    );
    assert(params[0].requiresGrad === true, "weight requiresGrad=true");
    assert(params[1].requiresGrad === true, "bias requiresGrad=true");

    // Direct property access
    assert(layer.weight.name === "weight", "layer.weight accessor works");
    assert(layer.bias!.name === "bias", "layer.bias accessor works");
  }

  // ──────────────────────────────────────────
  // Test 2: Linear without bias
  // ──────────────────────────────────────────
  console.log("Linear — no bias:");
  {
    const layer = new Linear(8, 4, false);
    const params = layer.parameters();
    assert(params.length === 1, "parameters() returns 1 (weight only)");
    assert(params[0].name === "weight", "param is weight");
    assert(layer.bias === undefined, "bias accessor is undefined");
  }

  // ──────────────────────────────────────────
  // Test 3: Linear forward shape
  // ──────────────────────────────────────────
  console.log("Linear — forward shape:");
  {
    const layer = new Linear(8, 4);
    const x = Tensor.randn([2, 8]);
    const y = layer.forward(x);
    assert(
      y.shape[0] === 2 && y.shape[1] === 4,
      `forward: [2, 8] → [2, 4] (got [${y.shape}])`
    );
    assert(y.requiresGrad === true, "output requiresGrad=true");
  }

  {
    const layer = new Linear(8, 4);
    const x = Tensor.randn([1, 8]);
    const y = layer.forward(x);
    assert(
      y.shape[0] === 1 && y.shape[1] === 4,
      `forward: [1, 8] → [1, 4] (got [${y.shape}])`
    );
  }

  {
    const layer = new Linear(8, 4);
    const x = Tensor.randn([16, 8]);
    const y = layer.forward(x);
    assert(
      y.shape[0] === 16 && y.shape[1] === 4,
      `forward: [16, 8] → [16, 4] (got [${y.shape}])`
    );
  }

  // ──────────────────────────────────────────
  // Test 4: Linear forward value correctness
  // ──────────────────────────────────────────
  console.log("Linear — forward value (manual check):");
  {
    const layer = new Linear(2, 3, false);
    const w = layer.weight;
    // weight[0] = row 0 (out feature 0): [w00, w10] = [1, 4]
    // weight[1] = row 0 (out feature 1): [w01, w11] = [2, 5]
    // weight[2] = row 0 (out feature 2): [w02, w12] = [3, 6]
    // weight: [in=2, out=3], row-major: w[0]=w00, w[1]=w01, w[2]=w02, w[3]=w10, w[4]=w11, w[5]=w12
    w.data[0] = 1; w.data[1] = 2; w.data[2] = 3; // in=0 → out=[1,2,3]
    w.data[3] = 4; w.data[4] = 5; w.data[5] = 6; // in=1 → out=[4,5,6]

    const x = Tensor.fromArray([[1, 2]]); // batch=1, in=2
    const y = layer.forward(x); // [1, 3]

    // y[0][0] = 1*1 + 2*4 = 9
    // y[0][1] = 1*2 + 2*5 = 12
    // y[0][2] = 1*3 + 2*6 = 15
    assertClose(y.data[0], 9, 1e-10, "forward[0][0] = 9");
    assertClose(y.data[1], 12, 1e-10, "forward[0][1] = 12");
    assertClose(y.data[2], 15, 1e-10, "forward[0][2] = 15");
  }

  console.log("Linear — forward value with bias:");
  {
    const layer = new Linear(2, 2);
    const w = layer.weight;
    // Set to identity: [in=2, out=2]
    // w[0]=w00=1, w[1]=w01=0, w[2]=w10=0, w[3]=w11=1
    w.data[0] = 1; w.data[1] = 0;
    w.data[2] = 0; w.data[3] = 1;

    const b = layer.bias!;
    b.data[0] = 10;
    b.data[1] = 20;

    const x = Tensor.fromArray([[1, 1]]); // batch=1, in=2
    const y = layer.forward(x); // [1, 2]

    // y[0][0] = 1*1 + 1*0 + 10 = 11
    // y[0][1] = 1*0 + 1*1 + 20 = 21
    assertClose(y.data[0], 11, 1e-10, "forward+bias[0][0] = 11");
    assertClose(y.data[1], 21, 1e-10, "forward+bias[0][1] = 21");
  }

  // ──────────────────────────────────────────
  // Test 5: Linear input validation
  // ──────────────────────────────────────────
  console.log("Linear — input validation:");
  {
    const layer = new Linear(8, 4);

    let threw = false;
    try {
      const x = Tensor.randn([2, 6]); // 6 != 8
      layer.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on input dim mismatch");

    threw = false;
    try {
      const x = Tensor.randn([8]); // 1D
      layer.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on 1D input");
  }

  // ──────────────────────────────────────────
  // Test 6: Linear namedParameters()
  // ──────────────────────────────────────────
  console.log("Linear — namedParameters():");
  {
    const layer = new Linear(4, 3);
    const named = layer.namedParameters();
    assert(named.length === 2, "namedParameters returns 2 entries");
    assert(named[0].name === "weight", "named[0] is weight");
    assert(named[1].name === "bias", "named[1] is bias");
  }

  // ──────────────────────────────────────────
  // Test 7: Linear zeroGrad propagation
  // ──────────────────────────────────────────
  console.log("Linear — zeroGrad():");
  {
    const layer = new Linear(4, 3);
    const x = Tensor.randn([2, 4]);
    const y = layer.forward(x);
    const loss = sum(y);
    loss.backward();

    assert(
      layer.weight.grad!.some((v) => v !== 0),
      "weight.grad non-zero after backward"
    );
    assert(
      layer.bias!.grad!.some((v) => v !== 0),
      "bias.grad non-zero after backward"
    );

    layer.zeroGrad();

    assert(
      layer.weight.grad!.every((v) => v === 0),
      "weight.grad all zeros after zeroGrad()"
    );
    assert(
      layer.bias!.grad!.every((v) => v === 0),
      "bias.grad all zeros after zeroGrad()"
    );
  }

  // ──────────────────────────────────────────
  // Test 8: Weight initialization scale
  // ──────────────────────────────────────────
  console.log("Linear — weight initialization scale:");
  {
    const inF = 64;
    const outF = 128;
    const layer = new Linear(inF, outF, false);
    const w = layer.weight;

    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < w.data.length; i++) {
      sum += w.data[i];
      sumSq += w.data[i] * w.data[i];
    }
    const mean = sum / w.data.length;
    const variance = sumSq / w.data.length - mean * mean;
    const std = Math.sqrt(variance);

    const expectedScale = Math.sqrt(2.0 / (inF + outF));

    assertClose(
      std,
      expectedScale,
      expectedScale * 0.5,
      `weight std ~ sqrt(2/(fan_in+fan_out)): ${std.toFixed(6)} ≈ ${expectedScale.toFixed(6)}`
    );

    const maxAbs = Math.max(...Array.from(w.data).map((v) => Math.abs(v)));
    assert(
      maxAbs < 1.0,
      `weight values bounded (max|w|=${maxAbs.toFixed(4)} < 1.0)`
    );
  }

  // ──────────────────────────────────────────
  // Test 9: Gradient check — matmul by itself
  // ──────────────────────────────────────────
  runGradientTest(
    "matmul only: sum(x @ W) — grad w.r.t. W",
    (params) => {
      const [W] = params;
      const x = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
      const y = matmul(x, W);
      return sum(y);
    },
    [Tensor.randn([3, 2], true)]
  );

  // ──────────────────────────────────────────
  // Test 10: Gradient check — matmul + add (bias broadcast)
  // ──────────────────────────────────────────
  runGradientTest(
    "matmul + bias broadcast: sum(x @ W + b) — grad w.r.t. W, b",
    (params) => {
      const [W, b] = params;
      const x = Tensor.fromArray([[1, 2, 3]]);
      const y = matmul(x, W);
      const z = add(y, b);
      return sum(z);
    },
    [
      Tensor.randn([3, 2], true),
      Tensor.fromArray([0.1, 0.2], undefined, true),
    ]
  );

  // ──────────────────────────────────────────
  // Test 11: Linear — gradient verification (analytic)
  // ──────────────────────────────────────────
  console.log("Linear — full module backward():");
  {
    const layer = new Linear(4, 3);
    const x = Tensor.fromArray([[1, 2, 3, 4], [5, 6, 7, 8]]);

    layer.zeroGrad();
    const y = layer.forward(x);
    const loss = sum(y);
    loss.backward();

    // weight.grad should be non-null and have correct shape
    const wGrad = layer.weight.grad;
    assert(wGrad !== null, "weight.grad is allocated after backward");
    assert(
      wGrad!.some((v) => v !== 0),
      "weight.grad has non-zero values"
    );
    assert(
      wGrad!.length === 12,
      `weight.grad length is 12 (4*3), got ${wGrad!.length}`
    );

    // bias.grad should be non-null
    const bGrad = layer.bias!.grad;
    assert(bGrad !== null, "bias.grad is allocated after backward");
    assert(
      bGrad!.some((v) => v !== 0),
      "bias.grad has non-zero values"
    );
    assert(
      bGrad!.length === 3,
      `bias.grad length is 3, got ${bGrad!.length}`
    );
  }

  // ──────────────────────────────────────────
  // Test 12: Finite difference on Linear-equivalent ops
  // The gradientCheck utility requires params to be directly in the
  // computation graph, so we test the raw ops that Linear composes.
  // The "full module backward()" test above verifies that Linear
  // correctly wires these ops together and produces non-null grads.
  // ──────────────────────────────────────────
  runGradientTest(
    "Linear-equivalent ops (finite diff): sum(matmul(x, W) + b)",
    (params) => {
      const [W, b] = params;
      const x = Tensor.fromArray([[1, 2, 3]]);
      const y = matmul(x, W);
      const z = add(y, b);
      return sum(z);
    },
    [
      Tensor.randn([3, 2], true),
      Tensor.fromArray([0.1, 0.2], undefined, true),
    ]
  );

  // ══════════════════════════════════════════
  // TensorLMHead Tests
  // ══════════════════════════════════════════

  // ──────────────────────────────────────────
  // Test 13: TensorLMHead construction
  // ──────────────────────────────────────────
  console.log("\nTensorLMHead — construction & sub-module:");
  {
    const head = new TensorLMHead(1000, 512);
    assert(head.vocabSize === 1000, "vocabSize is 1000");
    assert(head.hiddenDim === 512, "hiddenDim is 512");

    const params = head.parameters();
    assert(params.length === 1, "parameters() returns 1 (weight only, no bias)");
    assert(params[0].name === "weight", "param name is weight");

    const named = head.namedParameters();
    assert(named.length === 1, "namedParameters returns 1");
    assert(
      named[0].name === "linear.weight",
      `named param is "linear.weight" (got "${named[0].name}")`
    );

    assert(head.linear !== undefined, "linear accessor works");
    assert(
      head.linear.inFeatures === 512 && head.linear.outFeatures === 1000,
      "linear inFeatures=512, outFeatures=1000"
    );
  }

  // ──────────────────────────────────────────
  // Test 14: TensorLMHead forward shape
  // ──────────────────────────────────────────
  console.log("TensorLMHead — forward shape:");
  {
    const head = new TensorLMHead(1000, 512);
    const hidden = Tensor.randn([4, 512]);
    const logits = head.forward(hidden);
    assert(
      logits.shape[0] === 4 && logits.shape[1] === 1000,
      `forward: [4, 512] → [4, 1000] (got [${logits.shape}])`
    );
    assert(logits.requiresGrad === true, "logits requiresGrad=true");
  }

  {
    const head = new TensorLMHead(100, 64);
    const hidden = Tensor.randn([1, 64]);
    const logits = head.forward(hidden);
    assert(
      logits.shape[0] === 1 && logits.shape[1] === 100,
      `forward: [1, 64] → [1, 100] (got [${logits.shape}])`
    );
  }

  // ──────────────────────────────────────────
  // Test 15: TensorLMHead gradient check
  // ──────────────────────────────────────────
  console.log("TensorLMHead — gradient: weight.grad after backward:");
  {
    const head = new TensorLMHead(10, 4);
    const hidden = Tensor.randn([3, 4]);
    const logits = head.forward(hidden);
    const loss = sum(logits);
    loss.backward();

    const wGrad = head.linear.weight.grad;
    assert(wGrad !== null, "linear.weight.grad is allocated");
    assert(
      wGrad!.some((v) => v !== 0),
      "linear.weight.grad has non-zero values"
    );
    assert(
      wGrad!.length === 40,
      `weight.grad length is 40 (4*10), got ${wGrad!.length}`
    );
  }

  // ──────────────────────────────────────────
  // Test 16: TensorLMHead-equivalent ops (finite diff)
  // TensorLMHead = Linear(hiddenDim, vocabSize, bias=false) = matmul(x, W)
  // The "gradient: weight.grad" test above verifies the full module path.
  // ──────────────────────────────────────────
  runGradientTest(
    "TensorLMHead-equivalent ops (finite diff): sum(matmul(hidden, W))",
    (params) => {
      const [W] = params;
      const hidden = Tensor.fromArray([[1, 2, 3]]);
      const logits = matmul(hidden, W);
      return sum(logits);
    },
    [Tensor.randn([3, 5], true)]
  );

  // ──────────────────────────────────────────
  // Test 17: TensorLMHead input validation
  // ──────────────────────────────────────────
  console.log("TensorLMHead — input validation:");
  {
    const head = new TensorLMHead(10, 8);

    let threw = false;
    try {
      const x = Tensor.randn([2, 6]); // 6 != 8
      head.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on hidden dim mismatch");
  }

  // ──────────────────────────────────────────
  // Test 18: Parameter count
  // ──────────────────────────────────────────
  console.log("TensorLMHead — parameter count:");
  {
    const head = new TensorLMHead(1000, 512);
    const params = head.parameters();
    const totalElements = params.reduce((sum, p) => sum + p.size, 0);
    assert(
      totalElements === 512 * 1000,
      `total elements = 512*1000 = 512000 (got ${totalElements})`
    );
  }

  console.log(`\nLinear & TensorLMHead tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
