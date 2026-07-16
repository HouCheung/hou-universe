"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";

interface SectionHeaderProps {
  titleKey: string;
}

const headerVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export function SectionHeader({ titleKey }: SectionHeaderProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const enTitle = isZh ? i18n.getFixedT("en")(titleKey) : undefined;

  return (
    <motion.div
      className="mb-12 flex items-center gap-5 sm:mb-16"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={headerVariants}
    >
      {/* Vertical accent line — muted slate */}
      <div className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />

      <div className="flex flex-col gap-0.5">
        {enTitle && (
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-slate-500/70 sm:text-xs dark:text-slate-400/40">
            {enTitle}
          </span>
        )}
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          {t(titleKey)}
        </h2>
      </div>
    </motion.div>
  );
}
