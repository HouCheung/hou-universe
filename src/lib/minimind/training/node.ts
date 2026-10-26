// ============================================================
// MiniMind — training/node.ts
// ============================================================
// Node-only training exports.
//
// TrainingLogger uses Node.js fs/path — it is NOT browser-safe.
// Import from here for CLI / server-side use only.
//
// Usage:
//   import { TrainingLogger } from "@/lib/minimind/training/node";
// ============================================================

export { TrainingLogger } from "./TrainingLogger";
export type { TrainingLogRecord, TrainingLogSummary } from "./TrainingLogger";
