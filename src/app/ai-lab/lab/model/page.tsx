import { ProjectEvolutionPageClient } from "@/components/minimind/evolution/ProjectEvolutionPageClient";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Model Architecture",
  description:
    "Explore the MiniMind Transformer architecture — attention mechanisms, embeddings, RoPE, and layer composition. Trace the evolution from single-block to full GPT-style model.",
  path: "/ai-lab/lab/model",
  section: "MiniMind Lab",
});

export default function ModelLabPage() {
  return <ProjectEvolutionPageClient />;
}
