import { KnowledgePageClientWrapper } from "./KnowledgePageClientWrapper";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Knowledge Graph",
  description:
    "MiniMind Knowledge Graph — explore the complete web of modules, concepts, experiments, documents, and implementations that form the MiniMind learning system.",
  path: "/ai-lab/knowledge",
  section: "AI Lab",
});

export default function KnowledgePage() {
  return <KnowledgePageClientWrapper />;
}
