"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ProjectCategory = string;

interface CategoryFilterProps {
  categories: ProjectCategory[];
  activeCategory: ProjectCategory;
  onCategoryChange: (category: ProjectCategory) => void;
}

export function CategoryFilter({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  return (
    <div className="mb-12 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      {categories.map((category) => {
        const isActive = category === activeCategory;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onCategoryChange(category)}
            className={cn(
              "relative rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-out sm:px-5 sm:py-2.5",
              isActive
                ? "text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="category-pill"
                className="absolute inset-0 rounded-full border border-brand/30 bg-gradient-to-b from-brand/80 to-brand-deep/80 shadow-[0_2px_8px_rgba(var(--brand-rgb),0.2),inset_0_1px_0_rgba(255,255,255,0.08)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {!isActive && (
              <span className="absolute inset-0 rounded-full border border-slate-300/30 bg-slate-200/30 transition-all duration-300 hover:border-slate-400/40 hover:bg-slate-200/50 dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:border-white/[0.1] dark:hover:bg-white/[0.05]" />
            )}
            <span className="relative z-10">{category}</span>
          </button>
        );
      })}
    </div>
  );
}
