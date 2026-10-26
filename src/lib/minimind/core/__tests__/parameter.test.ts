// ============================================================
// Parameter system unit tests
// ============================================================

import { Tensor } from "../Tensor";
import { Parameter } from "../Parameter";
import { ParameterRegistry } from "../ParameterRegistry";
import { Module } from "../Module";

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

export function runParameterTests(): { passed: number; failed: number } {
  console.log("\n=== Parameter Tests ===\n");

  // ──────────────────────────────────────
  // 1. Parameter basics
  // ──────────────────────────────────────
  console.log("Parameter — construction:");
  {
    const t = Tensor.randn([512, 512]);
    const p = new Parameter(t, "attention.W_Q");
    assert(p.name === "attention.W_Q", "Parameter.name is set");
    assert(p.requiresGrad === true, "Parameter.requiresGrad defaults to true");
    assert(p.grad !== null, "Parameter.grad is allocated");
    assert(p._ctx === null, "Parameter is a leaf tensor (_ctx=null)");
    assert(p.shape[0] === 512 && p.shape[1] === 512, "Parameter preserves shape");
    // Data should match source tensor
    assert(p.data[0] === t.data[0], "Parameter.data matches source tensor data[0]");
    assert(p.data[100] === t.data[100], "Parameter.data matches source tensor data[100]");
  }

  console.log("Parameter — requiresGrad is forced true:");
  {
    // Even if source tensor has requiresGrad=false, Parameter forces true
    const t = Tensor.zeros([10], false);
    assert(t.requiresGrad === false, "source tensor requiresGrad=false");
    const p = new Parameter(t, "bias");
    assert(p.requiresGrad === true, "Parameter forces requiresGrad=true");
    assert(p.grad !== null, "Parameter.grad is allocated despite source having none");
  }

  console.log("Parameter — copies source gradient:");
  {
    const t = Tensor.ones([3], true);
    t.accumulateGrad(new Float64Array([1, 2, 3]));
    const p = new Parameter(t, "grad_param");
    assert(p.grad !== null, "Parameter.grad is allocated");
    assertClose(p.grad![0], 1, 1e-10, "Parameter copies grad[0]");
    assertClose(p.grad![1], 2, 1e-10, "Parameter copies grad[1]");
    assertClose(p.grad![2], 3, 1e-10, "Parameter copies grad[2]");
  }

  console.log("Parameter.of — factory method:");
  {
    const p = Parameter.of([64, 128], "test.W", "randn");
    assert(p.name === "test.W", "Parameter.of sets name");
    assert(p.requiresGrad === true, "Parameter.of: requiresGrad=true");
    assert(p.shape[0] === 64 && p.shape[1] === 128, "Parameter.of: correct shape");
    // Values should vary (randn)
    const hasVariation = Array.from(p.data).some((v) => v !== p.data[0]);
    assert(hasVariation, "Parameter.of randn: values vary");
  }

  {
    const p = Parameter.of([5], "zeros_param", "zeros");
    assert(p.data.every((v) => v === 0), "Parameter.of zeros: all zeros");
  }

  {
    const p = Parameter.of([5], "uniform_param", "uniform");
    const allInRange = Array.from(p.data).every((v) => v >= -1 && v <= 1);
    assert(allInRange, "Parameter.of uniform: all values in [-1, 1]");
  }

  console.log("Parameter — toString:");
  {
    const p = Parameter.of([3, 4], "my_param");
    const s = p.toString();
    assert(s.includes('"my_param"'), "toString includes name");
    assert(s.includes("[3, 4]"), "toString includes shape");
  }

  // ──────────────────────────────────────
  // 2. ParameterRegistry
  // ──────────────────────────────────────
  console.log("ParameterRegistry — register and get:");
  {
    const reg = new ParameterRegistry();
    const p1 = Parameter.of([10], "weight");
    const p2 = Parameter.of([5], "bias");
    reg.register("weight", p1);
    reg.register("bias", p2);
    assert(reg.size === 2, "registry size is 2");
    assert(reg.get("weight") === p1, "get returns correct parameter");
    assert(reg.get("bias") === p2, "get returns correct parameter");
    assert(reg.get("nonexistent") === undefined, "get returns undefined for unknown name");
  }

  console.log("ParameterRegistry — duplicate name throws:");
  {
    const reg = new ParameterRegistry();
    const p1 = Parameter.of([10], "dup");
    const p2 = Parameter.of([10], "also_dup");
    reg.register("dup", p1);
    let threw = false;
    try {
      reg.register("dup", p2);
    } catch {
      threw = true;
    }
    assert(threw, "register duplicate name throws");
    assert(reg.size === 1, "registry still has 1 param after failed register");
  }

  console.log("ParameterRegistry — parameters():");
  {
    const reg = new ParameterRegistry();
    const p1 = Parameter.of([2, 3], "first");
    const p2 = Parameter.of([4], "second");
    const p3 = Parameter.of([1], "third");
    reg.register("first", p1);
    reg.register("second", p2);
    reg.register("third", p3);

    const all = reg.parameters();
    assert(all.length === 3, "parameters() returns 3 params");
    assert(all[0] === p1, "parameters()[0] is first registered");
    assert(all[1] === p2, "parameters()[1] is second registered");
    assert(all[2] === p3, "parameters()[2] is third registered");
  }

  console.log("ParameterRegistry — namedParameters():");
  {
    const reg = new ParameterRegistry();
    const p1 = Parameter.of([2], "alpha");
    const p2 = Parameter.of([3], "beta");
    reg.register("alpha", p1);
    reg.register("beta", p2);

    const named = reg.namedParameters();
    assert(named.length === 2, "namedParameters() returns 2 entries");
    assert(named[0].name === "alpha" && named[0].parameter === p1, "named[0] correct");
    assert(named[1].name === "beta" && named[1].parameter === p2, "named[1] correct");
  }

  console.log("ParameterRegistry — zeroGrad:");
  {
    const reg = new ParameterRegistry();
    const p1 = Parameter.of([3], "a");
    const p2 = Parameter.of([3], "b");

    // Manually set some gradients via accumulateGrad
    p1.accumulateGrad(new Float64Array([1, 2, 3]));
    p2.accumulateGrad(new Float64Array([4, 5, 6]));

    reg.register("a", p1);
    reg.register("b", p2);

    // Verify gradients are non-zero
    assert(p1.grad![0] !== 0, "grad is non-zero before zeroGrad");
    assert(p2.grad![0] !== 0, "grad is non-zero before zeroGrad");

    reg.zeroGrad();

    // Verify all zeros
    assert(p1.grad!.every((v) => v === 0), "zeroGrad: p1 all zeros");
    assert(p2.grad!.every((v) => v === 0), "zeroGrad: p2 all zeros");
  }

  console.log("ParameterRegistry — unregister:");
  {
    const reg = new ParameterRegistry();
    const p = Parameter.of([1], "temp");
    reg.register("temp", p);
    assert(reg.size === 1, "size 1 before unregister");
    reg.unregister("temp");
    assert(reg.size === 0, "size 0 after unregister");
    assert(reg.get("temp") === undefined, "get returns undefined after unregister");
    assert(reg.parameters().length === 0, "parameters() empty after unregister");
  }

  console.log("ParameterRegistry — totalElements:");
  {
    const reg = new ParameterRegistry();
    reg.register("a", Parameter.of([2, 3], "a"));
    reg.register("b", Parameter.of([5], "b"));
    assert(reg.totalElements === 11, "totalElements = 2*3 + 5 = 11");
  }

  // ──────────────────────────────────────
  // 3. Module — parameter collection
  // ──────────────────────────────────────
  console.log("Module — registerParameter and parameters():");
  {
    class TestModule extends Module {
      constructor() {
        super();
        this.registerParameter("weight", Parameter.of([10, 5], "weight"));
        this.registerParameter("bias", Parameter.of([5], "bias"));
      }
    }
    const mod = new TestModule();
    const params = mod.parameters();
    assert(params.length === 2, "Module.parameters() returns 2 params");
    assert(params[0].name === "weight", "first param is weight");
    assert(params[1].name === "bias", "second param is bias");
  }

  console.log("Module — namedParameters():");
  {
    class TestModule extends Module {
      constructor() {
        super();
        this.registerParameter("W", Parameter.of([4, 4], "W"));
      }
    }
    const mod = new TestModule();
    const named = mod.namedParameters();
    assert(named.length === 1, "namedParameters length 1");
    assert(named[0].name === "W", "named name is W");
    assert(named[0].parameter.name === "W", "parameter name matches");
  }

  console.log("Module — zeroGrad():");
  {
    class TestModule extends Module {
      constructor() {
        super();
        this.registerParameter("p", Parameter.of([2], "p"));
      }
    }
    const mod = new TestModule();
    const p = mod.parameters()[0];
    p.accumulateGrad(new Float64Array([3, 4]));
    assert(p.grad![0] !== 0, "grad non-zero before zeroGrad");

    mod.zeroGrad();
    assert(p.grad!.every((v) => v === 0), "Module.zeroGrad: all zeros");
  }

  console.log("Module — sub-module parameter collection:");
  {
    class ChildModule extends Module {
      constructor() {
        super();
        this.registerParameter("gamma", Parameter.of([8], "gamma"));
      }
    }

    class ParentModule extends Module {
      constructor() {
        super();
        this.registerParameter("global_bias", Parameter.of([1], "global_bias"));
        const child = new ChildModule();
        this.registerModule("norm", child);
      }
    }

    const parent = new ParentModule();

    // Flat parameters() includes both parent and child
    const allParams = parent.parameters();
    assert(allParams.length === 2, "parent.parameters() includes child params (2 total)");

    // Verify both parameters are found
    const names = allParams.map((p) => p.name);
    assert(names.includes("global_bias"), "parent param found in flat list");
    assert(names.includes("gamma"), "child param found in flat list");

    // namedParameters with prefix
    const named = parent.namedParameters();
    assert(named.length === 2, "namedParameters returns 2 entries");
    const namedNames = named.map((n) => n.name);
    assert(namedNames.includes("global_bias"), "parent param name is unprefixed");
    assert(namedNames.includes("norm.gamma"), "child param name is prefixed with module name");
  }

  console.log("Module — nested sub-module zeroGrad propagates:");
  {
    class InnerModule extends Module {
      constructor() {
        super();
        this.registerParameter("inner_p", Parameter.of([2], "inner_p"));
      }
    }

    class OuterModule extends Module {
      constructor() {
        super();
        this.registerParameter("outer_p", Parameter.of([2], "outer_p"));
        const inner = new InnerModule();
        this.registerModule("inner", inner);
      }
    }

    const outer = new OuterModule();
    const allParams = outer.parameters();

    // Set non-zero grads
    for (const p of allParams) {
      p.accumulateGrad(new Float64Array([1, 1]));
      assert(p.grad![0] !== 0, `${p.name}: grad non-zero before zeroGrad`);
    }

    outer.zeroGrad();

    for (const p of allParams) {
      assert(p.grad!.every((v) => v === 0), `${p.name}: grad zero after zeroGrad`);
    }
  }

  console.log("Module — empty module:");
  {
    class EmptyModule extends Module {}
    const mod = new EmptyModule();
    assert(mod.parameters().length === 0, "empty module has no parameters");
    assert(mod.namedParameters().length === 0, "empty module has no named parameters");
    // zeroGrad on empty module should not throw
    mod.zeroGrad();
  }

  // ──────────────────────────────────────
  // 4. Edge cases
  // ──────────────────────────────────────
  console.log("Edge cases — Parameter from scalar tensor:");
  {
    const t = Tensor.scalar(3.14);
    const p = new Parameter(t, "scalar_param");
    assert(p.size === 1, "scalar parameter size=1");
    assert(p.shape.length === 0, "scalar parameter ndim=0");
    assert(p.requiresGrad === true, "scalar parameter requiresGrad=true");
  }

  console.log("Edge cases — ParameterRegistry maintains insertion order:");
  {
    const reg = new ParameterRegistry();
    const params = Array.from({ length: 10 }, (_, i) =>
      Parameter.of([1], `p${i}`)
    );
    for (let i = 0; i < params.length; i++) {
      reg.register(`p${i}`, params[i]);
    }
    const all = reg.parameters();
    for (let i = 0; i < 10; i++) {
      assert(all[i].name === `p${i}`, `order preserved: index ${i} is p${i}`);
    }
  }

  console.log("Edge cases — Parameter is instance of Tensor:");
  {
    const p = Parameter.of([4], "check_instance");
    assert(p instanceof Tensor, "Parameter instanceof Tensor");
  }

  console.log(`\nParameter tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
