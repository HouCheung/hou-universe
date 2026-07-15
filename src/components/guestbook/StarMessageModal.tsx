"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Sparkles, Calendar } from "lucide-react";
import type { GuestbookMessage } from "@/types";

interface StarMessageModalProps {
  message: GuestbookMessage | null;
  onClose: () => void;
}

export function StarMessageModal({ message, onClose }: StarMessageModalProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (message) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (message) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [message, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Card — full glass-morphism + cosmic theme */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Message from ${message.nickname}`}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-[0_0_40px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:p-7 dark:border-white/[0.08] dark:bg-[#0d0d18]/90 dark:shadow-[0_0_60px_rgba(148,163,184,0.06)]"
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            {/* Decorative top accent */}
            <div className="pointer-events-none absolute -top-px left-1/2 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-slate-400/20 to-transparent" />

            {/* Sparkle decoration */}
            <Sparkles className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-slate-400/20 dark:text-slate-400/10" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-300/30 bg-slate-100/50 text-slate-700 transition-all hover:border-slate-400/40 hover:bg-slate-200/60 hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-400 dark:hover:border-white/[0.12] dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
              aria-label="Close message"
            >
              <X className="h-4 w-4" />
            </button>

            {/* User info */}
            <div className="mb-5 flex items-center gap-3.5">
              {/* Avatar with glow */}
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-400/15 to-slate-400/5 ring-1 ring-white/[0.06]" />
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(148,163,184,0.15)_0%,transparent_60%)]" />
                <User className="relative h-4 w-4 text-slate-500/70 dark:text-slate-300/70" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-foreground">
                  {message.nickname}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                  <p className="text-xs text-slate-400 dark:text-slate-500">{message.date}</p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="mb-4 h-px bg-gradient-to-r from-slate-400/15 via-slate-400/8 to-transparent" />

            {/* Message content */}
            <p className="text-sm leading-relaxed text-slate-600/90 dark:text-slate-300/90">
              {message.content}
            </p>

            {/* Bottom star decoration */}
            <div className="pointer-events-none absolute right-4 bottom-3 text-2xl opacity-[0.04]">
              &#10022;
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
