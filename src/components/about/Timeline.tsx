'use client';

import { useRef } from 'react';
import { motion, useScroll, type Variants } from 'framer-motion';
import type { TimelineItem } from '@/types';
import { cn } from '@/lib/utils';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: 'easeOut',
      delay: i * 0.12,
    },
  }),
};

interface TimelineProps {
  items: TimelineItem[];
}

export function Timeline({ items }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.85', 'end 0.25'],
  });

  return (
    <div ref={containerRef} className="relative mx-auto max-w-3xl">
      {/* Animated vertical line */}
      <div className="absolute left-4 top-0 h-full w-px bg-border sm:left-1/2 sm:-translate-x-px">
        <motion.div
          className="h-full w-full origin-top bg-slate-400/60"
          style={{ scaleY: scrollYProgress, originY: 0 }}
        />
      </div>

      <div className="flex flex-col gap-10 sm:gap-14">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            custom={index}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={cardVariants}
            className={cn(
              'relative flex flex-col pl-12 sm:pl-0',
              index % 2 === 0 ? 'sm:pr-[calc(50%+2rem)] sm:text-right' : 'sm:pl-[calc(50%+2rem)] sm:text-left'
            )}
          >
            {/* Node dot */}
            <div
              className={cn(
                'absolute left-[13.5px] top-1 z-10 h-3.5 w-3.5 rounded-full border-2 border-slate-400 bg-background ring-4 ring-background sm:left-1/2 sm:-translate-x-1/2',
                'group-hover:bg-slate-400 transition-colors duration-300'
              )}
            />

            {/* Content card */}
            <div className="group rounded-xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm transition-all duration-300 hover:border-slate-400/30 hover:bg-card hover:shadow-[0_0_20px_rgba(100,116,139,0.08)] sm:p-6">
              <span className="inline-block rounded-full bg-slate-400/10 px-3 py-0.5 font-mono text-xs font-medium text-slate-300/90">
                {item.year}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
