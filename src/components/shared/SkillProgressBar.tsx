"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import type { SkillCategoryWithLevel } from "@/types";

interface SkillProgressBarProps {
  categories: SkillCategoryWithLevel[];
}

function SkillBar({ name, percentage, index }: { name: string; percentage: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{name}</span>
        <motion.span
          className="font-mono text-xs tabular-nums text-blue-300/80"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.3 + index * 0.08 }}
        >
          {isInView ? (
            <CountUp target={percentage} duration={1.2} />
          ) : (
            "0%"
          )}
        </motion.span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-400"
          initial={{ width: 0 }}
          animate={isInView ? { width: `${percentage}%` } : { width: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: index * 0.08 }}
        />
      </div>
    </div>
  );
}

function CountUp({ target, duration }: { target: number; duration: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
    >
      <CountUpInner target={target} duration={duration} />
    </motion.span>
  );
}

function CountUpInner({ target, duration }: { target: number; duration: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  if (typeof window === "undefined") {
    return <span ref={ref}>{target}%</span>;
  }

  return (
    <motion.span
      ref={ref}
      onAnimationStart={() => {
        const el = ref.current;
        if (!el) return;
        let start: number | null = null;
        const animate = (timestamp: number) => {
          if (!start) start = timestamp;
          const elapsed = timestamp - start;
          const progress = Math.min(elapsed / (duration * 1000), 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(eased * target);
          el.textContent = `${current}%`;
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };
        requestAnimationFrame(animate);
      }}
    >
      {target}%
    </motion.span>
  );
}

export function SkillProgressBar({ categories }: SkillProgressBarProps) {
  return (
    <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
      {categories.map((category) => (
        <motion.div
          key={category.id}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-blue-400/30 hover:shadow-[0_0_20px_rgba(96,165,250,0.08)]"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="text-xl" role="img" aria-hidden="true">
              {category.icon}
            </span>
            <h3 className="text-base font-semibold text-foreground">
              {category.title}
            </h3>
          </div>
          <div className="space-y-4">
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
      ))}
    </div>
  );
}
