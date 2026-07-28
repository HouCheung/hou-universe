import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Experiments",
};

export default function ExperimentsPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.roadmap" />;
}
