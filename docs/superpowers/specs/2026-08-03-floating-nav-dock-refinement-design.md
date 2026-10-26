# FloatingNavDock Refinement — Design Spec

> **Status:** Approved
> **Predecessor:** Phase 24-A (Navigation Foundation)
> **Scope:** Refine FloatingNavDock with responsive positioning, extracted nav config, and sub-page-only visibility

---

## 1. Problem Statement

The current [FloatingNavDock](../../src/components/ai-lab/FloatingNavDock.tsx) (from Phase 24-A) has three issues:

1. **Wrong position on desktop.** Bottom-fixed dock competes with page content. A top-floating glass nav matches the "chrome" mental model better on large screens.
2. **Shows on `/ai-lab` dashboard.** The dock is redundant when the dashboard itself provides richer navigation (ExplorationLinks grid, CurrentMission CTAs).
3. **Hardcoded nav items.** Routes, labels, and icons are inlined in the component, making them harder to maintain and reuse.

---

## 2. Design Principles

1. **Responsive position, not two components.** One `FloatingNavDock` adapts via Tailwind breakpoints — no `useMediaQuery` or conditional rendering.
2. **Config is data, not code.** Nav items live in a plain TS file with i18n key references.
3. **Mobile-first defaults.** Base styles = mobile (bottom, icon-only). `sm:` overrides = desktop (top, icon+label, auto-hide).
4. **Zero changes to layout.tsx or page files.** The dock is already injected in layout — only its internals change.

---

## 3. Component Architecture

### 3.1 File changes

```
src/components/ai-lab/
├── nav-config.ts          ← NEW: extracted nav items + route list
├── FloatingNavDock.tsx     ← MODIFY: responsive positioning + config import
```

### 3.2 nav-config.ts

Single source of truth for AI Lab navigation:

```ts
export interface NavItem {
  icon: "Home" | "Map" | "Brain" | "Layers" | "FlaskConical" | "Gamepad2";
  labelKey: string;
  href: string;
}

export const AI_LAB_NAV_ITEMS: NavItem[] = [
  { icon: "Home", labelKey: "aiLab.nav.dashboard", href: "/ai-lab" },
  { icon: "Map", labelKey: "aiLab.nav.journey", href: "/ai-lab/journey" },
  { icon: "Brain", labelKey: "aiLab.nav.knowledge", href: "/ai-lab/knowledge" },
  { icon: "Layers", labelKey: "aiLab.nav.experience", href: "/ai-lab/experience" },
  { icon: "FlaskConical", labelKey: "aiLab.nav.experiments", href: "/ai-lab/experiments" },
  { icon: "Gamepad2", labelKey: "aiLab.nav.playground", href: "/ai-lab/playground" },
];

/** Routes where the dock IS visible (sub-pages only, not /ai-lab) */
export const AI_LAB_DOCK_ROUTES: string[] = [
  "/ai-lab/journey",
  "/ai-lab/knowledge",
  "/ai-lab/experience",
  "/ai-lab/experiments",
  "/ai-lab/playground",
];
```

### 3.3 FloatingNavDock.tsx — Behavior matrix

| Aspect | Mobile (default) | Desktop (`sm:`) |
|---|---|---|
| Position | `fixed bottom-6` | `fixed top-6` |
| Content | Icon only | Icon + text label |
| Backdrop | `backdrop-blur-xl` | `backdrop-blur-xl` |
| Scroll behavior | Always visible | Auto-hide on scroll-down, show on scroll-up |
| Hide direction | N/A | `y: -24` (slides up and out of view) |
| Active indicator | `layoutId` spring pill | `layoutId` spring pill |
| Visibility | Hidden on `/ai-lab` | Hidden on `/ai-lab` |

### 3.4 Visibility rule

```
visible = pathname in AI_LAB_DOCK_ROUTES (exact match)
hidden  = pathname === "/ai-lab" or pathname does not start with "/ai-lab"
```

This is stricter than the current `pathname.startsWith("/ai-lab")` check — it won't render on unknown `/ai-lab/*` paths.

### 3.5 i18n

All labels use existing keys from Phase 24-A: `aiLab.nav.dashboard`, `aiLab.nav.journey`, etc. No new i18n keys needed.

---

## 4. Data Flow

```
nav-config.ts (AI_LAB_NAV_ITEMS, AI_LAB_DOCK_ROUTES)
       │
       ▼
FloatingNavDock.tsx
       │
       ├── usePathname() → isActive detection, visibility check
       ├── useScroll()   → auto-hide (desktop only)
       ├── useTranslation() → resolve labelKey → display label
       └── framer-motion → position animation, active indicator
```

---

## 5. Edge Cases

- **Direct URL to unknown `/ai-lab/foo`:** Dock does NOT render (not in AI_LAB_DOCK_ROUTES).
- **Scroll to top of page:** Dock appears immediately (y=0, opacity=1).
- **Very short pages (no scroll):** Auto-hide never triggers — dock stays visible. Correct behavior.
- **Fast scroll flings:** `useMotionValueEvent` debounces naturally via frame rate. No flicker.
- **SSR:** `useScroll()` and `usePathname()` are client-only — component is `"use client"`, no hydration mismatch.
