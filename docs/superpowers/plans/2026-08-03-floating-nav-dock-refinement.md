# FloatingNavDock Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine FloatingNavDock with responsive positioning (top on desktop, bottom on mobile), extracted nav config, sub-page-only visibility, and desktop-only auto-hide.

**Architecture:** Two files: a new `nav-config.ts` extracts route data from the component, then `FloatingNavDock.tsx` is rewritten to import config, use responsive Tailwind positioning, apply desktop-only auto-hide, and hide on `/ai-lab`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS, Framer Motion, lucide-react icons, react-i18next

## Global Constraints

- All files in `d:\123\HOU Universe\` root; no external temp files
- TypeScript strict, no `any` types
- Tailwind only, no raw CSS files, no complex inline `style`
- Framer Motion for animations
- i18n via `useTranslation()` from react-i18next
- Follow existing glass-card visual patterns (rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm)
- `npm run build` must pass with no errors or warnings
- Import order: third-party → internal components → types → styles
- Do NOT modify: `src/lib/data/`, `src/app/ai-lab/layout.tsx`, any page files

---

### Task 1: Create nav-config.ts

**Files:**
- Create: `src/components/ai-lab/nav-config.ts`

**Interfaces:**
- Produces: `NavItem` interface, `AI_LAB_NAV_ITEMS: NavItem[]`, `AI_LAB_DOCK_ROUTES: string[]` — consumed by Task 2

- [ ] **Step 1: Create the config file**

Write: `src/components/ai-lab/nav-config.ts`

```typescript
// ============================================================
// AI Lab Navigation Config — single source of truth
// ============================================================
//
// Every AI Lab navigation component imports from here.
// Add a new sub-page nav item in one place; FloatingNavDock,
// BreadcrumbBar, and future nav components pick it up.
// ============================================================

// ============================================================
// Types
// ============================================================

export interface NavItem {
  /** lucide-react icon name — resolved to component in consumers */
  icon: "Home" | "Map" | "Brain" | "Layers" | "FlaskConical" | "Gamepad2";
  /** i18n key for the display label (e.g. "aiLab.nav.journey") */
  labelKey: string;
  /** Route path relative to site root */
  href: string;
}

// ============================================================
// Nav items
// ============================================================

export const AI_LAB_NAV_ITEMS: NavItem[] = [
  { icon: "Home", labelKey: "aiLab.nav.dashboard", href: "/ai-lab" },
  { icon: "Map", labelKey: "aiLab.nav.journey", href: "/ai-lab/journey" },
  { icon: "Brain", labelKey: "aiLab.nav.knowledge", href: "/ai-lab/knowledge" },
  { icon: "Layers", labelKey: "aiLab.nav.experience", href: "/ai-lab/experience" },
  { icon: "FlaskConical", labelKey: "aiLab.nav.experiments", href: "/ai-lab/experiments" },
  { icon: "Gamepad2", labelKey: "aiLab.nav.playground", href: "/ai-lab/playground" },
];

// ============================================================
// Dock visibility — sub-pages only (not the /ai-lab dashboard)
// ============================================================

export const AI_LAB_DOCK_ROUTES: string[] = [
  "/ai-lab/journey",
  "/ai-lab/knowledge",
  "/ai-lab/experience",
  "/ai-lab/experiments",
  "/ai-lab/playground",
];
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — new file, not yet imported by anything.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/nav-config.ts
git commit -m "feat(nav): extract AI Lab nav config — NavItem type, items, dock routes"
```

---

### Task 2: Rewrite FloatingNavDock with responsive positioning

**Files:**
- Modify: `src/components/ai-lab/FloatingNavDock.tsx`

**Interfaces:**
- Consumes: `AI_LAB_NAV_ITEMS`, `AI_LAB_DOCK_ROUTES`, `NavItem` from `./nav-config` (Task 1)
- Produces: Updated `FloatingNavDock` — responsive position (top desktop, bottom mobile), desktop-only auto-hide, sub-page-only visibility, i18n labels via config

- [ ] **Step 1: Read the current file to confirm exact content**

Read: `src/components/ai-lab/FloatingNavDock.tsx`

The current file (Phase 24-A output) is at lines 1-137 — confirmed during context exploration. It has hardcoded NAV_ITEMS, empty HIDDEN_ON, bottom-fixed position on all sizes, and auto-hide that applies to both desktop and mobile.

- [ ] **Step 2: Rewrite the entire file**

Write: `src/components/ai-lab/FloatingNavDock.tsx`

```tsx
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
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS — no errors, no warnings. The nav-config.ts import resolves, all i18n keys exist from Phase 24-A.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/FloatingNavDock.tsx
git commit -m "feat(nav): refine FloatingNavDock — responsive top/bottom, nav config, sub-page-only visibility"
```

---

### Integration Verification

After both tasks, verify the complete refinement:

- [ ] `npm run build` passes with zero errors and warnings
- [ ] `/ai-lab` dashboard: FloatingNavDock does NOT render
- [ ] `/ai-lab/journey`: Dock visible at top on desktop, bottom on mobile
- [ ] `/ai-lab/knowledge`: Dock visible, Knowledge active indicator
- [ ] `/ai-lab/experience`: Dock visible, Experience active indicator
- [ ] `/ai-lab/experiments`: Dock visible, Experiments active indicator
- [ ] `/ai-lab/playground`: Dock visible, Playground active indicator
- [ ] Desktop (>640px): Dock at top, icons + labels, auto-hides on scroll-down
- [ ] Mobile (<640px): Dock at bottom, icons only, always visible
- [ ] Active indicator spring-animates between items on click
- [ ] BreadcrumbBar still renders correctly alongside dock
- [ ] `nav-config.ts` is the single source of truth for nav items
- [ ] No changes to `layout.tsx`, page files, or `lib/data`
