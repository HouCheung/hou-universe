"use client";

// ============================================================
// FloatingNavDock — glass navigation dock for AI Lab sub-pages
// ============================================================
//
// Injected into ai-lab/layout.tsx to provide persistent
// cross-navigation across all AI Lab sub-pages without
// modifying any individual page file.
//
// Behavior:
//   - Renders on all AI Lab pages including the dashboard
//   - Auto-hides on scroll-down, reappears on scroll-up
//   - Active route has brand-color glow ring
//   - Desktop: icon with text label
//   - Mobile: fixed to viewport bottom
// ============================================================

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState, useCallback } from "react";
import { Map, Brain, Layers, FlaskConical, Gamepad2, Home } from "lucide-react";

// ============================================================
// Nav items
// ============================================================

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: Home, label: "Dashboard", href: "/ai-lab" },
  { icon: Map, label: "Journey", href: "/ai-lab/journey" },
  { icon: Brain, label: "Knowledge", href: "/ai-lab/knowledge" },
  { icon: Layers, label: "Experience", href: "/ai-lab/experience" },
  { icon: FlaskConical, label: "Experiments", href: "/ai-lab/experiments" },
  { icon: Gamepad2, label: "Playground", href: "/ai-lab/playground" },
];

// ============================================================
// Routes where the dock should NOT appear
// ============================================================

const HIDDEN_ON = new Set<string>();

// ============================================================
// FloatingNavDock
// ============================================================

export function FloatingNavDock() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  // ── Auto-hide on scroll ──
  useMotionValueEvent(scrollY, "change", useCallback((latest: number) => {
    const prev = (scrollY.getPrevious() as number) ?? 0;
    if (latest > prev && latest > 120) {
      setHidden(true);
    } else if (latest < prev) {
      setHidden(false);
    }
  }, [scrollY]));

  // ── Don't render on dashboard or non-AI-Lab pages ──
  if (HIDDEN_ON.has(pathname) || !pathname.startsWith("/ai-lab")) {
    return null;
  }

  return (
    <motion.nav
      initial={{ y: 0, opacity: 1 }}
      animate={{
        y: hidden ? 24 : 0,
        opacity: hidden ? 0 : 1,
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 sm:bottom-8"
      aria-label="AI Lab section navigation"
    >
      <div
        className="flex items-center gap-0.5 rounded-2xl border border-white/[0.08] bg-background/60 px-1.5 py-1.5 backdrop-blur-xl shadow-[0_0_40px_rgba(var(--brand-rgb),0.06)] dark:border-white/[0.06] sm:gap-1 sm:px-2"
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/ai-lab"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className="group relative flex items-center justify-center rounded-xl px-3 py-2 transition-colors sm:px-3.5"
            >
              {/* Active indicator */}
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

              <item.icon
                className={`relative z-10 size-[18px] shrink-0 transition-colors ${
                  isActive
                    ? "text-brand"
                    : "text-slate-500/70 group-hover:text-slate-700 dark:text-slate-400/60 dark:group-hover:text-slate-300"
                }`}
              />
              <span
                className={`relative z-10 hidden text-xs font-medium transition-colors sm:inline ${
                  isActive
                    ? "text-brand"
                    : "text-slate-500/70 group-hover:text-slate-700 dark:text-slate-400/60 dark:group-hover:text-slate-300"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
