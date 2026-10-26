import type { Metadata } from "next";
import { ResearchWorkspace } from "@/components/ai-lab/research/ResearchWorkspace";

export const metadata: Metadata = {
  title: "Research Studio",
  description:
    "Full MiniMind research studio — manage training sessions, analyze results with the research copilot, run ablation studies, and benchmark model performance.",
};

export default function ResearchLabPage() {
  return <ResearchWorkspace />;
}
