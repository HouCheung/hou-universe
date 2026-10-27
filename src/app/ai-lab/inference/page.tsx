import { InferencePageClient } from "@/components/minimind/inference";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "MiniMind Inference",
  description:
    "Visualize MiniMind text generation pipeline and inference process.",
  path: "/ai-lab/inference",
  section: "AI Lab",
});

export default function InferencePage() {
  return <InferencePageClient />;
}
