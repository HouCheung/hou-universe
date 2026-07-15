import type { Metadata } from "next";
import { ToolsPageContent } from "@/components/tools/ToolsPageContent";

export const metadata: Metadata = {
  title: "工具箱 - HOU Universe",
  description:
    "常用开发工具与学习资源导航——涵盖 AI 开发、大数据学习与效率工具。",
};

export default function ToolsPage() {
  return <ToolsPageContent />;
}
