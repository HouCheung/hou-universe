import type { Metadata } from "next";
import { KnowledgePageClient } from "@/components/minimind/knowledge/KnowledgePageClient";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "MiniMind Knowledge Graph — explore the complete web of modules, concepts, experiments, documents, and implementations that form the MiniMind learning system.",
};

export default function KnowledgePage() {
  return <KnowledgePageClient />;
}
