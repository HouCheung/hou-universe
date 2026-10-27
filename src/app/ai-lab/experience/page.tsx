import { ExperiencePageClient } from "@/components/minimind/experience/ExperiencePageClient";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Architecture Experience",
  description:
    "MiniMind Architecture Experience — interactive visualization of the complete computation pipeline from Tokenizer to Transformer output.",
  path: "/ai-lab/experience",
  section: "AI Lab",
});

export default function ExperiencePage() {
  return <ExperiencePageClient />;
}
