import { ToolsPageContent } from "@/components/tools/ToolsPageContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Tools",
  description:
    "Curated development tools and learning resources — covering AI development, big data learning, and productivity tools.",
  path: "/tools",
});

export default function ToolsPage() {
  return <ToolsPageContent />;
}
