// ============================================================
// MiniMind — data/streaming/index.ts
// ============================================================
// Streaming data module barrel export.
//
// Phase 49: Streaming Dataset Engine
// ============================================================

// ── TextShardReader ──
export { TextShardReader } from "./TextShardReader";
export type { ShardReaderState, TextShardReaderOptions } from "./TextShardReader";

// ── StreamingDataset ──
export { StreamingDataset } from "./StreamingDataset";
export type {
  StreamingDatasetOptions,
  StreamingDatasetState,
} from "./StreamingDataset";

// ── StreamingDataLoader ──
export { StreamingDataLoader } from "./StreamingDataLoader";
export type {
  StreamingDataLoaderOptions,
  StreamingDataLoaderState,
} from "./StreamingDataLoader";
