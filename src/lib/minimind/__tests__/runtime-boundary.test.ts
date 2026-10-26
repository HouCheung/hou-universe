// ============================================================
// MiniMind — Runtime Boundary Tests
// ============================================================
// Phase 49.5: Verifies that Node-only modules (fs/path) are
// isolated from the browser-safe barrel exports.
//
// Run with: npx tsx src/lib/minimind/__tests__/runtime-boundary.test.ts
// ============================================================

// ============================================================
// Test infrastructure
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ============================================================
// Test 1: Browser barrel does not expose fs modules
// ============================================================

function testBrowserBarrelNoFS(): void {
  console.log("\n[Runtime Boundary — Browser barrel must not expose fs modules]");

  // Import from browser-safe barrel
  const browserExports = [
    // These should exist:
    "Tensor",
    "MiniTokenizer",
    "MiniEmbedding",
    "RotaryEmbedding",
    "MiniAttention",
    "MiniFeedForward",
    "MiniTransformerBlock",
    "MiniMindModel",
    "MiniMindPipeline",
    "InferenceEngine",
    "BPETokenizer",
    // Node-only — must NOT exist:
  ];

  const nodeOnlyExports = [
    "TextCorpus",
    "TinyStoriesDataset",
    "TextShardReader",
    "StreamingDataset",
    "StreamingDataLoader",
    "TrainingConfig",
    "TINY_TRAINING_CONFIG",
    "TrainingLogger",
    "ExperimentConfig",
    "DEFAULT_EXPERIMENT_CONFIG",
    "runTrainingExperiment",
    "runExperimentFromConfigFile",
    "BenchmarkReport",
    "TrainingReport",
  ];

  // Dynamic import of the browser-safe barrel
  import("../index").then((mod) => {
    // Browser-safe exports must be present
    for (const name of browserExports) {
      assert(
        name in mod,
        `Browser barrel must export ${name}`
      );
    }

    // Node-only exports must NOT be present
    for (const name of nodeOnlyExports) {
      assert(
        !(name in mod),
        `Browser barrel must NOT export ${name}`
      );
    }
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: Browser barrel import threw: ${err.message}`);
  });
}

// ============================================================
// Test 2: Node barrel exports dataset runtime
// ============================================================

function testNodeBarrelExports(): void {
  console.log("\n[Runtime Boundary — Node barrel must export dataset runtime]");

  import("../node").then((mod) => {
    const requiredNodeExports = [
      "TextCorpus",
      "TinyStoriesDataset",
      "StreamingDataset",
      "StreamingDataLoader",
      "TextShardReader",
      "TrainingConfig",
      "TINY_TRAINING_CONFIG",
      "TrainingLogger",
      "ExperimentConfig",
      "DEFAULT_EXPERIMENT_CONFIG",
      "runTrainingExperiment",
      "runExperimentFromConfigFile",
      "BenchmarkReport",
      "TrainingReport",
    ];

    for (const name of requiredNodeExports) {
      assert(
        name in mod,
        `Node barrel must export ${name}`
      );
    }
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: Node barrel import threw: ${err.message}`);
  });
}

// ============================================================
// Test 3: Node barrel API — TextCorpus inline (no fs needed)
// ============================================================

