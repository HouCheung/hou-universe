import type { Metadata } from "next";
import { ExperiencePageClient } from "@/components/minimind/experience/ExperiencePageClient";

export const metadata: Metadata = {
  title: "Architecture Experience",
  description:
    "MiniMind Architecture Experience — interactive visualization of the complete computation pipeline from Tokenizer to Transformer output.",
};

export default function ExperiencePage() {
  return <ExperiencePageClient />;
}
