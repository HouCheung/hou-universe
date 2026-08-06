// ============================================================
// Gradient validation tests for all operators
// ============================================================

import { Tensor } from "../Tensor";
import { add } from "../ops/add";
import { multiply } from "../ops/multiply";
import { matmul } from "../ops/matmul";
import { sum } from "../ops/sum";
import { reshape } from "../ops/reshape";
import { transpose } from "../ops/transpose";
import { softmax } from "../ops/softmax";
import { relu } from "../ops/relu";
import { gradientCheck } from "./gradientCheck";

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

export function runGradientTests(): { passed: number; failed: number } {
  console.log("\n=== Gradient Validation Tests ===\n");

  // ── Test 1: add (x + y) ──
  runGradientTest(
    "add: (x + y).sum()",
    (params) => {
      const [x, y] = params;
      return sum(add(x, y));
    },
    [
      Tensor.fromArray([1, 2, 3], undefined, true),
      Tensor.fromArray([4, 5, 6], undefined, true),
    ]
  );

  // ── Test 2: add with scalar ──
  runGradientTest(
    "add: (scalar + tensor).sum()",
    (params) => {
      const [s, t] = params;
      return sum(add(s, t));
    },
    [
      Tensor.scalar(2.0, true),
      Tensor.fromArray([1, 2, 3], undefined, true),
    ]
  );

  // ── Test 3: multiply (x * y) ──
  runGradientTest(
    "multiply: (x * y).sum()",
    (params) => {
      const [x, y] = params;
      return sum(multiply(x, y));
    },
    [
      Tensor.fromArray([1, 2, 3], undefined, true),
      Tensor.fromArray([4, 5, 6], undefined, true),
    ]
  );

  // ── Test 4: multiply with scalar ──
  runGradientTest(
    "multiply: (scalar * tensor).sum()",
    (params) => {
      const [s, t] = params;
      return sum(multiply(s, t));
    },
    [
      Tensor.scalar(3.0, true),
      Tensor.fromArray([1, 2, 3], undefined, true),
    ]
  );

  // ── Test 5: matmul ──
  runGradientTest(
    "matmul: sum(A @ B)",
    (params) => {
      const [A, B] = params;
      return sum(matmul(A, B));
    },
    [
      Tensor.fromArray([[1, 2, 3], [4, 5, 6]], undefined, true),
      Tensor.fromArray([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]], undefined, true),
    ]
  );

  // ── Test 6: relu ──
  runGradientTest(
    "relu: sum(relu(x))",
    (params) => {
      const [x] = params;
      return sum(relu(x));
    },
    [
      Tensor.fromArray([1.0, -2.0, 3.0, -4.0], undefined, true),
    ]
  );

  // ── Test 7: softmax ──
  runGradientTest(
    "softmax: sum(softmax(x))",
    (params) => {
      const [x] = params;
      return sum(softmax(x));
    },
    [
      Tensor.fromArray([1.0, 2.0, 3.0], undefined, true),
    ]
  );

  // ── Test 8: reshape ──
  runGradientTest(
    "reshape: sum(reshape(x, ...)).sum()",
    (params) => {
      const [x] = params;
      const r = reshape(x, 3, 2);
      return sum(r);
    },
    [
      Tensor.fromArray([1, 2, 3, 4, 5, 6], [2, 3], true),
    ]
  );

  // ── Test 9: transpose ──
  runGradientTest(
    "transpose: sum(transpose(x)).sum()",
    (params) => {
      const [x] = params;
      const t = transpose(x);
      return sum(t);
    },
    [
      Tensor.fromArray([[1, 2, 3], [4, 5, 6]], undefined, true),
    ]
  );

  // ── Test 10: sum along dim ──
  runGradientTest(
    "sum along dim=0: sum(sum(x, 0))",
    (params) => {
      const [x] = params;
      return sum(sum(x, 0));
    },
    [
      Tensor.fromArray([[1, 2, 3], [4, 5, 6]], undefined, true),
    ]
  );

  // ── Test 11: sum along dim=1 ──
  runGradientTest(
    "sum along dim=1: sum(sum(x, 1))",
    (params) => {
      const [x] = params;
      return sum(sum(x, 1));
    },
    [
      Tensor.fromArray([[1, 2, 3], [4, 5, 6]], undefined, true),
    ]
  );

  // ── Test 12: Composite — matmul → relu → sum ──
  // Only W is a parameter; x is input data (requiresGrad=false).
  runGradientTest(
    "composite: sum(relu(matmul(x, W)))",
    (params) => {
      const [W] = params;
      const x = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
      const h = matmul(x, W);
      const a = relu(h);
      return sum(a);
    },
    [
      Tensor.randn([3, 2], true),
    ]
  );

  // ── Test 13: detach — no gradients ──
  console.log("\ndetach: gradients should NOT flow through detached tensor");
  {
    const x = Tensor.fromArray([1, 2, 3], undefined, true);
    const d = x.detach();
    const y = multiply(d, Tensor.fromArray([2, 3, 4]));
    const loss = sum(y);
    loss.backward();
    // x should NOT receive gradients because d is detached
    const allZero = x.grad!.every((v) => v === 0);
    if (allZero) {
      console.log("  PASS (detached tensor blocked gradients)");
      passed++;
    } else {
      console.error("  FAIL: detached tensor leaked gradients");
      failed++;
    }
  }

  // ── Test 14: requiresGrad=false — no gradient accumulation ──
  console.log("\nrequiresGrad=false: gradients should not accumulate");
  {
    const x = Tensor.fromArray([1, 2, 3], undefined, false);
    const W = Tensor.fromArray([0.1, 0.2, 0.3], undefined, true);
    const y = multiply(x, W);
    const loss = sum(y);
    loss.backward();
    // x.grad should be null (requiresGrad=false)
    if (x.grad === null) {
      console.log("  PASS (requiresGrad=false → grad stays null)");
      passed++;
    } else {
      console.error("  FAIL: grad allocated for requiresGrad=false tensor");
      failed++;
    }
    // W should receive gradients
    if (W.grad !== null && W.grad.some((v) => v !== 0)) {
      console.log("  PASS (parameter received gradients)");
      passed++;
    } else {
      console.error("  FAIL: parameter did not receive gradients");
      failed++;
    }
  }

  // ── Test 15: fan-out gradient accumulation ──
  console.log("\nfan-out: same tensor used twice — gradients should add");
  {
    const x = Tensor.fromArray([1, 2, 3], undefined, true);
    const y1 = multiply(x, Tensor.fromArray([2, 2, 2])); // 2x
    const y2 = multiply(x, Tensor.fromArray([3, 3, 3])); // 3x
    const loss = sum(add(y1, y2)); // sum(2x + 3x) = sum(5x)
    loss.backward();
    // d(sum(5x))/dx = [5, 5, 5]
    assert(
      Math.abs(x.grad![0] - 5) < 1e-6 &&
      Math.abs(x.grad![1] - 5) < 1e-6 &&
      Math.abs(x.grad![2] - 5) < 1e-6,
      `fan-out: accumulated gradient = [${x.grad![0].toFixed(1)}, ${x.grad![1].toFixed(1)}, ${x.grad![2].toFixed(1)}], expected [5, 5, 5]`
    );
  }

  // ── Test 16: non-scalar backward error ──
  console.log("\nnon-scalar backward: should throw");
  {
    const x = Tensor.fromArray([1, 2, 3], undefined, true);
    const y = multiply(x, x);
    let threw = false;
    try {
      y.backward();
    } catch {
      threw = true;
    }
    assert(threw, "backward() on non-scalar throws error");
  }

  console.log(`\nGradient tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
