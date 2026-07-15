'use client';

import { useTranslation } from 'react-i18next';
import { motion, type Variants } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { TypeWriter } from './TypeWriter';
import { useEntrance } from './EntranceSequence';

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
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');
  const { contentVisible } = useEntrance();

  const ROLES = [
    t('hero.role1'),
    t('hero.role2'),
    t('hero.role3'),
  ];

  return (
    <motion.div
      initial="hidden"
      animate={contentVisible ? "visible" : "hidden"}
      variants={staggerContainer}
      className="relative z-10 flex flex-col items-center justify-center px-4 text-center select-none"
    >
      {/* Micro label */}
      <motion.p
        variants={itemFadeIn}
        className="mb-3 font-mono text-xs tracking-[0.35em] text-slate-500/80 uppercase sm:text-sm dark:text-slate-400/50"
      >
        {t('hero.microLabel')}
      </motion.p>

      {/* Main title with gradient text */}
      <motion.h1
        variants={itemFadeIn}
        className="text-6xl font-black tracking-tight sm:text-7xl md:text-8xl lg:text-9xl"
      >
        <span className="text-gradient-primary">
          {isEn ? "I'm HOU" : "我是 HOU"}
        </span>
      </motion.h1>

      {/* Slogan line */}
      <motion.p
        variants={itemFadeIn}
        className="mt-4 font-mono text-sm tracking-[0.15em] text-slate-600 sm:text-base dark:text-slate-500"
      >
        {t('hero.slogan')}
      </motion.p>

      {/* Typewriter subtitle */}
      <motion.p
        variants={itemFadeIn}
        className="mt-5 text-lg font-light text-slate-600 sm:text-xl md:text-2xl dark:text-slate-400"
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
          className="group relative inline-flex items-center gap-2.5 rounded-[9px] border border-brand/20 dark:border-white/[0.08] bg-gradient-to-b from-brand to-brand-deep px-7 py-3.5 text-sm font-medium tracking-[0.01em] text-slate-900 dark:text-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(var(--brand-deep-rgb),0.2),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.18),inset_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-brand-deep dark:hover:from-brand-light dark:hover:to-brand hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_4px_20px_rgba(var(--brand-light-rgb),0.22),0_0_40px_rgba(var(--brand-light-rgb),0.06),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12),inset_1px_0_0_rgba(255,255,255,0.1)] active:translate-y-px active:shadow-[0_0px_2px_rgba(0,0,0,0.06)] dark:active:shadow-[0_1px_3px_rgba(var(--brand-deep-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-9 sm:py-4 sm:text-base"
        >
          {/* 顶部玻璃高光覆盖层 */}
          <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/[0.06] to-transparent transition-opacity duration-300 group-hover:from-white/[0.1] pointer-events-none" aria-hidden="true" />
          {/* 悬浮星芒闪效径向光晕 */}
          <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none" aria-hidden="true" />
          <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-0.5 sm:size-5" />
          {t('hero.cta1')}
        </Link>

        {/* Secondary CTA — 白天透明底深灰边框 / 星夜通透玻璃底 + 渐变半透明蓝边框 */}
        <Link
          href="/contact"
          className="group relative inline-flex items-center gap-2.5 rounded-[9px] border border-slate-300/40 bg-transparent px-7 py-3.5 text-sm font-normal tracking-[0.01em] text-slate-800 backdrop-blur-sm shadow-none transition-all duration-300 ease-out hover:-translate-y-px hover:border-slate-400/50 hover:bg-slate-100/60 hover:text-slate-900 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] active:translate-y-px active:shadow-none sm:px-9 sm:py-4 sm:text-base dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.06)] dark:text-slate-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.12)] dark:hover:text-foreground dark:hover:shadow-[inset_0_0_20px_rgba(var(--brand-rgb),0.06),inset_0_1px_0_rgba(255,255,255,0.06),0_4px_16px_rgba(var(--brand-rgb),0.06)] dark:active:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
        >
          {/* 内发光层（默认隐藏） */}
          <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,rgba(var(--brand-rgb),0.08)_0%,transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" aria-hidden="true" />
          <Mail className="size-4 sm:size-5" />
          {t('hero.cta2')}
        </Link>
      </motion.div>
    </motion.div>
  );
}
