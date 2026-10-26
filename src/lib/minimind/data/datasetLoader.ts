// ============================================================
// MiniMind — data/datasetLoader.ts
// ============================================================
// Phase 82: Single dataset loader for production datasets.
//
// Responsibilities:
//   1. Parse + validate the dataset envelope (schema, duplicates,
//      language, split) and return STRONGLY-TYPED samples.
//   2. Compute DETERMINISTIC statistics (counts, character/byte/token
//      counts, split distribution) using the REAL tokenizer — never
//      a `length / 4` heuristic.
//   3. Load the production `bilingual` dataset from a data file
//      (bilingual.json) so the corpus lives OUTSIDE TypeScript.
//
// This is the ONE loader used by datasetRegistry, TrainingRuntime,
// TrainingWorker, tests, and evaluation. It is browser-safe (no fs,
// no path) — the production corpus is imported as a bundled JSON
// module so it loads synchronously on the main thread AND under
// `tsx` in Node tests.
//
// JSONL: parseJsonlText() is provided for future large corpora, but
// the production path uses the JSON envelope (a JSONL file has no
// browser raw-text loader configured and cannot bundle synchronously).
// ============================================================

import bilingualJson from "../../../data/minimind/datasets/bilingual.json";

import {
  validateDatasetMetadata,
  validateDatasetSample,
  type DatasetMetadata,
  type DatasetSample,
} from "./datasetSchema";
import type { ITokenizer } from "./ITokenizer";

// ============================================================
// Result types
// ============================================================

/**
 * A parsed + validated dataset.
 */
export interface LoadedDataset {
  metadata: DatasetMetadata;
  samples: DatasetSample[];
}

/**
 * Base statistics that require NO tokenizer (deterministic and cheap).
 */
export interface BaseStatistics {
  /** Total sample count */
  sampleCount: number;
  /** Language distribution (zh / en / mixed) */
  languageCounts: { zh: number; en: number; mixed: number };
  /** Split distribution (train / validation / test) */
  splitCounts: { train: number; validation: number; test: number };
  /** Total UTF-16 characters across all sample texts */
  characterCount: number;
  /** Total UTF-8 bytes across all sample texts */
  byteCount: number;
}

/**
 * Token-level statistics (require a real tokenizer).
 */
export interface TokenStatistics {
  /** Total tokens across all sample texts */
  tokenCount: number;
  /** Average tokens per sample */
  averageTokensPerSample: number;
  /** Maximum tokens in any single sample */
  maxTokensPerSample: number;
  /** Minimum tokens in any single sample */
  minTokensPerSample: number;
}

/**
 * Full deterministic statistics for a dataset.
 */
export interface DatasetStatistics extends BaseStatistics, TokenStatistics {}

// ============================================================
// Parsing / validation
// ============================================================

/**
 * Parse and validate a raw dataset envelope.
 *
 * Validates the metadata, each sample, and rejects duplicate ids.
 *
 * @param raw - The raw (untyped) dataset envelope
 * @param sourceLabel - Human-readable provenance for error messages
 * @returns Typed LoadedDataset
 * @throws On any schema violation
 */
export function parseDataset(
  raw: unknown,
  sourceLabel: string
): LoadedDataset {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Invalid dataset "${sourceLabel}": expected an object envelope`);
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.samples)) {
    throw new Error(`Invalid dataset "${sourceLabel}": "samples" must be an array`);
  }

  const metadata = validateDatasetMetadata(obj.metadata);

  const samples: DatasetSample[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < obj.samples.length; i++) {
    const sample = validateDatasetSample(obj.samples[i], i);
    if (seen.has(sample.id)) {
      throw new Error(
        `Invalid dataset "${sourceLabel}": duplicate sample id "${sample.id}"`
      );
    }
    seen.add(sample.id);
    samples.push(sample);
  }

  return { metadata, samples };
}

/**
 * Parse a JSONL corpus body into samples under the provided metadata.
 *
 * JSONL is a supported format for future large corpora; it is NOT used
 * by the production `bilingual` dataset (which bundles as JSON). Each
 * non-empty, non-comment line is expected to be a single sample object.
 *
 * @param text - Raw JSONL text (one sample JSON per line)
 * @param metadata - Dataset metadata for the envelope
 * @param sourceLabel - Human-readable provenance for error messages
 * @returns Typed LoadedDataset
 * @throws On a malformed line or any sample schema violation
 */
export function parseJsonlText(
  text: string,
  metadata: DatasetMetadata,
  sourceLabel: string
): LoadedDataset {
  const rawSamples: unknown[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `Invalid dataset "${sourceLabel}": malformed JSONL on line ${i + 1}: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
    rawSamples.push(parsed);
  }

  return parseDataset({ metadata, samples: rawSamples }, sourceLabel);
}

