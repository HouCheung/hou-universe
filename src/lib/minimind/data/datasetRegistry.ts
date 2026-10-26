// ============================================================
// MiniMind — data/datasetRegistry.ts
// ============================================================
// Phase 80: Single source of truth for dataset → corpus resolution.
//
// This is the ONLY place a dataset identifier is turned into a
// `string[]` corpus that the training/generation pipeline consumes.
//
// The Phase 80 contract:
//   - `TINY_TRAINING_CORPUS` is a TEST / DEMO / FIXTURE, never the
//     production training default.
//   - `bilingual` is the FOUNDATION production dataset.
//   - `tinystories` / `textfile` require network or Node fs access
//     and are NOT available inside the browser Worker — they must be
//     reported as unavailable, not silently replaced.
// ============================================================

import {
  loadProductionDataset,
  getDatasetTexts,
  computeBaseStatistics,
} from "./datasetLoader";
import { TINY_TRAINING_CORPUS } from "../research/worker/training-data";

// ============================================================
// Types
// ============================================================

/**
 * Dataset identifier contract (Phase 81).
 *
 * The union is split by KIND so validation can distinguish:
 *   - production    — the single real training dataset
 *   - fixture       — test/demo corpora (never a production default)
 *   - unavailable   — legacy ids with no real data source in the browser
 *
 * `tinystories` / `textfile` / `synthetic` remain as union members ONLY for
 * backward compatibility with historical recipes/configs. They are NOT
 * executable in the production pipeline and must be reported unavailable.
 */
export type ProductionDatasetId = "bilingual";
export type FixtureDatasetId = "inline" | "tiny" | "demo" | "fixture";
export type LegacyUnavailableDatasetId = "tinystories" | "textfile" | "synthetic";
export type DatasetId =
  | ProductionDatasetId
  | FixtureDatasetId
  | LegacyUnavailableDatasetId;

/**
 * Classification of a dataset identifier.
 */
export type DatasetKind = "production" | "fixture" | "unavailable";

/**
 * Classify a dataset identifier by kind.
 *
 * This is the single source of truth for whether an id is production,
 * fixture, unavailable, or unknown. Used by `validateRecipe`,
 * `validateLaunchConfig`, and the launcher adapter to keep the whole
 * dataset contract consistent.
 *
 * @param id - Dataset identifier (may be undefined/null)
 * @returns "production" | "fixture" | "unavailable" | "unknown"
 */
export function datasetKind(
  id: string | null | undefined
): DatasetKind | "unknown" {
  const normalized = (id ?? "").trim().toLowerCase();
  switch (normalized) {
    case "bilingual":
      return "production";
    case "inline":
    case "tiny":
    case "demo":
    case "fixture":
      return "fixture";
    case "tinystories":
    case "textfile":
    case "synthetic":
      return "unavailable";
    default:
      return "unknown";
  }
}

/**
 * Result of resolving a dataset identifier into a concrete corpus.
 */
export interface ResolvedDataset {
  /** Canonical dataset identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Resolved inline corpus (empty when unavailable) */
  corpus: string[];
  /** Whether the corpus is actually usable for training */
  available: boolean;
  /** Human-readable warning when unavailable (undefined when fine) */
  warning?: string;
  /** Whether this is a test/demo fixture rather than real data */
  isFixture: boolean;
  /** Classification of the dataset (production / fixture / unavailable) */
  kind: DatasetKind;
  /** Language coverage (production dataset only) */
  language?: string;
  /** Provenance (production dataset only) — the data file/module backing the corpus */
  source?: string;
  /** Dataset content version (production dataset only) */
  version?: string;
  /** Dataset schema version (production dataset only) */
  schemaVersion?: number;
  /** Dataset purpose (production dataset only) */
  purpose?: string;
  /** Sample count (production dataset only) */
  sampleCount?: number;
}

// ============================================================
// Registry
// ============================================================

