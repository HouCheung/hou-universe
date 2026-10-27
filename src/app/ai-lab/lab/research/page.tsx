import { ResearchWorkspace } from "@/components/ai-lab/research/ResearchWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Research Studio",
  description:
    "Full MiniMind research studio — manage training sessions, analyze results with the research copilot, run ablation studies, and benchmark model performance.",
  path: "/ai-lab/lab/research",
  section: "MiniMind Lab",
});

export default function ResearchLabPage() {
  return <ResearchWorkspace />;
}
