import type { Metadata } from "next";
import { StarField } from "@/components/shared/StarField";
import { ToolCard } from "@/components/tools/ToolCard";
import { getToolsByCategory } from "@/data/tools";

export const metadata: Metadata = {
  title: "工具箱 - HOU Universe",
  description:
    "常用开发工具与学习资源导航——涵盖 AI 开发、大数据学习与效率工具。",
};

export default function ToolsPage() {
  const categories = getToolsByCategory();

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-blue-300/60 uppercase">
              工具箱
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              工具箱
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              收集整理日常开发中常用的工具、平台与学习资源，
              点击卡片即可跳转对应网站。
            </p>
          </header>

          {/* Categories */}
          {Array.from(categories.entries()).map(([category, categoryTools]) => (
            <section key={category} className="mb-16 sm:mb-20">
              <div className="mb-8 flex items-center gap-4">
                <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 via-indigo-400 to-purple-500" />
                <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
                  {category}
                </h2>
                <span className="h-px flex-1 bg-gradient-to-r from-blue-400/20 via-blue-400/10 to-transparent" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categoryTools.map((tool, index) => (
                  <ToolCard key={tool.name} tool={tool} index={index} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
