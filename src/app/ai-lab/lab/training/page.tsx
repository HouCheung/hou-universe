import type { Metadata } from "next";
import { TrainingPageClient } from "@/components/minimind/training";

export const metadata: Metadata = {
  title: "Training Pipeline",
  description:
    "Watch the MiniMind training pipeline in action — dataset loading, forward pass, cross-entropy loss, optimizer step, and training metrics visualization.",
};

export default function TrainingLabPage() {
  return <TrainingPageClient />;
}
