'use client';

import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { SkillCategory } from '@/types';
import { cn } from '@/lib/utils';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const categoryVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

interface SkillTreeProps {
  categories: SkillCategory[];
}

export function SkillTree({ categories }: SkillTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(categories.map((c) => c.id))
  );

  const toggleCategory = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isExpanded = (id: string) => expanded.has(id);

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={containerVariants}
      className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2"
    >
      {categories.map((category) => (
        <motion.div
          key={category.id}
          variants={categoryVariants}
          className="glass-card-hover overflow-hidden rounded-2xl"
        >
          {/* Category header */}
          <button
            type="button"
            onClick={() => toggleCategory(category.id)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-blue-400/5 sm:px-6"
            aria-expanded={isExpanded(category.id)}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl" role="img" aria-hidden="true">
                {category.icon}
              </span>
              <h3 className="text-lg font-semibold text-foreground">
                {category.title}
              </h3>
              <span className="rounded-full bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-300/80">
                {category.skills.length}
              </span>
            </div>
            <motion.span
              animate={{ rotate: isExpanded(category.id) ? 180 : 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="text-muted-foreground"
            >
              <ChevronDown className="h-5 w-5" />
            </motion.span>
          </button>

          {/* Skills list */}
          <AnimatePresence initial={false}>
            {isExpanded(category.id) && (
              <motion.div
                key="skills"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="border-t border-border/40 px-5 pb-4 pt-3 sm:px-6">
                  <div className="flex flex-wrap gap-2.5">
                    {category.skills.map((skill) => (
                      <span
                        key={skill.name}
                        className={cn(
                          'group/skill inline-flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-1.5 text-sm transition-all duration-200',
                          'hover:border-blue-400/40 hover:bg-blue-400/8 hover:shadow-[0_0_12px_rgba(96,165,250,0.10)]'
                        )}
                      >
                        <span className="text-foreground transition-colors group-hover/skill:text-blue-200">
                          {skill.name}
                        </span>
                        <span className="rounded-full bg-blue-400/10 px-2 py-px text-xs font-medium text-blue-300/70 transition-colors group-hover/skill:text-blue-300">
                          {skill.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </motion.div>
  );
}
