"use client";

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { User, Calendar } from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";
import type { GuestbookMessage } from "@/types";

/* ═══════════════════════════════════════════════════════════
   Glass-morphism message card wall
   ═══════════════════════════════════════════════════════════ */

interface StarWallProps {
  messages: GuestbookMessage[];
}

/* ── Staggered horizontal offset per card index ── */
function getCardOffset(index: number): string {
  // Alternating slight shifts for organic feel
  const offsets = [
    "sm:ml-0",
    "sm:ml-6",
    "sm:ml-2",
    "sm:ml-8",
    "sm:ml-1",
    "sm:ml-5",
  ];
  return offsets[index % offsets.length];
}

export function StarWall({ messages }: StarWallProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="relative w-full px-4 py-10 sm:px-8 sm:py-14">
      {/* Deep space / Clear sky background vignette */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: isDark
            ? "radial-gradient(ellipse_at_center,rgba(30,41,59,0.25) 0%,rgba(15,23,42,0.5) 60%,rgba(8,12,20,0.85) 100%)"
            : "radial-gradient(ellipse_at_center,rgba(240,247,255,0.6) 0%,rgba(248,250,252,0.3) 60%,rgba(241,245,249,0.15) 100%)",
        }}
      />

      {/* Ambient dust particles — only in dark mode */}
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 15% 25%, rgba(148,163,184,0.4) 0%, transparent 100%), radial-gradient(1px 1px at 72% 18%, rgba(148,163,184,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 38% 62%, rgba(226,232,240,0.35) 0%, transparent 100%), radial-gradient(1px 1px at 85% 55%, rgba(148,163,184,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 22% 78%, rgba(226,232,240,0.25) 0%, transparent 100%), radial-gradient(1.5px 1.5px at 55% 38%, rgba(148,163,184,0.35) 0%, transparent 100%), radial-gradient(1px 1px at 92% 80%, rgba(148,163,184,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 8% 45%, rgba(226,232,240,0.3) 0%, transparent 100%)",
          }}
        />
      )}

      {/* ── Message cards ── */}
      <div className="relative flex flex-col gap-5">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            className={`relative w-full max-w-lg ${getCardOffset(i)}`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: 0.5,
              delay: i * 0.08,
              ease: "easeOut",
            }}
          >
            {/* ── Glass-morphism card ── */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 p-5 backdrop-blur-md transition-shadow duration-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.04)] sm:p-6 dark:border-white/[0.06] dark:bg-slate-900/40 dark:hover:shadow-[0_0_30px_rgba(147,197,253,0.06)]">
              {/* Blue micro-glow border — top edge accent */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent dark:via-blue-400/20" />

              {/* Mini star decoration — only in dark mode */}
              {isDark && (
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-0.5 opacity-30" aria-hidden="true">
                  <span className="relative flex h-3 w-3 items-center justify-center">
                    <span className="absolute h-3 w-px rotate-0 rounded-full bg-blue-300/50" />
                    <span className="absolute h-px w-3 rotate-0 rounded-full bg-blue-300/50" />
                  </span>
                </div>
              )}

              {/* ── Card header: nickname + date ── */}
              <div className="mb-3 flex items-center gap-3">
                {/* Avatar */}
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-300/30 to-slate-200/10 ring-1 ring-slate-200/60 dark:from-slate-400/12 dark:to-slate-400/4 dark:ring-white/[0.05]" />
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(148,163,184,0.12)_0%,transparent_60%)]" />
                  <User className="relative h-3.5 w-3.5 text-slate-600/80 dark:text-slate-300/60" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {msg.nickname}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-500" />
                    <p className="text-xs text-slate-600 dark:text-slate-400">{msg.date}</p>
                  </div>
                </div>
              </div>

              {/* ── Divider ── */}
              <div className="mb-3 h-px bg-gradient-to-r from-slate-300/50 via-slate-200/30 to-transparent dark:from-white/[0.05] dark:via-white/[0.03]" />

              {/* ── Message content — fully visible, no click needed ── */}
              <p className="text-sm leading-relaxed text-slate-700/85 dark:text-slate-300/85">
                {msg.content}
              </p>

              {/* Bottom-right subtle sparkle */}
              <span
                className="pointer-events-none absolute right-3 bottom-2 select-none text-base opacity-[0.03]"
                aria-hidden="true"
              >
                &#10022;
              </span>
            </div>
          </motion.div>
        ))}

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="relative flex items-center justify-center py-16">
            <p className="text-sm text-slate-500">
              {t("guestbook.emptyState")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
