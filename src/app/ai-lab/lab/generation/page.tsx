import type { Metadata } from "next";
import { GenerationWorkspace } from "@/components/ai-lab/research/GenerationWorkspace";

export const metadata: Metadata = {
  title: "Generation Lab",
  description:
    "Analyze MiniMind text generation quality — compare baseline vs trained output, explore temperature and sampling parameters, and export detailed generation reports.",
};

export default function GenerationLabPage() {
  return <GenerationWorkspace />;
}
