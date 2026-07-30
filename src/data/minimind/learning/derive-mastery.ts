// ============================================================
// MiniMind Learning Intelligence — Mastery & Recommendation Derivation
// ============================================================
//
// Pure functions that derive MasteryTree and Recommendations
// from the Knowledge Graph and existing SSOT registries.
// 5 recommendation rules + concept-to-dimension mapping.
// ============================================================

import { KNOWLEDGE_GRAPH } from "@/data/minimind/knowledge-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import type {
  MasteryConcept,
  MasteryTree,
  MasteryDimension,
  Recommendation,
  RecommendationReason,
  UserProgress,
} from "./types";

// ============================================================
// Dimension Mapping — concept → radar axis
// ============================================================

const CONCEPT_DIMENSION_MAP: Record<string, MasteryDimension> = {
  // Tokenization
  "Token": "tokenization",
  "Vocabulary": "tokenization",
  "Encoding": "tokenization",
  "Decoding": "tokenization",
  "BPE": "tokenization",
  "Word Tokenization": "tokenization",
  "Character Tokenization": "tokenization",
  "Vocabulary Coverage": "tokenization",
  "Unknown Token Rate": "tokenization",
  "Sequence Length Trade-off": "tokenization",
  "Subword Tokenization": "tokenization",

  // Embedding
  "Embedding Matrix": "embedding",
  "Lookup Table": "embedding",
  "Dense Vector": "embedding",
  "One-Hot Encoding": "embedding",
  "Trainable Parameters": "embedding",
  "Embedding Vector": "embedding",
  "Cosine Similarity": "embedding",
  "Semantic Space": "embedding",
  "Vector Arithmetic": "embedding",
  "Nearest Neighbor Search": "embedding",

  // Position Encoding
  "Rotary Embedding": "position_encoding",
  "Positional Encoding": "position_encoding",
  "Frequency Bands": "position_encoding",
  "Relative Position": "position_encoding",
  "Complex Numbers": "position_encoding",
  "2D Rotation Matrix": "position_encoding",
  "Vector Norm Invariance": "position_encoding",
  "Orthogonal Transformation": "position_encoding",
  "Precomputed Cache": "position_encoding",

  // Attention / FFN
  "Self-Attention": "attention_ffn",
  "Multi-Head": "attention_ffn",
  "Scaled Dot-Product": "attention_ffn",
  "QKV Projection": "attention_ffn",
  "Causal Masking": "attention_ffn",
  "Attention Weights": "attention_ffn",
  "Attention Matrix": "attention_ffn",
  "Numerical Stability (Softmax)": "attention_ffn",
  "Head Split / Merge": "attention_ffn",
  "Output Projection (W_O)": "attention_ffn",
  "Feed-Forward Network": "attention_ffn",
  "Position-wise Transformation": "attention_ffn",
  "SwiGLU": "attention_ffn",
  "SiLU Activation (Swish)": "attention_ffn",
  "Gated Linear Unit": "attention_ffn",
  "Gate / Up / Down Projection": "attention_ffn",
  "Element-wise Multiply": "attention_ffn",
  "Expansion-Compression (Bottleneck)": "attention_ffn",
  "Non-linearity in Transformers": "attention_ffn",
  "Head Diversity": "attention_ffn",
  "Softmax Temperature": "attention_ffn",
  "Attention Entropy": "attention_ffn",

  // Architecture / Inference
  "Transformer Block": "architecture_inference",
  "Decoder-only Architecture": "architecture_inference",
  "RMSNorm (Root Mean Square Normalization)": "architecture_inference",
  "Pre-Norm Architecture": "architecture_inference",
  "Residual Connection": "architecture_inference",
  "Attention + FFN Composition": "architecture_inference",
  "Gradient Highway": "architecture_inference",
  "Block Stacking": "architecture_inference",
  "LLaMA Architecture": "architecture_inference",
  "LLM Forward Pass": "architecture_inference",
  "Hidden State Flow": "architecture_inference",
  "LM Head": "architecture_inference",
  "Logits": "architecture_inference",
  "Softmax Probability": "architecture_inference",
  "Composition Root": "architecture_inference",
  "Dependency Injection": "architecture_inference",
  "Model Orchestration": "architecture_inference",
  "Pipeline Trace": "architecture_inference",
  "Autoregressive Generation": "architecture_inference",
  "Temperature Sampling": "architecture_inference",
  "Top-K Filtering": "architecture_inference",
  "Top-P Filtering": "architecture_inference",
  "KV Cache": "architecture_inference",
  "Beam Search": "architecture_inference",
  "Softmax Sharpening": "architecture_inference",
  "Probability Distribution": "architecture_inference",
  "Exploration vs Exploitation": "architecture_inference",
};

