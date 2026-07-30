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
import {
  MINIMIND_MODULES,
  computeDependencyLevels,
} from "@/data/minimind/module-registry";
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
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Spaces → hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim leading/trailing hyphens
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
  const parts = sourcePath
    .replace(/\\/g, "/")
    .replace(/\/$/, "")
    .split("/");
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
  const docSet = new Map<string, string>(); // id → docPath
  const implSet = new Map<string, string>(); // id → sourcePath

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
      const parts = sourcePath
        .replace(/\\/g, "/")
        .replace(/\/$/, "")
        .split("/");
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
  "the",
  "and",
  "for",
  "via",
  "over",
  "from",
  "with",
  "per",
  "its",
  "but",
  "not",
  "are",
  "can",
  "has",
  "had",
  "was",
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
