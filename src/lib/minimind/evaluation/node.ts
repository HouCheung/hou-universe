// ============================================================
// MiniMind — evaluation/node.ts
// ============================================================
// Node-only evaluation exports.
//
// TrainingReport uses Node.js fs/path — it is NOT browser-safe.
// Import from here for CLI / server-side use only.
//
// Usage:
//   import { TrainingReport } from "@/lib/minimind/evaluation/node";
// ============================================================

export { TrainingReport } from "./TrainingReport";
export type {
  TrainingReportData,
  TrainingReportGenerationComparison,
} from "./TrainingReport";