/**
 * Resolve a dataset identifier into a concrete training corpus.
 *
 * Supported identifiers:
 *   - "bilingual"   — FOUNDATION bilingual corpus (production default)
 *   - "inline"      — caller-supplied inline texts (via `inlineTexts`)
 *   - "tinystories" — real TinyStories (requires network) — NOT browser-ready
 *   - "textfile"    — a text file (requires fs/file input) — NOT browser-ready
 *   - "synthetic"   — not implemented — reported unavailable
 *   - "tiny" / "fixture" / "demo" — TINY_TRAINING_CORPUS fixture only
 *
 * Unknown identifiers are reported unavailable with an explicit warning —
 * never silently replaced with the bilingual corpus.
 *
 * @param datasetId - The dataset identifier selected in the UI
 * @param inlineTexts - Inline corpus text (required for "inline")
 * @returns ResolvedDataset with corpus + availability
 */
export function resolveTrainingDataset(
  datasetId: string | undefined,
  inlineTexts?: string[]
): ResolvedDataset {
  const id = (datasetId ?? "bilingual").trim().toLowerCase();

  switch (id) {
    case "bilingual": {
      const dataset = loadProductionDataset();
      const corpus = getDatasetTexts(dataset);
      const base = computeBaseStatistics(dataset);
      return {
        id,
        name: `${dataset.metadata.name} (${dataset.metadata.languageCoverage.join("/")})`,
        corpus,
        available: corpus.length > 0,
        isFixture: false,
        kind: "production",
        language: dataset.metadata.languageCoverage.join("/"),
        source: "bilingual.json",
        version: dataset.metadata.version,
        schemaVersion: dataset.metadata.schemaVersion,
        purpose: dataset.metadata.purpose,
        sampleCount: base.sampleCount,
      };
    }

    case "inline": {
      const corpus = inlineTexts?.filter((t) => t && t.trim().length > 0) ?? [];
      if (corpus.length === 0) {
        return {
          id,
          name: "Inline Corpus",
          corpus: [],
          available: false,
          warning: "No inline text was provided for this dataset.",
          isFixture: true,
          kind: "fixture",
        };
      }
      return {
        id,
        name: "Inline Corpus",
        corpus,
        available: true,
        isFixture: true,
        kind: "fixture",
      };
    }

    case "tinystories": {
      return {
        id,
        name: "TinyStories",
        corpus: [],
        available: false,
        warning:
          "TinyStories requires network download and is not available " +
          "inside the browser training worker. Use the bilingual foundation dataset.",
        isFixture: false,
        kind: "unavailable",
      };
    }

    case "textfile": {
      return {
        id,
        name: "Text File",
        corpus: [],
        available: false,
        warning:
          "Text-file datasets require filesystem access and are not available " +
          "inside the browser training worker.",
        isFixture: false,
        kind: "unavailable",
      };
    }

    case "synthetic": {
      return {
        id,
        name: "Synthetic",
        corpus: [],
        available: false,
        warning: "A synthetic dataset has not been authored yet.",
        isFixture: false,
        kind: "unavailable",
      };
    }

    case "tiny":
    case "fixture":
    case "demo": {
      return {
        id,
        name: "Tiny Demo Corpus (fixture)",
        corpus: TINY_TRAINING_CORPUS,
        available: true,
        warning: "This is a test/demo fixture, not production training data.",
        isFixture: true,
        kind: "fixture",
      };
    }

    default: {
      // Phase 81: unknown dataset ids are reported unavailable — never
      // silently replaced with the bilingual corpus. This keeps failures
      // diagnosable and prevents a user believing they trained on a dataset
      // that was actually swapped out.
      return {
        id,
        name: "Unknown Dataset",
        corpus: [],
        available: false,
        warning: `Unknown dataset "${datasetId}" — not available for training. No fallback was applied.`,
        isFixture: false,
        kind: "unavailable",
      };
    }
  }
}
