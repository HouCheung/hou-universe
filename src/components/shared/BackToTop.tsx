"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  const handleScroll = useCallback(() => {
    setVisible(window.scrollY > window.innerHeight);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          onClick={scrollToTop}
          aria-label="回到顶部"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-[rgba(15,15,25,0.7)] text-slate-400 shadow-lg backdrop-blur-xl transition-all duration-200 ease-out hover:-translate-y-1 hover:border-slate-400/30 hover:bg-[rgba(30,30,50,0.8)] hover:text-slate-200 hover:shadow-[0_0_20px_rgba(100,116,139,0.15)]"
        >
          <ArrowUp size={18} strokeWidth={1.8} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
