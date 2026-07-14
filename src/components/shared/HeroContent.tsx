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
    transition: { staggerChildren: 0.3, delayChildren: 0.2 },
  },
};

const itemFadeIn: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: 'easeOut' as const },
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
      <motion.p
        variants={itemFadeIn}
        className="mb-2 font-mono text-sm tracking-[0.3em] text-blue-300/70 uppercase sm:text-base"
      >
        你好，世界
      </motion.p>

      <motion.h1
        variants={itemFadeIn}
        className="text-6xl font-extrabold tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl"
      >
        我是 HOU
      </motion.h1>

      <motion.p
        variants={itemFadeIn}
        className="mt-4 text-lg font-light text-blue-100/80 sm:text-xl md:text-2xl"
      >
        专注于全栈开发与 AI 应用的个人宇宙
      </motion.p>

      <motion.p
        variants={itemFadeIn}
        className="mt-6 text-lg text-blue-200/60 sm:text-xl md:text-2xl"
      >
        <TypeWriter
          texts={ROLES}
          typeSpeed={80}
          deleteSpeed={40}
          pauseDuration={2000}
          startDelay={900}
          className="font-mono"
        />
      </motion.p>

      <motion.div
        variants={itemFadeIn}
        className="mt-10 flex flex-wrap items-center justify-center gap-4"
      >
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:bg-blue-400 hover:shadow-blue-400/30 hover:-translate-y-0.5 sm:px-8 sm:py-3.5 sm:text-base"
        >
          <ArrowRight className="size-4 sm:size-5" />
          查看项目
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-transparent px-6 py-3 text-sm font-semibold text-blue-100 transition-all duration-300 hover:border-blue-300/50 hover:bg-blue-400/10 hover:-translate-y-0.5 sm:px-8 sm:py-3.5 sm:text-base"
        >
          <Mail className="size-4 sm:size-5" />
          联系我
        </Link>
      </motion.div>
    </motion.div>
  );
}
