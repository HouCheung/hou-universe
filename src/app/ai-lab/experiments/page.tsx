import type { Metadata } from "next";
import { ExperimentsPageClient } from "@/components/minimind/experiments";

export const metadata: Metadata = {
  title: "Experiment Lab",
  description:
    "Interactive MiniMind experiments — explore tokenization strategies, embedding vectors, attention patterns, and more through hands-on comparisons.",
};

export default function ExperimentsPage() {
  return <ExperimentsPageClient />;
}
