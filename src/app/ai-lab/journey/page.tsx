import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Learning Journey",
};

export default function JourneyPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.timeline" />;
}
