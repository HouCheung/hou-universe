import { GenerationWorkspace } from "@/components/ai-lab/research/GenerationWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Generation Lab",
  description:
    "Analyze MiniMind text generation quality — compare baseline vs trained output, explore temperature and sampling parameters, and export detailed generation reports.",
  path: "/ai-lab/lab/generation",
  section: "MiniMind Lab",
});

export default function GenerationLabPage() {
  return <GenerationWorkspace />;
}
