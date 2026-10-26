// ============================================================
// MiniMind — data/node.ts
// ============================================================
// Node-only data module exports.
//
// These modules use Node.js fs/path and are NOT browser-safe.
// Import from here for CLI / server-side use only.
//
// Usage:
//   import { TextCorpus } from "@/lib/minimind/data/node";
//   import { TinyStoriesDataset } from "@/lib/minimind/data/node";
//   import { StreamingDataset } from "@/lib/minimind/data/node";
// ============================================================

// ── TextCorpus ──
export { TextCorpus } from "./TextCorpus";
export type { CorpusSource, TextCorpusOptions } from "./TextCorpus";

// ── TinyStoriesDataset ──
export { TinyStoriesDataset } from "./TinyStoriesDataset";
export type { TinyStoriesConfig } from "./TinyStoriesDataset";

// ── Streaming Dataset Engine (Phase 49) ──
export {
  TextShardReader,
  StreamingDataset,
  StreamingDataLoader,
} from "./streaming";
export type {
  ShardReaderState,
  TextShardReaderOptions,
  StreamingDatasetOptions,
  StreamingDatasetState,
  StreamingDataLoaderOptions,
  StreamingDataLoaderState,
} from "./streaming";
