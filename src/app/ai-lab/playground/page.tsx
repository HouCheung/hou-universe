import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "AI Playground",
};

export default function PlaygroundPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.roadmap" />;
}
