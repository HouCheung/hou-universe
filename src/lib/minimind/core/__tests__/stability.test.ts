// ============================================================
// MiniMind Core — stability.test.ts
// ============================================================
// Tests for gradient clipping and initialization utilities
// ============================================================

import { Tensor } from "../Tensor";
import { Parameter } from "../Parameter";
import { add } from "../ops/add";
import { multiply } from "../ops/multiply";
import { matmul } from "../ops/matmul";
import { sum } from "../ops/sum";
import { clipGradients, computeGlobalNorm, clipGradientsByValue } from "../GradientClipper";
import { Initialization } from "../Initialization";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertClose(actual: number, expected: number, tol: number, msg: string): void {
  if (Math.abs(actual - expected) <= tol) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${expected}±${tol}, got ${actual}`); }
}

// ============================================================
// Gradient Clipping tests
// ============================================================

function testComputeGlobalNorm(): void {
  console.log("\n[Gradient Clipping — Global Norm]");

  // Create parameters with known gradients
  const a = Tensor.randn([2, 3]);
  const pA = Parameter.of([2, 3], "a", "randn");
  pA.grad = new Float64Array([1, 2, 3, 4, 5, 6]);

  const b = Tensor.randn([2, 3]);
  const pB = Parameter.of([2, 3], "b", "randn");
  pB.grad = new Float64Array([0, 0, 0, 0, 0, 0]);

  const norm = computeGlobalNorm([pA, pB]);
  // sqrt(1^2 + 2^2 + 3^2 + 4^2 + 5^2 + 6^2) = sqrt(91) ≈ 9.539
  const expected = Math.sqrt(91);
  assertClose(norm, expected, 1e-10, "computes global norm correctly");
}

function testClipByGlobalNorm(): void {
  console.log("\n[Gradient Clipping — Clip by Global Norm]");

  const pA = Parameter.of([3], "a", "randn");
  pA.grad = new Float64Array([0.6, 0, 0.8]); // norm = 1.0

  const pB = Parameter.of([2], "b", "zeros");
  pB.grad = new Float64Array([0, 0]);

  // Clip to norm 0.5: scale = 0.5/1.0 = 0.5
  const preClipNorm = clipGradients([pA, pB], 0.5);

  assertClose(preClipNorm, 1.0, 1e-10, "pre-clip norm is 1.0");
  assertClose(pA.grad![0], 0.3, 1e-10, "grad[0] clipped to 0.3");
  assertClose(pA.grad![2], 0.4, 1e-10, "grad[2] clipped to 0.4");
}

function testClipByGlobalNormNoOp(): void {
  console.log("\n[Gradient Clipping — No-op when within limit]");

  const pA = Parameter.of([2], "a", "zeros");
  pA.grad = new Float64Array([0.3, 0.4]); // norm = 0.5

  const preClip = clipGradients([pA], 1.0); // limit > norm
  assertClose(preClip, 0.5, 1e-10, "pre-clip norm is 0.5");
  assertClose(pA.grad![0], 0.3, 1e-10, "grad[0] unchanged");
  assertClose(pA.grad![1], 0.4, 1e-10, "grad[1] unchanged");
}

function testClipGradientsByValue(): void {
  console.log("\n[Gradient Clipping — By Value]");

  const pA = Parameter.of([4], "a", "zeros");
  pA.grad = new Float64Array([-5, 0.5, 3, -0.2]);

  clipGradientsByValue([pA], 1.0);

  assertClose(pA.grad![0], -1.0, 1e-10, "grad[0] clipped to -1");
  assertClose(pA.grad![1], 0.5, 1e-10, "grad[1] unchanged");
  assertClose(pA.grad![2], 1.0, 1e-10, "grad[2] clipped to 1");
  assertClose(pA.grad![3], -0.2, 1e-10, "grad[3] unchanged");
}

function testClipGradientsZeroMaxNorm(): void {
  console.log("\n[Gradient Clipping — Zero maxNorm = no-op]");

  const pA = Parameter.of([2], "a", "zeros");
  pA.grad = new Float64Array([3, 4]); // norm = 5

  const preClip = clipGradients([pA], 0); // maxNorm=0 means no clipping
  assertClose(preClip, 5.0, 1e-10, "pre-clip norm is 5.0");
  // Grads should be unchanged
  assertClose(pA.grad![0], 3, 1e-10, "grad[0] unchanged");
  assertClose(pA.grad![1], 4, 1e-10, "grad[1] unchanged");
}

// ============================================================
// Initialization tests
// ============================================================

function testXavierUniformShape(): void {
  console.log("\n[Initialization — Xavier Uniform]");

  const data = Initialization.xavierUniform([64, 128]);
  assert(data.length === 64 * 128, "has correct number of elements");
  assert(data instanceof Float64Array, "returns Float64Array");

  // Check bounds: limit = sqrt(6 / (64 + 128)) ≈ 0.1768
  const limit = Math.sqrt(6 / (64 + 128));
  for (let i = 0; i < data.length; i++) {
    assert(Math.abs(data[i]) <= limit + 1e-10, `value ${data[i]} within [-${limit}, ${limit}]`);
  }
}

function testXavierNormalStats(): void {
  console.log("\n[Initialization — Xavier Normal]");

  const data = Initialization.xavierNormal([100, 200]);
  assert(data.length === 100 * 200, "has correct number of elements");

  // Check statistics (approximate)
  let sum = 0, sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const mean = sum / data.length;
  const std = Math.sqrt(sumSq / data.length - mean * mean);
  const expectedStd = Math.sqrt(2 / (100 + 200));

  assert(Math.abs(mean) < 0.05, `mean close to 0: ${mean.toFixed(4)}`);
  assert(Math.abs(std - expectedStd) < 0.02, `std close to expected: ${std.toFixed(4)} ≈ ${expectedStd.toFixed(4)}`);
}

function testKaimingUniform(): void {
  console.log("\n[Initialization — Kaiming Uniform]");

  const data = Initialization.kaimingUniform([128, 512]);
  const limit = Math.sqrt(6 / 128); // sqrt(6/fanIn)

  for (let i = 0; i < data.length; i++) {
    assert(Math.abs(data[i]) <= limit + 1e-10, "within kaiming bounds");
  }
}

function testZerosAndOnes(): void {
  console.log("\n[Initialization — Zeros and Ones]");

  const zeros = Initialization.zeros([10]);
  for (let i = 0; i < zeros.length; i++) {
    assert(zeros[i] === 0, "zeros are all 0");
  }

  const ones = Initialization.ones([10]);
  for (let i = 0; i < ones.length; i++) {
    assert(ones[i] === 1, "ones are all 1");
  }
}

function testEmbeddingInit(): void {
  console.log("\n[Initialization — Embedding]");

  const dModel = 128;
  const data = Initialization.embedding([1024, dModel], dModel);

  // Check that std ≈ dModel^(-0.5)
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
  const std = Math.sqrt(sumSq / data.length);
  const expected = Math.pow(dModel, -0.5);

  assert(Math.abs(std - expected) < 0.02, `std ≈ dModel^(-0.5): ${std.toFixed(4)} ≈ ${expected.toFixed(4)}`);
}

function testNormalInit(): void {
  console.log("\n[Initialization — Normal]");

  const data = Initialization.normal([1000], 0.5);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const mean = sum / data.length;
  const std = Math.sqrt(sumSq / data.length - mean * mean);

  assert(Math.abs(mean) < 0.05, `mean close to 0: ${mean.toFixed(4)}`);
  assert(Math.abs(std - 0.5) < 0.05, `std close to 0.5: ${std.toFixed(4)}`);
}

// ============================================================
// Finite difference validation for clipping
// ============================================================

function testGradientClippingPreservesDirection(): void {
  console.log("\n[Gradient Clipping — Preserves Direction]");

  // Set up parameter with known large gradients
  const aParam = Parameter.of([3], "a", "randn");
  aParam.grad = new Float64Array([100, 200, 300]);

  // Clip to norm 10
  clipGradients([aParam], 10.0);

  // Original norm = sqrt(100^2 + 200^2 + 300^2) = sqrt(140000) ≈ 374.17
  // After clipping: scale = 10 / 374.17 ≈ 0.02673

  // Check direction preserved (ratios should be same)
  const ratio01 = aParam.grad![0] / aParam.grad![1];
  const ratio12 = aParam.grad![1] / aParam.grad![2];
  assertClose(ratio01, 0.5, 1e-10, "ratio grad[0]/grad[1] preserved");
  assertClose(ratio12, 2/3, 1e-10, "ratio grad[1]/grad[2] preserved");

  // Check scale
  const newNorm = Math.sqrt(
    aParam.grad![0] ** 2 + aParam.grad![1] ** 2 + aParam.grad![2] ** 2
  );
  assertClose(newNorm, 10.0, 1e-10, "clipped norm equals maxNorm");
}

// ============================================================
// Runner
// ============================================================

export function runStabilityTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n" + "=".repeat(60));
  console.log("Stability Tests (Gradient Clipping + Initialization)");
  console.log("=".repeat(60));

  testComputeGlobalNorm();
  testClipByGlobalNorm();
  testClipByGlobalNormNoOp();
  testClipGradientsByValue();
  testClipGradientsZeroMaxNorm();
  testXavierUniformShape();
  testXavierNormalStats();
  testKaimingUniform();
  testZerosAndOnes();
  testEmbeddingInit();
  testNormalInit();
  testGradientClippingPreservesDirection();

  console.log(`\nStability: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

if (require.main === module) {
  const result = runStabilityTests();
  if (result.failed > 0) process.exit(1);
}
