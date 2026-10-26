// ============================================================
// MiniMind — data/datasetSchema.ts
// ============================================================
// Phase 82: Strongly-typed schema for production datasets.
//
// Defines the canonical shape of a versioned, bilingual production
// dataset: a `metadata` envelope plus a `samples` array, together
// with strict runtime validators that FAIL EXPLICITLY on malformed
// input (rather than silently accepting bad data).
//
// Validation guarantees (see datasetLoader.ts for the orchestration):
//   - `id` and `text` are non-empty strings
//   - `language` is one of zh | en | mixed
//   - `split` is one of train | validation | test
//   - `purpose` is one of pretraining | instruction | evaluation
//   - duplicate `id`s are rejected
//
// This file is pure (no fs, no browser APIs) so it is reusable by the
// loader, the registry, tests, and any future evaluation harness.
// ============================================================

// ============================================================
// Schema version
// ============================================================

/** Current dataset schema version (bump on breaking shape changes). */
export const DATASET_SCHEMA_VERSION = 1;

// ============================================================
// Discriminated unions
// ============================================================

/** Supported sample languages. */
export type DatasetLanguage = "zh" | "en" | "mixed";

/** Supported dataset splits. */
export type DatasetSplit = "train" | "validation" | "test";

/** Conceptual purpose of a dataset (kept separate from the sample schema). */
export type DatasetPurpose = "pretraining" | "instruction" | "evaluation";

export const SUPPORTED_LANGUAGES: readonly DatasetLanguage[] = [
  "zh",
  "en",
  "mixed",
];

export const SUPPORTED_SPLITS: readonly DatasetSplit[] = [
  "train",
  "validation",
  "test",
];

export const SUPPORTED_PURPOSES: readonly DatasetPurpose[] = [
  "pretraining",
  "instruction",
  "evaluation",
];

// ============================================================
// Sample
// ============================================================

/**
 * A single production dataset sample.
 *
 * Required: id, language, text.
 * Optional: source, category, quality, split (split defaults to "train").
 */
export interface DatasetSample {
  /** Unique, stable identifier (duplicates are rejected) */
  id: string;
  /** Language of the text */
  language: DatasetLanguage;
  /** The actual text content */
  text: string;
  /** Optional per-sample provenance label */
  source?: string;
  /** Optional free-form category (general / factual / technology / question / answer) */
  category?: string;
  /** Optional quality score (informational, not used for filtering) */
  quality?: number;
  /** Split assignment (defaults to "train") */
  split?: DatasetSplit;
}

// ============================================================
// Metadata
// ============================================================

/**
 * Versioned dataset metadata recorded in the data envelope and in
 * checkpoints, so a trained checkpoint always knows WHICH dataset
 * version it was trained on.
 */
export interface DatasetMetadata {
  /** Canonical dataset identifier (matches the registry id) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version of the dataset content */
  version: string;
  /** Schema version this dataset conforms to */
  schemaVersion: number;
  /** Conceptual purpose of the dataset */
  purpose: DatasetPurpose;
  /** Languages covered by the dataset */
  languageCoverage: DatasetLanguage[];
  /** Provenance label (e.g. "internally-authored-seed") */
  provenance: string;
  /** Optional free-form description */
  description?: string;
}

// ============================================================
// Envelope
// ============================================================

/**
 * The top-level JSON shape on disk.
 */
export interface DatasetEnvelope {
  metadata: DatasetMetadata;
  samples: DatasetSample[];
}

// ============================================================
// Type guards
// ============================================================

export function isDatasetLanguage(value: unknown): value is DatasetLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

export function isDatasetSplit(value: unknown): value is DatasetSplit {
  return (
    typeof value === "string" &&
    (SUPPORTED_SPLITS as readonly string[]).includes(value)
  );
}

export function isDatasetPurpose(value: unknown): value is DatasetPurpose {
  return (
    typeof value === "string" &&
    (SUPPORTED_PURPOSES as readonly string[]).includes(value)
  );
}

