# Phase 24-A: Navigation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix AI Lab navigation — add back-to-dashboard, breadcrumbs, dock labels, and surface the hidden Forward Playground.

**Architecture:** Five independent changes: (1) FloatingNavDock gains a Dashboard item and text labels on desktop, (2) a new BreadcrumbBar client component injected in layout.tsx derives hierarchy from `usePathname()`, (3) MiniMindPlayground gets a Forward Playground CTA card, (4) a new ForwardPlaygroundSection added to the dashboard, (5) i18n keys added for all new UI strings.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS, Framer Motion, shadcn/ui, lucide-react icons

## Global Constraints

- All files in `d:\123\HOU Universe\` root; no external temp files
- TypeScript strict, no `any` types
- Tailwind only, no raw CSS files, no complex inline `style`
- Framer Motion for animations
- i18n via `useTranslation()` from react-i18next
- Follow existing glass-card visual patterns (rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm)
- `npm run build` must pass with no errors or warnings
- Import order: third-party → internal components → types → styles

---

### Task 1: Add i18n keys for navigation UI strings

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/zh-CN.json`

**Interfaces:**
- Produces: `aiLab.nav.dashboard`, `aiLab.nav.journey`, `aiLab.nav.knowledge`, `aiLab.nav.experience`, `aiLab.nav.experiments`, `aiLab.nav.playground`, `aiLab.nav.forward`, `aiLab.sections.forwardPlayground`, `aiLab.forwardPlayground.title`, `aiLab.forwardPlayground.description`, `aiLab.forwardPlayground.cta`, `aiLab.playground.tryForward`, `aiLab.playground.tryForwardDesc`, `aiLab.playground.tryForwardCta`

- [ ] **Step 1: Add en.json keys**

Read the current en.json, locate the `aiLab` section (around line 728), and add these keys inside the `aiLab` object:

```json
"nav": {
  "dashboard": "Dashboard",
  "journey": "Journey",
  "knowledge": "Knowledge",
  "experience": "Experience",
  "experiments": "Experiments",
  "playground": "Playground",
  "forward": "Forward"
},
"sections": {
  "mission": "Mission",
  "roadmap": "Learning Roadmap",
  "timeline": "Learning Timeline",
  "knowledgeMap": "Knowledge Map",
  "learningJourney": "Learning Journey",
  "progress": "Latest Progress",
  "moduleProgress": "Module Progress",
  "resources": "Resources",
  "github": "GitHub",
  "blog": "Blog",
  "forwardPlayground": "Forward Model Explorer"
},
"forwardPlayground": {
  "title": "Forward Model Explorer",
  "description": "Trace the complete Text → Tokenizer → Embedding → RoPE → Transformer → LM Head → Logits pipeline. See every intermediate result with interactive visualizations at every stage.",
  "cta": "Run Forward Pass"
},
"playground": {
  "tryForward": "Ready for the full pipeline?",
  "tryForwardDesc": "Trace text through every stage — Tokenizer, Embedding, RoPE, Transformer, and LM Head — with real-time visualizations at each step.",
  "tryForwardCta": "Open Forward Model Explorer"
}
```

Note: The existing `sections` object already has `mission` through `blog` — add only `forwardPlayground` to it. The `nav` and `forwardPlayground` and `playground` objects are new additions inside `aiLab`.

- [ ] **Step 2: Add zh-CN.json keys**

Read the current zh-CN.json, locate the `aiLab` section, and add the same structure with Chinese translations:

```json
"nav": {
  "dashboard": "总览",
  "journey": "学习路径",
  "knowledge": "知识图谱",
  "experience": "架构体验",
  "experiments": "实验工坊",
  "playground": "演练场",
  "forward": "前向模型"
},
"sections": {
  "mission": "使命",
  "roadmap": "学习路线图",
  "timeline": "学习时间线",
  "knowledgeMap": "知识地图",
  "learningJourney": "学习路径",
  "progress": "最新进度",
  "moduleProgress": "模块进度",
  "resources": "资源",
  "github": "GitHub",
  "blog": "博客",
  "forwardPlayground": "前向模型浏览器"
},
"forwardPlayground": {
  "title": "前向模型浏览器",
  "description": "追踪完整的 Text → Tokenizer → Embedding → RoPE → Transformer → LM Head → Logits 管线。在每个阶段查看中间结果和交互式可视化。",
  "cta": "运行前向推理"
},
"playground": {
  "tryForward": "准备好体验完整管线了吗？",
  "tryForwardDesc": "追踪文本通过每个阶段 — Tokenizer、Embedding、RoPE、Transformer 和 LM Head — 每步都有实时可视化。",
  "tryForwardCta": "打开前向模型浏览器"
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, no errors or warnings related to i18n.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add navigation and Forward Playground UI keys for Phase 24-A"
```

