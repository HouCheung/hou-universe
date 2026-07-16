import type { Metadata } from "next";
import { ToolsPageContent } from "@/components/tools/ToolsPageContent";

export const metadata: Metadata = {
  title: "Tools - HOU Universe",
  description:
    "Curated development tools and learning resources — covering AI development, big data learning, and productivity tools.",
};

export default function ToolsPage() {
  return <ToolsPageContent />;
}
