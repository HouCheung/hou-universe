# MiniMind Knowledge Graph Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a derived Knowledge Graph at `/ai-lab/knowledge` that visually exposes all MiniMind knowledge relationships — modules, concepts, experiments, documents, implementations — as an interactive SVG graph with custom layered layout.

**Architecture:** Three-layer design: (1) Data derivation layer reads existing registries and computes `KnowledgeGraph` via pure function, (2) Adapter layer runs custom deterministic layout (zone placement + dependency hierarchy + collision adjustment), (3) UI layer renders SVG canvas with Framer Motion zoom/pan, glass-card nodes, type-colored edges, and a slide-in detail panel.

**Tech Stack:** TypeScript strict, SVG + foreignObject, Framer Motion (AnimatePresence, useDrag, layout), Tailwind CSS, lucide-react, Next.js 14 App Router, shadcn/ui

## Global Constraints

- **No d3-force dependency.** Use custom deterministic layout only.
- **No ReactFlow dependency.** SVG + Framer Motion only.
- **Existing registries remain SSOT.** `knowledge-registry.ts` is a derived layer — zero new facts authored.
- **Do NOT modify:** any existing registry file, any lib module, any UI component, any page, any theory doc.
- **TypeScript strict mode.** No `any` types, no `Record<string, unknown>`.
- **All user-facing strings via i18n:** `minimind.knowledge.*` namespace.
- **Follow existing code patterns:** JSDoc + educational comments + barrel exports + function components.
- **Zero `console.log` in production code.**
- **`npm run build` zero errors, zero warnings.**
- **`npm run lint` zero errors.**
- **`npx tsc --noEmit` zero errors.**

---

### Task 1: Knowledge Graph Data Types

**Files:**
- Create: `src/data/minimind/knowledge/types.ts`

**Interfaces:**
- Produces: `KnowledgeNodeType`, `KnowledgeNode`, `KnowledgeEdgeType`, `KnowledgeEdge`, `KnowledgeGraphMeta`, `KnowledgeGraph`

- [ ] **Step 1: Write the types file**

```typescript
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
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors related to `src/data/minimind/knowledge/types.ts`

- [ ] **Step 3: Commit**

```bash
git add src/data/minimind/knowledge/types.ts
git commit -m "feat(knowledge): add KnowledgeGraph data types (Phase 22a)"
```

---

### Task 2: Derivation Function — `deriveKnowledgeGraph()`

**Files:**
- Create: `src/data/minimind/knowledge/derive-graph.ts`

**Interfaces:**
- Consumes: `KnowledgeNodeType`, `KnowledgeNode`, `KnowledgeEdgeType`, `KnowledgeEdge`, `KnowledgeGraphMeta`, `KnowledgeGraph` from `./types`
- Consumes: `MINIMIND_MODULES`, `getModuleById`, `computeDependencyLevels` from `@/data/minimind/module-registry`
- Consumes: `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`
- Consumes: `getActiveModelModule`, type `ModelModule` from `@/data/minimind/model-registry`
- Produces: `deriveKnowledgeGraph(): KnowledgeGraph`, `conceptToSlug(concept: string): string`

- [ ] **Step 1: Write `conceptToSlug` helper and stopwords set**

```typescript
// ============================================================
// MiniMind Knowledge Graph — Derivation Engine
// ============================================================
//
// Pure function that reads existing SSOT registries and computes
// the complete KnowledgeGraph. All 12 derivation rules are
// implemented here.
//
// NO manual data entry. NO side effects. NO module modification.
// ============================================================

import type {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeEdge,
  KnowledgeEdgeType,
  KnowledgeGraph,
  KnowledgeGraphMeta,
} from "./types";
import { MINIMIND_MODULES, computeDependencyLevels } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import { getActiveModelModule } from "@/data/minimind/model-registry";
import type { ModelModule } from "@/data/minimind/model-registry";

// ============================================================
// Slug helper — concept string → URL-safe identifier
// ============================================================

/**
 * Convert a concept label to a URL-safe slug.
 *
 * "Self-Attention" → "self-attention"
 * "Multi-Head Attention" → "multi-head-attention"
 * "LLM Forward Pass" → "llm-forward-pass"
 */
export function conceptToSlug(concept: string): string {
  return concept
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")  // Remove special characters
    .replace(/\s+/g, "-")           // Spaces → hyphens
    .replace(/-+/g, "-")            // Collapse multiple hyphens
    .replace(/^-|-$/g, "");         // Trim leading/trailing hyphens
}

// ============================================================
// Document / implementation path helpers
// ============================================================

/** Extract a node ID from a theory doc path: "docs/minimind/01-tokenizer.md" → "01-tokenizer" */
function docPathToId(docPath: string): string {
  const parts = docPath.replace(/\\/g, "/").split("/");
  const filename = parts[parts.length - 1];
  return filename.replace(/\.md$/, "");
}

/** Extract a node ID from a source dir: "src/lib/minimind/tokenizer/" → "tokenizer-src" */
function sourcePathToId(sourcePath: string): string {
  const parts = sourcePath.replace(/\\/g, "/").replace(/\/$/, "").split("/");
  const dirname = parts[parts.length - 1];
  return `${dirname}-src`;
}

/** Extract a human label from a doc filename stem: "01-tokenizer" → "01. Tokenizer" */
function docStemToLabel(stem: string): string {
  const match = stem.match(/^(\d+)-(.+)$/);
  if (match) {
    return `${match[1]}. ${match[2].charAt(0).toUpperCase() + match[2].slice(1)}`;
  }
  return stem;
}
```

- [ ] **Step 2: Write the main derivation function**

```typescript
// ============================================================
// deriveKnowledgeGraph — main entry point
// ============================================================

/**
 * Derive the complete knowledge graph from existing SSOT registries.
 *
 * This is a PURE FUNCTION — no parameters, no side effects,
 * no manual data. It reads the three primary registries and
 * applies 12 derivation rules to produce all nodes and edges.
 *
 * Called once at import time to produce the KNOWLEDGE_GRAPH constant.
 */
