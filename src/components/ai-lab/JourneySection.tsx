"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { Map, ArrowRight } from "lucide-react";
import Link from "next/link";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function JourneySection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.learningJourney" />

      <Link
        href="/ai-lab/journey"
        className="group flex flex-col items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.02] py-16 text-center transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.05] dark:border-white/[0.06] dark:hover:border-emerald-500/25"
      >
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] transition-all duration-300 group-hover:border-emerald-500/40 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.1)] dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]">
          <Map className="size-6 text-emerald-500/60 transition-all duration-300 group-hover:text-emerald-500/80" />
        </div>
        <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-emerald-500">
          {t("aiLab.sections.learningJourney")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
          Follow a guided learning path through all MiniMind modules — from tokenization to inference, with progress tracking and concept mastery.
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-500/60 transition-all duration-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 dark:text-emerald-500/50 dark:group-hover:text-emerald-500/70">
          Start Learning Journey
          <ArrowRight className="size-3" />
        </span>
      </Link>
    </motion.section>
  );
}
