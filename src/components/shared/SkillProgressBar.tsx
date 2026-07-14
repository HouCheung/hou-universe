"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Code2, Database, Settings, Bot } from "lucide-react";
import type { SkillCategoryWithLevel } from "@/types";

interface SkillProgressBarProps {
  categories: SkillCategoryWithLevel[];
}

/* ── Category → lucide icon mapping ── */
const CATEGORY_ICON_MAP: Record<string, typeof Code2> = {
  programming: Code2,
  database: Database,
  core: Settings,
  ai: Bot,
};

function getCategoryIcon(id: string) {
  return CATEGORY_ICON_MAP[id] ?? Settings;
}

/* ── Animated count-up hook ── */
function useCountUp(target: number, isInView: boolean, duration: number = 1.4) {
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isInView || startedRef.current) return;
    startedRef.current = true;

    let raf: number;
    let start: number | null = null;
    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, isInView, duration]);

  return display;
}

/* ── Single skill bar ── */
function SkillBar({
  name,
  percentage,
  index,
}: {
  name: string;
  percentage: number;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const displayValue = useCountUp(percentage, isInView);

  return (
    <div ref={ref} className="space-y-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/80">
          {name}
        </span>
        <motion.span
          className="font-mono text-sm font-medium tabular-nums text-blue-300"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.25 + index * 0.08 }}
        >
          {isInView ? `${displayValue}%` : "0%"}
        </motion.span>
      </div>

      {/* Progress track */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.03]">
        {/* Fill bar */}
        <motion.div
          className="relative h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #3b82f6 0%, #6366f1 40%, #8b5cf6 100%)",
          }}
          initial={{ width: 0 }}
          animate={isInView ? { width: `${percentage}%` } : { width: 0 }}
          transition={{
            duration: 1.4,
            ease: [0.25, 0.46, 0.45, 0.94],
            delay: index * 0.1,
          }}
        >
          {/* Nebula glow overlay */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(167,139,250,0.3) 50%, rgba(255,255,255,0.15) 100%)",
              filter: "blur(1px)",
            }}
          />

          {/* Planet endpoint dot */}
          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2"
            initial={{ opacity: 0, scale: 0 }}
            animate={
              isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }
            }
            transition={{
              duration: 0.4,
              ease: "easeOut",
              delay: 0.6 + index * 0.1,
            }}
          >
            {/* Outer glow ring */}
            <div className="absolute -inset-1.5 rounded-full bg-blue-400/20 blur-[3px]" />
            {/* Core dot */}
            <div className="relative h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(147,197,253,0.8)]" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export function SkillProgressBar({ categories }: SkillProgressBarProps) {
  return (
    <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
      {categories.map((category) => {
        const Icon = getCategoryIcon(category.id);

        return (
          <motion.div
            key={category.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="glass-card-hover group/skill-cat flex flex-col gap-5 rounded-2xl p-6 sm:p-7"
          >
            {/* Category header with vertical gradient line */}
            <div className="flex items-center gap-3.5">
              {/* Vertical gradient accent line */}
              <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-blue-400 via-indigo-400 to-purple-500" />

              {/* Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04] text-blue-300 transition-colors duration-300 group-hover/skill-cat:border-blue-400/30 group-hover/skill-cat:bg-blue-400/8">
                <Icon size={18} strokeWidth={1.8} />
              </div>

              {/* Title */}
              <h3 className="text-base font-semibold text-foreground transition-colors duration-300 group-hover/skill-cat:text-blue-100">
                {category.title}
              </h3>

              {/* Skill count badge */}
              <span className="ml-auto rounded-full bg-blue-400/10 px-2.5 py-0.5 text-xs font-medium text-blue-300/70">
                {category.skills.length}
              </span>
            </div>

            {/* Skills list */}
            <div className="space-y-5">
              {category.skills.map((skill, i) => (
                <SkillBar
                  key={skill.name}
                  name={skill.name}
                  percentage={skill.percentage}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