export function deriveKnowledgeGraph(): KnowledgeGraph {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  // Used for deduplication
  const conceptSet = new Map<string, string>(); // slug → label
  const docSet = new Map<string, string>();     // id → docPath
  const implSet = new Map<string, string>();    // id → sourcePath

  // ==========================================================
  // Rule 1: Module nodes from MINIMIND_MODULES
  // ==========================================================
  for (const mod of MINIMIND_MODULES) {
    const nodeId = `module:${mod.id}`;
    nodes.push({
      id: nodeId,
      type: "module",
      label: mod.title,
      sourceId: mod.id,
      group: "module",
      metadata: {
        description: mod.description,
        status: mod.status,
        route: mod.metadata.playgroundPath,
        filePath: mod.theoryDocPath,
        icon: "Box",
      },
    });
  }

  // ==========================================================
  // Rules 2 & 3: Concept nodes + explains edges
  // ==========================================================
  for (const mod of MINIMIND_MODULES) {
    const concepts = mod.metadata.concepts ?? [];
    for (const conceptLabel of concepts) {
      const slug = conceptToSlug(conceptLabel);
      const conceptId = `concept:${slug}`;

      // Deduplicate concepts
      if (!conceptSet.has(slug)) {
        conceptSet.set(slug, conceptLabel);
        nodes.push({
          id: conceptId,
          type: "concept",
          label: conceptLabel,
          sourceId: slug,
          group: "concept",
          metadata: {
            description: undefined,
            status: undefined,
            route: undefined,
            filePath: undefined,
            icon: "Lightbulb",
          },
        });
      }

      // Rule 3: explains edges (one per module→concept association)
      edges.push({
        id: `edge:module:${mod.id}--explains-->${conceptId}`,
        source: `module:${mod.id}`,
        target: conceptId,
        type: "explains",
        metadata: { weight: 1 },
      });
    }
  }

  // ==========================================================
  // Rule 4: depends_on edges
  // ==========================================================
  for (const mod of MINIMIND_MODULES) {
    const deps = mod.metadata.dependencies ?? [];
    for (const depId of deps) {
      edges.push({
        id: `edge:module:${mod.id}--depends_on-->module:${depId}`,
        source: `module:${mod.id}`,
        target: `module:${depId}`,
        type: "depends_on",
        metadata: { weight: 2 },
      });
    }
  }

  // ==========================================================
  // Rules 5 & 6: Experiment nodes + experiments edges
  // ==========================================================
  for (const exp of MINIMIND_EXPERIMENTS) {
    const expId = `experiment:${exp.id}`;
    nodes.push({
      id: expId,
      type: "experiment",
      label: exp.title,
      sourceId: exp.id,
      group: "experiment",
      metadata: {
        description: exp.description,
        status: exp.status,
        route: "/ai-lab/experiments",
        filePath: exp.componentPath ?? undefined,
        icon: "FlaskConical",
      },
    });

    // Rule 6: experiments edge
    edges.push({
      id: `edge:${expId}--experiments-->module:${exp.relatedModule}`,
      source: expId,
      target: `module:${exp.relatedModule}`,
      type: "experiments",
      metadata: { weight: 1.5 },
    });
  }

  // ==========================================================
  // Rules 7 & 8: Document nodes + documents edges
  // ==========================================================
  for (const mod of MINIMIND_MODULES) {
    const docPath = mod.theoryDocPath;
    if (!docPath) continue;

    const docId = `document:${docPathToId(docPath)}`;

    if (!docSet.has(docId)) {
      docSet.set(docId, docPath);
      nodes.push({
        id: docId,
        type: "document",
        label: docStemToLabel(docPathToId(docPath)),
        sourceId: docPathToId(docPath),
        group: "document",
        metadata: {
          description: `Theory documentation for ${mod.title}`,
          status: undefined,
          route: undefined,
          filePath: docPath,
          icon: "FileText",
        },
      });
    }

    // Rule 8: documents edges
    edges.push({
      id: `edge:${docId}--documents-->module:${mod.id}`,
      source: docId,
      target: `module:${mod.id}`,
      type: "documents",
      metadata: { weight: 1.5 },
    });
  }

  // ==========================================================
  // Rules 9 & 10: Implementation nodes + implements edges
  // ==========================================================
  for (const mod of MINIMIND_MODULES) {
    const sourcePath = mod.sourcePath;
    if (!sourcePath) continue;

    const implId = `implementation:${sourcePathToId(sourcePath)}`;

    if (!implSet.has(implId)) {
      implSet.set(implId, sourcePath);
      const parts = sourcePath.replace(/\\/g, "/").replace(/\/$/, "").split("/");
      const dirname = parts[parts.length - 1];
      nodes.push({
        id: implId,
        type: "implementation",
        label: `${dirname}/`,
        sourceId: sourcePathToId(sourcePath),
        group: "implementation",
        metadata: {
          description: `Source implementation for ${mod.title}`,
          status: undefined,
          route: undefined,
          filePath: sourcePath,
          icon: "Code",
        },
      });
    }

    // Rule 10: implements edge
    edges.push({
      id: `edge:${implId}--implements-->module:${mod.id}`,
      source: implId,
      target: `module:${mod.id}`,
      type: "implements",
      metadata: { weight: 1.5 },
    });
  }

  // ==========================================================
  // Rule 11: Additional concepts from MODEL_MODULES active entry
  // ==========================================================
  const activeModel = getActiveModelModule();
  if (activeModel) {
    const existingSlugs = new Set(conceptSet.keys());
    for (const conceptLabel of activeModel.concepts) {
      const slug = conceptToSlug(conceptLabel);
      if (existingSlugs.has(slug)) continue;

      const conceptId = `concept:${slug}`;
      conceptSet.set(slug, conceptLabel);
      nodes.push({
        id: conceptId,
        type: "concept",
        label: conceptLabel,
        sourceId: slug,
        group: "concept",
        metadata: {
          description: `Model architecture concept from ${activeModel.version}`,
          status: undefined,
          route: undefined,
          filePath: undefined,
          icon: "Lightbulb",
        },
      });

      edges.push({
        id: `edge:module:model--explains-->${conceptId}`,
        source: "module:model",
        target: conceptId,
        type: "explains",
        metadata: { weight: 1 },
      });
    }
  }
```

- [ ] **Step 3: Write the concept cross-linking heuristic (Rule 12) and meta computation**

```typescript
  // ==========================================================
  // Rule 12: Concept cross-linking (relates_to edges)
  // ==========================================================
  const conceptNodes = nodes.filter((n) => n.type === "concept");
  const relatesToEdges = computeConceptRelatesToEdges(conceptNodes);
  edges.push(...relatesToEdges);

  // ==========================================================
  // Build meta
  // ==========================================================
  const nodeCounts: Record<KnowledgeNodeType, number> = {
    module: 0,
    concept: 0,
    experiment: 0,
    document: 0,
    implementation: 0,
  };
  for (const n of nodes) {
    nodeCounts[n.type]++;
  }

  const edgeCounts: Record<KnowledgeEdgeType, number> = {
    depends_on: 0,
    explains: 0,
    implements: 0,
    experiments: 0,
    documents: 0,
    relates_to: 0,
  };
  for (const e of edges) {
    edgeCounts[e.type]++;
  }

  const meta: KnowledgeGraphMeta = {
    generatedAt: new Date().toISOString(),
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodeCounts,
    edgeCounts,
  };

  return { nodes, edges, meta };
}

// ============================================================
// Concept cross-linking heuristic
// ============================================================

/** Words to exclude from concept similarity comparison */
const STOPWORDS = new Set([
  "the", "and", "for", "via", "over", "from", "with", "per",
  "its", "but", "not", "are", "can", "has", "had", "was",
]);

/**
 * Compute weak "relates_to" edges between concepts that share
 * significant terminology.
 *
 * Heuristic:
 * 1. Split each concept label into words, lowercase
 * 2. Filter words ≤ 3 chars and stopwords
 * 3. Compute pairwise Jaccard similarity
 * 4. Edge created if Jaccard ≥ 0.25 AND shared words ≥ 2
 * 5. Weight = Jaccard × 2, clamped to [0.5, 2.0]
 */
function computeConceptRelatesToEdges(
  conceptNodes: KnowledgeNode[]
): KnowledgeEdge[] {
  const edges: KnowledgeEdge[] = [];

  // Tokenize each concept into significant words
  const tokenized: { node: KnowledgeNode; words: Set<string> }[] = [];
  for (const node of conceptNodes) {
    const words = new Set(
      node.label
        .toLowerCase()
        .split(/[\s-]+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    );
    if (words.size === 0) continue;
    tokenized.push({ node, words });
  }

  // Pairwise comparison
  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const a = tokenized[i];
      const b = tokenized[j];

      // Compute intersection
      let intersection = 0;
      for (const w of a.words) {
        if (b.words.has(w)) intersection++;
      }

      // Compute union
      const union = new Set([...a.words, ...b.words]).size;

      if (intersection < 2 || union === 0) continue;

      const jaccard = intersection / union;
      if (jaccard < 0.25) continue;

      // Edge direction: alphabetically first concept ID is source
      const [sourceId, targetId] =
        a.node.id < b.node.id
          ? [a.node.id, b.node.id]
          : [b.node.id, a.node.id];

      const weight = Math.max(0.5, Math.min(2.0, jaccard * 2));

      edges.push({
        id: `edge:${sourceId}--relates_to-->${targetId}`,
        source: sourceId,
        target: targetId,
        type: "relates_to",
        metadata: { weight, bidirectional: true },
      });
    }
  }

  return edges;
}
```

- [ ] **Step 4: Verify derivation compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add src/data/minimind/knowledge/derive-graph.ts
git commit -m "feat(knowledge): implement deriveKnowledgeGraph with 12 rules (Phase 22a)"
```

---

### Task 3: Knowledge Internal Barrel + Public API Registry

**Files:**
- Create: `src/data/minimind/knowledge/index.ts`
- Create: `src/data/minimind/knowledge-registry.ts`

**Interfaces:**
- Consumes: `deriveKnowledgeGraph` from `./knowledge/derive-graph`
- Consumes: All types from `./knowledge/types`
- Produces: `KNOWLEDGE_GRAPH: KnowledgeGraph`, `getNodeById`, `getEdgesForNode`, `getRelatedNodes`, `getGraphStats`

- [ ] **Step 1: Write the internal barrel**

```typescript
// src/data/minimind/knowledge/index.ts
// ============================================================
// Knowledge Graph — Internal Barrel
// ============================================================

export type {
  KnowledgeNodeType,
  KnowledgeNode,
  KnowledgeEdgeType,
  KnowledgeEdge,
  KnowledgeGraphMeta,
  KnowledgeGraph,
} from "./types";

export { deriveKnowledgeGraph, conceptToSlug } from "./derive-graph";
```

- [ ] **Step 2: Write the public API registry**

```typescript
// src/data/minimind/knowledge-registry.ts
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
```

- [ ] **Step 3: Verify registry compiles and graph is populated**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors. The `KNOWLEDGE_GRAPH` constant is correctly typed.

- [ ] **Step 4: Commit**

