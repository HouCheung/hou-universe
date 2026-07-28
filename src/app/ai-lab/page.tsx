import type { Metadata } from "next";
import { AiLabClient } from "@/components/ai-lab/AiLabClient";

export const metadata: Metadata = {
  title: "AI Lab · MiniMind Research",
  description:
    "AI Lab — Building MiniMind from scratch. A systematic exploration of LLM internals covering Tokenizer, Embedding, Attention, Transformer, Pretrain, SFT, LoRA, RLHF, RAG, and Agent.",
};

export default function AiLabPage() {
  return <AiLabClient />;
}
