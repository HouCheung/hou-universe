import type { RoadmapPhase, RoadmapNode } from "@/types";

export const roadmapPhases: RoadmapPhase[] = [
  {
    id: "phase-foundation",
    order: 1,
    titleKey: "roadmap.phases.foundation.title",
    descriptionKey: "roadmap.phases.foundation.description",
    status: "in-progress",
    nodes: [
      {
        id: "tokenizer",
        order: 1,
        titleKey: "roadmap.nodes.tokenizer.title",
        descriptionKey: "roadmap.nodes.tokenizer.description",
        status: "in-progress",
        topics: ["BPE", "WordPiece", "SentencePiece", "Byte-level encoding"],
      },
      {
        id: "embedding",
        order: 2,
        titleKey: "roadmap.nodes.embedding.title",
        descriptionKey: "roadmap.nodes.embedding.description",
        status: "upcoming",
        topics: ["Word2Vec", "Positional Encoding", "RoPE"],
      },
      {
        id: "attention",
        order: 3,
        titleKey: "roadmap.nodes.attention.title",
        descriptionKey: "roadmap.nodes.attention.description",
        status: "upcoming",
        topics: ["Self-Attention", "Multi-Head Attention", "Flash Attention"],
      },
      {
        id: "transformer",
        order: 4,
        titleKey: "roadmap.nodes.transformer.title",
        descriptionKey: "roadmap.nodes.transformer.description",
        status: "upcoming",
        topics: ["Encoder-Decoder", "Layer Normalization", "Residual Connections"],
      },
    ],
  },
  {
    id: "phase-training",
    order: 2,
    titleKey: "roadmap.phases.training.title",
    descriptionKey: "roadmap.phases.training.description",
    status: "upcoming",
    nodes: [
      {
        id: "pretrain",
        order: 5,
        titleKey: "roadmap.nodes.pretrain.title",
        descriptionKey: "roadmap.nodes.pretrain.description",
        status: "upcoming",
        topics: ["Data Preparation", "Training Loop", "Loss Curves", "Checkpointing"],
      },
      {
        id: "sft",
        order: 6,
        titleKey: "roadmap.nodes.sft.title",
        descriptionKey: "roadmap.nodes.sft.description",
        status: "upcoming",
        topics: ["Instruction Tuning", "Dataset Formatting", "Chat Templates"],
      },
      {
        id: "lora",
        order: 7,
        titleKey: "roadmap.nodes.lora.title",
        descriptionKey: "roadmap.nodes.lora.description",
        status: "upcoming",
        topics: ["Low-Rank Adaptation", "QLoRA", "Adapter Merging"],
      },
      {
        id: "rlhf",
        order: 8,
        titleKey: "roadmap.nodes.rlhf.title",
        descriptionKey: "roadmap.nodes.rlhf.description",
        status: "upcoming",
        topics: ["Reward Modeling", "PPO", "DPO", "Preference Data"],
      },
    ],
  },
  {
    id: "phase-advanced",
    order: 3,
    titleKey: "roadmap.phases.advanced.title",
    descriptionKey: "roadmap.phases.advanced.description",
    status: "upcoming",
    nodes: [
      {
        id: "rag",
        order: 9,
        titleKey: "roadmap.nodes.rag.title",
        descriptionKey: "roadmap.nodes.rag.description",
        status: "upcoming",
        topics: ["Vector DB", "Retrieval Pipelines", "Hybrid Search"],
      },
      {
        id: "agent",
        order: 10,
        titleKey: "roadmap.nodes.agent.title",
        descriptionKey: "roadmap.nodes.agent.description",
        status: "upcoming",
        topics: ["Tool Use", "ReAct", "Planning", "Memory"],
      },
    ],
  },
];

/** All nodes flattened across phases — for global indexing */
export function getAllNodes(): RoadmapNode[] {
  return roadmapPhases.flatMap((p) => p.nodes);
}

/** The first phase with status "in-progress", or null */
export function getCurrentPhase(): RoadmapPhase | null {
  return roadmapPhases.find((p) => p.status === "in-progress") ?? null;
}

/** The first node with status "in-progress" across all phases, or null */
export function getCurrentTask(): RoadmapNode | null {
  return getAllNodes().find((n) => n.status === "in-progress") ?? null;
}

/** Overall progress: percent (in-progress weighted at 30%) plus raw counts */
export function getOverallProgress(): {
  completed: number;
  inProgress: number;
  total: number;
  percent: number;
} {
  const allNodes = getAllNodes();
  const completed = allNodes.filter((n) => n.status === "completed").length;
  const inProgress = allNodes.filter((n) => n.status === "in-progress").length;
  const effective = completed + inProgress * 0.3;
  const percent = Math.round((effective / allNodes.length) * 100);
  return { completed, inProgress, total: allNodes.length, percent };
}
