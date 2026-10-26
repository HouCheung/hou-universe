import type { Metadata } from "next";
import { ExperimentsPageClient } from "@/app/ai-lab/experiments/ExperimentsPageClient";

export const metadata: Metadata = {
  title: "Experiments",
  description:
    "Design and run controlled MiniMind experiments — test hypotheses with reproducible workflows, compare configurations, and analyze results.",
};

export default function ExperimentsLabPage() {
  return <ExperimentsPageClient />;
}