```bash
git add src/data/minimind/knowledge/index.ts src/data/minimind/knowledge-registry.ts
git commit -m "feat(knowledge): add knowledge-registry public API with helpers (Phase 22a)"
```

---

### Task 4: Adapter Layer Types

**Files:**
- Create: `src/lib/minimind/knowledge/types.ts`

**Interfaces:**
- Consumes: `KnowledgeNodeType`, `KnowledgeNode`, `KnowledgeEdge` from `@/data/minimind/knowledge-registry`
- Produces: `ForceNode`, `KnowledgeLayout`, `ViewportConfig`, `ZoneLayout`, `ZoneConfig`, `NodeStyleHints`

- [ ] **Step 1: Write the adapter types**

```typescript
// ============================================================
// MiniMind Knowledge Graph — Adapter Types
// ============================================================
//
// These types bridge the pure data KnowledgeGraph to the UI.
// ForceNode adds position + dimension data; KnowledgeLayout
// captures the complete render-ready state.
// ============================================================

import type {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeEdge,
} from "@/data/minimind/knowledge-registry";

// ============================================================
// ForceNode — a KnowledgeNode with layout position
// ============================================================

/**
 * A knowledge node with computed layout position and dimensions.
 *
 * Unlike d3-force nodes, there are no velocity vectors — this is
 * a deterministic, stateless position derived from zone placement
 * + dependency hierarchy + grid packing + collision adjustment.
 */
export interface ForceNode extends KnowledgeNode {
  /** Computed x position (node center) */
  x: number;
  /** Computed y position (node center) */
  y: number;
  /** Node visual width in pixels */
  width: number;
  /** Node visual height in pixels */
  height: number;
  /** Zone anchor x — the center of this node's semantic zone */
  anchorX: number;
  /** Zone anchor y — the center of this node's semantic zone */
  anchorY: number;
}

// ============================================================
// Layout configuration
// ============================================================

/** Viewport dimensions for responsive layout */
export interface ViewportConfig {
  width: number;
  height: number;
  /** Padding around the full graph bounding box */
  padding: number;
}

/** Configuration for one semantic zone */
export interface ZoneConfig {
  /** Human-readable anchor name */
  anchor: string;
  /** Column in the 3×3 implicit grid (0, 1, or 2) */
  col: number;
  /** Row in the 3×3 implicit grid (0, 1, or 2) */
  row: number;
  /** Maximum columns before wrapping nodes within this zone */
  maxCols: number;
}

/** Computed layout for one zone */
export interface ZoneLayout {
  /** Which node type this zone contains */
  type: KnowledgeNodeType;
  /** Center x of the zone region */
  cx: number;
  /** Center y of the zone region */
  cy: number;
  /** Zone region width */
  width: number;
  /** Zone region height */
  height: number;
  /** Number of nodes assigned to this zone */
  nodeCount: number;
}

// ============================================================
// Complete layout
// ============================================================

/**
 * Complete render-ready knowledge layout.
 *
 * Produced by KnowledgeGraphAdapter.adaptKnowledgeGraph().
 * Contains all positioned nodes, edges, zone metadata, and
 * viewport configuration.
 */
export interface KnowledgeLayout {
  /** All nodes with computed positions */
  nodes: ForceNode[];
  /** All edges (unchanged from KnowledgeGraph) */
  edges: KnowledgeEdge[];
  /** Viewport used for this layout computation */
  viewport: ViewportConfig;
  /** Zone regions */
  zones: ZoneLayout[];
  /** Bounding box of the entire graph (for SVG viewBox) */
  bbox: { x: number; y: number; width: number; height: number };
}

// ============================================================
// UI enrichment
// ============================================================

/** Styling hints for rendering a node */
export interface NodeStyleHints {
  /** Tailwind border color class */
  borderClass: string;
  /** Tailwind background color class */
  bgClass: string;
  /** Tailwind shape class (rounded-xl, rounded-full, etc.) */
  shapeClass: string;
  /** lucide-react icon component name */
  icon: string;
  /** Node width */
  width: number;
  /** Node height */
  height: number;
}

// ============================================================
// Edge styling
// ============================================================

/** Styling hints for rendering an edge */
export interface EdgeStyleHints {
  /** Tailwind stroke color class */
  strokeClass: string;
  /** Stroke width in pixels */
  strokeWidth: number;
  /** Dash array string (e.g. "4 4") or undefined for solid */
  dashArray?: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/knowledge/types.ts
git commit -m "feat(knowledge): add adapter layer types (Phase 22b)"
```

---

### Task 5: Knowledge Graph Adapter — Layout Computation

**Files:**
- Create: `src/lib/minimind/knowledge/KnowledgeGraphAdapter.ts`

**Interfaces:**
- Consumes: `KnowledgeGraph`, `KnowledgeNode`, `KnowledgeNodeType`, `KnowledgeEdge` from `@/data/minimind/knowledge-registry`
- Consumes: `computeDependencyLevels` from `@/data/minimind/module-registry`
- Consumes: `ForceNode`, `KnowledgeLayout`, `ViewportConfig`, `ZoneConfig`, `ZoneLayout`, `NodeStyleHints`, `EdgeStyleHints` from `./types`
- Produces: `adaptKnowledgeGraph(graph, viewport): KnowledgeLayout`, `enrichForUI(nodeType): NodeStyleHints`, `getEdgeStyle(edgeType): EdgeStyleHints`, `ZONE_CONFIGS`

- [ ] **Step 1: Write ZONE_CONFIGS, node dimensions, and enrichForUI**

```typescript
// ============================================================
// MiniMind Knowledge Graph Adapter
// ============================================================
//
// Transforms the raw KnowledgeGraph into a render-ready
// KnowledgeLayout using custom deterministic layout:
//
// 1. Semantic zone placement (5 zones in a cross pattern)
// 2. Module dependency hierarchy (topological levels as rows)
// 3. Grid packing within non-module zones
// 4. Lightweight collision adjustment (≤5 passes)
//
// No d3-force. No randomness. Structured educational map.
// ============================================================

import type { KnowledgeGraph, KnowledgeNode, KnowledgeNodeType, KnowledgeEdge, KnowledgeEdgeType } from "@/data/minimind/knowledge-registry";
import { computeDependencyLevels } from "@/data/minimind/module-registry";
import type {
  ForceNode,
  KnowledgeLayout,
  ViewportConfig,
  ZoneConfig,
  ZoneLayout,
  NodeStyleHints,
  EdgeStyleHints,
} from "./types";

// ============================================================
// Zone configuration — 3×3 implicit grid, cross pattern
// ============================================================

/**
 * Fixed zone configuration.
 *
 * Zones are arranged in a 3×3 implicit grid:
 *
 *   Concepts (0,0)    [empty] (1,0)    Documents (2,0)
 *   [empty]  (0,1)    Modules (1,1)    [empty]   (2,1)
 *   Experiments (0,2) [empty] (1,2)    Implementations (2,2)
 */
export const ZONE_CONFIGS: Record<KnowledgeNodeType, ZoneConfig> = {
  module:         { anchor: "center",        col: 1, row: 1, maxCols: 3 },
  concept:        { anchor: "top-left",      col: 0, row: 0, maxCols: 4 },
  document:       { anchor: "top-right",     col: 2, row: 0, maxCols: 2 },
  experiment:     { anchor: "bottom-left",   col: 0, row: 2, maxCols: 2 },
  implementation: { anchor: "bottom-right",  col: 2, row: 2, maxCols: 2 },
};

// ============================================================
// Node dimensions by type
// ============================================================

interface NodeDimensions {
  width: number;
  height: number;
  gapX: number;
  gapY: number;
}

const NODE_DIMENSIONS: Record<KnowledgeNodeType, NodeDimensions> = {
  module:         { width: 130, height: 60, gapX: 24, gapY: 20 },
  concept:        { width: 110, height: 40, gapX: 16, gapY: 14 },
  experiment:     { width: 126, height: 48, gapX: 16, gapY: 14 },
  document:       { width: 120, height: 44, gapX: 16, gapY: 14 },
  implementation: { width: 110, height: 38, gapX: 14, gapY: 12 },
};

// ============================================================
// UI enrichment — styling hints per node/edge type
// ============================================================

/**
 * Return styling hints for rendering a node of the given type.
 */
export function enrichForUI(nodeType: KnowledgeNodeType): NodeStyleHints {
  switch (nodeType) {
    case "module":
      return {
        borderClass: "border-brand/25 dark:border-brand/30",
        bgClass: "bg-brand/[0.05] dark:bg-[rgba(var(--brand-rgb),0.06)]",
        shapeClass: "rounded-xl",
        icon: "Box",
        width: NODE_DIMENSIONS.module.width,
        height: NODE_DIMENSIONS.module.height,
      };
    case "concept":
      return {
        borderClass: "border-slate-500/20 dark:border-slate-500/25",
        bgClass: "bg-slate-500/[0.03] dark:bg-slate-500/[0.04]",
        shapeClass: "rounded-full",
        icon: "Lightbulb",
        width: NODE_DIMENSIONS.concept.width,
        height: NODE_DIMENSIONS.concept.height,
      };
    case "experiment":
      return {
        borderClass: "border-amber-500/25 dark:border-amber-500/30",
        bgClass: "bg-amber-500/[0.05] dark:bg-amber-500/[0.06]",
        shapeClass: "rounded-lg",
        icon: "FlaskConical",
        width: NODE_DIMENSIONS.experiment.width,
        height: NODE_DIMENSIONS.experiment.height,
      };
    case "document":
      return {
        borderClass: "border-dashed border-slate-500/15 dark:border-slate-500/20",
        bgClass: "bg-transparent",
        shapeClass: "rounded-lg",
        icon: "FileText",
        width: NODE_DIMENSIONS.document.width,
        height: NODE_DIMENSIONS.document.height,
      };
    case "implementation":
      return {
        borderClass: "border-slate-500/12 dark:border-slate-500/15",
        bgClass: "bg-slate-500/[0.02] dark:bg-slate-500/[0.03]",
        shapeClass: "rounded-md",
        icon: "Code",
        width: NODE_DIMENSIONS.implementation.width,
        height: NODE_DIMENSIONS.implementation.height,
      };
  }
}

/**
 * Return styling hints for rendering an edge of the given type.
 */
export function getEdgeStyle(edgeType: KnowledgeEdgeType): EdgeStyleHints {
  switch (edgeType) {
    case "depends_on":
      return {
        strokeClass: "stroke-brand/40 dark:stroke-brand/45",
        strokeWidth: 2,
        dashArray: undefined,
      };
    case "explains":
      return {
        strokeClass: "stroke-slate-500/25 dark:stroke-slate-500/30",
        strokeWidth: 1,
        dashArray: undefined,
      };
    case "implements":
      return {
        strokeClass: "stroke-slate-500/20 dark:stroke-slate-500/25",
        strokeWidth: 1,
        dashArray: "4 4",
      };
    case "experiments":
      return {
        strokeClass: "stroke-amber-500/30 dark:stroke-amber-500/35",
        strokeWidth: 1.5,
        dashArray: undefined,
      };
    case "documents":
      return {
        strokeClass: "stroke-slate-500/20 dark:stroke-slate-500/25",
        strokeWidth: 1,
        dashArray: "2 4",
      };
    case "relates_to":
      return {
        strokeClass: "stroke-slate-500/15 dark:stroke-slate-500/18",
        strokeWidth: 0.5,
        dashArray: "1 3",
      };
  }
}
```

