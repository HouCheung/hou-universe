import type { Metadata } from "next";
import { LearningJourneyPageClient } from "@/components/minimind/learning";

export const metadata: Metadata = {
  title: "Learning Journey — MiniMind",
  description:
    "Follow the guided learning path through MiniMind modules — from tokenization to inference, with concept tracking and experiment validation.",
};

export default function JourneyPage() {
  return <LearningJourneyPageClient />;
}
