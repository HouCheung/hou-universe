// ============================================================
// missionAdapter — Learning-derived mission intelligence
// ============================================================
//
// This adapter computes "what should the user do next" data
// by combining localStorage UserProgress with learning-registry
// intelligence. Components import from HERE, never from
// registries directly.
//
// SSOT sources:
//   - src/data/minimind/module-registry.ts
//   - src/data/minimind/learning-registry.ts
// ============================================================

import {
  getNextNodes,
  getRecommendations,
  getOverallProgress,
  type UserProgress,
  type Recommendation,
  type LearningStatus,
} from "@/data/minimind/learning-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";

// ============================================================
// Types
// ============================================================

export interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

export interface MissionData {
  /** The MINIMIND_MODULES id (no prefix) */
  moduleId: string;
  /** Resolved module title */
  title: string;
  /** Resolved module description */
  description: string;
  /** Top-priority recommendation from learning intelligence */
  recommendation: Recommendation | null;
  /** All recommendations sorted by priority */
  allRecommendations: Recommendation[];
  /** True when all modules are mastered — no more nodes available */
  isAllDone: boolean;
}

export interface ResumeData {
  moduleId: string;
  moduleTitle: string;
  percentComplete: number;
  modulesCompleted: number;
  modulesTotal: number;
  lastUpdated: string;
}

// ============================================================
// localStorage helpers
// ============================================================

/** Parse localStorage raw data into UserProgress shape */
export function parseStoredProgress(raw: string | null): UserProgress | null {
  if (!raw) return null;
  try {
    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;
    return {
      nodeStatus: (parsed.nodeStatus ?? {}) as Record<string, LearningStatus>,
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Load UserProgress from localStorage (client-side only) */
export function loadProgress(): UserProgress | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredProgress(localStorage.getItem("minimind-learning-progress"));
  } catch {
    return null;
  }
}

/** Load progress percentage (0-100) from localStorage */
export function loadProgressPercent(): number {
  if (typeof window === "undefined") return 0;
  try {
    const progress = loadProgress();
    if (!progress) return 0;
    const statuses = Object.values(progress.nodeStatus);
    if (statuses.length === 0) return 0;
    const done = statuses.filter(
      (s) => s === "completed" || s === "mastered"
    ).length;
    return Math.round((done / statuses.length) * 100);
  } catch {
    return 0;
  }
}

// ============================================================
// Mission derivation
// ============================================================

/** Derive the user's current mission from progress data */
export function deriveMission(progress: UserProgress | null): MissionData {
  // ── Fallback: first visit, no progress ──
  if (!progress) {
    const firstModule = MINIMIND_MODULES[0];
    return {
      moduleId: firstModule?.id ?? "tokenizer",
      title: firstModule?.title ?? "Tokenizer",
      description: firstModule?.description ?? "",
      recommendation: null,
      allRecommendations: [],
      isAllDone: false,
    };
  }

  // ── Get next available nodes ──
  const nextIds = getNextNodes(progress);

  // ── Get recommendations ──
  const recommendations = getRecommendations(progress);
  const topRec = recommendations.length > 0 ? recommendations[0] : null;

  // ── All done? ──
  if (nextIds.length === 0 && recommendations.length === 0) {
    return {
      moduleId: "",
      title: "",
      description: "",
      recommendation: null,
      allRecommendations: [],
      isAllDone: true,
    };
  }

  // ── Pick the first available node ──
  const nextSourceId = nextIds[0] ?? "module:tokenizer";
  const moduleId = nextSourceId.replace(/^module:/, "");
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);

  return {
    moduleId,
    title: mod?.title ?? moduleId,
    description: mod?.description ?? "",
    recommendation: topRec,
    allRecommendations: recommendations,
    isAllDone: false,
  };
}

// ============================================================
// Resume data derivation
// ============================================================

/** Derive resume card data from localStorage progress */
export function deriveResumeData(progress: UserProgress | null): ResumeData | null {
  if (!progress) return null;

  // Must have at least one non-locked node
  const hasAnyProgress = Object.values(progress.nodeStatus).some(
    (s) => s !== "locked"
  );
  if (!hasAnyProgress) return null;

  // Find the in_progress node, or fall back to last completed
  let activeSourceId = "";
  for (const [id, status] of Object.entries(progress.nodeStatus)) {
    if (status === "in_progress") {
      activeSourceId = id;
      break;
    }
  }
  if (!activeSourceId) {
    for (const [id, status] of Object.entries(progress.nodeStatus)) {
      if (status === "completed" || status === "mastered") {
        activeSourceId = id;
      }
    }
  }

  const moduleId = activeSourceId.replace(/^module:/, "");
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);
  const stats = getOverallProgress(progress);

  return {
    moduleId,
    moduleTitle: mod?.title ?? moduleId,
    percentComplete: stats.percentComplete,
    modulesCompleted: stats.modulesCompleted,
    modulesTotal: stats.modulesTotal,
    lastUpdated: progress.lastUpdated,
  };
}

/** Format an ISO date string as a relative time ago */
export function formatTimeAgo(isoString: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return "";
  }
}
