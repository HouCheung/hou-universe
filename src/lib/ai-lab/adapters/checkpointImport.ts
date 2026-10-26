// ============================================================
// AI Lab — adapters/checkpointImport.ts
// ============================================================
// Milestone A: local checkpoint import + activation.
//
// Responsibilities:
//   1. Validate a `.ckpt.json` file BEFORE it can become active
//      (structure, architecture, parameter names/shapes/completeness).
//   2. Reconstruct the tokenizer for legacy checkpoints that predate
//      `metadata.tokenizerState`, deterministically, from the production
//      bilingual corpus.
//   3. Persist the blob through the existing CheckpointStore (IndexedDB)
//      and attach it to a ResearchWorkspace session through the existing
//      `activeCheckpoint` mechanism.
//
// Hard guarantees:
//   - A rejected file writes nothing and activates nothing.
//   - A partially initialized model can never be activated.
//   - The original file on disk is never modified; enrichment happens on
//     the in-memory copy that is stored.
// ============================================================

import type { CheckpointData, CheckpointMetadata } from "@/lib/minimind/training/checkpoint/Checkpoint";
import type { BPETokenizerState } from "@/lib/minimind/tokenizer/BPETokenizer";
import type { GenerationModelConfig } from "@/lib/minimind/research/GenerationResult";
import type { ResearchCheckpoint } from "@/lib/minimind/research/ResearchState";
import { BPETokenizer } from "@/lib/minimind/tokenizer/BPETokenizer";
import { TensorMiniMindModel } from "@/lib/minimind/model/TensorMiniMindModel";
import { getProductionModelConfig } from "@/lib/minimind/experiments/ModelRegistry";
import { loadRecipe } from "@/lib/minimind/experiments/TrainingRecipe";
import { resolveTrainingDataset } from "@/lib/minimind/data/datasetRegistry";
import { checkpointStore, type CheckpointStoreBackend } from "@/lib/minimind/research/CheckpointStore";
import { workspace } from "@/lib/minimind/research/ResearchWorkspace";

// ============================================================
// Types
// ============================================================

export interface CheckpointAnalysis {
  checkpoint: CheckpointData;
  /** Production architecture this app can execute. */
  modelConfig: GenerationModelConfig;
  parameterCount: number;
  vocabSize: number;
  tokenizerSource: "metadata" | "reconstructed";
  tokenizerState: BPETokenizerState;
  warnings: string[];
  step: number;
}

export type CheckpointAnalysisResult =
  | { ok: true; analysis: CheckpointAnalysis }
  | { ok: false; error: string };

export interface ImportCheckpointInput {
  fileName: string;
  json: string;
}

export interface ImportedCheckpoint {
  sessionId: string;
  sessionName: string;
  checkpointId: string;
  storage: CheckpointStoreBackend;
  tokenizerSource: "metadata" | "reconstructed";
  warnings: string[];
  parameterCount: number;
  vocabSize: number;
}

// ============================================================
// Helpers
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function productionModelConfig(): GenerationModelConfig {
  const p = getProductionModelConfig();
  return {
    vocabSize: p.vocabSize,
    dModel: p.dModel,
    numHeads: p.numHeads,
    dFF: p.dFF,
    numLayers: p.numLayers,
    maxSeqLen: p.maxSeqLen,
  };
}

function fail(error: string): CheckpointAnalysisResult {
  return { ok: false, error };
}

