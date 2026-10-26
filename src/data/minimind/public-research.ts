/**
 * Public MiniMind research registry.
 *
 * Only IDs, statuses, tones, and language-neutral labels live here. All
 * display text is provided through `aiLab.publicResearch.*` in both locale
 * files, so the Chinese and English pages stay in sync.
 *
 * Evidence source: experiments/MINIMIND-RESEARCH-INDEX.md (2026-10-23) and
 * experiments/phase124-replication/ (2026-10-25). Do not add a phase here
 * without a frozen report or audit trail.
 */

export type ResearchStatus =
  | "completed"
  | "experimental"
  | "in-progress"
  | "blocked"
  | "planned";

export type VerdictTone = "positive" | "caution" | "negative" | "neutral";

export interface ResearchPhase {
  /** i18n key segment under aiLab.publicResearch.phases */
  id: string;
  /** Language-neutral phase label */
  label: string;
  status: ResearchStatus;
  verdictTone: VerdictTone;
  /** i18n key segment under aiLab.publicResearch.tags */
  tag: string;
}

export const RESEARCH_PHASES: ResearchPhase[] = [
  {
    id: "p113",
    label: "Phase 113",
    status: "completed",
    verdictTone: "negative",
    tag: "chatSft",
  },
  {
    id: "p114",
    label: "Phase 114",
    status: "completed",
    verdictTone: "neutral",
    tag: "diagnostic",
  },
  {
    id: "p115",
    label: "Phase 115",
    status: "completed",
    verdictTone: "positive",
    tag: "paraphrase",
  },
  {
    id: "p116",
    label: "Phase 116",
    status: "completed",
    verdictTone: "caution",
    tag: "replication",
  },
  {
    id: "p117",
    label: "Phase 117",
    status: "completed",
    verdictTone: "neutral",
    tag: "overlap",
  },
  {
    id: "h118",
    label: "H118",
    status: "completed",
    verdictTone: "positive",
    tag: "overlap",
  },
  {
    id: "h119",
    label: "H119",
    status: "completed",
    verdictTone: "caution",
    tag: "matching",
  },
  {
    id: "h120",
    label: "H120",
    status: "completed",
    verdictTone: "caution",
    tag: "audit",
  },
  {
    id: "h121",
    label: "H121",
    status: "experimental",
    verdictTone: "caution",
    tag: "augmentation",
  },
  {
    id: "h122",
    label: "H122",
    status: "completed",
    verdictTone: "caution",
    tag: "audit",
  },
  {
    id: "h123",
    label: "Phase 123",
    status: "blocked",
    verdictTone: "negative",
    tag: "selection",
  },
  {
    id: "h123v2",
    label: "Phase 123-v2",
    status: "experimental",
    verdictTone: "caution",
    tag: "augmentation",
  },
  {
    id: "p124",
    label: "Phase 124-A1",
    status: "in-progress",
    verdictTone: "neutral",
    tag: "replication",
  },
];

/** Production model configuration used by every reported experiment. */
export const PRODUCTION_MODEL = {
  parameters: "~1.13M",
  vocabSize: "300",
  dModel: "128",
  numHeads: "4",
  dFF: "512",
  numLayers: "4",
  maxSeqLen: "256",
} as const;

export interface Phase124Gate {
  id: string;
  gate: string;
  status: string;
  tone: "ready" | "blocked" | "design" | "partial";
}

/** Verbatim gate labels from experiments/phase124-replication/DECISION-GATES.md. */
export const PHASE_124_GATES: Phase124Gate[] = [
  {
    id: "a",
    gate: "A",
    status: "READY FOR HUMAN REVIEW",
    tone: "ready",
  },
  {
    id: "b",
    gate: "B",
    status: "BLOCKED",
    tone: "blocked",
  },
  {
    id: "c",
    gate: "C",
    status: "BLOCKED",
    tone: "blocked",
  },
  {
    id: "d",
    gate: "D",
    status: "DESIGN-LEVEL ONLY",
    tone: "design",
  },
  {
    id: "e",
    gate: "E",
    status: "PARTIAL",
    tone: "partial",
  },
];

export interface ResearchRoadmapItem {
  id: string;
  status: ResearchStatus;
}

/** Next directions from the research index; none has started. */
export const RESEARCH_ROADMAP: ResearchRoadmapItem[] = [
  { id: "independent-facts", status: "planned" },
  { id: "english-coverage", status: "planned" },
  { id: "author-generalization", status: "planned" },
];

export const RESEARCH_STATUSES: ResearchStatus[] = [
  "completed",
  "experimental",
  "in-progress",
  "blocked",
  "planned",
];
