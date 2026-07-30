import type { Metadata } from "next";
import { ForwardPlayground } from "@/components/minimind/playground/forward";

export const metadata: Metadata = {
  title: "Forward Model Explorer",
  description:
    "MiniMind Forward Model Explorer — trace the complete Text → Tokenizer → Embedding → RoPE → Transformer → LM Head → Logits pipeline. Inspect every intermediate result with interactive visualizations at every stage.",
};

export default function ForwardPlaygroundPage() {
  return <ForwardPlayground />;
}
