'use client';

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface ScrollIndicatorProps {
  targetId: string;
}

export function ScrollIndicator({ targetId }: ScrollIndicatorProps) {
  const { t } = useTranslation();

  const handleClick = () => {
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      aria-label={t('hero.scrollDown')}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 cursor-pointer text-slate-500/70 transition-colors duration-300 hover:text-slate-700/90 dark:text-slate-500/60 dark:hover:text-slate-300/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.8, duration: 0.6 }}
    >
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <ChevronDown size={28} strokeWidth={1.5} />
      </motion.div>
    </motion.button>
  );
}
