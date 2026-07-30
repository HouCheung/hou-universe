// ============================================================
// MiniMind Knowledge Graph — Public API
// ============================================================
//
// This is a DERIVED LAYER. It computes the knowledge graph from
// existing SSOT registries — it does NOT author new metadata.
//
// The primary SSOT registries are:
//   - src/data/minimind/module-registry.ts
//   - src/data/minimind/experiment-registry.ts
//   - src/data/minimind/model-registry.ts
//
// This file declares the graph TOPOLOGY (which edges connect
// which nodes) as computed output — not as authored input.
//
// Consumers of the knowledge graph import from HERE.
// ============================================================

import { deriveKnowledgeGraph } from "./knowledge/derive-graph";
import type {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeEdge,
  KnowledgeEdgeType,
  KnowledgeGraph,
  KnowledgeGraphMeta,
} from "./knowledge/types";

// Re-export types for convenience
export type {
  KnowledgeNodeType,
  KnowledgeNode,
  KnowledgeEdgeType,
  KnowledgeEdge,
  KnowledgeGraphMeta,
  KnowledgeGraph,
};

// ============================================================
// Eagerly-computed graph constant
// ============================================================

/**
 * The complete derived knowledge graph.
 *
 * Computed once at module load time via deriveKnowledgeGraph().
 * This is a pure function — no side effects, no parameters.
 */
export const KNOWLEDGE_GRAPH: KnowledgeGraph = deriveKnowledgeGraph();

// ============================================================
// Lookup helpers — O(1) by id
// ============================================================

/** Find a node by its full prefixed id (e.g. "module:tokenizer") */
export function getNodeById(id: string): KnowledgeNode | undefined {
  return KNOWLEDGE_GRAPH.nodes.find((n) => n.id === id);
}

/** Get all edges where the given node is either source or target */
export function getEdgesForNode(nodeId: string): KnowledgeEdge[] {
  return KNOWLEDGE_GRAPH.edges.filter(
    (e) => e.source === nodeId || e.target === nodeId
  );
}

/**
 * Get all nodes directly connected to the given node,
 * grouped by edge type and direction.
 */
export function getRelatedNodes(nodeId: string): {
  outgoing: { node: KnowledgeNode; edgeType: KnowledgeEdgeType }[];
  incoming: { node: KnowledgeNode; edgeType: KnowledgeEdgeType }[];
} {
  const outgoing: { node: KnowledgeNode; edgeType: KnowledgeEdgeType }[] = [];
  const incoming: { node: KnowledgeNode; edgeType: KnowledgeEdgeType }[] = [];

  for (const edge of KNOWLEDGE_GRAPH.edges) {
    if (edge.source === nodeId) {
      const target = getNodeById(edge.target);
      if (target) outgoing.push({ node: target, edgeType: edge.type });
    }
    if (edge.target === nodeId) {
      const source = getNodeById(edge.source);
      if (source) incoming.push({ node: source, edgeType: edge.type });
    }
  }

  return { outgoing, incoming };
}

/** Get graph-level statistics */
export function getGraphStats(): KnowledgeGraphMeta {
  return KNOWLEDGE_GRAPH.meta;
}
