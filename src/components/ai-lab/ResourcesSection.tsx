"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { BookOpen, ExternalLink } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const placeholderResources = [
  { labelKey: "roadmap.nodes.tokenizer.title", descKey: "roadmap.nodes.tokenizer.description" },
  { labelKey: "roadmap.nodes.attention.title", descKey: "roadmap.nodes.attention.description" },
  { labelKey: "roadmap.nodes.transformer.title", descKey: "roadmap.nodes.transformer.description" },
];

export function ResourcesSection() {
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {placeholderResources.map((res, i) => (
          <motion.div
            key={res.labelKey}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="group relative rounded-xl border border-slate-500/[0.1] bg-transparent px-5 py-5 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.03] dark:border-white/[0.04] dark:hover:border-white/[0.08] dark:hover:bg-white/[0.02]"
          >
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 size-5 shrink-0 text-slate-400 dark:text-slate-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {t(res.labelKey)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500/80 dark:text-slate-500/70 line-clamp-2">
                  {t(res.descKey)}
                </p>
              </div>
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-slate-400/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
