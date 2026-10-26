"use client";

// ============================================================
// LabCard — Individual "Explore MiniMind" card
// ============================================================
// Phase 69: Understated glass card linking to a lab section.
// Shows icon, title, and one-line description with subtle
// hover lift effect.
// ============================================================

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, type LucideIcon } from "lucide-react";

// ============================================================
// LabCard
// ============================================================

interface LabCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  index: number;
  /** Phase 73: Live data badge shown below description */
  liveBadge?: string;
}

export function LabCard({
  icon: Icon,
  title,
  description,
  href,
  index,
  liveBadge,
}: LabCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
    >
      <Link
        href={href}
        className="group relative flex flex-col gap-3 rounded-2xl border border-brand/[0.06] bg-brand/[0.015] px-5 py-5 transition-all duration-300 hover:border-brand/12 hover:bg-brand/[0.04] hover:shadow-[0_4px_24px_rgba(var(--brand-rgb),0.05)] dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:border-brand/20 dark:hover:bg-brand/[0.04]"
      >
        {/* Icon */}
        <div className="flex size-9 items-center justify-center rounded-xl border border-brand/[0.06] bg-brand/[0.03] transition-colors duration-300 group-hover:border-brand/15 group-hover:bg-brand/[0.08] dark:border-white/[0.04] dark:bg-white/[0.02] dark:group-hover:border-brand/20">
          <Icon className="size-4 text-brand/50 transition-colors duration-300 group-hover:text-brand/80" />
        </div>

        {/* Text */}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground/85 transition-colors duration-300 group-hover:text-foreground">
            {title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500/70 dark:text-slate-400/50">
            {description}
          </p>
          {liveBadge && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/[0.06] px-2 py-0.5 font-mono text-[0.6rem] text-emerald-600/80 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06] dark:text-emerald-400/70">
              {liveBadge}
            </span>
          )}
        </div>

        {/* Arrow (visible on hover) */}
        <ArrowRight className="absolute right-4 top-4 size-3.5 text-brand/30 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}