- [ ] **Step 2: Write zone computation and node placement**

```typescript
// ============================================================
// Zone anchor computation
// ============================================================

/**
 * Compute zone regions from viewport dimensions.
 *
 * The viewport is divided into a 3×3 grid. Each zone occupies
 * one cell. Cell size is 1/3 of the available viewport.
 */
function computeZones(
  viewport: ViewportConfig,
  nodeCounts: Record<KnowledgeNodeType, number>
): ZoneLayout[] {
  const cellW = (viewport.width - viewport.padding * 2) / 3;
  const cellH = (viewport.height - viewport.padding * 2) / 3;

  const zones: ZoneLayout[] = [];

  for (const [type, config] of Object.entries(ZONE_CONFIGS) as [KnowledgeNodeType, ZoneConfig][]) {
    const cx = viewport.padding + config.col * cellW + cellW / 2;
    const cy = viewport.padding + config.row * cellH + cellH / 2;

    zones.push({
      type,
      cx,
      cy,
      width: cellW,
      height: cellH,
      nodeCount: nodeCounts[type] ?? 0,
    });
  }

  return zones;
}

// ============================================================
// Module zone: dependency hierarchy rows
// ============================================================

/**
 * Place module nodes in rows by topological dependency level.
 *
 * Level 0 (root modules, no deps) at top, increasing levels
 * downward. Nodes at the same level are placed side-by-side.
 */
function placeModuleNodes(
  nodes: KnowledgeNode[],
  zone: ZoneLayout
): ForceNode[] {
  const moduleNodes = nodes.filter((n) => n.type === "module");
  if (moduleNodes.length === 0) return [];

  const depLevels = computeDependencyLevels();
  const dims = NODE_DIMENSIONS.module;

  // Group modules by dependency level
  const levelMap = new Map<number, KnowledgeNode[]>();
  for (const dl of depLevels) {
    const node = moduleNodes.find((n) => n.sourceId === dl.moduleId);
    if (node) {
      const existing = levelMap.get(dl.level) ?? [];
      existing.push(node);
      levelMap.set(dl.level, existing);
    }
  }

  const sortedLevels = Array.from(levelMap.entries()).sort(([a], [b]) => a - b);
  const totalLevels = sortedLevels.length;
  const zoneStartY = zone.cy - (zone.height / 2) + dims.height + 20;

  const result: ForceNode[] = [];

  for (let li = 0; li < sortedLevels.length; li++) {
    const [, levelNodes] = sortedLevels[li];
    const y = zoneStartY + li * (dims.height + dims.gapY);
    const totalRowWidth =
      levelNodes.length * dims.width +
      (levelNodes.length - 1) * dims.gapX;
    const startX = zone.cx - totalRowWidth / 2 + dims.width / 2;

    for (let ni = 0; ni < levelNodes.length; ni++) {
      const node = levelNodes[ni];
      result.push({
        ...node,
        x: startX + ni * (dims.width + dims.gapX),
        y,
        width: dims.width,
        height: dims.height,
        anchorX: zone.cx,
        anchorY: zone.cy,
      });
    }
  }

  return result;
}

// ============================================================
// Non-module zones: grid packing
// ============================================================

/**
 * Place non-module nodes in a grid within their zone.
 *
 * Default: single column, stacked vertically.
 * If node count exceeds vertical capacity, wrap to 2 columns.
 */
function placeNonModuleNodes(
  nodes: KnowledgeNode[],
  nodeType: KnowledgeNodeType,
  zone: ZoneLayout
): ForceNode[] {
  const typeNodes = nodes.filter((n) => n.type === nodeType);
  if (typeNodes.length === 0) return [];

  const config = ZONE_CONFIGS[nodeType];
  const dims = NODE_DIMENSIONS[nodeType];
  const maxCols = config.maxCols;

  // Determine how many columns we need
  const maxRowsPerCol = Math.floor(zone.height / (dims.height + dims.gapY));
  const colsNeeded = Math.min(
    maxCols,
    Math.ceil(typeNodes.length / Math.max(1, maxRowsPerCol))
  );
  const rowsPerCol = Math.ceil(typeNodes.length / colsNeeded);

  const result: ForceNode[] = [];
  const totalColWidth =
    colsNeeded * dims.width + (colsNeeded - 1) * dims.gapX;
  const startX = zone.cx - totalColWidth / 2 + dims.width / 2;
  const totalColHeight =
    rowsPerCol * dims.height + (rowsPerCol - 1) * dims.gapY;
  const startY = zone.cy - totalColHeight / 2 + dims.height / 2;

  for (let i = 0; i < typeNodes.length; i++) {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const node = typeNodes[i];

    result.push({
      ...node,
      x: startX + col * (dims.width + dims.gapX),
      y: startY + row * (dims.height + dims.gapY),
      width: dims.width,
      height: dims.height,
      anchorX: zone.cx,
      anchorY: zone.cy,
    });
  }

  return result;
}
```

- [ ] **Step 3: Write collision adjustment and the main adapt function**

