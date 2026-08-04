import type { Metadata } from "next";
import { TrainingPageClient } from "@/components/minimind/training";

export const metadata: Metadata = {
  title: "Training Pipeline — MiniMind",
  description:
    "MiniMind Training Showcase — visualize the pretraining pipeline: dataset, forward pass, cross-entropy loss, optimizer, and the honest gradient boundary.",
};

export default function TrainingPage() {
  return <TrainingPageClient />;
}