/** Validate the outer JSON shape before touching model internals. */
function validateStructure(value: unknown): string | null {
  if (!isRecord(value)) return "Checkpoint JSON must be an object.";

  if (
    value.version !== 1 &&
    value.version !== 2 &&
    value.version !== 3
  ) {
    return `Unsupported checkpoint version: ${String(value.version)}.`;
  }

  if (!Array.isArray(value.modelParams) || value.modelParams.length === 0) {
    return "Checkpoint has no model parameters.";
  }

  const seen = new Set<string>();
  for (const raw of value.modelParams) {
    if (!isRecord(raw)) return "Checkpoint contains a malformed parameter entry.";
    if (typeof raw.name !== "string" || raw.name.length === 0) {
      return "Checkpoint parameter is missing its name.";
    }
    if (seen.has(raw.name)) {
      return `Checkpoint contains duplicate parameter "${raw.name}".`;
    }
    seen.add(raw.name);

    if (!isNumberArray(raw.shape) || raw.shape.length === 0) {
      return `Checkpoint parameter "${raw.name}" has an invalid shape.`;
    }
    if (!isNumberArray(raw.data)) {
      return `Checkpoint parameter "${raw.name}" has invalid data.`;
    }
    const expectedLength = raw.shape.reduce((a, b) => a * b, 1);
    if (expectedLength !== raw.data.length) {
      return (
        `Checkpoint parameter "${raw.name}" has ${raw.data.length} values ` +
        `for shape [${raw.shape.join(",")}] (expected ${expectedLength}).`
      );
    }
  }

  const optimizer = value.optimizerState;
  if (!isRecord(optimizer)) return "Checkpoint has no optimizer state.";
  if (optimizer.type !== "AdamW") {
    return (
      `Unsupported optimizer type "${String(optimizer.type)}". ` +
      `This app restores AdamW checkpoints only.`
    );
  }
  if (!Array.isArray(optimizer.paramStates)) {
    return "Checkpoint optimizer state is missing paramStates.";
  }
  if (optimizer.paramStates.length !== value.modelParams.length) {
    return (
      `Optimizer parameter count mismatch: checkpoint has ` +
      `${optimizer.paramStates.length}, model has ${value.modelParams.length}.`
    );
  }

  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) return "Checkpoint metadata is malformed.";
    const meta = value.metadata;
    if (meta.modelConfig !== undefined && !isRecord(meta.modelConfig)) {
      return "Checkpoint metadata.modelConfig is malformed.";
    }
  }

  return null;
}

/** Validate saved parameters against the production model architecture. */
function validateParameters(
  checkpoint: CheckpointData,
  modelConfig: GenerationModelConfig
): { ok: true; parameterCount: number } | { ok: false; error: string } {
  const model = new TensorMiniMindModel({
    vocabSize: modelConfig.vocabSize,
    dModel: modelConfig.dModel,
    numHeads: modelConfig.numHeads,
    dFF: modelConfig.dFF,
    numLayers: modelConfig.numLayers,
    maxSeqLen: modelConfig.maxSeqLen,
  });

  const expected = new Map(
    model.namedParameters().map(({ name, parameter }) => [
      name,
      parameter,
    ])
  );
  const restored = new Set<string>();
  let parameterCount = 0;

  for (const saved of checkpoint.modelParams) {
    const param = expected.get(saved.name);
    if (!param) {
      return {
        ok: false,
        error:
          `Unknown parameter "${saved.name}" — the checkpoint was built for ` +
          `a different architecture.`,
      };
    }

    const expectedShape = param.shape.join(",");
    const savedShape = saved.shape.join(",");
    if (savedShape !== expectedShape) {
      return {
        ok: false,
        error:
          `shape mismatch for "${saved.name}": checkpoint [${savedShape}], ` +
          `model [${expectedShape}].`,
      };
    }

    restored.add(saved.name);
    parameterCount += saved.data.length;
  }

  const missing: string[] = [];
  for (const { name } of model.namedParameters()) {
    if (!restored.has(name)) missing.push(name);
  }
  if (missing.length > 0) {
    const preview = missing.slice(0, 5).join(", ");
    const suffix = missing.length > 5 ? `, … (+${missing.length - 5} more)` : "";
    return {
      ok: false,
      error:
        `Incomplete checkpoint: ${missing.length} parameter(s) missing ` +
        `(${preview}${suffix}). Refusing to load a partially initialized model.`,
    };
  }

  return { ok: true, parameterCount };
}

/** Validate an explicit metadata architecture against the production one. */
function validateMetadataArchitecture(
  metadata: CheckpointMetadata,
  modelConfig: GenerationModelConfig
): string | null {
  const arch = metadata.modelConfig;
  if (!arch) return null;

  const matches =
    arch.vocabSize === modelConfig.vocabSize &&
    arch.dModel === modelConfig.dModel &&
    arch.numHeads === modelConfig.numHeads &&
    arch.dFF === modelConfig.dFF &&
    arch.numLayers === modelConfig.numLayers &&
    arch.maxSeqLen === modelConfig.maxSeqLen;

  if (!matches) {
    return (
      `Unsupported checkpoint architecture ` +
      `(vocab=${arch.vocabSize}, dModel=${arch.dModel}, heads=${arch.numHeads}, ` +
      `dFF=${arch.dFF}, layers=${arch.numLayers}, maxSeqLen=${arch.maxSeqLen}). ` +
      `This app runs the production architecture only.`
    );
  }

  if (
    metadata.vocabSize !== undefined &&
    metadata.vocabSize !== modelConfig.vocabSize
  ) {
    return (
      `Checkpoint metadata vocabSize ${metadata.vocabSize} does not match ` +
      `the production vocabulary ${modelConfig.vocabSize}.`
    );
  }

  return null;
}

