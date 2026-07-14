'use client';

import { motion, type Variants } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { TypeWriter } from './TypeWriter';

const ROLES = [
  '全栈开发者',
  'AI 创作者',
  '数据工程师',
];

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.25, delayChildren: 0.3 },
  },
};

const itemFadeIn: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: 'easeOut' as const },
  },
};

export function HeroContent() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="relative z-10 flex flex-col items-center justify-center px-4 text-center select-none"
    >
      {/* Micro label */}
      <motion.p
        variants={itemFadeIn}
        className="mb-3 font-mono text-xs tracking-[0.35em] text-slate-400/50 uppercase sm:text-sm"
      >
        你好，世界
      </motion.p>

      {/* Main title with gradient text */}
      <motion.h1
        variants={itemFadeIn}
        className="text-6xl font-black tracking-tight sm:text-7xl md:text-8xl lg:text-9xl"
      >
        <span className="text-gradient-primary">
          我是 HOU
        </span>
      </motion.h1>

      {/* Slogan line */}
      <motion.p
        variants={itemFadeIn}
        className="mt-4 font-mono text-sm tracking-[0.15em] text-slate-500 sm:text-base"
      >
        数据科学 × AI工程化 个人探索宇宙
      </motion.p>

      {/* Typewriter subtitle */}
      <motion.p
        variants={itemFadeIn}
        className="mt-5 text-lg font-light text-slate-400 sm:text-xl md:text-2xl"
      >
        <TypeWriter
          texts={ROLES}
          typeSpeed={80}
          deleteSpeed={40}
          pauseDuration={2000}
          startDelay={1200}
          className="font-mono"
        />
      </motion.p>

      {/* CTA buttons */}
      <motion.div
        variants={itemFadeIn}
        className="mt-12 flex flex-wrap items-center justify-center gap-4"
      >
        {/* Primary CTA — solid deep gray-blue */}
        <Link
          href="/projects"
          className="group inline-flex items-center gap-2.5 rounded-lg bg-[#1e293b] px-7 py-3.5 text-sm font-medium text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#334155] hover:shadow-md sm:px-9 sm:py-4 sm:text-base"
        >
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 sm:size-5" />
          查看项目
        </Link>

        {/* Secondary CTA — outline */}
        <Link
          href="/contact"
          className="group inline-flex items-center gap-2.5 rounded-lg border border-white/[0.12] bg-transparent px-7 py-3.5 text-sm font-medium text-slate-300 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-400/30 hover:bg-white/[0.05] hover:text-foreground sm:px-9 sm:py-4 sm:text-base"
        >
          <Mail className="size-4 sm:size-5" />
          联系我
        </Link>
      </motion.div>
    </motion.div>
  );
}
