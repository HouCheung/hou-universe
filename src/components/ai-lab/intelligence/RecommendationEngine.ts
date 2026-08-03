// ============================================================
// RecommendationEngine — enrich raw recommendations with
// cross-system routing + human-readable context
// ============================================================
//
// Takes the 5 recommendation rules from derive-mastery.ts and
// adds three capabilities the data layer doesn't provide:
//   1. Domain routing — which sub-page to link to
//   2. Rich context — trigger, unlocks, related mastered concepts
//   3. Human-readable strings for UI rendering
//
// Pure functions. Zero side effects. Does NOT modify derive-mastery.ts.
// ============================================================

import { KNOWLEDGE_GRAPH, getNodeById } from "@/data/minimind/knowledge-registry";
import {
  MASTERY_TREE,
  getUnlockChain,
  type UserProgress,
  type Recommendation,
} from "@/data/minimind/learning-registry";
import type {
  EnrichedRecommendation,
  RecommendationContext,
  ActionDomain,
} from "./types";

// ============================================================
// Domain routing map
// ============================================================

const REASON_DOMAIN_MAP: Record<
  string,
  { domain: ActionDomain; routePrefix: string; idParam: string }
> = {
  next_in_path: {
    domain: "journey",
    routePrefix: "/ai-lab/journey",
    idParam: "module",
  },
  prerequisite_for: {
    domain: "journey",
    routePrefix: "/ai-lab/journey",
    idParam: "module",
  },
  experiment: {
    domain: "experiments",
    routePrefix: "/ai-lab/experiments",
    idParam: "experiment",
  },
  reinforce: {
    domain: "knowledge",
    routePrefix: "/ai-lab/knowledge",
    idParam: "concept",
  },
  explore: {
    domain: "knowledge",
    routePrefix: "/ai-lab/knowledge",
    idParam: "concept",
  },
};

// ============================================================
// Public API
// ============================================================

export function enrichRecommendation(
  rec: Recommendation,
  progress: UserProgress
): EnrichedRecommendation {
  const routing = REASON_DOMAIN_MAP[rec.reason] ?? {
    domain: "journey" as ActionDomain,
    routePrefix: "/ai-lab/journey",
    idParam: "module",
  };

  const cleanId = rec.sourceId.replace(/^(module|experiment|concept):/, "");

  const route = `${routing.routePrefix}?${routing.idParam}=${encodeURIComponent(cleanId)}`;

  const context = buildContext(rec, progress);

  return {
    ...rec,
    domain: routing.domain,
    route,
    context,
  };
}

// ============================================================
// Context building
// ============================================================

function buildContext(
  rec: Recommendation,
  progress: UserProgress
): RecommendationContext {
  const trigger = buildTrigger(rec, progress);
  const unlocks = buildUnlocks(rec);
  const relatedMastered = buildRelatedMastered(progress);

  return { trigger, unlocks, relatedMastered };
}

/** List prerequisite labels that are completed/mastered */
function buildTrigger(
  rec: Recommendation,
  progress: UserProgress
): string {
  // Find the knowledge node and its prerequisite edges
  const node = getNodeById(rec.sourceId);
  if (!node) return "";

  const prereqEdges = KNOWLEDGE_GRAPH.edges.filter(
    (e) => e.source === rec.sourceId && e.type === "depends_on"
  );

  if (prereqEdges.length === 0) return "";

  const completedPrereqs = prereqEdges
    .filter((e) => {
      const s = progress.nodeStatus[e.target] ?? "locked";
      return s === "completed" || s === "mastered";
    })
    .map((e) => {
      const prereqNode = getNodeById(e.target);
      return prereqNode?.label ?? e.target;
    });

  if (completedPrereqs.length === 0) return "";

  return completedPrereqs.join(", ") + " completed";
}

/** List what this recommendation unlocks (transitively) */
function buildUnlocks(rec: Recommendation): string[] {
  // getUnlockChain works for module sourceIds
  if (!rec.sourceId.startsWith("module:")) return [];

  try {
    const chain = getUnlockChain(rec.sourceId);
    return chain
      .map((n) => n.knowledgeNode.label)
      .filter(Boolean)
      .slice(0, 5); // top 5, avoid bloat
  } catch {
    return [];
  }
}

/** List mastered concepts related to any concept the user reviewed */
function buildRelatedMastered(progress: UserProgress): string[] {
  const reviewedIds = Object.entries(progress.conceptReviewed)
    .filter(([, reviewed]) => reviewed)
    .map(([id]) => id);

  if (reviewedIds.length === 0) return [];

  const related: string[] = [];

  for (const concept of MASTERY_TREE.concepts) {
    if (progress.conceptReviewed[concept.conceptId]) continue;

    // Check if any reviewed concept relates to this one
    const hasRelation = reviewedIds.some(
      (rid) =>
        concept.relatesToScores[rid] !== undefined &&
        concept.relatesToScores[rid] > 0
    );

    if (hasRelation) {
      related.push(concept.conceptLabel);
    }
  }

  return related.slice(0, 5);
}
