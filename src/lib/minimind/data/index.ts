// ============================================================
// MiniMind — data/index.ts
// ============================================================
// Data 模块统一导出入口
//
// 导出所有公开类型和类：
//   - Dataset<T>     — 泛型数据集抽象基类
//   - TextDataset     — 文本语料 → Causal LM 样本
//   - DataLoader<T>   — 批量数据加载器
//   - BatchSampler    — 批量索引采样器
//
// Phase 40: Dataset & DataLoader System
// ============================================================

// ── Dataset ──
export { Dataset } from "./Dataset";

// ── TextDataset ──
export { TextDataset } from "./TextDataset";
export type { TextSample, TextDatasetOptions } from "./TextDataset";

// ── BatchSampler ──
export { BatchSampler } from "./BatchSampler";
export type { BatchSamplerOptions } from "./BatchSampler";

// ── DataLoader ──
export { DataLoader } from "./DataLoader";
export type { DataLoaderOptions, DataLoaderState } from "./DataLoader";

// ── Common Tokenizer Interface ──
export type { ITokenizer } from "./ITokenizer";

// ── Production dataset loader (Phase 82) ──
export {
  loadProductionDataset,
  parseDataset,
  parseJsonlText,
  getDatasetTexts,
  computeBaseStatistics,
  computeTokenStatistics,
  computeDatasetStatistics,
} from "./datasetLoader";
export type {
  LoadedDataset,
  BaseStatistics,
  TokenStatistics,
  DatasetStatistics,
} from "./datasetLoader";

// ── Dataset schema (Phase 82) ──
export {
  DATASET_SCHEMA_VERSION,
  SUPPORTED_LANGUAGES,
  SUPPORTED_SPLITS,
  SUPPORTED_PURPOSES,
  isDatasetLanguage,
  isDatasetSplit,
  isDatasetPurpose,
  validateDatasetSample,
  validateDatasetMetadata,
} from "./datasetSchema";
export type {
  DatasetLanguage,
  DatasetSplit,
  DatasetPurpose,
  DatasetSample,
  DatasetMetadata,
  DatasetEnvelope,
} from "./datasetSchema";

// ── Node-only exports ──
// TextCorpus, TinyStoriesDataset, and the streaming engine use
// Node.js fs/path — they are NOT browser-safe.
// Import them from "@/lib/minimind/data/node" (or "@/lib/minimind/node")
// for CLI / server-side use.
