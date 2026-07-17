"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const lastVisibleRef = useRef(false);

  // Throttled via rAF to avoid triggering React re-renders on every scroll pixel
  const handleScroll = useCallback(() => {
    const isVisible = window.scrollY > window.innerHeight;
    // Only update state when crossing the threshold — avoids unnecessary re-renders
    if (isVisible !== lastVisibleRef.current) {
      lastVisibleRef.current = isVisible;
      setVisible(isVisible);
    }
  }, []);

  useEffect(() => {
    let rafId: number | null = null;

    const onScroll = () => {
      if (rafId !== null) return; // already queued
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handleScroll();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    handleScroll(); // set initial state
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [handleScroll]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          onClick={scrollToTop}
          aria-label={t("backToTop")}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="group fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-[9px] border border-brand/20 bg-brand text-slate-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] active:translate-y-px active:shadow-[0_0px_2px_rgba(0,0,0,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-white dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-brand dark:to-brand-deep dark:shadow-[0_2px_8px_rgba(var(--brand-deep-rgb),0.2),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.18),inset_1px_0_0_rgba(255,255,255,0.06)] dark:hover:from-brand-light dark:hover:to-brand dark:hover:shadow-[0_4px_20px_rgba(var(--brand-light-rgb),0.22),0_0_40px_rgba(var(--brand-light-rgb),0.06),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12),inset_1px_0_0_rgba(255,255,255,0.1)] dark:active:shadow-[0_1px_3px_rgba(var(--brand-deep-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/[0.06] to-transparent transition-opacity duration-300 group-hover:from-white/[0.1] pointer-events-none" aria-hidden="true" />
          <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none" aria-hidden="true" />
          <ArrowUp size={18} strokeWidth={1.8} className="relative" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