// ============================================================
// Statistics
// ============================================================

/**
 * Compute deterministic base statistics (no tokenizer required).
 */
export function computeBaseStatistics(dataset: LoadedDataset): BaseStatistics {
  const languageCounts = { zh: 0, en: 0, mixed: 0 };
  const splitCounts = { train: 0, validation: 0, test: 0 };
  let characterCount = 0;
  let byteCount = 0;

  for (const sample of dataset.samples) {
    languageCounts[sample.language]++;
    splitCounts[sample.split ?? "train"]++;
    characterCount += sample.text.length;
    byteCount += byteLengthOf(sample.text);
  }

  return {
    sampleCount: dataset.samples.length,
    languageCounts,
    splitCounts,
    characterCount,
    byteCount,
  };
}

/**
 * Compute deterministic token statistics using a REAL tokenizer.
 *
 * Token counts come from `tokenizer.encode(text).length` — never from a
 * `length / 4`-style heuristic, which is wrong for Chinese (whose UTF-8
 * bytes do not map to ASCII-like tokens).
 */
export function computeTokenStatistics(
  dataset: LoadedDataset,
  tokenizer: ITokenizer
): TokenStatistics {
  let tokenCount = 0;
  let maxTokens = 0;
  let minTokens = Number.POSITIVE_INFINITY;

  for (const sample of dataset.samples) {
    const tokens = tokenizer.encode(sample.text).length;
    tokenCount += tokens;
    if (tokens > maxTokens) maxTokens = tokens;
    if (tokens < minTokens) minTokens = tokens;
  }

  if (dataset.samples.length === 0) {
    return {
      tokenCount: 0,
      averageTokensPerSample: 0,
      maxTokensPerSample: 0,
      minTokensPerSample: 0,
    };
  }

  return {
    tokenCount,
    averageTokensPerSample: tokenCount / dataset.samples.length,
    maxTokensPerSample: maxTokens,
    minTokensPerSample: minTokens,
  };
}

/**
 * Compute full deterministic statistics for a dataset.
 */
export function computeDatasetStatistics(
  dataset: LoadedDataset,
  tokenizer: ITokenizer
): DatasetStatistics {
  return {
    ...computeBaseStatistics(dataset),
    ...computeTokenStatistics(dataset, tokenizer),
  };
}

// ============================================================
// Production dataset loading
// ============================================================

let cachedProductionDataset: LoadedDataset | null = null;

/**
 * Load the production `bilingual` dataset.
 *
 * The corpus lives in a data file (bilingual.json), NOT in TypeScript.
 * Parsing + validation runs once and is memoized.
 *
 * @returns Typed LoadedDataset
 * @throws If the bundled corpus fails schema validation
 */
export function loadProductionDataset(): LoadedDataset {
  if (cachedProductionDataset) {
    return cachedProductionDataset;
  }
  cachedProductionDataset = parseDataset(
    bilingualJson as unknown,
    "bilingual.json"
  );
  return cachedProductionDataset;
}

/**
 * Extract the flat `string[]` corpus from a loaded dataset.
 *
 * This is the ONLY place a production dataset is converted into the
 * `string[]` shape the tokenizer / TextDataset pipeline consumes.
 */
export function getDatasetTexts(dataset: LoadedDataset): string[] {
  return dataset.samples.map((sample) => sample.text);
}

// ============================================================
// Helpers
// ============================================================

const textEncoder = new TextEncoder();

/**
 * Deterministic UTF-8 byte length of a string (browser + Node safe).
 */
function byteLengthOf(text: string): number {
  return textEncoder.encode(text).length;
}