---

### Task 2: Add Dashboard item and text labels to FloatingNavDock

**Files:**
- Modify: `src/components/ai-lab/FloatingNavDock.tsx`

**Interfaces:**
- Consumes: `aiLab.nav.dashboard` i18n key (from Task 1)
- Produces: Updated `NAV_ITEMS` with 6 items including Dashboard; labels visible on `sm:` breakpoint

- [ ] **Step 1: Read current file to confirm exact content**

Read: `src/components/ai-lab/FloatingNavDock.tsx`

- [ ] **Step 2: Add Home icon to imports**

Change the lucide-react import line (currently line 23) from:

```tsx
import { Map, Brain, Layers, FlaskConical, Gamepad2 } from "lucide-react";
```

to:

```tsx
import { Map, Brain, Layers, FlaskConical, Gamepad2, Home } from "lucide-react";
```

- [ ] **Step 3: Add Dashboard to NAV_ITEMS**

Replace the `NAV_ITEMS` array (lines 35-41) with:

```tsx
const NAV_ITEMS: NavItem[] = [
  { icon: Home, label: "Dashboard", href: "/ai-lab" },
  { icon: Map, label: "Journey", href: "/ai-lab/journey" },
  { icon: Brain, label: "Knowledge", href: "/ai-lab/knowledge" },
  { icon: Layers, label: "Experience", href: "/ai-lab/experience" },
  { icon: FlaskConical, label: "Experiments", href: "/ai-lab/experiments" },
  { icon: Gamepad2, label: "Playground", href: "/ai-lab/playground" },
];
```

- [ ] **Step 4: Update HIDDEN_ON to show dock on all AI Lab pages including dashboard**

The dock currently hides on `/ai-lab`. With the new Dashboard nav item, users can navigate back. Change lines 47 from:

```tsx
const HIDDEN_ON = new Set(["/ai-lab"]);
```

to:

```tsx
const HIDDEN_ON = new Set<string>();
```

This makes the dock visible on the dashboard, which is now correct because the Dashboard item provides the "you are here" indicator and the other items serve as quick-jump shortcuts from the long-scroll dashboard page.

- [ ] **Step 5: Fix active detection for Dashboard exact match**

The current active check `pathname.startsWith(item.href)` would match Dashboard (`/ai-lab`) on ALL sub-pages. Fix the `isActive` computation (around line 88). Change:

```tsx
const isActive = pathname.startsWith(item.href);
```

to:

```tsx
const isActive =
  item.href === "/ai-lab"
    ? pathname === item.href
    : pathname.startsWith(item.href);
```

This ensures Dashboard only highlights on `/ai-lab` exactly, while Journey/Knowledge/etc. still match their sub-paths.

- [ ] **Step 6: Add text labels visible on desktop**

In the JSX, each nav link currently renders `<item.icon />` only. Add a text label. Find the `<item.icon` element (around line 111) and replace the entire icon block with:

```tsx
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
```

This keeps the mobile dock icon-only (space-constrained) and shows labels on `sm:` (640px+) viewports.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/ai-lab/FloatingNavDock.tsx
git commit -m "feat(nav): add Dashboard item and desktop text labels to FloatingNavDock"
```

---

### Task 3: Create BreadcrumbBar component

**Files:**
- Create: `src/components/ai-lab/BreadcrumbBar.tsx`

**Interfaces:**
- Consumes: `aiLab.nav.*` i18n keys (from Task 1)
- Produces: `BreadcrumbBar` client component — auto-derives path hierarchy from `usePathname()`, hidden on `/ai-lab` dashboard, shows on all sub-pages

- [ ] **Step 1: Create the component file**

Write: `src/components/ai-lab/BreadcrumbBar.tsx`

```tsx
"use client";

// ============================================================
// BreadcrumbBar — hierarchical breadcrumb for AI Lab sub-pages
// ============================================================
//
// Injected into ai-lab/layout.tsx to provide persistent
// breadcrumb navigation across all AI Lab sub-pages.
//
// Behavior:
//   - Hidden on /ai-lab (dashboard)
//   - Auto-derives breadcrumbs from pathname segments
//   - Renders: AI Lab > Section or AI Lab > Playground > Forward
//   - Last segment is non-clickable (current page)
//   - Matches the glass-card visual pattern
// ============================================================

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

