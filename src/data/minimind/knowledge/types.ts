// ============================================================
// MiniMind Knowledge Graph — Derived Data Types
// ============================================================
//
// These types define the structure of the derived knowledge graph.
// They are PURE DATA — no UI, no layout, no rendering concerns.
//
// All nodes and edges are COMPUTED from existing SSOT registries
// (module-registry.ts, experiment-registry.ts, model-registry.ts).
// No manual authoring required.
// ============================================================

// ============================================================
// Node Types
// ============================================================

export type KnowledgeNodeType =
  | "module"           // MiniMind module (from MINIMIND_MODULES)
  | "concept"          // Educational concept (from module metadata.concepts[])
  | "experiment"       // Interactive experiment (from MINIMIND_EXPERIMENTS)
  | "document"         // Theory documentation (from module.theoryDocPath)
  | "implementation";  // Source code (from module.sourcePath)

/**
 * A single node in the knowledge graph.
 *
 * Each node represents one knowledge entity — a module, concept,
 * experiment, document, or implementation. Every field traces
 * back to exactly one field in one existing SSOT registry.
 */
export interface KnowledgeNode {
  /** Unique identifier — prefixed by type: "module:tokenizer" */
  id: string;
  /** Category for visual grouping and filtering */
  type: KnowledgeNodeType;
  /** Human-readable display name */
  label: string;
  /** ID in the source SSOT registry — for cross-reference */
  sourceId: string;
  /** Visual grouping zone — matches type by default */
  group: KnowledgeNodeType;
  /** Enriched metadata — all derived from SSOT registries */
  metadata: {
    /** Short description of the entity */
    description?: string;
    /**
     * Lifecycle status.
     * - module status: "completed" | "in-progress" | "upcoming"
     * - experiment status: "active" | "planned" | "legacy"
     */
    status?: "completed" | "in-progress" | "upcoming" | "active" | "planned" | "legacy";
    /** App route path, e.g. "/ai-lab/playground" */
    route?: string;
    /** Filesystem path, e.g. "docs/minimind/01-tokenizer.md" */
    filePath?: string;
    /** lucide-react icon name for rendering */
    icon?: string;
  };
}

// ============================================================
// Edge Types
// ============================================================

export type KnowledgeEdgeType =
  | "depends_on"       // Module → Module (learning prerequisite)
  | "explains"         // Module → Concept (teaches this concept)
  | "implements"       // Implementation → Module (source code realizes)
  | "experiments"      // Experiment → Module (validates through interaction)
  | "documents"        // Document → Module (theory doc covers)
  | "relates_to";      // Concept → Concept (cross-cutting semantic link)

/**
 * A directed edge connecting two knowledge nodes.
 */
export interface KnowledgeEdge {
  /** Unique — "edge:{sourceId}--{type}-->{targetId}" */
  id: string;
  /** Source KnowledgeNode.id */
  source: string;
  /** Target KnowledgeNode.id */
  target: string;
  /** Relationship type */
  type: KnowledgeEdgeType;
  /** Edge rendering hints */
  metadata?: {
    /** Visual stroke weight (0.5–3, default 1) */
    weight?: number;
    /** Whether to render arrow at both ends */
    bidirectional?: boolean;
  };
}

// ============================================================
// Graph Container
// ============================================================

/** Counts by node/edge type — for stats display */
export interface KnowledgeGraphMeta {
  /** ISO timestamp of graph derivation */
  generatedAt: string;
  /** Total nodes in the graph */
  totalNodes: number;
  /** Total edges in the graph */
  totalEdges: number;
  /** Node count per type */
  nodeCounts: Record<KnowledgeNodeType, number>;
  /** Edge count per type */
  edgeCounts: Record<KnowledgeEdgeType, number>;
}

/**
 * Complete derived knowledge graph.
 *
 * This is the output of deriveKnowledgeGraph() — the single
 * data contract consumed by the adapter and UI layers.
 */
export interface KnowledgeGraph {
  /** All knowledge nodes */
  nodes: KnowledgeNode[];
  /** All knowledge edges */
  edges: KnowledgeEdge[];
  /** Graph-level metadata and statistics */
  meta: KnowledgeGraphMeta;
}
