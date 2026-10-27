import { TrainingPageClient } from "@/components/minimind/training";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Training Pipeline",
  description:
    "Watch the MiniMind training pipeline in action — dataset loading, forward pass, cross-entropy loss, optimizer step, and training metrics visualization.",
  path: "/ai-lab/lab/training",
  section: "MiniMind Lab",
});

export default function TrainingLabPage() {
  return <TrainingPageClient />;
}
