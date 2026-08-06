// ============================================================
// Tensor unit tests
// ============================================================

import { Tensor } from "../Tensor";

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

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`);
  }
}

export function runTensorTests(): { passed: number; failed: number } {
  console.log("\n=== Tensor Tests ===\n");

  // ── Constructor & Properties ──
  console.log("Constructor & Properties:");
  {
    const t = Tensor.zeros([2, 3]);
    assert(t.shape[0] === 2 && t.shape[1] === 3, "shape is [2, 3]");
    assert(t.ndim === 2, "ndim is 2");
    assert(t.size === 6, "size is 6");
    assert(t.stride === 3, "stride is 3");
    assert(t.requiresGrad === false, "requiresGrad defaults to false");
    assert(t.grad === null, "grad is null when requiresGrad=false");
    assert(t._ctx === null, "_ctx is null for leaf tensor");
  }

  {
    const t = Tensor.zeros([4], true);
    assert(t.requiresGrad === true, "requiresGrad=true works");
    assert(t.grad !== null, "grad is allocated when requiresGrad=true");
    assert(t.grad!.length === 4, "grad length matches data");
    assert(t.grad!.every((v) => v === 0), "grad initialized to zeros");
  }

  // ── Scalar tensor ──
  console.log("Scalar tensor:");
  {
    const s = Tensor.scalar(3.14);
    assert(s.shape.length === 0, "scalar shape is []");
    assert(s.ndim === 0, "scalar ndim is 0");
    assert(s.size === 1, "scalar size is 1");
    assert(s.stride === 1, "scalar stride is 1");
    assertClose(s.item(), 3.14, 1e-10, "scalar item()");
  }

  // ── fromArray ──
  console.log("fromArray:");
  {
    const t = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
    assert(t.shape[0] === 2 && t.shape[1] === 3, "fromArray infers shape [2, 3]");
    assertClose(t.data[0], 1, 1e-10, "data[0]=1");
    assertClose(t.data[5], 6, 1e-10, "data[5]=6");
  }

  {
    const t = Tensor.fromArray([1, 2, 3]);
    assert(t.shape.length === 1 && t.shape[0] === 3, "fromArray infers 1D shape [3]");
  }

  {
    const t = Tensor.fromArray(42);
    assert(t.shape.length === 0, "fromArray: scalar input → shape []");
    assertClose(t.item(), 42, 1e-10, "fromArray: scalar value");
  }

  {
    // Explicit shape override
    const t = Tensor.fromArray([1, 2, 3, 4], [2, 2]);
    assert(t.shape[0] === 2 && t.shape[1] === 2, "fromArray with explicit shape [2, 2]");
  }

  // ── zeros / ones ──
  console.log("zeros / ones:");
  {
    const t = Tensor.zeros([2, 2]);
    assert(t.data.every((v) => v === 0), "zeros: all zeros");
  }
  {
    const t = Tensor.ones([3]);
    assert(t.data.every((v) => v === 1), "ones: all ones");
  }

  // ── randn ──
  console.log("randn:");
  {
    const t = Tensor.randn([100]);
    // Check that values are not all the same (very unlikely with randn)
    const hasVariation = t.data.some((v) => v !== t.data[0]);
    assert(hasVariation, "randn: values vary");
    // Check that values are roughly N(0,1) by checking mean ≈ 0, std ≈ 1
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += t.data[i];
    const mean = sum / 100;
    assert(Math.abs(mean) < 0.5, `randn: mean near 0 (got ${mean.toFixed(3)})`);
  }

  // ── uniform ──
  console.log("uniform:");
  {
    const t = Tensor.uniform([50], -1, 1);
    const allInRange = t.data.every((v) => v >= -1 && v <= 1);
    assert(allInRange, "uniform: all values in [-1, 1]");
  }

  // ── toArray round-trip ──
  console.log("toArray:");
  {
    const original = [[1, 2, 3], [4, 5, 6]];
    const t = Tensor.fromArray(original);
    const restored = t.toArray() as number[][];
    assert(restored[0][0] === 1, "toArray[0][0]=1");
    assert(restored[0][2] === 3, "toArray[0][2]=3");
    assert(restored[1][0] === 4, "toArray[1][0]=4");
    assert(restored[1][2] === 6, "toArray[1][2]=6");
  }
  {
    const s = Tensor.scalar(99);
    const val = s.toArray() as number;
    assert(val === 99, "toArray: scalar → number");
  }

  // ── clone ──
  console.log("clone:");
  {
    const t = Tensor.fromArray([[1, 2], [3, 4]], undefined, true);
    const c = t.clone();
    assert(c.shape[0] === 2 && c.shape[1] === 2, "clone: same shape");
    assert(c.data[0] === 1 && c.data[3] === 4, "clone: same data");
    assert(c._ctx === null, "clone: _ctx is null (leaf)");
    // Modify clone data — original should be unaffected
    c.data[0] = 99;
    assert(t.data[0] === 1, "clone: deep copy — original unaffected");
  }

  // ── detach ──
  console.log("detach:");
  {
    const t = Tensor.fromArray([[1, 2]], undefined, true);
    const d = t.detach();
    assert(d.requiresGrad === false, "detach: requiresGrad=false");
    assert(d._ctx === null, "detach: _ctx=null");
    assert(d.data[0] === 1, "detach: shares data value");
  }

  // ── accumulateGrad ──
  console.log("accumulateGrad:");
  {
    const t = Tensor.zeros([3], true);
    t.accumulateGrad(new Float64Array([1, 2, 3]));
    assert(t.grad![0] === 1 && t.grad![1] === 2 && t.grad![2] === 3, "accumulateGrad: initial");
    t.accumulateGrad(new Float64Array([0.5, 0.5, 0.5]));
    assertClose(t.grad![0], 1.5, 1e-10, "accumulateGrad: accumulate [0]");
    assertClose(t.grad![1], 2.5, 1e-10, "accumulateGrad: accumulate [1]");
    assertClose(t.grad![2], 3.5, 1e-10, "accumulateGrad: accumulate [2]");
  }

  {
    // requiresGrad=false: accumulateGrad should be no-op
    const t = Tensor.zeros([2], false);
    t.accumulateGrad(new Float64Array([5, 5]));
    assert(t.grad === null, "accumulateGrad: no-op when requiresGrad=false");
  }

  // ── zeroGrad ──
  console.log("zeroGrad:");
  {
    const t = Tensor.ones([2], true);
    t.accumulateGrad(new Float64Array([3, 4]));
    t.zeroGrad();
    assert(t.grad![0] === 0 && t.grad![1] === 0, "zeroGrad: resets to zero");
  }

  // ── reshape ──
  console.log("reshape:");
  {
    const t = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
    const r = t.reshape(3, 2);
    assert(r.shape[0] === 3 && r.shape[1] === 2, "reshape: [2,3]→[3,2]");
    assert(r.data[0] === 1 && r.data[1] === 2 && r.data[2] === 3, "reshape: row-major layout preserved");
  }

  {
    const t = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
    const r = t.reshape(-1, 2);
    assert(r.shape[0] === 3 && r.shape[1] === 2, "reshape: -1 inference [2,3]→[-1,2]=[3,2]");
  }

  {
    const t = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
    const r = t.reshape(6);
    assert(r.shape.length === 1 && r.shape[0] === 6, "reshape: [2,3]→[6]");
  }

  // ── transpose ──
  console.log("transpose:");
  {
    const t = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);
    const tr = t.transpose(); // default last two dims
    assert(tr.shape[0] === 3 && tr.shape[1] === 2, "transpose: [2,3]→[3,2]");
    assert(tr.data[0] === 1, "transpose: [0,0]=1");
    assert(tr.data[1] === 4, "transpose: [0,1]=4");
    assert(tr.data[2] === 2, "transpose: [1,0]=2");
    assert(tr.data[3] === 5, "transpose: [1,1]=5");
    assert(tr.data[4] === 3, "transpose: [2,0]=3");
    assert(tr.data[5] === 6, "transpose: [2,1]=6");
  }

  // ── toString ──
  console.log("toString:");
  {
    const t = Tensor.fromArray([[1, 2], [3, 4]]);
    const s = t.toString();
    assert(s.includes("[2, 2]"), "toString: includes shape");
    assert(s.includes("requiresGrad=false"), "toString: includes requiresGrad");
  }

  console.log(`\nTensor tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
