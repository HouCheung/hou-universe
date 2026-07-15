"use client";

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const isZh = (i18n.language || "zh-CN").startsWith("zh");

  const toggleLang = () => {
    const next = isZh ? "en" : "zh-CN";
    i18n.changeLanguage(next);
  };

  return (
    <button
      type="button"
      onClick={toggleLang}
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-300 ease-out",
        "border-slate-300/40 bg-slate-200/30 text-slate-600",
        "hover:border-brand/25 hover:bg-brand/8 hover:text-slate-800",
        "dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400",
        "dark:hover:text-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
      aria-label={t("language.label")}
      title={t("language.label")}
    >
      <Languages className="h-3.5 w-3.5 shrink-0 transition-colors duration-300 group-hover:text-slate-800 dark:group-hover:text-slate-200" />
      <motion.span
        key={i18n.language}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="tabular-nums"
      >
        {isZh ? "EN" : "中文"}
      </motion.span>
    </button>
  );
}
