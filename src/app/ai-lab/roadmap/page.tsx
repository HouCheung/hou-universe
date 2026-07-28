import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Full Roadmap",
};

export default function RoadmapPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.roadmap" />;
}
