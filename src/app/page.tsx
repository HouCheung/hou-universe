import type { Metadata } from "next";
import { HomePageClient } from "./HomePageClient";

export const metadata: Metadata = {
  title: "HOU Universe - 数据科学个人作品集",
  description:
    "数据科学与大数据技术专业个人作品集，展示项目经历、技能栈与学习笔记。涵盖全栈开发、AI 工程化与数据工程领域。",
};

export default function HomePage() {
  return <HomePageClient />;
}
