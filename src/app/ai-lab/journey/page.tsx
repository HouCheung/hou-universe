import type { Metadata } from "next";
import { ProjectEvolutionPageClient } from "@/components/minimind/evolution";

export const metadata: Metadata = {
  title: "Project Evolution — MiniMind",
  description:
    "Track the evolution of the MiniMind project — from tokenization through inference, each module building on the last.",
};

export default function JourneyPage() {
  return <ProjectEvolutionPageClient />;
}
