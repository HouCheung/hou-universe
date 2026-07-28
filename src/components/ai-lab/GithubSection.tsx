"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { Github, ExternalLink, Star, GitFork } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function GithubSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.github" />

      <Link
        href="https://github.com"
        target="_blank"
        rel="noopener noreferrer"
        className="group mx-auto block max-w-lg rounded-xl border border-slate-500/[0.1] bg-slate-500/[0.02] px-6 py-7 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.03] dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:border-white/[0.08] dark:hover:bg-[rgba(var(--brand-rgb),0.04)]"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Github className="size-6 text-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                MiniMind
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                A small language model built from scratch
              </p>
            </div>
          </div>
          <ExternalLink className="size-4 text-slate-400/50 transition-all duration-200 group-hover:text-brand/60 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>

        <div className="mt-5 flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <Star className="size-3.5 text-slate-400/70" />
            <span className="text-xs tabular-nums text-slate-500">—</span>
          </div>
          <div className="flex items-center gap-1.5">
            <GitFork className="size-3.5 text-slate-400/70" />
            <span className="text-xs tabular-nums text-slate-500">—</span>
          </div>
          <span className="ml-auto text-xs text-brand/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {t("aiLab.viewOnGithub")} →
          </span>
        </div>
      </Link>
    </motion.section>
  );
}
