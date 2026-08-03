# Phase 24-B: AI Lab Dashboard Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/ai-lab` from a flat 11-section showcase into a 5-section intelligent dashboard that composes existing SSOT registries.

**Architecture:** Five new dashboard components under `src/components/ai-lab/dashboard/` compose data from `module-registry`, `learning-registry`, and localStorage `UserProgress`. A single `page.tsx` change swaps `AiLabClient` for `AiLabDashboard`. All 11 existing section components are preserved on disk.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS, Framer Motion, shadcn/ui, lucide-react icons, react-i18next

## Global Constraints

- All files in `d:\123\HOU Universe\` root; no external temp files
- TypeScript strict, no `any` types
- Tailwind only, no raw CSS files, no complex inline `style`
- Framer Motion for animations
- i18n via `useTranslation()` from react-i18next
- Follow existing glass-card visual patterns (rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm)
- `npm run build` must pass with no errors or warnings
- Import order: third-party → internal components → types → styles
- All data from existing SSOT registries — zero new metadata
- Do NOT modify: `src/lib/minimind/*`, `src/data/minimind/*` registries, existing playground internals, knowledge graph internals, learning engine internals
- Do NOT delete old components (AiLabClient.tsx and its 11 sections)

---

### Task 1: Add i18n keys for dashboard UI strings

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/zh-CN.json`

**Interfaces:**
- Produces: `aiLab.dashboard.currentMission`, `aiLab.dashboard.continueLearning`, `aiLab.dashboard.explorationHub`, `aiLab.dashboard.resumeJourney`, `aiLab.dashboard.openKnowledgeGraph`, `aiLab.dashboard.runExperiment`, `aiLab.dashboard.lastActive`, `aiLab.dashboard.noProgressYet`, `aiLab.dashboard.allMastered`, `aiLab.dashboard.modulesStat`, `aiLab.dashboard.phaseStat`, `aiLab.dashboard.progressStat`

- [ ] **Step 1: Add en.json keys**

Read the current en.json, locate the `aiLab` object (ends with `"readBlog": "Read Notes"` around line 771, closing `}` at line 772). Insert the `dashboard` object between `"readBlog"` and the closing `}` of `aiLab`.

Change the end of the `aiLab` object from:

```json
    "readBlog": "Read Notes"
  },
```

to:

```json
    "readBlog": "Read Notes",
    "dashboard": {
      "currentMission": "Current Mission",
      "continueLearning": "Continue Learning",
      "explorationHub": "Exploration Hub",
      "resumeJourney": "Continue Journey",
      "openKnowledgeGraph": "Open Knowledge Graph",
      "runExperiment": "Run Experiment",
      "lastActive": "Last active",
      "noProgressYet": "Start with Tokenizer — the foundation of all language models.",
      "allMastered": "All modules mastered! Try an experiment to deepen your understanding.",
      "modulesStat": "modules",
      "phaseStat": "phase",
      "progressStat": "complete"
    }
  },
```

The insertion goes after `"readBlog": "Read Notes"` (line 771) — replace the line `    "readBlog": "Read Notes"` with `    "readBlog": "Read Notes",` and add the `dashboard` block after it.

- [ ] **Step 2: Add zh-CN.json keys**

Read the current zh-CN.json, locate the `aiLab` object (ends with `"readBlog": "阅读笔记"` around line 771). Apply the same insertion:

Change:

```json
    "readBlog": "阅读笔记"
  },
```

to:

```json
    "readBlog": "阅读笔记",
    "dashboard": {
      "currentMission": "当前任务",
      "continueLearning": "继续学习",
      "explorationHub": "探索中心",
      "resumeJourney": "继续旅程",
      "openKnowledgeGraph": "打开知识图谱",
      "runExperiment": "运行实验",
      "lastActive": "上次学习",
      "noProgressYet": "从 Tokenizer 开始——所有语言模型的基石。",
      "allMastered": "所有模块已掌握！尝试实验以加深理解。",
      "modulesStat": "个模块",
      "phaseStat": "阶段",
      "progressStat": "已完成"
    }
  },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, no errors or warnings related to i18n.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add dashboard UI keys for Phase 24-B"
```

---

### Task 2: Create DashboardHero component

**Files:**
- Create: `src/components/ai-lab/dashboard/DashboardHero.tsx`

**Interfaces:**
- Consumes: `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `LEARNING_PATHS` from `@/data/minimind/learning-registry`, `aiLab.*` i18n keys (existing + Task 1)
- Produces: `DashboardHero` — default-exported function component, no props

- [ ] **Step 1: Create the component file**

Write: `src/components/ai-lab/dashboard/DashboardHero.tsx`

```tsx
"use client";

// ============================================================
// DashboardHero — AI Lab identity + live MiniMind stats
// ============================================================
//
// Clones MissionBanner's visual pattern (glass card, glow accent,
// Rocket icon, heading, intro, mission statement) and adds a
// 3-stat row below the mission statement:
//   Modules: implemented/total | Phase: current | Progress: N%
//
// Data sources:
//   - MINIMIND_MODULES → module counts
//   - LEARNING_PATHS → current critical-path phase label
//   - localStorage("minimind-learning-progress") → completion %
//
// All data is read-only. Zero new metadata.
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles, Rocket, Box, Layers, TrendingUp } from "lucide-react";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { LEARNING_PATHS } from "@/data/minimind/learning-registry";

// ============================================================
// Types
// ============================================================

interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.4 + i * 0.12, ease: "easeOut" },
  }),
};

// ============================================================
// Helpers
// ============================================================

function loadProgressPercent(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return 0;
    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1 || !parsed.nodeStatus) return 0;
    const statuses = Object.values(parsed.nodeStatus);
    if (statuses.length === 0) return 0;
    const done = statuses.filter(
      (s) => s === "completed" || s === "mastered"
    ).length;
    return Math.round((done / statuses.length) * 100);
  } catch {
    return 0;
  }
}

// ============================================================
// DashboardHero
// ============================================================

export function DashboardHero() {
  const { t } = useTranslation();
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    setProgressPercent(loadProgressPercent());
  }, []);

  // ── Derived stats ──
  const implementedCount = MINIMIND_MODULES.filter(
    (m) => m.implemented
  ).length;
  const totalCount = MINIMIND_MODULES.length;

  // Current phase from critical path: find the phase of the first
  // in-progress module on the critical path, or default to first path label.
  const criticalPath = LEARNING_PATHS.find((p) => p.type === "critical");
  const criticalPathLabel = criticalPath?.label ?? "Foundation";

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={variants}
      className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
    >
      {/* Glow accent */}
      <span
        className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center gap-4">
        {/* Subhead pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <Rocket className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("aiLab.subhead")}
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("aiLab.heading")}
        </h1>

        {/* Intro */}
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("aiLab.intro")}
        </p>

        {/* Mission */}
        <div className="flex items-center gap-1.5 text-xs text-brand/60 dark:text-brand-light/60">
          <Sparkles className="size-3" />
          <span className="font-mono italic">
            {t("aiLab.missionStatement")}
          </span>
        </div>

        {/* ── Live stat row ── */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
          {/* Modules */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <Box className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {implementedCount}/{totalCount}
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.modulesStat")}
            </span>
          </motion.div>

          {/* Phase */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <Layers className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground">
              {criticalPathLabel}
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.phaseStat")}
            </span>
          </motion.div>

          {/* Progress */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <TrendingUp className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {progressPercent}%
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.progressStat")}
            </span>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, no errors. DashboardHero exists but is not yet imported by any page.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/DashboardHero.tsx
git commit -m "feat(dashboard): add DashboardHero with live MiniMind stats"
```

---

### Task 3: Create CurrentMission component

**Files:**
- Create: `src/components/ai-lab/dashboard/CurrentMission.tsx`

**Interfaces:**
- Consumes: `getNextNodes` from `@/data/minimind/learning-registry`, `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `getRecommendations` from `@/data/minimind/learning-registry`, `aiLab.dashboard.*` i18n keys (Task 1)
- Produces: `CurrentMission` — default-exported function component, no props

- [ ] **Step 1: Create the component file**

Write: `src/components/ai-lab/dashboard/CurrentMission.tsx`

```tsx
"use client";

// ============================================================
// CurrentMission — learning-registry derived next action
// ============================================================
//
// Reads UserProgress from localStorage and calls learning-registry
// intelligence to determine:
//   1. The next available module on the critical path
//   2. The top-priority recommendation
//
// States:
//   - Has next node: shows module name, description, CTA link
//   - No progress yet: falls back to "Start with Tokenizer"
//   - All mastered: shows congratulations + experiment CTA
//
// Data sources:
//   - localStorage("minimind-learning-progress") → UserProgress
//   - getNextNodes(progress) → available module sourceIds
//   - getRecommendations(progress) → top priority rec
//   - MINIMIND_MODULES → resolve module title/description
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ArrowRight, Target, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import {
  getNextNodes,
  getRecommendations,
} from "@/data/minimind/learning-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import type { UserProgress, Recommendation } from "@/data/minimind/learning-registry";

// ============================================================
// Types
// ============================================================

interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// localStorage helpers
// ============================================================

function loadProgress(): UserProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return null;
    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;
    return {
      nodeStatus: parsed.nodeStatus ?? {},
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================
// Derive current mission
// ============================================================

interface MissionData {
  moduleId: string; // MINIMIND_MODULES id (no prefix)
  title: string;
  description: string;
  recommendation: Recommendation | null;
  isAllDone: boolean;
}

function deriveMission(progress: UserProgress | null): MissionData {
  // ── Fallback: first visit, no progress ──
  if (!progress) {
    const firstModule = MINIMIND_MODULES[0];
    return {
      moduleId: firstModule?.id ?? "tokenizer",
      title: firstModule?.title ?? "Tokenizer",
      description: firstModule?.description ?? "",
      recommendation: null,
      isAllDone: false,
    };
  }

  // ── Get next available nodes ──
  const nextIds = getNextNodes(progress);

  // ── Get recommendations ──
  const recommendations = getRecommendations(progress);
  const topRec = recommendations.length > 0 ? recommendations[0] : null;

  // ── All done? ──
  if (nextIds.length === 0 && recommendations.length === 0) {
    return {
      moduleId: "",
      title: "",
      description: "",
      recommendation: null,
      isAllDone: true,
    };
  }

  // ── Pick the first available node ──
  // getNextNodes returns KnowledgeNode.id format: "module:tokenizer"
  // Strip prefix to get MINIMIND_MODULES id: "tokenizer"
  const nextSourceId = nextIds[0] ?? "module:tokenizer";
  const moduleId = nextSourceId.replace(/^module:/, "");
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);

  return {
    moduleId,
    title: mod?.title ?? moduleId,
    description: mod?.description ?? "",
    recommendation: topRec,
    isAllDone: false,
  };
}

// ============================================================
// CurrentMission
// ============================================================

export function CurrentMission() {
  const { t } = useTranslation();
  const [mission, setMission] = useState<MissionData | null>(null);

  useEffect(() => {
    const progress = loadProgress();
    setMission(deriveMission(progress));
  }, []);

  // SSR guard — render nothing until client-side hydration
  if (!mission) {
    return (
      <section className="mt-20 sm:mt-28">
        <SectionHeader titleKey="aiLab.dashboard.currentMission" />
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-12 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
        </div>
      </section>
    );
  }

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.currentMission" />

      {/* ── All mastered state ── */}
      {mission.isAllDone ? (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] px-6 py-8 text-center backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]">
          <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-500/70" />
          <p className="text-base font-semibold text-foreground">
            {t("aiLab.dashboard.allMastered")}
          </p>
          <Link
            href="/ai-lab/experiments"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-4 py-2 text-sm font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
          >
            {t("aiLab.dashboard.runExperiment")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        /* ── Active mission card ── */
        <Link
          href={`/ai-lab/journey?module=${encodeURIComponent(mission.moduleId)}`}
          className="group flex items-center gap-5 rounded-xl border border-brand/10 bg-brand/[0.03] px-6 py-5 backdrop-blur-sm transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.07)] sm:px-8 sm:py-6"
        >
          {/* Status icon */}
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.12)] dark:border-brand/25 dark:bg-brand/[0.08]">
            <Target className="size-5.5 text-brand/70 transition-all duration-300 group-hover:text-brand" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-brand/60 dark:text-brand/50">
                {mission.recommendation
                  ? mission.recommendation.description
                  : t("aiLab.dashboard.noProgressYet")}
              </span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-foreground transition-colors group-hover:text-brand sm:text-lg">
              {mission.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500/80 dark:text-slate-400/70 sm:text-sm">
              {mission.description}
            </p>
          </div>

          {/* Arrow */}
          <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 sm:flex dark:text-brand/50 dark:group-hover:text-brand/70">
            {mission.recommendation?.cta ??
              t("aiLab.dashboard.resumeJourney")}
            <ArrowRight className="size-3.5" />
          </div>
        </Link>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/CurrentMission.tsx
git commit -m "feat(dashboard): add CurrentMission with learning-registry intelligence"
```

---

### Task 4: Create ContinueLearning component

**Files:**
- Create: `src/components/ai-lab/dashboard/ContinueLearning.tsx`

**Interfaces:**
- Consumes: `getOverallProgress` from `@/data/minimind/learning-registry`, `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `aiLab.dashboard.*` i18n keys (Task 1)
- Produces: `ContinueLearning` — default-exported function component, no props

- [ ] **Step 1: Create the component file**

Write: `src/components/ai-lab/dashboard/ContinueLearning.tsx`

```tsx
"use client";

// ============================================================
// ContinueLearning — localStorage resume card
// ============================================================
//
// Reads UserProgress from localStorage. If the user has started
// learning, shows a resume card with the last active module,
// overall progress, and three action buttons.
//
// States:
//   - Has progress: shows resume card with 3 actions
//   - No progress / first visit: renders nothing (return null)
//
// Data sources:
//   - localStorage("minimind-learning-progress") → UserProgress
//   - getOverallProgress(progress) → stats
//   - MINIMIND_MODULES → resolve module title
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  BookOpen,
  Brain,
  FlaskConical,
  ArrowRight,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { getOverallProgress } from "@/data/minimind/learning-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import type { UserProgress } from "@/data/minimind/learning-registry";

// ============================================================
// Types
// ============================================================

interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

interface ResumeData {
  moduleId: string;
  moduleTitle: string;
  percentComplete: number;
  modulesCompleted: number;
  modulesTotal: number;
  lastUpdated: string;
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// localStorage helpers
// ============================================================

function loadResumeData(): ResumeData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return null;

    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;

    const progress: UserProgress = {
      nodeStatus: parsed.nodeStatus ?? {},
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };

    // Must have at least one non-locked node to show resume
    const hasAnyProgress = Object.values(progress.nodeStatus).some(
      (s) => s !== "locked"
    );
    if (!hasAnyProgress) return null;

    // Find the in_progress node, or fall back to last completed
    let activeSourceId = "";
    for (const [id, status] of Object.entries(progress.nodeStatus)) {
      if (status === "in_progress") {
        activeSourceId = id;
        break;
      }
    }
    if (!activeSourceId) {
      // Fallback: last completed
      for (const [id, status] of Object.entries(progress.nodeStatus)) {
        if (status === "completed" || status === "mastered") {
          activeSourceId = id;
        }
      }
    }

    // Strip "module:" prefix to get MINIMIND_MODULES id
    const moduleId = activeSourceId.replace(/^module:/, "");
    const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);

    const stats = getOverallProgress(progress);

    return {
      moduleId,
      moduleTitle: mod?.title ?? moduleId,
      percentComplete: stats.percentComplete,
      modulesCompleted: stats.modulesCompleted,
      modulesTotal: stats.modulesTotal,
      lastUpdated: progress.lastUpdated,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Time ago formatter
// ============================================================

function formatTimeAgo(isoString: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return "";
  }
}

// ============================================================
// ContinueLearning
// ============================================================

export function ContinueLearning() {
  const { t } = useTranslation();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);

  useEffect(() => {
    setResumeData(loadResumeData());
  }, []);

  // ── Hidden when no progress ──
  if (!resumeData) return null;

  const timeAgo = formatTimeAgo(resumeData.lastUpdated);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.continueLearning" />

      <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-6 py-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: resume info */}
          <div className="flex items-center gap-4">
            {/* Progress ring (simplified as filled circle) */}
            <div className="relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-brand/20 bg-brand/[0.04] dark:border-brand/25 dark:bg-brand/[0.06]">
              <span className="text-sm font-bold tabular-nums text-brand dark:text-brand-light">
                {resumeData.percentComplete}%
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {resumeData.moduleTitle}
              </p>
              <p className="mt-0.5 text-xs text-slate-500/80 dark:text-slate-400/70">
                {resumeData.modulesCompleted}/{resumeData.modulesTotal}{" "}
                {t("aiLab.dashboard.modulesStat")}
                {" · "}
                {resumeData.percentComplete}%{" "}
                {t("aiLab.dashboard.progressStat")}
              </p>
              {timeAgo && (
                <p className="mt-1.5 flex items-center gap-1 text-[0.65rem] text-slate-400/80 dark:text-slate-500/70">
                  <Clock className="size-3" />
                  {t("aiLab.dashboard.lastActive")}: {timeAgo}
                </p>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Continue Journey */}
            <Link
              href={`/ai-lab/journey?module=${encodeURIComponent(resumeData.moduleId)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-3.5 py-2 text-xs font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
            >
              <BookOpen className="size-3.5" />
              {t("aiLab.dashboard.resumeJourney")}
              <ArrowRight className="size-3" />
            </Link>

            {/* Open Knowledge Graph */}
            <Link
              href="/ai-lab/knowledge"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.02] px-3.5 py-2 text-xs font-medium text-slate-600/80 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400/70 dark:hover:border-brand/25 dark:hover:text-brand/70"
            >
              <Brain className="size-3.5" />
              {t("aiLab.dashboard.openKnowledgeGraph")}
            </Link>

            {/* Run Experiment */}
            <Link
              href="/ai-lab/experiments"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/[0.03] px-3.5 py-2 text-xs font-medium text-amber-600/80 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-600 dark:border-amber-500/20 dark:text-amber-500/60 dark:hover:border-amber-500/35 dark:hover:text-amber-500/80"
            >
              <FlaskConical className="size-3.5" />
              {t("aiLab.dashboard.runExperiment")}
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/ContinueLearning.tsx
git commit -m "feat(dashboard): add ContinueLearning resume card with localStorage"
```

---

### Task 5: Create ExplorationLinks component

**Files:**
- Create: `src/components/ai-lab/dashboard/ExplorationLinks.tsx`

**Interfaces:**
- Consumes: `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`, `aiLab.dashboard.explorationHub` i18n key (Task 1), `aiLab.nav.*` and existing `aiLab.sections.*` i18n keys
- Produces: `ExplorationLinks` — default-exported function component, no props

- [ ] **Step 1: Create the component file**

Write: `src/components/ai-lab/dashboard/ExplorationLinks.tsx`

```tsx
"use client";

// ============================================================
// ExplorationLinks — 6-card navigation hub grid
// ============================================================
//
// Responsive grid of navigation cards linking to all AI Lab
// sub-pages. Each card follows the existing CTA card pattern
// from JourneySection / KnowledgeMap / ForwardPlaygroundSection.
//
// Grid layout:
//   1 col (mobile) → 2 col (sm) → 3 col (lg)
//
// Data sources:
//   - MINIMIND_MODULES → module count badges
//   - MINIMIND_EXPERIMENTS → active experiment count badge
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  Map,
  Brain,
  Layers,
  FlaskConical,
  Gamepad2,
  Cpu,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { getActiveExperiments } from "@/data/minimind/experiment-registry";
import { cn } from "@/lib/utils";

// ============================================================
// Route config
// ============================================================

interface ExploreRoute {
  key: string;
  icon: LucideIcon;
  href: string;
  i18nLabel: string;
  i18nDesc: string;
  /** Tailwind classes for the icon container border + glow */
  colorBorder: string;
  colorGlow: string;
  colorText: string;
  colorHoverBorder: string;
  /** Optional: derive a badge string from registries */
  getBadge?: () => string | null;
}

function buildRoutes(): ExploreRoute[] {
  const implementedCount = MINIMIND_MODULES.filter(
    (m) => m.implemented
  ).length;
  const totalCount = MINIMIND_MODULES.length;
  const activeExperimentCount = getActiveExperiments().length;

  return [
    {
      key: "journey",
      icon: Map,
      href: "/ai-lab/journey",
      i18nLabel: "aiLab.sections.learningJourney",
      i18nDesc: "aiLab.dashboard.journeyDesc",
      colorBorder: "border-emerald-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]",
      colorText: "text-emerald-500/60 group-hover:text-emerald-500/80",
      colorHoverBorder: "group-hover:border-emerald-500/40",
      getBadge: () => `${implementedCount}/${totalCount} modules`,
    },
    {
      key: "knowledge",
      icon: Brain,
      href: "/ai-lab/knowledge",
      i18nLabel: "aiLab.sections.knowledgeMap",
      i18nDesc: "aiLab.dashboard.knowledgeDesc",
      colorBorder: "border-brand/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)]",
      colorText: "text-brand/60 group-hover:text-brand/80",
      colorHoverBorder: "group-hover:border-brand/40",
      getBadge: () => `${MINIMIND_MODULES.length} modules`,
    },
    {
      key: "experience",
      icon: Layers,
      href: "/ai-lab/experience",
      i18nLabel: "aiLab.dashboard.experienceLabel",
      i18nDesc: "aiLab.dashboard.experienceDesc",
      colorBorder: "border-violet-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]",
      colorText: "text-violet-500/60 group-hover:text-violet-500/80",
      colorHoverBorder: "group-hover:border-violet-500/40",
    },
    {
      key: "experiments",
      icon: FlaskConical,
      href: "/ai-lab/experiments",
      i18nLabel: "aiLab.dashboard.experimentsLabel",
      i18nDesc: "aiLab.dashboard.experimentsDesc",
      colorBorder: "border-amber-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]",
      colorText: "text-amber-500/60 group-hover:text-amber-500/80",
      colorHoverBorder: "group-hover:border-amber-500/40",
      getBadge: () => `${activeExperimentCount} active`,
    },
    {
      key: "playground",
      icon: Gamepad2,
      href: "/ai-lab/playground",
      i18nLabel: "aiLab.dashboard.playgroundLabel",
      i18nDesc: "aiLab.dashboard.playgroundDesc",
      colorBorder: "border-sky-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(14,165,233,0.1)]",
      colorText: "text-sky-500/60 group-hover:text-sky-500/80",
      colorHoverBorder: "group-hover:border-sky-500/40",
    },
    {
      key: "inference",
      icon: Cpu,
      href: "/ai-lab/inference",
      i18nLabel: "aiLab.dashboard.inferenceLabel",
      i18nDesc: "aiLab.dashboard.inferenceDesc",
      colorBorder: "border-rose-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(244,63,94,0.1)]",
      colorText: "text-rose-500/60 group-hover:text-rose-500/80",
      colorHoverBorder: "group-hover:border-rose-500/40",
    },
  ];
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" },
  }),
};

// ============================================================
// ExplorationLinks
// ============================================================

export function ExplorationLinks() {
  const { t } = useTranslation();
  const routes = buildRoutes();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.explorationHub" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {routes.map((route, i) => {
          const badge = route.getBadge?.() ?? null;

          return (
            <motion.div
              key={route.key}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
            >
              <Link
                href={route.href}
                className={cn(
                  "group flex flex-col items-center justify-center rounded-xl border bg-brand/[0.02] px-5 py-10 text-center transition-all duration-300 hover:bg-brand/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:bg-[rgba(var(--brand-rgb),0.06)]",
                  route.colorBorder,
                  "dark:border-white/[0.06]",
                  route.colorHoverBorder,
                  "dark:hover:border-white/[0.12]"
                )}
              >
                {/* Icon container */}
                <div
                  className={cn(
                    "mb-3 flex size-12 items-center justify-center rounded-full border bg-brand/[0.04] transition-all duration-300 dark:bg-brand/[0.06]",
                    route.colorBorder,
                    route.colorHoverBorder,
                    route.colorGlow,
                    "dark:border-brand/20 dark:group-hover:border-brand/35"
                  )}
                >
                  <route.icon
                    className={cn(
                      "size-5.5 transition-all duration-300",
                      route.colorText
                    )}
                  />
                </div>

                {/* Label */}
                <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                  {t(route.i18nLabel)}
                </h3>

                {/* Description */}
                <p className="mt-1.5 max-w-[18rem] text-xs leading-relaxed text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
                  {t(route.i18nDesc)}
                </p>

                {/* Footer: badge + arrow */}
                <div className="mt-3 flex items-center gap-2">
                  {badge && (
                    <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-2.5 py-0.5 text-[0.6rem] font-medium text-slate-500/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400/70">
                      {badge}
                    </span>
                  )}
                  <ArrowRight className="size-3 text-slate-400/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
```

Note: This component references the following new i18n keys that need to be added to Task 1's deliverables. These were not included in Task 1 as written — they must be added to en.json and zh-CN.json alongside the Task 1 keys:

**Additional en.json keys for `aiLab.dashboard`:**
```json
"journeyDesc": "Follow a guided learning path through all MiniMind modules — from tokenization to inference, with progress tracking and concept mastery.",
"knowledgeDesc": "Explore the full knowledge graph — modules, concepts, experiments, and their relationships visualized as an interactive network.",
"experienceLabel": "Architecture Experience",
"experienceDesc": "Walk through the MiniMind pipeline step by step — see how data flows from text input through every module to output.",
"experimentsLabel": "Experiments",
"experimentsDesc": "Run interactive experiments — compare tokenizers, explore embeddings, inspect attention patterns, and more.",
"playgroundLabel": "Playground",
"playgroundDesc": "Interact with every MiniMind module directly — tweak parameters, visualize internals, and see results in real time.",
"inferenceLabel": "Inference",
"inferenceDesc": "Watch MiniMind generate text token by token — explore temperature, top-k, top-p sampling, and KV-cache behavior."
```

**Additional zh-CN.json keys for `aiLab.dashboard`:**
```json
"journeyDesc": "跟随引导式学习路径，遍历所有 MiniMind 模块——从分词到推理，含进度追踪和概念掌握。",
"knowledgeDesc": "探索完整知识图谱——模块、概念、实验及其关系以交互式网络可视化呈现。",
"experienceLabel": "架构体验",
"experienceDesc": "逐步浏览 MiniMind 管线——观察数据如何从文本输入流经每个模块到达输出。",
"experimentsLabel": "实验工坊",
"experimentsDesc": "运行交互式实验——对比分词器、探索嵌入、检查注意力模式等。",
"playgroundLabel": "演练场",
"playgroundDesc": "直接与每个 MiniMind 模块交互——调整参数、可视化内部结构、实时查看结果。",
"inferenceLabel": "推理",
"inferenceDesc": "观察 MiniMind 逐 token 生成文本——探索温度采样、Top-K、Top-P 和 KV-Cache 行为。"
```

- [ ] **Step 2: Update Task 1 i18n keys**

The additional keys listed above must be added to both en.json and zh-CN.json. If implementing sequentially, add them now. If Task 1 was already committed, add them as a follow-up commit.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/dashboard/ExplorationLinks.tsx
# If i18n keys were added separately:
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(dashboard): add ExplorationLinks 6-card navigation grid"
```

---

### Task 6: Create AiLabDashboard composition root

**Files:**
- Create: `src/components/ai-lab/dashboard/AiLabDashboard.tsx`

**Interfaces:**
- Consumes: `DashboardHero` (Task 2), `CurrentMission` (Task 3), `ContinueLearning` (Task 4), `ExplorationLinks` (Task 5), `ModuleProgressGrid` from `@/components/ai-lab/ModuleProgressGrid` (existing)
- Produces: `AiLabDashboard` — default-exported function component, no props

- [ ] **Step 1: Create the composition root**

Write: `src/components/ai-lab/dashboard/AiLabDashboard.tsx`

```tsx
"use client";

// ============================================================
// AiLabDashboard — AI Lab Dashboard composition root
// ============================================================
//
// Replaces AiLabClient as the /ai-lab page body. Composes 5
// dashboard sections from existing intelligence:
//
//   1. DashboardHero    — AI Lab identity + live stats
//   2. CurrentMission   — learning-registry derived next action
//   3. ContinueLearning — localStorage resume card
//   4. ModuleProgressGrid — 8-module mastery overview (existing)
//   5. ExplorationLinks  — 6-card sub-page navigation grid
//
// All data comes from SSOT registries. Zero new metadata.
// Existing AiLabClient.tsx is preserved, not modified.
// ============================================================

import { DashboardHero } from "./DashboardHero";
import { CurrentMission } from "./CurrentMission";
import { ContinueLearning } from "./ContinueLearning";
import { ExplorationLinks } from "./ExplorationLinks";
import { ModuleProgressGrid } from "../ModuleProgressGrid";

export function AiLabDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <DashboardHero />
      <CurrentMission />
      <ContinueLearning />
      <ModuleProgressGrid />
      <ExplorationLinks />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, no errors. AiLabDashboard exists but is not yet wired to the page.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/AiLabDashboard.tsx
git commit -m "feat(dashboard): add AiLabDashboard composition root"
```

---

### Task 7: Switch page.tsx to render AiLabDashboard

**Files:**
- Modify: `src/app/ai-lab/page.tsx`

**Interfaces:**
- Consumes: `AiLabDashboard` from `@/components/ai-lab/dashboard/AiLabDashboard` (Task 6)
- Produces: `/ai-lab` renders the new dashboard instead of old AiLabClient

- [ ] **Step 1: Change the import and render**

Read the current file at `src/app/ai-lab/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AiLabClient } from "@/components/ai-lab/AiLabClient";

export const metadata: Metadata = {
  title: "AI Lab · MiniMind Research",
  description:
    "AI Lab — Building MiniMind from scratch. A systematic exploration of LLM internals covering Tokenizer, Embedding, Attention, Transformer, Pretrain, SFT, LoRA, RLHF, RAG, and Agent.",
};

export default function AiLabPage() {
  return <AiLabClient />;
}
```

Replace `AiLabClient` with `AiLabDashboard`:

```tsx
import type { Metadata } from "next";
import { AiLabDashboard } from "@/components/ai-lab/dashboard/AiLabDashboard";

export const metadata: Metadata = {
  title: "AI Lab · MiniMind Research",
  description:
    "AI Lab — Building MiniMind from scratch. A systematic exploration of LLM internals covering Tokenizer, Embedding, Attention, Transformer, Pretrain, SFT, LoRA, RLHF, RAG, and Agent.",
};

export default function AiLabPage() {
  return <AiLabDashboard />;
}
```

Only two lines change: the import and the JSX return.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS, no errors, no warnings.

- [ ] **Step 3: Commit**

```bash
git add src/app/ai-lab/page.tsx
git commit -m "feat(dashboard): switch /ai-lab to AiLabDashboard"
```

---

### Integration Verification

After all 7 tasks, verify the complete Phase 24-B:

- [ ] `/ai-lab` renders 5 sections: DashboardHero, CurrentMission, ContinueLearning, ModuleProgressGrid, ExplorationLinks
- [ ] DashboardHero shows live stats: module count, phase label, progress %
- [ ] CurrentMission shows next learning module (or fallback to Tokenizer on first visit)
- [ ] ContinueLearning is hidden when no localStorage progress exists
- [ ] ContinueLearning shows resume card with 3 action buttons when progress exists
- [ ] ModuleProgressGrid renders unchanged from Phase 24-A
- [ ] ExplorationLinks shows 6 navigation cards in responsive grid (1→2→3 columns)
- [ ] All 6 ExplorationLinks cards link to correct sub-pages
- [ ] FloatingNavDock is visible on the dashboard (Dashboard item active)
- [ ] BreadcrumbBar is hidden on dashboard (correct — it's the root)
- [ ] All glass-card visual patterns match existing sections
- [ ] Mobile responsive: all sections adapt correctly
- [ ] `npm run build` passes with no errors or warnings
- [ ] Old `AiLabClient.tsx` and its 11 section components still exist on disk (untouched)
