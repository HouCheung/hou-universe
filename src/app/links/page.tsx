import type { Metadata } from "next";
import { LinksPageContent } from "@/components/links/LinksPageContent";

export const metadata: Metadata = {
  title: "Links - HOU Universe",
  description:
    "Links wall — friendly links and technical tool navigation, discover more great developer sites and useful resources.",
};

export default function LinksPage() {
  return <LinksPageContent />;
}