// ============================================================
// Path segment → display label mapping
// ============================================================

const SEGMENT_LABELS: Record<string, string> = {
  journey: "Journey",
  knowledge: "Knowledge",
  experience: "Experience",
  experiments: "Experiments",
  playground: "Playground",
  forward: "Forward",
};

// ============================================================
// BreadcrumbBar
// ============================================================

export function BreadcrumbBar() {
  const pathname = usePathname();

  // ── Don't render on dashboard or non-AI-Lab pages ──
  if (pathname === "/ai-lab" || !pathname.startsWith("/ai-lab")) {
    return null;
  }

  // ── Build breadcrumb segments ──
  const segments = pathname.split("/").filter(Boolean);
  // e.g. ["ai-lab", "playground", "forward"]

  const breadcrumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = i === 0 ? "AI Lab" : (SEGMENT_LABELS[seg] ?? seg);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 max-sm:px-5 max-sm:pt-5"
    >
      <ol className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {/* Separator */}
            {i > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-slate-400/50 dark:text-slate-500/50" />
            )}

            {crumb.isLast ? (
              <span className="font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-slate-500 transition-colors hover:text-brand dark:text-slate-400 dark:hover:text-brand-light"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/BreadcrumbBar.tsx
git commit -m "feat(nav): add BreadcrumbBar component for AI Lab sub-page hierarchy"
```

---

### Task 4: Inject BreadcrumbBar into AI Lab layout

**Files:**
- Modify: `src/app/ai-lab/layout.tsx`

**Interfaces:**
- Consumes: `BreadcrumbBar` component (from Task 3)
- Produces: BreadcrumbBar rendered above `{children}` on all AI Lab sub-pages

- [ ] **Step 1: Read current file to confirm exact content**

Read: `src/app/ai-lab/layout.tsx`

- [ ] **Step 2: Add BreadcrumbBar import and render**

Add the import after the FloatingNavDock import (line 2):

```tsx
import { BreadcrumbBar } from "@/components/ai-lab/BreadcrumbBar";
```

Add the BreadcrumbBar component right before `{children}`. Replace lines 38-41:

```tsx
      {/* Floating navigation dock — renders on sub-pages only */}
      <FloatingNavDock />

      {children}
```

with:

```tsx
      {/* Breadcrumb bar — renders on sub-pages only */}
      <BreadcrumbBar />

      {/* Floating navigation dock */}
      <FloatingNavDock />

      {children}
```

- [ ] **Step 3: Adjust top padding on sub-pages**

Since the breadcrumb bar now provides top spacing, the sub-page containers that have `py-24` will have extra space. This is acceptable — the breadcrumb adds ~24px of padding at top, and the page content starts with `py-24` (~96px). The combined effect (~120px) is reasonable and matches the dashboard's `py-24` without breadcrumb. No change needed to individual pages.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/ai-lab/layout.tsx
git commit -m "feat(nav): inject BreadcrumbBar into AI Lab layout"
```

---

### Task 5: Add Forward Playground link card to MiniMindPlayground

**Files:**
- Modify: `src/components/minimind/playground/MiniMindPlayground.tsx`

**Interfaces:**
- Consumes: `aiLab.playground.tryForward`, `aiLab.playground.tryForwardDesc`, `aiLab.playground.tryForwardCta` i18n keys (from Task 1)
- Produces: Prominent CTA card between module selector and active playground, linking to `/ai-lab/playground/forward`

- [ ] **Step 1: Read current file to confirm exact content**

Read: `src/components/minimind/playground/MiniMindPlayground.tsx`

- [ ] **Step 2: Add new imports**

Add to the lucide-react import (line 5):

Change:
```tsx
import { Sparkles, Construction } from "lucide-react";
```

to:
```tsx
import { Sparkles, Construction, ArrowRight, Layers } from "lucide-react";
```

- [ ] **Step 3: Add Forward Playground CTA card**

Insert a new section between the module selector grid (ends around line 243 with `</motion.section>`) and the active module playground section (starts around line 248). Add this JSX block between the closing `</motion.section>` of the module cards and the opening `<motion.section key={selectedModule}...>` of the active playground:

```tsx
      {/* ================================================================ */}
      {/* Forward Playground CTA */}
      {/* ================================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mt-8"
      >
        <Link
          href="/ai-lab/playground/forward"
          className="group flex items-center gap-5 rounded-xl border border-brand/15 bg-brand/[0.03] px-6 py-5 backdrop-blur-sm transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.06] dark:border-white/[0.06] dark:hover:border-brand/25 sm:px-8 sm:py-6"
        >
          {/* Icon */}
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.08] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.12)] dark:border-brand/25 dark:bg-brand/[0.1] sm:size-12">
            <Layers className="size-5 text-brand/70 transition-all duration-300 group-hover:text-brand sm:size-5.5" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand sm:text-base">
              Ready for the full pipeline?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500/80 dark:text-slate-400/70 sm:text-sm">
              Trace text through every stage — Tokenizer, Embedding, RoPE,
              Transformer, and LM Head — with real-time visualizations at each
              step.
            </p>
          </div>

          {/* Arrow */}
          <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 sm:flex dark:text-brand/50 dark:group-hover:text-brand/70">
            Open Forward Model Explorer
            <ArrowRight className="size-3.5" />
          </div>
        </Link>
      </motion.div>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/minimind/playground/MiniMindPlayground.tsx
git commit -m "feat(playground): add Forward Playground CTA link card"
```

---

### Task 6: Create ForwardPlaygroundSection and add to dashboard

**Files:**
- Create: `src/components/ai-lab/ForwardPlaygroundSection.tsx`
- Modify: `src/components/ai-lab/AiLabClient.tsx`

**Interfaces:**
- Consumes: `aiLab.sections.forwardPlayground`, `aiLab.forwardPlayground.*` i18n keys (from Task 1)
- Produces: CTA card on the dashboard linking to `/ai-lab/playground/forward`, placed between KnowledgeMap and ResourcesSection

- [ ] **Step 1: Create ForwardPlaygroundSection component**

Write: `src/components/ai-lab/ForwardPlaygroundSection.tsx`

```tsx
"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ArrowRight, Layers } from "lucide-react";
import Link from "next/link";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function ForwardPlaygroundSection() {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.forwardPlayground" />

      <Link
        href="/ai-lab/playground/forward"
        className="group flex flex-col items-center justify-center rounded-xl border border-brand/15 bg-brand/[0.02] py-16 text-center transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.05] dark:border-white/[0.06] dark:hover:border-brand/25"
      >
        <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)] dark:border-brand/25 dark:bg-brand/[0.08]">
          <Layers className="size-6 text-brand/60 transition-all duration-300 group-hover:text-brand/80" />
        </div>
        <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-brand">
          {t("aiLab.forwardPlayground.title")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
          {t("aiLab.forwardPlayground.description")}
        </p>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 dark:text-brand/50 dark:group-hover:text-brand/70">
          {t("aiLab.forwardPlayground.cta")}
          <ArrowRight className="size-3" />
        </span>
      </Link>
    </motion.section>
  );
}
```

- [ ] **Step 2: Add ForwardPlaygroundSection to AiLabClient**

Read: `src/components/ai-lab/AiLabClient.tsx`

Add the import after the existing imports (around line 11):

```tsx
import { ForwardPlaygroundSection } from "./ForwardPlaygroundSection";
```

Insert `<ForwardPlaygroundSection />` into the component body. It should go between `KnowledgeMap` and `ResourcesSection` to group the interactive CTA cards together. The relevant section (lines 25-28) changes from:

```tsx
      <KnowledgeMap />
      <ResourcesSection />
```

to:

```tsx
      <KnowledgeMap />
      <ForwardPlaygroundSection />
      <ResourcesSection />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/ForwardPlaygroundSection.tsx src/components/ai-lab/AiLabClient.tsx
git commit -m "feat(dashboard): add Forward Playground Explorer CTA section"
```

---

### Integration Verification

After all 6 tasks, verify the complete Phase 24-A:

- [ ] `/ai-lab` dashboard: Shows FloatingNavDock with 6 labeled items (Dashboard active), new ForwardPlaygroundSection card between KnowledgeMap and ResourcesSection
- [ ] `/ai-lab/journey`: Breadcrumb shows "AI Lab > Journey", dock shows with Journey active
- [ ] `/ai-lab/playground`: Breadcrumb shows "AI Lab > Playground", Forward CTA card visible between module selector and active playground, dock shows with Playground active
- [ ] `/ai-lab/playground/forward`: Breadcrumb shows "AI Lab > Playground > Forward", dock shows with Playground active
- [ ] All sub-pages: Clicking Dashboard in dock returns to `/ai-lab`
- [ ] Mobile: Dock shows icons only (no labels), breadcrumb compresses
- [ ] `npm run build` passes with no errors or warnings