function testNodeBarrelTextCorpusInline(): void {
  console.log("\n[Runtime Boundary — Node barrel TextCorpus with inline data]");

  import("../node").then((mod) => {
    // TextCorpus with inline data (no fs needed)
    const corpus = new mod.TextCorpus({
      type: "inline",
      texts: [
        "the cat sat on the mat",
        "the dog ran in the park",
        "once upon a time there was a princess",
      ],
    });

    assertEq(corpus.length, 3, "TextCorpus with 3 inline texts must have length 3");
    assertEq(corpus.get(0), "the cat sat on the mat", "TextCorpus.get(0) must return first text");

    // Iteration
    const docs: string[] = [];
    for (const doc of corpus) {
      docs.push(doc);
    }
    assertEq(docs.length, 3, "TextCorpus iteration must yield 3 documents");

    // StreamingDataset class is accessible from node barrel
    assert(
      typeof mod.StreamingDataset === "function",
      "StreamingDataset must be a class constructor"
    );
    assert(
      typeof mod.StreamingDataLoader === "function",
      "StreamingDataLoader must be a class constructor"
    );
    assert(
      typeof mod.TextShardReader === "function",
      "TextShardReader must be a class constructor"
    );
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: Node barrel TextCorpus test threw: ${err.message}`);
  });
}

// ============================================================
// Test 4: CLI imports still work (direct file references)
// ============================================================

function testCLIImports(): void {
  console.log("\n[Runtime Boundary — CLI imports must resolve]");

  // Verify that the CLI file can resolve its direct imports.
  // The CLI imports directly from specific files, not from barrels.
  import("../cli/TrainingConfig").then((mod) => {
    assert(
      "TrainingConfig" in mod,
      "TrainingConfig must be importable from cli/TrainingConfig"
    );
    assert(
      "TINY_TRAINING_CONFIG" in mod,
      "TINY_TRAINING_CONFIG must be importable from cli/TrainingConfig"
    );
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: TrainingConfig import threw: ${err.message}`);
  });

  import("../experiments/ExperimentConfig").then((mod) => {
    assert(
      "ExperimentConfig" in mod,
      "ExperimentConfig must be importable from experiments/ExperimentConfig"
    );
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: ExperimentConfig import threw: ${err.message}`);
  });

  import("../experiments/TrainingExperimentRunner").then((mod) => {
    assert(
      "runTrainingExperiment" in mod,
      "runTrainingExperiment must be importable from experiments/TrainingExperimentRunner"
    );
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: TrainingExperimentRunner import threw: ${err.message}`);
  });

  import("../data/TextCorpus").then((mod) => {
    assert(
      "TextCorpus" in mod,
      "TextCorpus must be importable from data/TextCorpus"
    );
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: TextCorpus import threw: ${err.message}`);
  });
}

// ============================================================
// Test 5: Node barrel exports match the original API surface
// ============================================================

function testNodeBarrelAPISurface(): void {
  console.log("\n[Runtime Boundary — Node barrel API surface]");

  import("../node").then((mod) => {
    // TextCorpus
    const corpus = new mod.TextCorpus({
      type: "inline",
      texts: ["hello world", "goodbye world"],
    });
    assertEq(corpus.length, 2, "TextCorpus with 2 inline texts must have length 2");
    assertEq(corpus.get(0), "hello world", "TextCorpus.get(0) must return first text");

    // TinyStoriesDataset.fromTexts (no fs needed)
    const ds = mod.TinyStoriesDataset.fromTexts([
      "the cat sat on the mat",
      "the dog ran in the park",
    ]);
    assertEq(ds.length, 2, "TinyStoriesDataset.fromTexts with 2 texts must have length 2");

    // TrainingConfig.fromObject (no fs needed)
    const config = mod.TrainingConfig.tiny();
    assert(
      config.data.metadata.name === "tiny-quick-train",
      "TrainingConfig.tiny() must have name 'tiny-quick-train'"
    );

    // ExperimentConfig.default (no fs needed)
    const expConfig = mod.ExperimentConfig.default();
    assert(
      expConfig.data.name === "default-experiment",
      "ExperimentConfig.default() must have name 'default-experiment'"
    );
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: Node barrel API surface test threw: ${err.message}`);
  });
}

// ============================================================
// Test 6: Sub-barrel node.ts files exist and export correctly
// ============================================================

function testSubBarrelNodeFiles(): void {
  console.log("\n[Runtime Boundary — Sub-barrel node.ts files]");

  // data/node.ts
  import("../data/node").then((mod) => {
    for (const name of ["TextCorpus", "TinyStoriesDataset", "StreamingDataset", "StreamingDataLoader", "TextShardReader"]) {
      assert(name in mod, `data/node.ts must export ${name}`);
    }
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: data/node import threw: ${err.message}`);
  });

  // experiments/node.ts
  import("../experiments/node").then((mod) => {
    for (const name of ["ExperimentConfig", "runTrainingExperiment", "BenchmarkReport"]) {
      assert(name in mod, `experiments/node.ts must export ${name}`);
    }
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: experiments/node import threw: ${err.message}`);
  });

  // evaluation/node.ts
  import("../evaluation/node").then((mod) => {
    assert("TrainingReport" in mod, "evaluation/node.ts must export TrainingReport");
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: evaluation/node import threw: ${err.message}`);
  });

  // training/node.ts
  import("../training/node").then((mod) => {
    assert("TrainingLogger" in mod, "training/node.ts must export TrainingLogger");
  }).catch((err) => {
    failed++;
    console.error(`  FAIL: training/node import threw: ${err.message}`);
  });
}

// ============================================================
// Run all tests
// ============================================================

export function runRuntimeBoundaryTests(): { passed: number; failed: number } {
  // Reset counters
  passed = 0;
  failed = 0;

  console.log("=".repeat(60));
  console.log("MiniMind — Runtime Boundary Tests (Phase 49.5)");
  console.log("=".repeat(60));

  testBrowserBarrelNoFS();
  testNodeBarrelExports();
  testCLIImports();
  testNodeBarrelAPISurface();
  testSubBarrelNodeFiles();
  testNodeBarrelTextCorpusInline();

  // Wait for all async tests to settle
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("\n" + "=".repeat(60));
      console.log(`Runtime Boundary: ${passed} passed, ${failed} failed`);
      console.log("=".repeat(60));
      resolve({ passed, failed });
    }, 2000);
  }) as unknown as { passed: number; failed: number };
}

// Run directly if called as main
if (require.main === module) {
  runRuntimeBoundaryTests().then((result) => {
    if (result.failed > 0) {
      process.exit(1);
    }
  });
}
