import { PublicResearchPage } from "@/components/ai-lab/research/PublicResearchPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "MiniMind Research",
  description:
    "A transparent record of MiniMind experiments: architecture, frozen verdicts, negative results, current limitations, blocked work, and planned directions.",
  path: "/ai-lab/research",
  section: "AI Lab",
});

export default function ResearchPage() {
  return <PublicResearchPage />;
}
