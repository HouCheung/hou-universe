"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { FileText, ArrowRight } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function BlogSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.blog" />

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/15 py-16 text-center dark:border-white/[0.05]">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-slate-500/[0.12] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]">
          <FileText className="size-6 text-slate-500/50 dark:text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {t("aiLab.comingSoon")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/80 dark:text-slate-500/70">
          {t("aiLab.comingSoonDesc")}
        </p>
        <Link
          href="/notes"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand/70 transition-colors duration-200 hover:text-brand dark:text-brand-light/70 dark:hover:text-brand-light"
        >
          {t("aiLab.readBlog")}
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </motion.section>
  );
}
