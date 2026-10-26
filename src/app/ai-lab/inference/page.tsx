import type { Metadata } from "next";
import { InferencePageClient } from "@/components/minimind/inference";

export const metadata: Metadata = {
  title: "MiniMind Inference",
  description:
    "Visualize MiniMind text generation pipeline and inference process.",
};

export default function InferencePage() {
  return <InferencePageClient />;
}
