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
          className="group fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-[9px] border border-white/[0.08] bg-gradient-to-b from-[#1e40af] to-[#1e3a8a] text-white shadow-[0_2px_8px_rgba(30,58,138,0.2),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.18),inset_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:from-[#2563eb] hover:to-[#1e40af] hover:shadow-[0_4px_20px_rgba(37,99,235,0.22),0_0_40px_rgba(37,99,235,0.06),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.12),inset_1px_0_0_rgba(255,255,255,0.1)] active:translate-y-px active:shadow-[0_1px_3px_rgba(30,58,138,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          {/* 顶部玻璃高光 */}
          <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/[0.06] to-transparent transition-opacity duration-300 group-hover:from-white/[0.1] pointer-events-none" aria-hidden="true" />
          {/* 星芒闪效 */}
          <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,transparent_70%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none" aria-hidden="true" />
          <ArrowUp size={18} strokeWidth={1.8} className="relative" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
