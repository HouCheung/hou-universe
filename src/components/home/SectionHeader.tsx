"use client";

import { motion, type Variants } from "framer-motion";

interface SectionHeaderProps {
  enTitle: string;
  zhTitle: string;
}

const headerVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export function SectionHeader({ enTitle, zhTitle }: SectionHeaderProps) {
  return (
    <motion.div
      className="mb-12 flex items-center gap-5 sm:mb-16"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={headerVariants}
    >
      {/* Vertical accent line */}
      <div className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 via-blue-500 to-purple-500" />

      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-blue-300/40 sm:text-xs">
          {enTitle}
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          {zhTitle}
        </h2>
      </div>
    </motion.div>
  );
}
