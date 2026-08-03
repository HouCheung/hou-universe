"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Layers } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function ForwardPlaygroundSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.forwardPlayground" />

      <Link
        href="/ai-lab/playground/forward"
        className="group flex flex-col items-center justify-center rounded-xl border border-brand/15 bg-brand/[0.02] py-16 text-center transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.05] dark:border-white/[0.06] dark:hover:border-brand/25"
      >
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)] dark:border-brand/25 dark:bg-brand/[0.08]">
          <Layers className="size-6 text-brand/60 transition-all duration-300 group-hover:text-brand/80" />
        </div>
        <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-brand">
          {t("aiLab.forwardPlayground.title")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
          {t("aiLab.forwardPlayground.description")}
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 dark:text-brand/50 dark:group-hover:text-brand/70">
          {t("aiLab.forwardPlayground.cta")}
          <ArrowRight className="size-3" />
        </span>
      </Link>
    </motion.section>
  );
}