```typescript
// ============================================================
// Collision resolution
// ============================================================

/**
 * Lightweight overlap detection and resolution.
 *
 * For each pair of overlapping nodes, push them apart along
 * the shortest escape axis. Runs at most `maxPasses` iterations.
 *
 * O(n² × passes) — for 100 nodes and 5 passes, ~50K checks.
 */
function resolveCollisions(nodes: ForceNode[], maxPasses: number = 5): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const halfW = (a.width + b.width) / 2 + 12;
        const halfH = (a.height + b.height) / 2 + 12;

        const overlapX = halfW - Math.abs(dx);
        const overlapY = halfH - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue; // No overlap

        if (dist < 0.01) {
          // Overlapping centers — nudge apart
          a.x -= 10;
          b.x += 10;
          moved = true;
          continue;
        }

        // Push apart along the shortest escape direction
        const nx = dx / dist;
        const ny = dy / dist;
        const pushAmount = Math.min(overlapX, overlapY) * 0.6;

        a.x -= nx * pushAmount;
        a.y -= ny * pushAmount;
        b.x += nx * pushAmount;
        b.y += ny * pushAmount;
        moved = true;
      }
    }

    if (!moved) break;
  }
}

// ============================================================
// Bounding box computation
// ============================================================

function computeBbox(
  nodes: ForceNode[],
  padding: number
): { x: number; y: number; width: number; height: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

// ============================================================
// Main adapter function
// ============================================================

/**
 * Adapt a raw KnowledgeGraph into a render-ready KnowledgeLayout.
 *
 * Runs the full custom layout pipeline:
 * 1. Compute zone regions from viewport
 * 2. Place module nodes by dependency hierarchy
 * 3. Place non-module nodes by grid packing
 * 4. Resolve collisions
 * 5. Compute bounding box
 *
 * @param graph - The derived knowledge graph
 * @param viewport - Current viewport dimensions
 * @returns Complete KnowledgeLayout ready for rendering
 */
export function adaptKnowledgeGraph(
  graph: KnowledgeGraph,
  viewport: ViewportConfig
): KnowledgeLayout {
  const zones = computeZones(viewport, graph.meta.nodeCounts);

  // Place nodes by zone
  const moduleZone = zones.find((z) => z.type === "module")!;
  const placedNodes: ForceNode[] = [
    ...placeModuleNodes(graph.nodes, moduleZone),
  ];

  for (const nodeType of ["concept", "experiment", "document", "implementation"] as const) {
    const zone = zones.find((z) => z.type === nodeType);
    if (!zone || zone.nodeCount === 0) continue;
    placedNodes.push(...placeNonModuleNodes(graph.nodes, nodeType, zone));
  }

  // Resolve collisions
  resolveCollisions(placedNodes);

  // Compute bounding box
  const bbox = computeBbox(placedNodes, viewport.padding);

  return {
    nodes: placedNodes,
    edges: graph.edges,
    viewport,
    zones,
    bbox,
  };
}
```

- [ ] **Step 4: Verify adapter compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/minimind/knowledge/KnowledgeGraphAdapter.ts
git commit -m "feat(knowledge): implement KnowledgeGraphAdapter with custom layered layout (Phase 22b)"
```

---

### Task 6: Adapter Layer Barrel

**Files:**
- Create: `src/lib/minimind/knowledge/index.ts`

- [ ] **Step 1: Write the adapter barrel**

```typescript
// ============================================================
// MiniMind Knowledge Graph — Adapter Barrel
// ============================================================

export type {
  ForceNode,
  KnowledgeLayout,
  ViewportConfig,
  ZoneConfig,
  ZoneLayout,
  NodeStyleHints,
  EdgeStyleHints,
} from "./types";

export {
  adaptKnowledgeGraph,
  enrichForUI,
  getEdgeStyle,
  ZONE_CONFIGS,
} from "./KnowledgeGraphAdapter";
```

- [ ] **Step 2: Verify barrel compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/minimind/knowledge/index.ts
git commit -m "feat(knowledge): add adapter layer barrel export (Phase 22b)"
```

---

### Task 7: Knowledge Graph Canvas

**Files:**
- Create: `src/components/minimind/knowledge/KnowledgeGraphCanvas.tsx`

**Interfaces:**
- Consumes: `KnowledgeLayout`, `ForceNode`, `getEdgeStyle`, `enrichForUI` from `@/lib/minimind/knowledge`
- Consumes: `KnowledgeNodeType`, `KnowledgeEdge` from `@/data/minimind/knowledge-registry`
- Produces: `<KnowledgeGraphCanvas>` component

- [ ] **Step 1: Write the canvas component**

