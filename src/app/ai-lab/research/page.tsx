import type { Metadata } from "next";
import { PublicResearchPage } from "@/components/ai-lab/research/PublicResearchPage";

export const metadata: Metadata = {
  title: "MiniMind Research",
  description:
    "A transparent record of MiniMind experiments: architecture, frozen verdicts, negative results, current limitations, blocked work, and planned directions.",
};

export default function ResearchPage() {
  return <PublicResearchPage />;
}