function getDimension(conceptLabel: string): MasteryDimension {
  return CONCEPT_DIMENSION_MAP[conceptLabel] ?? "architecture_inference";
}

// ============================================================
// Mastery Tree Derivation
// ============================================================

let _masteryTreeCache: MasteryTree | null = null;

export function deriveMasteryTree(): MasteryTree {
  if (_masteryTreeCache) return _masteryTreeCache;

  const conceptNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "concept"
  );

  const moduleConceptMap: Record<string, string[]> = {};
  const conceptModuleMap: Record<string, string> = {};

  // Build module→concepts from explains edges
  for (const edge of KNOWLEDGE_GRAPH.edges) {
    if (edge.type !== "explains") continue;
    const moduleSourceId = KNOWLEDGE_GRAPH.nodes.find(
      (n) => n.id === edge.source
    )?.sourceId;
    if (!moduleSourceId) continue;

    const existing = moduleConceptMap[moduleSourceId] ?? [];
    existing.push(edge.target);
    moduleConceptMap[moduleSourceId] = existing;
    conceptModuleMap[edge.target] = moduleSourceId;
  }

  // Build relates_to scores
  const relatesToScoresMap = new Map<string, Record<string, number>>();
  for (const edge of KNOWLEDGE_GRAPH.edges) {
    if (edge.type !== "relates_to") continue;
    // Jaccard weight stored in edge metadata
    const weight = edge.metadata?.weight ?? 0.3;
    const sourceScores = relatesToScoresMap.get(edge.source) ?? {};
    sourceScores[edge.target] = weight;
    relatesToScoresMap.set(edge.source, sourceScores);
    const targetScores = relatesToScoresMap.get(edge.target) ?? {};
    targetScores[edge.source] = weight;
    relatesToScoresMap.set(edge.target, targetScores);
  }

  // Build experiment→concept mapping
  const conceptExperimentMap = new Map<string, string[]>();
  for (const exp of MINIMIND_EXPERIMENTS) {
    for (const conceptLabel of exp.concepts) {
      // Find the concept node with this label
      const conceptNode = conceptNodes.find((n) => n.label === conceptLabel);
      if (!conceptNode) continue;
      const existing = conceptExperimentMap.get(conceptNode.id) ?? [];
      existing.push(`experiment:${exp.id}`);
      conceptExperimentMap.set(conceptNode.id, existing);
    }
  }

  const concepts: MasteryConcept[] = conceptNodes.map((cn) => ({
    conceptId: cn.id,
    conceptLabel: cn.label,
    parentModuleId: conceptModuleMap[cn.id] ?? "unknown",
    experimentIds: conceptExperimentMap.get(cn.id) ?? [],
    relatedConceptIds: Object.keys(relatesToScoresMap.get(cn.id) ?? {}),
    relatesToScores: relatesToScoresMap.get(cn.id) ?? {},
    dimension: getDimension(cn.label),
  }));

  _masteryTreeCache = {
    concepts,
    moduleConceptMap,
    conceptModuleMap,
  };

  return _masteryTreeCache;
}

