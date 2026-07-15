import type { Metadata } from "next";
import { LinksPageContent } from "@/components/links/LinksPageContent";

export const metadata: Metadata = {
  title: "友链 - HOU Universe",
  description:
    "友链墙——友情链接与技术工具导航，发现更多优质开发者站点与实用资源。",
};

export default function LinksPage() {
  return <LinksPageContent />;
}