/** Restore a tokenizer from metadata, or rebuild it deterministically. */
function resolveTokenizer(
  checkpoint: CheckpointData,
  corpus: string[],
  vocabSize: number
): {
  tokenizerState: BPETokenizerState;
  source: "metadata" | "reconstructed";
  warnings: string[];
} | { error: string } {
  const metadataState = checkpoint.metadata?.tokenizerState;

  if (metadataState) {
    try {
      const tokenizer = new BPETokenizer();
      tokenizer.fromState(metadataState);
      if (
        tokenizer.vocabSize !== vocabSize ||
        tokenizer.getVocabulary().size !== tokenizer.vocabSize
      ) {
        return {
          error:
            `Checkpoint tokenizer vocabulary (${tokenizer.vocabSize}) is ` +
            `incompatible with the model vocabulary (${vocabSize}).`,
        };
      }
      return {
        tokenizerState: tokenizer.toState(),
        source: "metadata",
        warnings: [],
      };
    } catch (error) {
      return {
        error:
          `Checkpoint tokenizer state is invalid: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (corpus.length === 0) {
    return {
      error:
        `Legacy checkpoint has no tokenizer state and the production ` +
        `bilingual corpus is unavailable, so tokenizer compatibility ` +
        `cannot be established.`,
    };
  }

  try {
    const tokenizer = new BPETokenizer();
    tokenizer.train(corpus, vocabSize);
    if (tokenizer.vocabSize !== vocabSize) {
      return {
        error:
          `Deterministic tokenizer reconstruction produced ` +
          `${tokenizer.vocabSize} tokens, expected ${vocabSize}. ` +
          `Tokenizer compatibility could not be established.`,
      };
    }
    return {
      tokenizerState: tokenizer.toState(),
      source: "reconstructed",
      warnings: [
        "Legacy checkpoint has no tokenizer metadata. The tokenizer was " +
        "reconstructed deterministically from the production bilingual corpus.",
      ],
    };
  } catch (error) {
    return {
      error:
        `Tokenizer reconstruction failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================
// Analyze
// ============================================================

/**
 * Validate a checkpoint JSON string without persisting or activating it.
 *
 * @param json - The raw file contents
 * @param corpus - Production corpus used for legacy tokenizer reconstruction
 */
export function analyzeCheckpointJSON(
  json: string,
  corpus: string[]
): CheckpointAnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail("File is not valid JSON.");
  }

  const structureError = validateStructure(parsed);
  if (structureError) return fail(structureError);

  const checkpoint = parsed as CheckpointData;
  const modelConfig = productionModelConfig();

  if (checkpoint.metadata) {
    const archError = validateMetadataArchitecture(
      checkpoint.metadata,
      modelConfig
    );
    if (archError) return fail(archError);
  }

  const parameters = validateParameters(checkpoint, modelConfig);
  if (!parameters.ok) return fail(parameters.error);

  const tokenizer = resolveTokenizer(
    checkpoint,
    corpus,
    modelConfig.vocabSize
  );
  if ("error" in tokenizer) return fail(tokenizer.error);

  const trainerState = checkpoint.trainerState as unknown as Record<
    string,
    unknown
  >;
  // `TrainingStateSnapshot` serializes the optimizer-step counter as
  // `globalStep`. Older/hand-written checkpoints may carry `step`; keep that as
  // a fallback so the reported step is never silently zeroed.
  const rawStep = trainerState?.globalStep ?? trainerState?.step;
  const step =
    typeof rawStep === "number" && Number.isFinite(rawStep) ? rawStep : 0;

  return {
    ok: true,
    analysis: {
      checkpoint,
      modelConfig,
      parameterCount: parameters.parameterCount,
      vocabSize: modelConfig.vocabSize,
      tokenizerSource: tokenizer.source,
      tokenizerState: tokenizer.tokenizerState,
      warnings: tokenizer.warnings,
      step,
    },
  };
}

// ============================================================
// Import
// ============================================================

let importCounter = 0;

function nextCheckpointId(): string {
  importCounter += 1;
  return `ckpt-import-${Date.now().toString(36)}-${importCounter.toString(36)}`;
}

/** Add the reconstructed tokenizer to the in-memory copy that gets stored. */
function enrichCheckpoint(analysis: CheckpointAnalysis): CheckpointData {
  const existing = analysis.checkpoint.metadata;
  const metadata: CheckpointMetadata = {
    modelConfig: analysis.modelConfig,
    vocabSize: analysis.vocabSize,
    parameterCount: analysis.parameterCount,
    trainingDataset: existing?.trainingDataset ?? "bilingual",
    datasetVersion: existing?.datasetVersion,
    datasetSchemaVersion: existing?.datasetSchemaVersion,
    datasetPurpose: existing?.datasetPurpose,
    trainingSteps: existing?.trainingSteps ?? 0,
    epochs: existing?.epochs ?? 0,
    createdAt: existing?.createdAt ?? analysis.checkpoint.timestamp,
    tokenizerState: existing?.tokenizerState ?? analysis.tokenizerState,
  };

  return {
    ...analysis.checkpoint,
    metadata,
  };
}

/**
 * Validate, persist, and activate a checkpoint.
 *
 * @throws with a user-facing message if the file is incompatible or if
 *         storage/activation fails. Nothing is activated on failure.
 */
export async function importCheckpoint(
  input: ImportCheckpointInput
): Promise<ImportedCheckpoint> {
  const corpus = resolveTrainingDataset("bilingual").corpus;
  const result = analyzeCheckpointJSON(input.json, corpus);
  if (!result.ok) {
    throw new Error(result.error);
  }

  const analysis = result.analysis;
  const checkpointId = nextCheckpointId();
  const sessionName = `Imported: ${input.fileName}`;
  const enrichedJSON = JSON.stringify(enrichCheckpoint(analysis));

  const storage = await checkpointStore.put(checkpointId, enrichedJSON);
  const roundTrip = await checkpointStore.get(checkpointId);
  if (!roundTrip) {
    await checkpointStore.delete(checkpointId);
    throw new Error(
      "Checkpoint storage failed: the blob could not be read back. " +
      "Nothing was activated."
    );
  }

  let sessionId: string | undefined;
  try {
    const session = workspace.createSession({
      name: sessionName,
      modelConfig: getProductionModelConfig(),
      trainingConfig: loadRecipe("bilingual-foundation"),
      dataset: "bilingual",
      seed: 42,
      tags: ["imported"],
      notes: `Imported from ${input.fileName}`,
    });
    sessionId = session.id;

    const checkpointMeta: ResearchCheckpoint = {
      id: checkpointId,
      step: analysis.step,
      loss: 0,
      epoch: 0,
      timestamp: analysis.checkpoint.timestamp,
      modelConfigLabel: "production",
      seed: 42,
      sizeBytes: enrichedJSON.length,
      checkpointDataPersisted: true,
    };

    workspace.updateSession(session.id, {
      status: "completed",
      checkpoints: [checkpointMeta],
      activeCheckpoint: checkpointMeta,
    });
  } catch (error) {
    if (sessionId) {
      try {
        workspace.deleteSession(sessionId);
      } catch {
        // Best-effort rollback.
      }
    }
    await checkpointStore.delete(checkpointId);
    throw new Error(
      `Checkpoint was validated but could not be activated: ` +
      `${error instanceof Error ? error.message : String(error)}. ` +
      `Nothing was activated.`
    );
  }

  const warnings = [...analysis.warnings];
  if (storage === "memory") {
    warnings.push(
      "IndexedDB is unavailable, so this checkpoint is stored in memory " +
      "only and will not survive a reload."
    );
  }

  return {
    sessionId,
    sessionName,
    checkpointId,
    storage,
    tokenizerSource: analysis.tokenizerSource,
    warnings,
    parameterCount: analysis.parameterCount,
    vocabSize: analysis.vocabSize,
  };
}
