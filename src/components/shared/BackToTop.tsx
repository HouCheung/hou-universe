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
          className="fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-[#2563eb]/20 bg-[rgba(15,15,25,0.75)] text-slate-400 shadow-lg backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#2563eb]/35 hover:bg-[rgba(37,99,235,0.12)] hover:text-slate-200 hover:shadow-[0_0_24px_rgba(37,99,235,0.15)]"
        >
          <ArrowUp size={18} strokeWidth={1.8} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
