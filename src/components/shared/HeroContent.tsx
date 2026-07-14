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

      {/* CTA buttons — 全站统一深蓝按钮规范 */}
      <motion.div
        variants={itemFadeIn}
        className="mt-12 flex flex-wrap items-center justify-center gap-4"
      >
        {/* Primary CTA — 低饱和深靛蓝微渐变 + 立体光影 + 星芒闪效 */}
        <Link
          href="/projects"
          className="group relative inline-flex items-center gap-2.5 rounded-[9px] border border-white/[0.08] bg-gradient-to-b from-[#1e40af] to-[#1e3a8a] px-7 py-3.5 text-sm font-medium tracking-[0.01em] text-white shadow-[0_2px_8px_rgba(30,58,138,0.2),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.18),inset_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:from-[#2563eb] hover:to-[#1e40af] hover:shadow-[0_4px_20px_rgba(37,99,235,0.22),0_0_40px_rgba(37,99,235,0.06),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12),inset_1px_0_0_rgba(255,255,255,0.1)] active:translate-y-px active:shadow-[0_1px_3px_rgba(30,58,138,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-9 sm:py-4 sm:text-base"
        >
          {/* 顶部玻璃高光覆盖层 */}
          <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/[0.06] to-transparent transition-opacity duration-300 group-hover:from-white/[0.1] pointer-events-none" aria-hidden="true" />
          {/* 悬浮星芒闪效径向光晕 */}
          <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none" aria-hidden="true" />
          <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-0.5 sm:size-5" />
          查看项目
        </Link>

        {/* Secondary CTA — 通透玻璃底 + 渐变半透明蓝边框 */}
        <Link
          href="/contact"
          className="group relative inline-flex items-center gap-2.5 rounded-[9px] border border-white/[0.06] bg-[rgba(30,64,175,0.06)] px-7 py-3.5 text-sm font-normal tracking-[0.01em] text-slate-300 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-out hover:-translate-y-px hover:border-white/[0.12] hover:bg-[rgba(30,64,175,0.12)] hover:text-foreground hover:shadow-[inset_0_0_20px_rgba(30,64,175,0.06),inset_0_1px_0_rgba(255,255,255,0.06),0_4px_16px_rgba(30,64,175,0.06)] active:translate-y-px active:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-9 sm:py-4 sm:text-base"
        >
          {/* 内发光层（默认隐藏） */}
          <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,rgba(30,64,175,0.08)_0%,transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" aria-hidden="true" />
          <Mail className="size-4 sm:size-5" />
          联系我
        </Link>
      </motion.div>
    </motion.div>
  );
}
