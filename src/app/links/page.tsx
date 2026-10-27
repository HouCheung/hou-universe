import { LinksPageContent } from "@/components/links/LinksPageContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Links",
  description:
    "Links wall — friendly links and technical tool navigation, discover more great developer sites and useful resources.",
  path: "/links",
});

export default function LinksPage() {
  return <LinksPageContent />;
}
