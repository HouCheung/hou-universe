import { pageMetadata } from "@/lib/seo";
import { ExperimentsPageClient } from "@/app/ai-lab/experiments/ExperimentsPageClient";

export const metadata = pageMetadata({
  title: "Experiments",
  description:
    "Design and run controlled MiniMind experiments — test hypotheses with reproducible workflows, compare configurations, and analyze results.",
  path: "/ai-lab/lab/experiments",
  section: "MiniMind Lab",
});

export default function ExperimentsLabPage() {
  return <ExperimentsPageClient />;
}
