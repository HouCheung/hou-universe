"use client";

import { useTranslation } from "react-i18next";
import { StarField } from "@/components/shared/StarField";
import { ToolCard } from "@/components/tools/ToolCard";
import { getToolsByCategory } from "@/data/tools";

export function ToolsPageContent() {
  const { t } = useTranslation();
  const categories = getToolsByCategory();

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-slate-500/80 uppercase dark:text-slate-400/60">
              {t("tools.subhead")}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {t("tools.heading")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("tools.intro")}
            </p>
          </header>

          {/* Categories */}
          {Array.from(categories.entries()).map(([category, categoryTools]) => {
            const translatedCategory = t(`toolsCategories.${getCategoryKey(category)}`, category);
            return (
              <section key={category} className="mb-16 sm:mb-20">
                <div className="mb-8 flex items-center gap-4">
                  <div className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
                  <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-slate-500/80 uppercase dark:text-slate-400/70">
                    {translatedCategory}
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-slate-400/20 via-slate-400/10 to-transparent" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryTools.map((tool, index) => (
                    <ToolCard key={tool.name} tool={tool} index={index} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function getCategoryKey(category: string): string {
  // Categories are now key-based (ai, bigdata, efficiency)
  return `toolsCategories.${category}`;
}
