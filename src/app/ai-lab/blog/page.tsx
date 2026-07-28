import type { Metadata } from "next";
import { SubRoutePlaceholder } from "@/components/ai-lab/SubRoutePlaceholder";

export const metadata: Metadata = {
  title: "Learning Notes",
};

export default function BlogPage() {
  return <SubRoutePlaceholder sectionNameKey="aiLab.sections.blog" />;
}
