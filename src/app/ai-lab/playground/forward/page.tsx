import { ForwardPlayground } from "@/components/minimind/playground/forward";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Forward Model Explorer",
  description:
    "MiniMind Forward Model Explorer — trace the complete Text → Tokenizer → Embedding → RoPE → Transformer → LM Head → Logits pipeline. Inspect every intermediate result with interactive visualizations at every stage.",
  path: "/ai-lab/playground/forward",
  section: "AI Lab",
});

export default function ForwardPlaygroundPage() {
  return <ForwardPlayground />;
}
