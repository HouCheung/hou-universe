"use client";

import { motion, type Variants } from "framer-motion";
import type { UpdateLogEntry } from "@/types";

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut",
      delay: i * 0.1,
    },
  }),
};

interface UpdateLogTimelineProps {
  entries: UpdateLogEntry[];
}

export function UpdateLogTimeline({ entries }: UpdateLogTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">暂无更新日志。</p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-0 h-full w-px bg-border sm:left-[15px]" />

      <div className="flex flex-col gap-8">
        {entries.map((entry, index) => (
          <motion.div
            key={entry.version}
            custom={index}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={itemVariants}
            className="relative flex gap-4 pl-8 sm:gap-6 sm:pl-12"
          >
            {/* Node dot */}
            <div className="absolute left-[7px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-blue-400 bg-background ring-4 ring-background sm:left-[11px]" />

            {/* Content */}
            <div className="flex-1 rounded-lg border border-border/50 bg-card/60 p-4 backdrop-blur-sm transition-all duration-300 hover:border-blue-400/25 hover:bg-card sm:p-5">
              <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2">
                <span className="rounded-full bg-blue-400/10 px-2.5 py-0.5 font-mono text-xs font-medium text-blue-300/90">
                  {entry.version}
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.date}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {entry.changes.map((change, ci) => (
                  <li
                    key={ci}
                    className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-[0.35em] block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400/40" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
