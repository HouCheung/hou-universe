"use client";

// ============================================================
// FloatingNavDock — responsive glass navigation dock
// ============================================================
//
// Injected into ai-lab/layout.tsx to provide persistent
// cross-navigation across all AI Lab sub-pages without
// modifying any individual page file.
//
// Behavior:
//   - Hidden on /ai-lab dashboard (AI_LAB_DOCK_ROUTES only)
//   - Desktop (sm:): fixed top, centered, backdrop-blur,
//     auto-hides on scroll-down, reappears on scroll-up
//   - Mobile: fixed bottom, always visible, icon-only
//   - Active route has brand-color spring-animated pill
//   - Nav items sourced from nav-config.ts (single truth)
// ============================================================

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Home,
  Map,
  Brain,
  Layers,
  FlaskConical,
  Gamepad2,
  type LucideIcon,
} from "lucide-react";
import { AI_LAB_NAV_ITEMS, AI_LAB_DOCK_ROUTES, type NavItem } from "./nav-config";

// ============================================================
// Icon map (icon name string → LucideIcon component)
// ============================================================

const ICON_MAP: Record<NavItem["icon"], LucideIcon> = {
  Home,
  Map,
  Brain,
  Layers,
  FlaskConical,
  Gamepad2,
};

// ============================================================
// FloatingNavDock
// ============================================================

export function FloatingNavDock() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  // ── Desktop auto-hide on scroll-down, show on scroll-up ──
  // Mobile: always visible (scroll callback is a no-op below 640px)
  useMotionValueEvent(
    scrollY,
    "change",
    useCallback(
      (latest: number) => {
        // Only auto-hide on desktop viewports; mobile dock stays fixed
        if (typeof window !== "undefined" && window.innerWidth < 640) return;
        const prev = (scrollY.getPrevious() as number) ?? 0;
        if (latest > prev && latest > 120) {
          setHidden(true);
        } else if (latest < prev) {
          setHidden(false);
        }
      },
      [scrollY],
    ),
  );

  // ── Visibility: sub-pages only (not /ai-lab dashboard) ──
  if (!AI_LAB_DOCK_ROUTES.includes(pathname)) {
    return null;
  }

  return (
    <motion.nav
      // ── Responsive position ──
      // Mobile:  fixed bottom-6, always visible
      // Desktop: fixed top-6, auto-hide (slides up)
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 sm:bottom-auto sm:top-6"
      initial={{ y: 0, opacity: 1 }}
      animate={{
        // Desktop (top dock): slide up out of view when hidden
        // Mobile: always y=0 (hidden stays false per scroll guard)
        y: hidden ? -24 : 0,
        opacity: hidden ? 0 : 1,
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      aria-label="AI Lab section navigation"
    >
      <div className="flex items-center gap-0.5 rounded-2xl border border-white/[0.08] bg-background/60 px-1.5 py-1.5 backdrop-blur-xl shadow-[0_0_40px_rgba(var(--brand-rgb),0.06)] dark:border-white/[0.06] sm:gap-1 sm:px-2">
        {AI_LAB_NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive =
            item.href === "/ai-lab"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={t(item.labelKey)}
              aria-label={t(item.labelKey)}
              className="group relative flex items-center justify-center rounded-xl px-3 py-2 transition-colors sm:px-3.5"
            >
              {/* Active indicator pill */}
              {isActive && (
                <motion.div
                  layoutId="nav-dock-active"
                  className="absolute inset-0 rounded-xl border border-brand/15 bg-brand/[0.08] dark:border-brand/20 dark:bg-brand/[0.1]"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                  }}
                />
              )}

              {/* Icon */}
              <Icon
                className={`relative z-10 size-[18px] shrink-0 transition-colors ${
                  isActive
                    ? "text-brand"
                    : "text-slate-500/70 group-hover:text-slate-700 dark:text-slate-400/60 dark:group-hover:text-slate-300"
                }`}
              />

              {/* Label — visible on sm: (640px+) only */}
              <span
                className={`relative z-10 hidden text-xs font-medium transition-colors sm:inline ${
                  isActive
                    ? "text-brand"
                    : "text-slate-500/70 group-hover:text-slate-700 dark:text-slate-400/60 dark:group-hover:text-slate-300"
                }`}
              >
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
