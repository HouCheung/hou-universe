"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles, Rocket } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

export function MissionBanner() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={variants}
      className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
    >
      {/* Glow accent */}
      <span
        className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <Rocket className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("aiLab.subhead")}
          </span>
        </div>

        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("aiLab.heading")}
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("aiLab.intro")}
        </p>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-brand/60 dark:text-brand-light/60">
          <Sparkles className="size-3" />
          <span className="font-mono italic">{t("aiLab.missionStatement")}</span>
        </div>
      </div>
    </motion.section>
  );
}
