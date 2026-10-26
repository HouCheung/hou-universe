"use client";

// ============================================================
// ExplorationLinks — secondary navigation hub (Phase 70)
// ============================================================
//
// Lower visual hierarchy than primary learning modules.
// Compact cards for: Roadmap, GitHub, Resources, Blog.
//
// These do NOT compete with the main CTAs.
//
// Adapter source: src/lib/ai-lab/adapters/moduleLinks.ts
// Zero direct registry imports.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Map, Github, BookOpen, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { cn } from "@/lib/utils";

// ============================================================
// Secondary link config
// ============================================================

interface ExploreLink {
  key: string;
  icon: LucideIcon;
  href: string;
  i18nLabel: string;
  i18nDesc: string;
}

const EXPLORE_LINKS: ExploreLink[] = [
  {
    key: "model",
    icon: Map,
    href: "/ai-lab/lab/model",
    i18nLabel: "aiLab.chat.lab.model.title",
    i18nDesc: "aiLab.chat.lab.model.description",
  },
  {
    key: "architecture",
    icon: Github,
    href: "/ai-lab/lab/architecture",
    i18nLabel: "aiLab.chat.lab.architecture.title",
    i18nDesc: "aiLab.chat.lab.architecture.description",
  },
  {
    key: "training",
    icon: BookOpen,
    href: "/ai-lab/lab/training",
    i18nLabel: "aiLab.chat.lab.training.title",
    i18nDesc: "aiLab.chat.lab.training.description",
  },
  {
    key: "knowledge",
    icon: FileText,
    href: "/ai-lab/knowledge",
    i18nLabel: "aiLab.nav.knowledge",
    i18nDesc: "aiLab.chat.lab.experiments.description",
  },
];

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const linkVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.06, ease: "easeOut" },
  }),
};

// ============================================================
// ExplorationLinks
// ============================================================

export function ExplorationLinks() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.resources" />

      {/* Compact horizontal row — lower visual weight */}
      <div className="flex flex-wrap justify-center gap-3">
        {EXPLORE_LINKS.map((link, i) => (
          <motion.div
            key={link.key}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={linkVariants}
          >
            <Link
              href={link.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-full border border-brand/5 bg-brand/[0.015] px-4 py-2 text-xs transition-all duration-300",
                "hover:border-brand/15 hover:bg-brand/[0.04]",
                "dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"
              )}
            >
              <link.icon className="size-3.5 text-slate-400/60 transition-colors group-hover:text-brand/60 dark:text-slate-500/60 dark:group-hover:text-brand/50" />
              <span className="font-medium text-slate-500/70 transition-colors group-hover:text-slate-700 dark:text-slate-400/60 dark:group-hover:text-slate-300">
                {t(link.i18nLabel)}
              </span>
              <ArrowRight className="size-3 text-slate-400/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/50" />
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