```typescript
"use client";

// ============================================================
// KnowledgeGraphCanvas — SVG-based interactive graph canvas
// ============================================================
//
// Renders the knowledge graph as an SVG with Framer Motion
// zoom/pan controls. Nodes render as foreignObject glass cards.
// Edges render as typed SVG lines.
//
// State owned by parent (KnowledgePageClient).
// This component owns only zoom, pan, and hover state.
// ============================================================

import { useRef, useState, useCallback, type WheelEvent } from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Box,
  Lightbulb,
  FlaskConical,
  FileText,
  Code,
  type LucideIcon,
} from "lucide-react";
import type {
  KnowledgeLayout,
  ForceNode,
} from "@/lib/minimind/knowledge";
import { getEdgeStyle, enrichForUI } from "@/lib/minimind/knowledge";
import type {
  KnowledgeNodeType,
  KnowledgeEdge,
} from "@/data/minimind/knowledge-registry";

// ============================================================
// Icon map
// ============================================================

const ICON_MAP: Record<KnowledgeNodeType, LucideIcon> = {
  module: Box,
  concept: Lightbulb,
  experiment: FlaskConical,
  document: FileText,
  implementation: Code,
};

// ============================================================
// Props
// ============================================================

interface KnowledgeGraphCanvasProps {
  /** Render-ready layout with positioned nodes */
  layout: KnowledgeLayout | null;
  /** Currently selected node ID */
  selectedNode: string | null;
  /** Active type filters */
  filters: Set<KnowledgeNodeType>;
  /** Current search query string */
  searchQuery: string;
  /** Callback when a node is clicked */
  onNodeClick: (nodeId: string) => void;
}

// ============================================================
// Helper: check if a node matches the search query
// ============================================================

function matchesSearch(node: ForceNode, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    node.label.toLowerCase().includes(q) ||
    (node.metadata.description ?? "").toLowerCase().includes(q)
  );
}

// ============================================================
// KnowledgeGraphCanvas
// ============================================================

export function KnowledgeGraphCanvas({
  layout,
  selectedNode,
  filters,
  searchQuery,
  onNodeClick,
}: KnowledgeGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Filter nodes by type toggle and search query
  const visibleNodeIds = new Set<string>();
  const visibleNodes: ForceNode[] = [];
  if (layout) {
    for (const node of layout.nodes) {
      if (filters.has(node.type) && matchesSearch(node, searchQuery)) {
        visibleNodeIds.add(node.id);
        visibleNodes.push(node);
      }
    }
  }

  // Filter edges: both endpoints must be visible, and edge type
  // must not be excluded (edges inherit visibility from node types)
  const visibleEdges: KnowledgeEdge[] = [];
  if (layout) {
    for (const edge of layout.edges) {
      if (
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target)
      ) {
        visibleEdges.push(edge);
      }
    }
  }

  // Zoom handler
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((prev) => Math.max(0.3, Math.min(3.0, prev + delta)));
  }, []);

  // Get connected node IDs for hover highlighting
  const connectedNodeIds = new Set<string>();
  if (hoveredNode && layout) {
    connectedNodeIds.add(hoveredNode);
    for (const edge of layout.edges) {
      if (edge.source === hoveredNode) connectedNodeIds.add(edge.target);
      if (edge.target === hoveredNode) connectedNodeIds.add(edge.source);
    }
  }

  // Edge label on hover
  const edgeTypeLabel: Record<string, string> = {
    depends_on: "depends on",
    explains: "explains",
    implements: "implements",
    experiments: "experiments",
    documents: "documents",
    relates_to: "relates to",
  };

  if (!layout) {
    return (
      <div
        ref={containerRef}
        className="flex h-[600px] items-center justify-center rounded-2xl border border-dashed border-slate-500/15 dark:border-white/[0.06]"
      >
        <p className="text-sm text-slate-500/60">Loading knowledge graph...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-brand/10 bg-brand/[0.01] dark:border-white/[0.04] dark:bg-transparent"
      style={{ height: "600px", touchAction: "none" }}
      onWheel={handleWheel}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`${layout.bbox.x} ${layout.bbox.y} ${layout.bbox.width} ${layout.bbox.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edge layer */}
        <g>
          {visibleEdges.map((edge) => {
            const sourceNode = layout.nodes.find(
              (n) => n.id === edge.source
            );
            const targetNode = layout.nodes.find(
              (n) => n.id === edge.target
            );
            if (!sourceNode || !targetNode) return null;

            const style = getEdgeStyle(edge.type);
            const isHighlighted =
              hoveredNode === edge.source || hoveredNode === edge.target;
            const isDimmed =
              hoveredNode !== null && !isHighlighted;

            return (
              <g key={edge.id}>
                <line
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  className={cn(
                    style.strokeClass,
                    isHighlighted && "!stroke-brand/60 dark:!stroke-brand/65",
                    isDimmed && "opacity-[0.06]",
                    "transition-opacity duration-300"
                  )}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.dashArray}
                />
                {/* Edge label on hover */}
                {isHighlighted && (
                  <text
                    x={(sourceNode.x + targetNode.x) / 2}
                    y={(sourceNode.y + targetNode.y) / 2 - 6}
                    textAnchor="middle"
                    className="fill-slate-500/60 dark:fill-slate-400/50 font-mono text-[8px]"
                  >
                    {edgeTypeLabel[edge.type] ?? edge.type}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Node layer */}
        {layout.nodes.map((node, index) => {
          const isVisible = visibleNodeIds.has(node.id);
          const isSelected = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          const isConnected =
            hoveredNode !== null && connectedNodeIds.has(node.id);
          const isDimmed =
            hoveredNode !== null && !isConnected && !isHovered;
          const isSearchMatch =
            searchQuery.trim() !== "" && matchesSearch(node, searchQuery);

          const style = enrichForUI(node.type);
          const Icon = ICON_MAP[node.type];

          return (
            <motion.g
              key={node.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{
                opacity: isVisible ? 1 : 0,
                scale: isVisible ? 1 : 0.8,
              }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 25,
                delay: isVisible ? index * 0.03 : 0,
              }}
              style={{
                translateX: node.x - node.width / 2,
                translateY: node.y - node.height / 2,
              }}
            >
              <foreignObject
                width={node.width}
                height={node.height}
                className={cn(
                  "overflow-visible",
                  isDimmed && "opacity-[0.08] transition-opacity duration-300",
                  !isDimmed && !isSelected && isConnected && "opacity-80",
                  isSearchMatch && !isSelected && "animate-pulse"
                )}
                onClick={() => onNodeClick(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <div
                  className={cn(
                    "flex h-full items-center gap-2 border backdrop-blur-sm transition-all duration-300 cursor-pointer select-none",
                    style.shapeClass,
                    style.borderClass,
                    style.bgClass,
                    isSelected && "!border-brand/60 shadow-[0_0_20px_rgba(var(--brand-rgb),0.15)] scale-105",
                    isHovered && "!border-brand/40 shadow-[0_0_12px_rgba(var(--brand-rgb),0.08)]"
                  )}
                >
                  <Icon className="ml-2 size-3 shrink-0 text-brand/50 dark:text-brand/60" />
                  <span
                    className={cn(
                      "truncate pr-2 text-[10px] leading-tight font-medium text-foreground/80 dark:text-foreground/70",
                      node.type === "concept" && "text-[9px]"
                    )}
                  >
                    {node.label}
                  </span>
                </div>
              </foreignObject>
            </motion.g>
          );
        })}
      </svg>

      {/* Zoom indicator */}
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-slate-500/15 bg-white/[0.6] px-3 py-1 font-mono text-[0.6rem] text-slate-500/60 backdrop-blur-sm dark:bg-black/[0.4] dark:text-slate-400/50">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/knowledge/KnowledgeGraphCanvas.tsx
git commit -m "feat(knowledge): add KnowledgeGraphCanvas with SVG + Framer Motion zoom/pan (Phase 22c)"
```

---

### Task 8: Knowledge Toolbar

**Files:**
- Create: `src/components/minimind/knowledge/KnowledgeToolbar.tsx`

**Interfaces:**
- Consumes: `KnowledgeNodeType` from `@/data/minimind/knowledge-registry`
- Produces: `<KnowledgeToolbar>` component

- [ ] **Step 1: Write the toolbar component**

```typescript
"use client";

// ============================================================
// KnowledgeToolbar — search, filter toggles, stats, reset
// ============================================================

import { useCallback, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, RotateCcw, X } from "lucide-react";
import type { KnowledgeNodeType } from "@/data/minimind/knowledge-registry";

// ============================================================
// Filter toggle config
// ============================================================

interface FilterOption {
  type: KnowledgeNodeType;
  label: string;
  colorClass: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { type: "module", label: "Modules", colorClass: "border-brand/25 bg-brand/[0.05]" },
  { type: "concept", label: "Concepts", colorClass: "border-slate-500/20 bg-slate-500/[0.03]" },
  { type: "experiment", label: "Experiments", colorClass: "border-amber-500/25 bg-amber-500/[0.05]" },
  { type: "document", label: "Docs", colorClass: "border-dashed border-slate-500/15" },
  { type: "implementation", label: "Code", colorClass: "border-slate-500/12 bg-slate-500/[0.02]" },
];

// ============================================================
// Props
// ============================================================

interface KnowledgeToolbarProps {
  /** Active type filters */
  filters: Set<KnowledgeNodeType>;
  /** Toggle a filter type on/off */
  onFiltersChange: (filters: Set<KnowledgeNodeType>) => void;
  /** Current search query */
  searchQuery: string;
  /** Search query change handler */
  onSearchChange: (query: string) => void;
  /** Node and edge counts for stats display */
  stats: { nodes: number; edges: number };
  /** Reset view (re-center + reset zoom) */
  onResetView: () => void;
}

// ============================================================
// KnowledgeToolbar
// ============================================================

export function KnowledgeToolbar({
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  stats,
  onResetView,
}: KnowledgeToolbarProps) {
  const handleToggle = useCallback(
    (type: KnowledgeNodeType) => {
      const next = new Set(filters);
      if (next.has(type)) {
        // Don't allow deselecting all filters
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      onFiltersChange(next);
    },
    [filters, onFiltersChange]
  );

  const handleClearSearch = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/10 bg-brand/[0.02] px-4 py-3 backdrop-blur-sm dark:border-white/[0.05] dark:bg-transparent"
    >
      {/* Search input */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-500/40 dark:text-slate-400/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(e.target.value)
          }
          placeholder="Search nodes..."
          className="w-full rounded-lg border border-slate-500/15 bg-transparent py-1.5 pl-9 pr-8 text-xs text-foreground placeholder:text-slate-500/40 focus:border-brand/30 focus:outline-none dark:border-white/[0.06] dark:placeholder:text-slate-400/30"
        />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500/40 hover:text-slate-500/70 dark:hover:text-slate-400/60"
            aria-label="Clear search"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Filter toggles */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((opt) => {
          const active = filters.has(opt.type);
          return (
            <button
              key={opt.type}
              onClick={() => handleToggle(opt.type)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.6rem] font-medium tracking-wide uppercase transition-all duration-200",
                active
                  ? `${opt.colorClass} text-foreground/80`
                  : "border-slate-500/10 bg-transparent text-slate-500/40 hover:border-slate-500/20 dark:border-white/[0.04] dark:text-slate-400/30"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <span className="font-mono text-[0.6rem] text-slate-500/50 dark:text-slate-400/40 whitespace-nowrap">
        {stats.nodes} nodes · {stats.edges} edges
      </span>

      {/* Reset view */}
      <button
        onClick={onResetView}
        className="rounded-full border border-slate-500/15 p-1.5 text-slate-500/50 transition-colors hover:border-brand/25 hover:text-brand/70 dark:border-white/[0.06] dark:text-slate-400/40 dark:hover:text-brand/60"
        aria-label="Reset view"
      >
        <RotateCcw className="size-3" />
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/knowledge/KnowledgeToolbar.tsx
git commit -m "feat(knowledge): add KnowledgeToolbar with search, filters, stats (Phase 22c)"
```

---

### Task 9: Knowledge Components Barrel

**Files:**
- Create: `src/components/minimind/knowledge/index.ts`

- [ ] **Step 1: Write the components barrel**

```typescript
// ============================================================
// MiniMind Knowledge Graph — Components Barrel
// ============================================================

export { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";
export { KnowledgeToolbar } from "./KnowledgeToolbar";
export { KnowledgeDetailPanel } from "./KnowledgeDetailPanel";
export { KnowledgePageClient } from "./KnowledgePageClient";
```

- [ ] **Step 2: Commit** (the barrel references exports that don't exist yet — this is fine, we'll commit it now and add the missing components in the next tasks)

```bash
git add src/components/minimind/knowledge/index.ts
git commit -m "feat(knowledge): add knowledge components barrel (Phase 22c)"
```

---

### Task 10: Knowledge Detail Panel

**Files:**
- Create: `src/components/minimind/knowledge/KnowledgeDetailPanel.tsx`

**Interfaces:**
- Consumes: `KnowledgeNode`, `KnowledgeNodeType`, `getRelatedNodes` from `@/data/minimind/knowledge-registry`
- Consumes: `enrichForUI` from `@/lib/minimind/knowledge`
- Produces: `<KnowledgeDetailPanel>` component

- [ ] **Step 1: Write the detail panel component**

```typescript
"use client";

// ============================================================
// KnowledgeDetailPanel — slide-in sidebar for node details
// ============================================================
//
// Renders when a node is selected. Slides in from the right
// edge. Shows node metadata, status, route/file links, and
// related nodes (clickable to navigate).
//
// Matches the DeepDivePanel pattern from forward visualization.
// ============================================================

import { useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, ExternalLink, Box, Lightbulb, FlaskConical, FileText, Code, type LucideIcon } from "lucide-react";
import type { KnowledgeNode, KnowledgeNodeType } from "@/data/minimind/knowledge-registry";
import { getRelatedNodes } from "@/data/minimind/knowledge-registry";
import { enrichForUI } from "@/lib/minimind/knowledge";
import Link from "next/link";

// ============================================================
// Icon map
// ============================================================

const ICON_MAP: Record<KnowledgeNodeType, LucideIcon> = {
  module: Box,
  concept: Lightbulb,
  experiment: FlaskConical,
  document: FileText,
  implementation: Code,
};

// ============================================================
// Status badge colors
// ============================================================

const STATUS_CLASS: Record<string, string> = {
  completed: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
  "in-progress": "border-brand/25 bg-brand/[0.06] text-brand",
  upcoming: "border-slate-500/20 bg-slate-500/[0.04] text-slate-500",
  active: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
  planned: "border-amber-500/25 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
  legacy: "border-slate-500/15 bg-slate-500/[0.03] text-slate-500/60",
};

// ============================================================
// Edge type display labels
// ============================================================

const EDGE_LABELS: Record<string, string> = {
  depends_on: "Depends on",
  explains: "Explains",
  implements: "Implements",
  experiments: "Validated by",
  documents: "Documented by",
  relates_to: "Related to",
};

// ============================================================
// Props
// ============================================================

interface KnowledgeDetailPanelProps {
  /** The selected node (from getNodeById) */
  node: KnowledgeNode | null;
  /** Callback to close the panel */
  onClose: () => void;
  /** Callback to navigate to a related node */
  onNavigate: (nodeId: string) => void;
}

// ============================================================
// KnowledgeDetailPanel
// ============================================================

export function KnowledgeDetailPanel({
  node,
  onClose,
  onNavigate,
}: KnowledgeDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!node) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [node, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!node) return;

    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [node, onClose]);

  if (!node) return null;

  const style = enrichForUI(node.type);
  const Icon = ICON_MAP[node.type];
  const related = getRelatedNodes(node.id);

  // Group incoming edges by edge type
  const groupedIncoming = new Map<string, KnowledgeNode[]>();
  for (const rel of related.incoming) {
    const key = EDGE_LABELS[rel.edgeType] ?? rel.edgeType;
    const existing = groupedIncoming.get(key) ?? [];
    existing.push(rel.node);
    groupedIncoming.set(key, existing);
  }

  // Group outgoing edges by edge type
  const groupedOutgoing = new Map<string, KnowledgeNode[]>();
  for (const rel of related.outgoing) {
    const key = EDGE_LABELS[rel.edgeType] ?? rel.edgeType;
    const existing = groupedOutgoing.get(key) ?? [];
    existing.push(rel.node);
    groupedOutgoing.set(key, existing);
  }

  const hasRelated =
    groupedIncoming.size > 0 || groupedOutgoing.size > 0;

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "absolute right-0 top-0 z-20 h-full w-full max-w-[380px] overflow-y-auto border-l p-6 shadow-2xl",
          "border-brand/15 bg-white/95 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0a0a0a]/95",
          "rounded-r-2xl"
        )}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-slate-500/15 p-1.5 text-slate-500/60 transition-colors hover:border-slate-500/30 hover:text-slate-500/90 dark:border-white/[0.06] dark:hover:text-slate-300"
          aria-label="Close detail panel"
        >
          <X className="size-3.5" />
        </button>

        {/* Node type badge */}
        <div className="mb-4 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6rem] font-medium tracking-wide uppercase",
              style.borderClass,
              style.bgClass
            )}
          >
            <Icon className="size-3" />
            {node.type}
          </span>
        </div>

        {/* Node label */}
        <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">
          {node.label}
        </h2>

        {/* Description */}
        {node.metadata.description && (
          <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {node.metadata.description}
          </p>
        )}

        {/* Status badge */}
        {node.metadata.status && (
          <span
            className={cn(
              "mb-4 inline-block rounded-full border px-3 py-0.5 text-[0.65rem] font-medium",
              STATUS_CLASS[node.metadata.status] ?? "border-slate-500/15 text-slate-500/60"
            )}
          >
            {node.metadata.status}
          </span>
        )}

        {/* Route link */}
        {node.metadata.route && (
          <div className="mb-3">
            <Link
              href={node.metadata.route}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand/70 transition-colors hover:text-brand dark:text-brand/60 dark:hover:text-brand/80"
            >
              <ExternalLink className="size-3" />
              Open {node.type === "experiment" ? "Experiment" : "Playground"}
            </Link>
          </div>
        )}

        {/* File path */}
        {node.metadata.filePath && (
          <div className="mb-6">
            <code className="block rounded-lg border border-slate-500/10 bg-slate-500/[0.03] px-3 py-2 font-mono text-[0.6rem] text-slate-500/70 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-400/50">
              {node.metadata.filePath}
            </code>
          </div>
        )}

        {/* Related nodes */}
        {hasRelated && (
          <div className="border-t border-slate-500/10 pt-5 dark:border-white/[0.04]">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500/70 dark:text-slate-400/50">
              Related Nodes
            </h3>

            {/* Incoming (sources → this node) */}
            {Array.from(groupedIncoming.entries()).map(([groupLabel, nodes]) => (
              <div key={`in-${groupLabel}`} className="mb-4">
                <span className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-wide text-slate-500/50 dark:text-slate-400/40">
                  {groupLabel}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {nodes.map((relNode) => (
                    <button
                      key={relNode.id}
                      onClick={() => onNavigate(relNode.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-all duration-200 hover:border-brand/30 hover:text-brand dark:hover:text-brand/80",
                        style.borderClass,
                        "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {relNode.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Outgoing (this node → targets) */}
            {Array.from(groupedOutgoing.entries()).map(([groupLabel, nodes]) => (
              <div key={`out-${groupLabel}`} className="mb-4">
                <span className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-wide text-slate-500/50 dark:text-slate-400/40">
                  {groupLabel}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {nodes.map((relNode) => (
                    <button
                      key={relNode.id}
                      onClick={() => onNavigate(relNode.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-all duration-200 hover:border-brand/30 hover:text-brand dark:hover:text-brand/80",
                        style.borderClass,
                        "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {relNode.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/knowledge/KnowledgeDetailPanel.tsx
git commit -m "feat(knowledge): add KnowledgeDetailPanel with slide-in animation (Phase 22d)"
```

---

### Task 11: Knowledge Page Client

**Files:**
- Create: `src/components/minimind/knowledge/KnowledgePageClient.tsx`

**Interfaces:**
- Consumes: `KNOWLEDGE_GRAPH`, `getNodeById` from `@/data/minimind/knowledge-registry`
- Consumes: `adaptKnowledgeGraph` from `@/lib/minimind/knowledge`
- Consumes: `KnowledgeGraphCanvas`, `KnowledgeToolbar`, `KnowledgeDetailPanel` from local
- Produces: `<KnowledgePageClient>` component

- [ ] **Step 1: Write the page client component**

```typescript
"use client";

// ============================================================
// KnowledgePageClient — state owner and orchestrator
// ============================================================
//
// Derives the knowledge graph, computes layout, manages all
// UI state (selection, filters, search, viewport).
//
// This is the root component for the /ai-lab/knowledge page.
// ============================================================

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
  KNOWLEDGE_GRAPH,
  getNodeById,
  type KnowledgeNodeType,
} from "@/data/minimind/knowledge-registry";
import {
  adaptKnowledgeGraph,
  type KnowledgeLayout,
} from "@/lib/minimind/knowledge";
import { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { KnowledgeDetailPanel } from "./KnowledgeDetailPanel";

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const DEFAULT_VIEWPORT = { width: 1200, height: 800, padding: 60 };

// ============================================================
// KnowledgePageClient
// ============================================================

export function KnowledgePageClient() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── State ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Set<KnowledgeNodeType>>(
    new Set(["module", "concept", "experiment", "document", "implementation"])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      // Debounce 200ms
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { width, height } = entry.contentRect;
        setViewport({
          width: Math.max(width, 600),
          height: Math.max(height - 80, 400), // Account for toolbar
          padding: 60,
        });
      }, 200);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // ── Derive graph (once) ──
  const graph = useMemo(() => KNOWLEDGE_GRAPH, []);

  // ── Compute layout ──
  const layout: KnowledgeLayout | null = useMemo(
    () => adaptKnowledgeGraph(graph, viewport),
    [graph, viewport]
  );

  // ── Selected node object ──
  const selectedNode = useMemo(
    () => (selectedNodeId ? getNodeById(selectedNodeId) ?? null : null),
    [selectedNodeId]
  );

  // ── Handlers ──
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNavigate = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // ── Stats for toolbar ──
  const stats = useMemo(
    () => ({ nodes: graph.meta.totalNodes, edges: graph.meta.totalEdges }),
    [graph]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ================================================================ */}
      {/* Page Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("minimind.knowledge.subhead")}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("minimind.knowledge.heading")}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {t("minimind.knowledge.intro")}
          </p>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Toolbar */}
      {/* ================================================================ */}
      <div className="mt-8">
        <KnowledgeToolbar
          filters={filters}
          onFiltersChange={setFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stats={stats}
          onResetView={() => {
            // Reset viewport to trigger re-layout
            setViewport({ ...viewport });
          }}
        />
      </div>

      {/* ================================================================ */}
      {/* Graph Canvas + Detail Panel */}
      {/* ================================================================ */}
      <div ref={containerRef} className="relative mt-4">
        <div className="relative">
          <KnowledgeGraphCanvas
            layout={layout}
            selectedNode={selectedNodeId}
            filters={filters}
            searchQuery={searchQuery}
            onNodeClick={handleNodeClick}
          />

          <KnowledgeDetailPanel
            node={selectedNode}
            onClose={handleClosePanel}
            onNavigate={handleNavigate}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/knowledge/KnowledgePageClient.tsx
git commit -m "feat(knowledge): add KnowledgePageClient state owner + orchestrator (Phase 22d)"
```

---

### Task 12: Page Route

**Files:**
- Create: `src/app/ai-lab/knowledge/page.tsx`

- [ ] **Step 1: Write the server component page**

```typescript
import type { Metadata } from "next";
import { KnowledgePageClient } from "@/components/minimind/knowledge/KnowledgePageClient";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "MiniMind Knowledge Graph — explore the complete web of modules, concepts, experiments, documents, and implementations that form the MiniMind learning system.",
};

export default function KnowledgePage() {
  return <KnowledgePageClient />;
}
```

- [ ] **Step 2: Verify page compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/app/ai-lab/knowledge/page.tsx
git commit -m "feat(knowledge): add /ai-lab/knowledge route page (Phase 22d)"
```

---

### Task 13: i18n Keys

**Files:**
- Modify: `src/lib/i18n/locales/en.json` — add `minimind.knowledge` namespace
- Modify: `src/lib/i18n/locales/zh-CN.json` — add `minimind.knowledge` namespace (Chinese translations)

**Interfaces:**
- Produces: `minimind.knowledge.subhead`, `minimind.knowledge.heading`, `minimind.knowledge.intro`

- [ ] **Step 1: Add English i18n keys**

Read the existing file to find the insertion point, then add after the `minimind.experiments` block.

Run to find insertion point:
```bash
grep -n '"experiments"' src/lib/i18n/locales/en.json
```

Add the following block after the closing `}` of the `minimind.experiments` object (after line ~812):

```json
    "knowledge": {
      "subhead": "Knowledge Graph",
      "heading": "How Everything Connects",
      "intro": "An interactive map of the MiniMind learning system. Explore how modules, concepts, experiments, documents, and implementations relate to each other. Click any node to see its connections — every node and edge is derived from the module registry, no manual maintenance required."
    }
```

- [ ] **Step 2: Add Chinese i18n keys**

Similarly for `zh-CN.json`:

```json
    "knowledge": {
      "subhead": "知识图谱",
      "heading": "万物互联",
      "intro": "MiniMind 学习系统的交互式知识地图。探索模块、概念、实验、文档和实现之间的关系。点击任意节点查看其连接——所有节点和边均从模块注册表自动派生，无需手动维护。"
    }
```

- [ ] **Step 3: Verify i18n keys compile**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(knowledge): add i18n keys for knowledge graph (Phase 22e)"
```

---

### Task 14: Integration Links

**Files:**
- Modify: `src/components/ai-lab/KnowledgeMap.tsx` — replace placeholder with link to `/ai-lab/knowledge`
- Modify: `src/components/minimind/experience/ModuleDependencyGraph.tsx` — add "Explore full knowledge graph →" link at bottom

- [ ] **Step 1: Update KnowledgeMap placeholder to real link**

Replace the KnowledgeMap component content. Change from the placeholder coming-soon card to a link card pointing to `/ai-lab/knowledge`:

Read the current file at `src/components/ai-lab/KnowledgeMap.tsx`. Replace the inner `<div>` (lines 30-39) with:

```tsx
      <Link
        href="/ai-lab/knowledge"
        className="group flex flex-col items-center justify-center rounded-xl border border-brand/15 bg-brand/[0.02] py-16 text-center transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.05] dark:border-white/[0.06] dark:hover:border-brand/25"
      >
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)] dark:border-brand/25 dark:bg-brand/[0.08]">
          <Brain className="size-6 text-brand/60 transition-all duration-300 group-hover:text-brand/80" />
        </div>
        <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-brand">
          {t("aiLab.sections.knowledgeMap")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
          Explore the complete web of modules, concepts, experiments, and documents.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 dark:text-brand/50 dark:group-hover:text-brand/70">
          Explore Knowledge Graph
          <ArrowRight className="size-3" />
        </span>
      </Link>
```

Add imports at top:
```typescript
import Link from "next/link";
import { ArrowRight } from "lucide-react";
```

Remove the unused import of `motion` if it's no longer used (keep the `Variants` type only if still needed — check if the section wrapper still uses motion).

- [ ] **Step 2: Add bottom link to ModuleDependencyGraph**

Read the current file at `src/components/minimind/experience/ModuleDependencyGraph.tsx`. Add after the closing `</div>` of the dependency graph grid (after line 263, before `</motion.section>`):

```tsx
        {/* Link to full knowledge graph */}
        <div className="mt-10 flex justify-center">
          <Link
            href="/ai-lab/knowledge"
            className="group inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.03] px-5 py-2.5 text-sm font-medium text-brand/70 transition-all duration-300 hover:border-brand/40 hover:bg-brand/[0.06] hover:text-brand dark:border-brand/25 dark:text-brand/60 dark:hover:text-brand/80"
          >
            Explore full knowledge graph
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
```

Add imports at top:
```typescript
import Link from "next/link";
import { ArrowRight } from "lucide-react";
```

- [ ] **Step 3: Verify everything compiles**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/KnowledgeMap.tsx src/components/minimind/experience/ModuleDependencyGraph.tsx
git commit -m "feat(knowledge): add integration links to /ai-lab/knowledge (Phase 22e)"
```

---

### Task 15: Final Verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: zero errors

- [ ] **Step 2: Lint check**

Run: `npm run lint`
Expected: zero errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: zero errors, zero warnings

- [ ] **Step 4: Manual route verification**

Run: `npm run dev`
Navigate to `http://localhost:3000/ai-lab/knowledge`
Verify:
- [ ] Page renders without layout shift
- [ ] Page header visible with "Knowledge Graph" subtitle
- [ ] Toolbar visible with search input, 5 filter toggles, stats, reset button
- [ ] SVG canvas visible with nodes and edges
- [ ] 5 node types visually distinct (shape, border, background)
- [ ] 6 edge types rendered (solid, dashed, dotted with varying widths)
- [ ] Click module node → detail panel slides in from right
- [ ] Detail panel shows: type badge, label, description, status, route link, related nodes
- [ ] Click related node in panel → panel updates to that node
- [ ] Double-click selected node (or click X/Escape/click-outside) → panel closes
- [ ] Type filter toggle off → nodes of that type disappear
- [ ] Search "attention" → matching nodes highlight, non-matching dim
- [ ] Scroll wheel → zoom in/out
- [ ] Click "Reset view" → zoom resets
- [ ] Hover edge → edge label appears
- [ ] Hover node → connected edges highlight, unconnected dim
- [ ] Mobile viewport: detail panel goes full-width
- [ ] `/ai-lab/experience` still loads with ModuleDependencyGraph visible
- [ ] ModuleDependencyGraph has "Explore full knowledge graph →" link at bottom
- [ ] AI Lab hub page KnowledgeMap card links to `/ai-lab/knowledge`

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(knowledge): final verification fixes (Phase 22e)"
```
