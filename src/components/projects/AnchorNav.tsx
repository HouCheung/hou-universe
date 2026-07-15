"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnchorItem {
  id: string;
  labelKey: string;
}

const ANCHORS: AnchorItem[] = [
  { id: "section-background", labelKey: "anchorNav.projectBackground" },
  { id: "section-features", labelKey: "anchorNav.coreFeatures" },
  { id: "section-tech-solution", labelKey: "anchorNav.techSolution" },
  { id: "section-tech-stack", labelKey: "anchorNav.techStack" },
  { id: "section-download", labelKey: "anchorNav.download" },
];

export function AnchorNav() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string>("");
  const [isVisible, setIsVisible] = useState(false);

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    setIsVisible(scrollY > 400);

    const viewportMiddle = window.innerHeight / 3;

    for (const anchor of ANCHORS) {
      const el = document.getElementById(anchor.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= viewportMiddle && rect.bottom >= viewportMiddle) {
        setActiveId(anchor.id);
        return;
      }
    }

    const lastAnchor = ANCHORS[ANCHORS.length - 1];
    const lastEl = document.getElementById(lastAnchor.id);
    if (lastEl) {
      const rect = lastEl.getBoundingClientRect();
      if (rect.bottom < viewportMiddle) {
        setActiveId(lastAnchor.id);
        return;
      }
    }

    const firstEl = document.getElementById(ANCHORS[0].id);
    if (firstEl) {
      const rect = firstEl.getBoundingClientRect();
      if (rect.top > viewportMiddle) {
        setActiveId("");
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <motion.nav
      initial={{ opacity: 0, x: 20 }}
      animate={{
        opacity: isVisible ? 1 : 0,
        x: isVisible ? 0 : 20,
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed right-6 top-1/2 z-40 -translate-y-1/2 hidden lg:block"
      aria-label={t("anchorNav.label")}
    >
      <div className="flex flex-col gap-1 rounded-xl border border-slate-200/40 bg-white/70 backdrop-blur-xl p-2 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-white/[0.06] dark:bg-[rgba(10,10,15,0.7)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        {ANCHORS.map((anchor) => {
          const isActive = activeId === anchor.id;
          return (
            <button
              key={anchor.id}
              type="button"
              onClick={() => scrollToSection(anchor.id)}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-inset",
                isActive
                  ? "text-slate-800 dark:text-slate-200"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300",
                  isActive
                    ? "bg-brand shadow-[0_0_8px_rgba(var(--brand-rgb),0.6)] scale-125"
                    : "bg-slate-400 group-hover:bg-slate-500 dark:bg-slate-600 dark:group-hover:bg-slate-400"
                )}
              />
              <span>{t(anchor.labelKey)}</span>
              {isActive && (
                <motion.span
                  layoutId="anchor-active-bg"
                  className="absolute inset-0 rounded-lg bg-slate-200/40 border border-slate-300/30 dark:bg-white/[0.04] dark:border-white/[0.06]"
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
