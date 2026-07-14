'use client';

import { motion, type Variants } from 'framer-motion';
import { TypeWriter } from './TypeWriter';

const ROLES = [
  'Big Data Developer',
  'AI Creator',
  'Full-Stack Builder',
  'Lifelong Learner',
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
        Hello World
      </motion.p>

      <motion.h1
        variants={itemFadeIn}
        className="text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl lg:text-8xl"
      >
        Welcome.
      </motion.h1>

      <motion.p
        variants={itemFadeIn}
        className="mt-4 text-2xl font-light text-blue-100/80 sm:text-3xl md:text-4xl"
      >
        I&apos;m HOU.
      </motion.p>

      <motion.p
        variants={itemFadeIn}
        className="mt-4 text-lg text-blue-200/60 sm:text-xl md:text-2xl"
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
    </motion.div>
  );
}
