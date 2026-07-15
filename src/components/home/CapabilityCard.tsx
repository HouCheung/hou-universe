"use client";

import { motion, type Variants } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { TiltCard } from "@/components/shared/TiltCard";

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
      delay: i * 0.05,
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
    >
      <TiltCard
        className="group/cap glass-card flex flex-col items-start gap-5 rounded-2xl p-6 sm:p-8 transition-all duration-300 ease-out hover:bg-slate-100/80 hover:border-brand/20 hover:shadow-[0_2px_12px_rgba(var(--brand-rgb),0.06)] dark:hover:bg-white/[0.06] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(var(--brand-rgb),0.08),0_0_60px_rgba(var(--brand-rgb),0.03)]"
        intensity={0.05}
        glare={0.04}
      >
        {/* Icon container */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300/30 bg-slate-200/40 transition-colors duration-300 group-hover/cap:border-brand/25 group-hover/cap:bg-brand/8 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <Icon
            size={22}
            strokeWidth={1.5}
            className="text-slate-500 transition-colors duration-300 group-hover/cap:text-brand dark:text-slate-400 dark:group-hover/cap:text-[#93bbf0]"
          />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover/cap:text-brand dark:group-hover/cap:text-slate-200">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </TiltCard>
    </motion.div>
  );
}
