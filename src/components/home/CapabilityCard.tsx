"use client";

import { motion, type Variants } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface CapabilityCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  index: number;
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
      delay: i * 0.12,
    },
  }),
};

export function CapabilityCard({
  icon: Icon,
  title,
  description,
  index,
}: CapabilityCardProps) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={cardVariants}
      className="group/cap glass-card-hover flex flex-col items-start gap-5 rounded-2xl p-6 sm:p-8"
    >
      {/* Icon container */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] transition-colors duration-300 group-hover/cap:border-[#2563eb]/25 group-hover/cap:bg-[#2563eb]/8">
        <Icon
          size={22}
          strokeWidth={1.5}
          className="text-slate-400 transition-colors duration-300 group-hover/cap:text-[#60a5fa]"
        />
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover/cap:text-slate-200">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </motion.div>
  );
}
