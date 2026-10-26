// ============================================================
// Milestone A — Checkpoint import + activation
// ============================================================
// Covers:
//   1. Structural / architectural completeness validation
//   2. Legacy checkpoints without metadata (deterministic tokenizer rebuild)
//   3. Metadata tokenizer restoration
//   4. Import → CheckpointStore → ResearchWorkspace session activation
//   5. Invalid / incomplete files fail without activating anything
//   6. loadCheckpoint itself rejects a partially random model
// ============================================================

import { describe, it, expect, run } from "../../../minimind/test-harness";
import {
  analyzeCheckpointJSON,
  importCheckpoint,
} from "../checkpointImport";
import { TensorMiniMindModel } from "../../../minimind/model/TensorMiniMindModel";
import { BPETokenizer } from "../../../minimind/tokenizer/BPETokenizer";
import { AdamWOptimizer } from "../../../minimind/core/optim/AdamW";
import {
  loadCheckpoint,
  type CheckpointData,
} from "../../../minimind/training/checkpoint/Checkpoint";
import { resolveTrainingDataset } from "../../../minimind/data/datasetRegistry";
import { getProductionModelConfig } from "../../../minimind/experiments/ModelRegistry";
import { workspace } from "../../../minimind/research/ResearchWorkspace";
import { checkpointStore } from "../../../minimind/research/CheckpointStore";
import {
  getGenerationCheckpointInfo,
  getGeneratableSessions,
} from "../generationAdapter";
import { getDefaultChatConfig } from "../chatAdapter";

// ============================================================
// localStorage / window polyfill for Node.js
// ============================================================