// ============================================================
// Recommendation Derivation (5 Rules)
// ============================================================

const REASON_LABELS: Record<RecommendationReason, { cta: string }> = {
  next_in_path: { cta: "Continue Learning" },
  prerequisite_for: { cta: "Unlocks More" },
  experiment: { cta: "Validate Knowledge" },
  reinforce: { cta: "Reinforce Concept" },
  explore: { cta: "Explore Key Concept" },
};

export function deriveRecommendations(
  progress: UserProgress
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Rule R1: Next in Path
  const nextNode = findNextInPath(progress);
  if (nextNode) {
    recommendations.push({
      sourceId: nextNode,
      reason: "next_in_path",
      priority: 0.9,
      description: "Your next step on the recommended learning path.",
      cta: REASON_LABELS.next_in_path.cta,
    });
  }

  // Rule R2: Prerequisite Gateway
  const gatewayNode = findGatewayNode(progress);
  if (gatewayNode) {
    recommendations.push({
      sourceId: gatewayNode.sourceId,
      reason: "prerequisite_for",
      priority: gatewayNode.priority,
      description: `Unlocks ${gatewayNode.unlockCount} more module${gatewayNode.unlockCount > 1 ? "s" : ""}.`,
      cta: REASON_LABELS.prerequisite_for.cta,
    });
  }

  // Rule R3: Experiment Validation
  const expRec = findExperimentRecommendation(progress);
  if (expRec) {
    recommendations.push({
      sourceId: expRec.sourceId,
      reason: "experiment",
      priority: 0.7,
      description: "Validate your knowledge with a hands-on experiment.",
      cta: REASON_LABELS.experiment.cta,
    });
  }

  // Rule R4: Concept Reinforcement
  const reinforceRec = findReinforceRecommendation(progress);
  if (reinforceRec) {
    recommendations.push({
      sourceId: reinforceRec.sourceId,
      reason: "reinforce",
      priority: reinforceRec.priority,
      description: "Reinforce a concept related to what you've learned.",
      cta: REASON_LABELS.reinforce.cta,
    });
  }

  // Rule R5: Explore Key Concept
  const exploreRec = findExploreRecommendation(progress);
  if (exploreRec) {
    recommendations.push({
      sourceId: exploreRec.sourceId,
      reason: "explore",
      priority: 0.5,
      description: "Discover a central concept that connects many topics.",
      cta: REASON_LABELS.explore.cta,
    });
  }

  // Deduplicate by sourceId, sort by priority descending, take top 5
  return deduplicateAndRank(recommendations);
}

// ============================================================
// Rule R1: Next in Path
// ============================================================

function findNextInPath(progress: UserProgress): string | null {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );

  // Find first available node whose prerequisites are all completed
  for (const node of moduleNodes) {
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status === "completed" || status === "mastered") continue;

    // Check prerequisites: node depends on e.target (prerequisites)
    const prereqEdges = KNOWLEDGE_GRAPH.edges.filter(
      (e) => e.source === node.id && e.type === "depends_on"
    );
    const allPrereqsDone = prereqEdges.every((e) => {
      const ps = progress.nodeStatus[e.target] ?? "locked";
      return ps === "completed" || ps === "mastered";
    });

    if (allPrereqsDone) return node.id;
  }

  return null;
}

// ============================================================
// Rule R2: Prerequisite Gateway
// ============================================================

function findGatewayNode(progress: UserProgress): {
  sourceId: string;
  unlockCount: number;
  priority: number;
} | null {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );

  let bestGateway: { sourceId: string; unlockCount: number } | null = null;
  let maxUnlocks = 0;

  for (const node of moduleNodes) {
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status === "completed" || status === "mastered") continue;

    // Count how many locked nodes this unlocks (transitively)
    const unlockedIds = new Set<string>();
    collectTransitiveUnlocks(node.id, new Set(), unlockedIds, progress);

    if (unlockedIds.size > maxUnlocks) {
      maxUnlocks = unlockedIds.size;
      bestGateway = { sourceId: node.id, unlockCount: unlockedIds.size };
    }
  }

  if (!bestGateway || bestGateway.unlockCount === 0) return null;

  return {
    ...bestGateway,
    priority: Math.min(1, bestGateway.unlockCount / 8),
  };
}

