"use client";

// ============================================================
// QuickNavigationCards — Studio quick navigation hub
// ============================================================
// Phase 64: 4-card navigation grid for key MiniMind Studio
// destinations with per-card color theming and hover effects.
//
// Features:
//   - 4 premium nav cards (Playground, Training, Experiments, Research)
//   - Per-card color accent (brand, emerald, amber, purple)
//   - Icon + label + description + arrow
//   - Glass card with glow-on-hover
//   - Responsive grid: 1 → 2 → 4 columns
//
// Data sourced exclusively through studioAdapter.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  Gamepad2,
  Cpu,
  FlaskConical,
  Microscope,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import {
  getQuickNavCards,
  type QuickNavCard,
} from "@/lib/ai-lab/adapters/studioAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Icon resolver (presentation logic, not business logic)
// ============================================================

const ICON_MAP: Record<QuickNavCard["icon"], React.ComponentType<{ className?: string }>> = {
  Gamepad2,
  Cpu,
  FlaskConical,
  Microscope,
  GraduationCap: Cpu, // fallback
};

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
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" },
  }),
};

// ============================================================
// QuickNavigationCards
// ============================================================

export function QuickNavigationCards() {
  const { t } = useTranslation();
  const cards = getQuickNavCards();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
    >
      {/* ── Section header ── */}
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] dark:border-brand/25 dark:bg-brand/[0.08]">
            <svg
              className="size-4 text-brand/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Quick Navigation
            </h2>
            <p className="text-xs text-slate-500/60 dark:text-slate-400/50">
              Jump to key MiniMind Studio tools
            </p>
          </div>
        </div>
      </div>

      {/* ── Card grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => {
          const CardIcon = ICON_MAP[card.icon];

          return (
            <motion.div
              key={card.key}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
            >
              <Link
                href={card.href}
                aria-label={t(card.labelKey)}
                className={cn(
                  "group flex flex-col items-center justify-center rounded-xl border bg-brand/[0.02] px-4 py-10 text-center transition-all duration-300",
                  "hover:scale-[1.03] hover:bg-brand/[0.05]",
                  card.colorBorder,
                  "dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:bg-[rgba(var(--brand-rgb),0.06)]",
                  "dark:border-white/[0.06]",
                  card.colorHoverBorder,
                  "dark:hover:border-white/[0.12]",
                  card.colorGlow
                )}
              >
                {/* Icon container */}
                <div
                  className={cn(
                    "mb-4 flex size-14 items-center justify-center rounded-full border bg-brand/[0.04] transition-all duration-300",
                    card.colorBorder,
                    card.colorHoverBorder,
                    card.colorGlow,
                    "dark:border-brand/20 dark:bg-brand/[0.06] dark:group-hover:border-brand/35"
                  )}
                >
                  <CardIcon
                    className={cn(
                      "size-6 transition-all duration-300 group-hover:scale-110",
                      card.colorText
                    )}
                  />
                </div>

                {/* Label */}
                <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                  {t(card.labelKey)}
                </h3>

                {/* Description */}
                <p className="mt-2 max-w-[14rem] text-xs leading-relaxed text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
                  {t(card.descriptionKey)}
                </p>

                {/* Arrow */}
                <div className="mt-4">
                  <ArrowRight className="size-3.5 text-slate-400/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