// ============================================================
// Validation helpers
// ============================================================

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid dataset: ${label} must be a non-empty string`);
  }
  return value;
}

/**
 * Validate and normalize a single raw sample.
 *
 * @throws On invalid id/language/text/split
 */
export function validateDatasetSample(
  raw: unknown,
  index: number
): DatasetSample {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Invalid dataset: sample at index ${index} is not an object`);
  }
  const obj = raw as Record<string, unknown>;

  const id = assertNonEmptyString(obj.id, `sample[${index}].id`);
  const text = assertNonEmptyString(obj.text, `sample[${index}].text`);

  if (!isDatasetLanguage(obj.language)) {
    throw new Error(
      `Invalid dataset: sample "${id}" has unsupported language ` +
      `"${String(obj.language)}" (expected zh | en | mixed)`
    );
  }

  let split: DatasetSplit = "train";
  if (obj.split !== undefined) {
    if (!isDatasetSplit(obj.split)) {
      throw new Error(
        `Invalid dataset: sample "${id}" has unsupported split ` +
        `"${String(obj.split)}" (expected train | validation | test)`
      );
    }
    split = obj.split;
  }

  const sample: DatasetSample = {
    id,
    language: obj.language as DatasetLanguage,
    text,
    split,
  };

  if (obj.source !== undefined) {
    if (typeof obj.source !== "string") {
      throw new Error(`Invalid dataset: sample "${id}" has a non-string source`);
    }
    sample.source = obj.source;
  }
  if (obj.category !== undefined) {
    if (typeof obj.category !== "string") {
      throw new Error(`Invalid dataset: sample "${id}" has a non-string category`);
    }
    sample.category = obj.category;
  }
  if (obj.quality !== undefined) {
    if (typeof obj.quality !== "number" || !Number.isFinite(obj.quality)) {
      throw new Error(`Invalid dataset: sample "${id}" has a non-numeric quality`);
    }
    sample.quality = obj.quality;
  }

  return sample;
}

/**
 * Validate the dataset metadata envelope.
 *
 * @throws On invalid id/name/version/schemaVersion/purpose/coverage
 */
export function validateDatasetMetadata(raw: unknown): DatasetMetadata {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid dataset: metadata is not an object");
  }
  const obj = raw as Record<string, unknown>;

  const id = assertNonEmptyString(obj.id, "metadata.id");
  const name = assertNonEmptyString(obj.name, "metadata.name");
  const version = assertNonEmptyString(obj.version, "metadata.version");

  if (typeof obj.schemaVersion !== "number" || !Number.isInteger(obj.schemaVersion)) {
    throw new Error("Invalid dataset: metadata.schemaVersion must be an integer");
  }
  if (obj.schemaVersion !== DATASET_SCHEMA_VERSION) {
    throw new Error(
      `Invalid dataset: metadata.schemaVersion ${obj.schemaVersion} does not ` +
      `match the supported version ${DATASET_SCHEMA_VERSION}`
    );
  }

  if (!isDatasetPurpose(obj.purpose)) {
    throw new Error(
      `Invalid dataset: metadata.purpose "${String(obj.purpose)}" is unsupported`
    );
  }

  if (!Array.isArray(obj.languageCoverage) || obj.languageCoverage.length === 0) {
    throw new Error("Invalid dataset: metadata.languageCoverage must be a non-empty array");
  }
  for (const lang of obj.languageCoverage) {
    if (!isDatasetLanguage(lang)) {
      throw new Error(
        `Invalid dataset: metadata.languageCoverage contains unsupported language "${String(lang)}"`
      );
    }
  }

  const provenance = assertNonEmptyString(obj.provenance, "metadata.provenance");

  const metadata: DatasetMetadata = {
    id,
    name,
    version,
    schemaVersion: obj.schemaVersion,
    purpose: obj.purpose as DatasetPurpose,
    languageCoverage: obj.languageCoverage as DatasetLanguage[],
    provenance,
  };

  if (obj.description !== undefined) {
    if (typeof obj.description !== "string") {
      throw new Error("Invalid dataset: metadata.description must be a string");
    }
    metadata.description = obj.description;
  }

  return metadata;
}
