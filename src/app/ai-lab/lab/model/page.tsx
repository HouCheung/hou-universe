import type { Metadata } from "next";
import { ProjectEvolutionPageClient } from "@/components/minimind/evolution/ProjectEvolutionPageClient";

export const metadata: Metadata = {
  title: "Model Architecture",
  description:
    "Explore the MiniMind Transformer architecture — attention mechanisms, embeddings, RoPE, and layer composition. Trace the evolution from single-block to full GPT-style model.",
};

export default function ModelLabPage() {
  return <ProjectEvolutionPageClient />;
}
