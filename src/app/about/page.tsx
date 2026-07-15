import type { Metadata } from "next";
import { AboutContent } from "@/components/about/AboutContent";

export const metadata: Metadata = {
  title: "关于 - HOU Universe",
  description:
    "数据科学与大数据技术专业在读，热爱全栈开发与 AI 工程化——这里是我的个人简历与技术能力全景。",
};

export default function AboutPage() {
  return <AboutContent />;
}
