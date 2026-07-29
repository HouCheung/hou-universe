"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Type, Grid3X3, Cpu } from "lucide-react";

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.5, ease: "easeOut" },
  }),
};

// ============================================================
// Card definitions — lightweight config, content from i18n
// ============================================================

const ARCH_CARDS = [
  {
    id: "tokenizer",
    icon: Type,
    titleKey: "minimind.experience.architecture.tokenizer.title",
    descKey: "minimind.experience.architecture.tokenizer.description",
  },
  {
    id: "embedding",
    icon: Grid3X3,
    titleKey: "minimind.experience.architecture.embedding.title",
    descKey: "minimind.experience.architecture.embedding.description",
  },
  {
    id: "transformer",
    icon: Cpu,
    titleKey: "minimind.experience.architecture.transformer.title",
    descKey: "minimind.experience.architecture.transformer.description",
  },
] as const;

// ============================================================
// ArchitectureOverview
// ============================================================

export function ArchitectureOverview() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
    >
      {/* Section header */}
      <div className="mb-10 flex items-center gap-5 sm:mb-14">
        <div className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {t("minimind.experience.sectionTitles.architecture")}
          </h2>
        </div>
      </div>

      {/* Subtitle */}
      <p className="-mt-6 mb-8 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
        {t("minimind.experience.architecture.description")}
      </p>

      {/* Cards grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ARCH_CARDS.map((card, i) => {
          const Icon = card.icon;

          return (
            <motion.div
              key={card.id}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
              className="group relative rounded-2xl border border-brand/15 bg-brand/[0.03] px-6 py-7 backdrop-blur-sm transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.06] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-brand/30 dark:hover:bg-[rgba(var(--brand-rgb),0.07)]"
            >
              {/* Glow accent */}
              <span
                className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                aria-hidden="true"
              />

              {/* Icon */}
              <div className="mb-4 flex size-10 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] transition-colors group-hover:border-brand/35 group-hover:bg-brand/[0.1]">
                <Icon className="size-5 text-brand/80 transition-colors group-hover:text-brand" />
              </div>

              {/* Title */}
              <h3 className="mb-3 text-base font-bold tracking-tight text-foreground">
                {t(card.titleKey)}
              </h3>

              {/* Description */}
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {t(card.descKey)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
