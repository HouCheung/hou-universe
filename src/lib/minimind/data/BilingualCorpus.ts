// ============================================================
// MiniMind — data/BilingualCorpus.ts  (DEPRECATED shim)
// ============================================================
// Phase 82: The bilingual production corpus has MOVED out of
// TypeScript into a data file (src/data/minimind/datasets/bilingual.json),
// loaded and validated by datasetLoader.ts.
//
// This module is retained ONLY as a backward-compatible shim for the
// two accessors that predate the loader:
//   - bilingualCorpusTexts()
//   - bilingualCorpusStats()
//
// New code should import from "./datasetLoader" instead. Do NOT add
// new corpus entries here — the JSON data file is the single source
// of truth, and duplicating it here would violate the "no corpus in
// TS and JSON" contract.
// ============================================================

import {
  loadProductionDataset,
  getDatasetTexts,
  computeBaseStatistics,
} from "./datasetLoader";

/**
 * Flatten the production bilingual corpus into plain `string[]`
 * documents. Delegates to the single DatasetLoader.
 *
 * @deprecated Import `getDatasetTexts(loadProductionDataset())` from datasetLoader.
 */
export function bilingualCorpusTexts(): string[] {
  return getDatasetTexts(loadProductionDataset());
}

/**
 * Language distribution summary (zh / en / mixed).
 *
 * @deprecated Import `computeBaseStatistics(loadProductionDataset())` from datasetLoader.
 */
export function bilingualCorpusStats(): {
  total: number;
  zh: number;
  en: number;
  mixed: number;
} {
  const base = computeBaseStatistics(loadProductionDataset());
  return {
    total: base.sampleCount,
    zh: base.languageCounts.zh,
    en: base.languageCounts.en,
    mixed: base.languageCounts.mixed,
  };
}