if (!(globalThis as Record<string, unknown>).localStorage) {
  const store = new Map<string, string>();
  const ls = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

// ============================================================
// Synthetic production-shaped checkpoint
// ============================================================

const production = getProductionModelConfig();
const corpus = resolveTrainingDataset("bilingual").corpus;

let cachedParams: CheckpointData["modelParams"] | undefined;

function modelParams(): CheckpointData["modelParams"] {
  if (!cachedParams) {
    const model = new TensorMiniMindModel({
      vocabSize: production.vocabSize,
      dModel: production.dModel,
      numHeads: production.numHeads,
      dFF: production.dFF,
      numLayers: production.numLayers,
      maxSeqLen: production.maxSeqLen,
    });
    cachedParams = model.namedParameters().map(({ name, parameter }) => ({
      name,
      shape: [...parameter.shape],
      data: Array.from(parameter.data),
    }));
  }
  return cachedParams.map((p) => ({ ...p, data: [...p.data] }));
}

function metadataForCheckpoint(
  overrides?: Partial<NonNullable<CheckpointData["metadata"]>>
): NonNullable<CheckpointData["metadata"]> {
  return {
    modelConfig: {
      vocabSize: production.vocabSize,
      dModel: production.dModel,
      numHeads: production.numHeads,
      dFF: production.dFF,
      numLayers: production.numLayers,
      maxSeqLen: production.maxSeqLen,
    },
    vocabSize: production.vocabSize,
    parameterCount: 1126528,
    trainingDataset: "bilingual",
    trainingSteps: 0,
    epochs: 0,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function buildCheckpoint(
  options: {
    omitParam?: string;
    unknownParam?: boolean;
    wrongShape?: boolean;
    metadata?: CheckpointData["metadata"];
    trainerState?: Record<string, unknown>;
  } = {}
): CheckpointData {
  let params = modelParams();

  if (options.omitParam) {
    params = params.filter((p) => p.name !== options.omitParam);
  }
  if (options.unknownParam) {
    params = [...params, { name: "extra.weight", shape: [2], data: [0, 0] }];
  }
  if (options.wrongShape) {
    params = params.map((p) =>
      p.name === "embedding.weight"
        ? { ...p, shape: [production.dModel, production.vocabSize] }
        : p
    );
  }

  return {
    version: 3,
    timestamp: 1_700_000_000_000,
    modelParams: params,
    optimizerState: {
      type: "AdamW",
      stepCount: 0,
      config: {
        lr: 0.001,
        betas: [0.9, 0.999],
        eps: 1e-8,
        weightDecay: 0.01,
      },
      paramStates: params.map(() => ({})),
    },
    schedulerState: null,
    trainerState: (options.trainerState ?? {
      epoch: 0,
      globalStep: 0,
    }) as unknown as CheckpointData["trainerState"],
    randomState: [1, 2, 3, 4, 0, 0],
    dataloaderState: null,
    streamingDataloaderState: null,
    metadata: options.metadata,
  };
}

function jsonOf(checkpoint: CheckpointData): string {
  return JSON.stringify(checkpoint);
}

let cachedTokenizerState: ReturnType<BPETokenizer["toState"]> | undefined;
function tokenizerState(): ReturnType<BPETokenizer["toState"]> {
  if (!cachedTokenizerState) {
    const tokenizer = new BPETokenizer();
    tokenizer.train(corpus, production.vocabSize);
    cachedTokenizerState = tokenizer.toState();
  }
  return cachedTokenizerState;
}

// ============================================================
// 1. Analysis
// ============================================================

describe("Milestone A — checkpoint analysis", () => {
  it("accepts a legacy production checkpoint and reports tokenizer fallback", () => {
    const result = analyzeCheckpointJSON(jsonOf(buildCheckpoint()), corpus);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.analysis.tokenizerSource).toBe("reconstructed");
    expect(result.analysis.vocabSize).toBe(production.vocabSize);
    expect(result.analysis.parameterCount).toBe(1126528);
    expect(result.analysis.warnings.length).toBeGreaterThan(0);
  });

  it("reports the serialized globalStep of a trained checkpoint", () => {
    // Regression: TrainingStateSnapshot serializes the optimizer-step counter
    // as `globalStep`. Reading only `trainerState.step` reported every imported
    // checkpoint as step 0.
    const result = analyzeCheckpointJSON(
      jsonOf(
        buildCheckpoint({
          trainerState: { epoch: 15, globalStep: 336, totalBatches: 336 },
        })
      ),
      corpus
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.step).toBe(336);
  });

  it("still accepts a legacy trainerState.step field", () => {
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ trainerState: { epoch: 3, step: 7 } })),
      corpus
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.step).toBe(7);
  });

  it("rejects a missing model parameter", () => {
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ omitParam: "lmHead.linear.weight" })),
      corpus
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("missing");
  });

  it("rejects an unknown model parameter", () => {
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ unknownParam: true })),
      corpus
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("extra.weight");
  });

  it("rejects a tensor shape mismatch", () => {
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ wrongShape: true })),
      corpus
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("shape");
  });

  it("rejects an unsupported metadata architecture", () => {
    const metadata = metadataForCheckpoint({
      modelConfig: {
        vocabSize: production.vocabSize,
        dModel: 64,
        numHeads: 2,
        dFF: 128,
        numLayers: 1,
        maxSeqLen: 64,
      },
    });
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ metadata })),
      corpus
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("architecture");
  });

  it("uses metadata tokenizer state when it matches the model vocabulary", () => {
    const metadata = metadataForCheckpoint({
      tokenizerState: tokenizerState(),
    });
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ metadata })),
      corpus
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.tokenizerSource).toBe("metadata");
  });

  it("rejects metadata tokenizer state with the wrong vocabulary size", () => {
    const metadata = metadataForCheckpoint({
      tokenizerState: {
        version: 1,
        vocabSize: 260,
        merges: [],
        vocab: {},
      },
    });
    const result = analyzeCheckpointJSON(
      jsonOf(buildCheckpoint({ metadata })),
      corpus
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("tokenizer");
  });

  it("rejects malformed JSON", () => {
    const result = analyzeCheckpointJSON("{not json", corpus);
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// 2. loadCheckpoint completeness guard
// ============================================================

describe("Milestone A — loadCheckpoint completeness", () => {
  it("refuses a checkpoint that would leave parameters at random init", () => {
    const checkpoint = buildCheckpoint({ omitParam: "finalNorm.gamma" });
    const model = new TensorMiniMindModel({
      vocabSize: production.vocabSize,
      dModel: production.dModel,
      numHeads: production.numHeads,
      dFF: production.dFF,
      numLayers: production.numLayers,
      maxSeqLen: production.maxSeqLen,
    });
    const optimizer = new AdamWOptimizer(model.parameters(), {
      lr: 0.001,
      weightDecay: 0.01,
    });

    expect(() =>
      loadCheckpoint({ model, optimizer, checkpoint })
    ).toThrow();
  });
});

// ============================================================
// 3. Import + activation
// ============================================================

describe("Milestone A — checkpoint import and activation", () => {
  it("stores the blob and activates a generatable session", async () => {
    const checkpoint = buildCheckpoint();
    const imported = await importCheckpoint({
      fileName: "phase96-treatment.ckpt.json",
      json: jsonOf(checkpoint),
    });

    expect(imported.sessionId.length).toBeGreaterThan(0);
    expect(imported.checkpointId.length).toBeGreaterThan(0);
    expect(imported.storage).toBe("memory"); // Node has no IndexedDB
    expect(imported.tokenizerSource).toBe("reconstructed");

    const session = workspace.getSession(imported.sessionId);
    expect(session?.activeCheckpoint?.checkpointDataPersisted).toBe(true);
    expect(session?.activeCheckpoint?.id).toBe(imported.checkpointId);

    const stored = await checkpointStore.get(imported.checkpointId);
    expect(stored !== undefined).toBe(true);
    if (stored) {
      const enriched = JSON.parse(stored) as CheckpointData;
      expect(enriched.metadata?.tokenizerState !== undefined).toBe(true);
      expect(enriched.metadata?.vocabSize).toBe(production.vocabSize);
    }

    const info = getGenerationCheckpointInfo(imported.sessionId);
    expect(info?.hasCheckpoint).toBe(true);
    expect(getDefaultChatConfig(info).isBaseline).toBe(false);
    expect(
      getGeneratableSessions().some((s) => s.sessionId === imported.sessionId)
    ).toBe(true);
  });

  it("does not create a session when the checkpoint is incomplete", async () => {
    const before = getGeneratableSessions().length;
    let threw = false;
    try {
      await importCheckpoint({
        fileName: "incomplete.ckpt.json",
        json: jsonOf(buildCheckpoint({ omitParam: "finalNorm.gamma" })),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
    expect(getGeneratableSessions().length).toBe(before);
    expect(
      getGeneratableSessions().some((s) =>
        s.sessionName.includes("incomplete.ckpt.json")
      )
    ).toBe(false);
  });

  it("keeps the baseline path available and seeded by default", () => {
    const config = getDefaultChatConfig(null);
    expect(config.isBaseline).toBe(true);
    expect(config.params.seed).toBe(42);
  });
});

// ============================================================
// Standalone runner
// ============================================================

if (
  (typeof require !== "undefined" && require.main === module) ||
  process.argv[1]?.includes("milestone-a-checkpoint-import")
) {
  run().then((result) => {
    console.log("\n" + "=".repeat(60));
    console.log(
      `Milestone A checkpoint import: ${result.passed} passed, ${result.failed} failed`
    );
    console.log("=".repeat(60));
    if (result.failed > 0) process.exit(1);
  });
}
