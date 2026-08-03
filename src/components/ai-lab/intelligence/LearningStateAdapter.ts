// ============================================================
// LearningStateAdapter — unified learning state from SSOT + localStorage
// ============================================================
//
// MUST only be called client-side (inside useEffect / event handler).
// Accesses localStorage and window — will throw during SSR.
//
// This is the SINGLE entry point for all dashboard data. No other
// component reads localStorage("minimind-learning-progress").
// ============================================================

import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import { KNOWLEDGE_GRAPH } from "@/data/minimind/knowledge-registry";
import {
  getOverallProgress,
  getNextNodes,
  getRecommendations,
  type UserProgress,
  type LearningStatus,
  type OverallProgress,
} from "@/data/minimind/learning-registry";
import { enrichRecommendation } from "./RecommendationEngine";
import type {
  LearningState,
  ModuleProgressEntry,
  ModuleStatus,
  ResumeData,
} from "./types";

// ============================================================
// Stored progress shape (as persisted in localStorage)
// ============================================================

interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

// ============================================================
// Public API
// ============================================================

export function adaptLearningState(): LearningState {
  const progress = loadProgress();

  const stats: OverallProgress = progress
    ? getOverallProgress(progress)
    : emptyStats();

  const nextNodes: string[] = progress ? getNextNodes(progress) : [];

  const rawRecs = progress ? getRecommendations(progress) : [];

  const recommendations = rawRecs.map((rec) =>
    enrichRecommendation(rec, progress)
  );

  const moduleProgress: ModuleProgressEntry[] =
    buildModuleProgress(progress);

  const resume: ResumeData | null = buildResumeData(progress);

  const isFirstVisit = progress === null;
  const isAllMastered =
    progress !== null &&
    nextNodes.length === 0 &&
    rawRecs.length === 0;

  return {
    progress,
    stats,
    moduleProgress,
    nextNodes,
    recommendations,
    resume,
    isFirstVisit,
    isAllMastered,
  };
}

// ============================================================
// localStorage helpers
// ============================================================

function loadProgress(): UserProgress | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return null;

    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;

    return {
      nodeStatus: (parsed.nodeStatus ?? {}) as Record<
        string,
        LearningStatus
      >,
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================
// Empty stats (first visit / no progress)
// ============================================================

function emptyStats(): OverallProgress {
  return {
    modulesCompleted: 0,
    modulesTotal: MINIMIND_MODULES.length,
    conceptsReviewed: 0,
    conceptsTotal: KNOWLEDGE_GRAPH.nodes.filter(
      (n) => n.type === "concept"
    ).length,
    experimentsCompleted: 0,
    experimentsTotal: MINIMIND_EXPERIMENTS.filter(
      (e) => e.status === "active"
    ).length,
    percentComplete: 0,
    estimatedRemainingMinutes: 0,
  };
}

// ============================================================
// Module progress builder
// ============================================================

function buildModuleProgress(
  progress: UserProgress | null
): ModuleProgressEntry[] {
  return MINIMIND_MODULES.map((mod) => {
    const sourceId = `module:${mod.id}`;
    const rawStatus = progress?.nodeStatus[sourceId];
    const status: ModuleStatus = mapStatus(rawStatus ?? null);

    let percent = 0;
    switch (status) {
      case "mastered":
        percent = 100;
        break;
      case "completed":
        percent = 85;
        break;
      case "in_progress":
        percent = 45;
        break;
      case "available":
        percent = 0;
        break;
      case "locked":
        percent = 0;
        break;
    }

    const conceptIds =
      KNOWLEDGE_GRAPH.edges
        .filter(
          (e) =>
            e.source === sourceId && e.type === "explains"
        )
        .map((e) => e.target) ?? [];

    const experimentIds =
      KNOWLEDGE_GRAPH.edges
        .filter(
          (e) =>
            e.target === sourceId && e.type === "experiments"
        )
        .map((e) => e.source) ?? [];

    const conceptsReviewed = progress
      ? conceptIds.filter((cid) => progress.conceptReviewed[cid])
          .length
      : 0;

    const experimentsCompleted = progress
      ? experimentIds.filter(
          (eid) => progress.experimentCompleted[eid]
        ).length
      : 0;

    return {
      moduleId: mod.id,
      title: mod.title,
      description: mod.description,
      status,
      percent,
      conceptTotal: conceptIds.length,
      conceptsReviewed,
      experimentTotal: experimentIds.length,
      experimentsCompleted,
    };
  });
}

function mapStatus(raw: string | null): ModuleStatus {
  if (raw === "mastered") return "mastered";
  if (raw === "completed") return "completed";
  if (raw === "in_progress") return "in_progress";
  if (raw === "available") return "available";
  return "locked";
}

// ============================================================
// Resume data builder
// ============================================================

function buildResumeData(
  progress: UserProgress | null
): ResumeData | null {
  if (!progress) return null;

  // Must have at least one non-locked node
  const hasAnyProgress = Object.values(progress.nodeStatus).some(
    (s) => s !== "locked"
  );
  if (!hasAnyProgress) return null;

  // Find in_progress node, or fall back to last completed/mastered
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
  if (!activeSourceId) return null;

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