function collectTransitiveUnlocks(
  nodeId: string,
  visited: Set<string>,
  result: Set<string>,
  progress: UserProgress
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  // Find who depends on nodeId — those are the modules nodeId unlocks
  const unlockEdges = KNOWLEDGE_GRAPH.edges.filter(
    (e) => e.target === nodeId && e.type === "depends_on"
  );

  for (const edge of unlockEdges) {
    const sourceStatus = progress.nodeStatus[edge.source] ?? "locked";
    if (sourceStatus === "completed" || sourceStatus === "mastered") continue;
    result.add(edge.source);
    collectTransitiveUnlocks(edge.source, visited, result, progress);
  }
}

// ============================================================
// Rule R3: Experiment Validation
// ============================================================

function findExperimentRecommendation(
  progress: UserProgress
): { sourceId: string } | null {
  // Find completed modules that have uncompleted experiments
  for (const node of KNOWLEDGE_GRAPH.nodes) {
    if (node.type !== "module") continue;
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status !== "completed" && status !== "mastered") continue;

    const expEdges = KNOWLEDGE_GRAPH.edges.filter(
      (e) => e.target === node.id && e.type === "experiments"
    );

    for (const edge of expEdges) {
      if (!progress.experimentCompleted[edge.source]) {
        return { sourceId: edge.source };
      }
    }
  }

  return null;
}

// ============================================================
// Rule R4: Concept Reinforcement
// ============================================================

function findReinforceRecommendation(
  progress: UserProgress
): { sourceId: string; priority: number } | null {
  const tree = deriveMasteryTree();

  // Find completed concepts
  const completedConceptIds = Object.entries(progress.conceptReviewed)
    .filter(([, reviewed]) => reviewed)
    .map(([id]) => id);

  if (completedConceptIds.length === 0) return null;

  let bestConcept: string | null = null;
  let bestScore = 0;

  for (const concept of tree.concepts) {
    if (progress.conceptReviewed[concept.conceptId]) continue;

    // Sum relates_to scores from completed concepts
    let score = 0;
    for (const completedId of completedConceptIds) {
      score += concept.relatesToScores[completedId] ?? 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestConcept = concept.conceptId;
    }
  }

  if (!bestConcept) return null;

  return {
    sourceId: bestConcept,
    priority: Math.min(1, bestScore / 3),
  };
}

// ============================================================
// Rule R5: Explore Key Concept
// ============================================================

function findExploreRecommendation(
  progress: UserProgress
): { sourceId: string } | null {
  const tree = deriveMasteryTree();

  // Find concept with highest betweenness centrality (most edges)
  let bestConcept: string | null = null;
  let bestDegree = 0;

  for (const concept of tree.concepts) {
    if (progress.conceptReviewed[concept.conceptId]) continue;

    const degree =
      concept.relatedConceptIds.length +
      (tree.moduleConceptMap[concept.parentModuleId]?.length ?? 0);

    if (degree > bestDegree) {
      bestDegree = degree;
      bestConcept = concept.conceptId;
    }
  }

  return bestConcept ? { sourceId: bestConcept } : null;
}

// ============================================================
// Helpers
// ============================================================

function deduplicateAndRank(recommendations: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const unique: Recommendation[] = [];

  for (const rec of recommendations) {
    if (seen.has(rec.sourceId)) continue;
    seen.add(rec.sourceId);
    unique.push(rec);
  }

  unique.sort((a, b) => b.priority - a.priority);
  return unique.slice(0, 5);
}

/** Clear cache (for testing) */
export function clearMasteryCache(): void {
  _masteryTreeCache = null;
}
