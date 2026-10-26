# Project Evolution Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/ai-lab/journey` route from `LearningJourneyPageClient` to `ProjectEvolutionPageClient` — a MiniMind project evolution timeline derived from `module-registry.ts`.

**Architecture:** New `src/components/minimind/evolution/` directory with `ProjectEvolutionPageClient.tsx` (page-level component) and `index.ts` (barrel). Reads `MINIMIND_MODULES` and `getModuleExperiments()` from `module-registry.ts`. Groups modules by phase, renders card grids. Old `LearningJourneyPageClient.tsx` preserved.

**Tech Stack:** Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui (Card), Framer Motion, react-i18next

## Global Constraints

- All files must be within `d:\123\HOU Universe`
- TypeScript strict mode, no `any` types
- Tailwind CSS only, no CSS files
- shadcn/ui components only
- Framer Motion for animations
- `npm run build` must pass with no errors or warnings
- No modifications to `src/data/minimind/**` or `src/lib/minimind/**`
- No learning/mastery/progress/recommendation/student language in new component
- Old `LearningJourneyPageClient.tsx` and its index.ts barrel must remain untouched

---

### Task 1: Add i18n translation keys for evolution page

**Files:**
- Modify: `src/lib/i18n/locales/en.json` (after `"learning": {...}` closing `}`)
- Modify: `src/lib/i18n/locales/zh-CN.json` (after `"learning": {...}` closing `}`)

**Interfaces:**
- Produces: `t("minimind.evolution.*")` translation keys available to all components

- [ ] **Step 1: Add `evolution` key to en.json**

In `src/lib/i18n/locales/en.json`, find the `"learning"` block ending at line ~881 (`}` closing the learning object). Add a comma after that closing brace, then insert:

```json
"evolution": {
  "subhead": "MiniMind Project",
  "heading": "Project Evolution Timeline",
  "intro": "Track the evolution of MiniMind — each module builds on the last, from tokenization to inference.",
  "phases": {
    "foundation": "Foundation Layer",
    "training": "Training Pipeline",
    "advanced": "Advanced Capabilities"
  },
  "status": {
    "completed": "Completed",
    "in-progress": "In Progress",
    "upcoming": "Upcoming"
  },
  "dependencies": "Dependencies",
  "experiments": "Experiments",
  "source": "Source",
  "playground": "Open Playground",
  "noExperiments": "No experiments yet",
  "noDependencies": "No dependencies",
  "plannedCount": "{{count}} planned",
  "activeCount": "{{count}} active",
  "viewExperiment": "View experiment"
}
```

- [ ] **Step 2: Add `evolution` key to zh-CN.json**

In `src/lib/i18n/locales/zh-CN.json`, find the `"learning"` block closing. Add a comma after that closing brace, then insert:

```json
"evolution": {
  "subhead": "MiniMind 项目",
  "heading": "项目演进时间线",
  "intro": "追踪 MiniMind 的演进历程 — 每个模块都建立在前一个之上，从分词到推理。",
  "phases": {
    "foundation": "基础层",
    "training": "训练管线",
    "advanced": "高级能力"
  },
  "status": {
    "completed": "已完成",
    "in-progress": "进行中",
    "upcoming": "待开始"
  },
  "dependencies": "依赖",
  "experiments": "实验",
  "source": "源码",
  "playground": "打开 Playground",
  "noExperiments": "暂无实验",
  "noDependencies": "无依赖",
  "plannedCount": "{{count}} 个计划中",
  "activeCount": "{{count}} 个活跃",
  "viewExperiment": "查看实验"
}
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/en.json','utf8')); console.log('en.json OK')"`
Expected: `en.json OK`

Run: `node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/zh-CN.json','utf8')); console.log('zh-CN.json OK')"`
Expected: `zh-CN.json OK`

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add minimind.evolution translation keys"
```

---

### Task 2: Create ProjectEvolutionPageClient component

**Files:**
- Create: `src/components/minimind/evolution/ProjectEvolutionPageClient.tsx`

**Interfaces:**
- Consumes: `MINIMIND_MODULES`, `MiniMindModule`, `getModuleExperiments` from `@/data/minimind/module-registry`
- Consumes: `MiniMindExperiment` from `@/data/minimind/experiment-registry`
- Consumes: `useTranslation` from `react-i18next`
- Consumes: `t("minimind.evolution.*")` keys from Task 1
- Produces: `export function ProjectEvolutionPageClient()` — default export for the `/ai-lab/journey` page

- [ ] **Step 1: Write the component**

Create `src/components/minimind/evolution/ProjectEvolutionPageClient.tsx`:

```tsx
"use client";

// ============================================================
// ProjectEvolutionPageClient — MiniMind Project Evolution Timeline
// ============================================================

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  Sparkles,
  GitBranch,
  ExternalLink,
  FlaskConical,
  FolderOpen,
  ChevronRight,
  Package,
} from "lucide-react";
import {
  MINIMIND_MODULES,
  getModuleExperiments,
  type MiniMindModule,
} from "@/data/minimind/module-registry";
import type { MiniMindExperiment } from "@/data/minimind/experiment-registry";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ============================================================
// Constants
// ============================================================

const PHASE_ORDER: MiniMindModule["phase"][] = [
  "foundation",
  "training",
  "advanced",
];

const STATUS_COLORS: Record<
  MiniMindModule["status"],
  { border: string; bg: string; text: string; dot: string }
> = {
  completed: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  "in-progress": {
    border: "border-amber-500/20",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  upcoming: {
    border: "border-slate-500/15",
    bg: "bg-slate-500/5",
    text: "text-slate-400 dark:text-slate-500",
    dot: "bg-slate-400",
  },
};

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" },
  }),
};

// ============================================================
// Sub-components
// ============================================================

function StatusBadge({ status }: { status: MiniMindModule["status"] }) {
  const { t } = useTranslation();
  const c = STATUS_COLORS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium",
        c.border,
        c.bg,
        c.text
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {t(`minimind.evolution.status.${status}`)}
    </span>
  );
}

function ExperimentList({ experiments }: { experiments: MiniMindExperiment[] }) {
  const { t } = useTranslation();

  if (experiments.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("minimind.evolution.noExperiments")}
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {experiments.map((exp) => (
        <li key={exp.id} className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              exp.status === "active"
                ? "bg-emerald-400"
                : exp.status === "planned"
                  ? "bg-amber-400"
                  : "bg-slate-300"
            )}
          />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {exp.title}
          </span>
          {exp.status === "planned" && (
            <span className="ml-1 rounded border border-amber-500/15 bg-amber-500/[0.06] px-1.5 py-px text-[0.6rem] text-amber-600 dark:text-amber-400">
              {t("minimind.evolution.plannedCount", { count: "" }).replace(
                "{{count}} ",
                ""
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ModuleCard({
  module: mod,
  index,
}: {
  module: MiniMindModule;
  index: number;
}) {
  const { t } = useTranslation();
  const experiments = useMemo(
    () => getModuleExperiments(mod.id),
    [mod.id]
  );

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className="group relative flex flex-col rounded-xl border border-slate-500/10 bg-background/60 p-5 transition-all hover:border-brand/15 hover:shadow-lg hover:shadow-brand/[0.04] dark:border-white/[0.06] dark:hover:border-brand/20"
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand/10 bg-brand/[0.04] text-[0.7rem] font-mono font-bold text-brand">
            {mod.order}
          </span>
          <h3 className="truncate text-base font-bold text-foreground">
            {mod.title}
          </h3>
        </div>
        <StatusBadge status={mod.status} />
      </div>

      {/* Description */}
      <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {mod.description}
      </p>

      {/* Dependencies */}
      <div className="mb-3">
        <h4 className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
          <GitBranch className="size-3" />
          {t("minimind.evolution.dependencies")}
        </h4>
        {mod.metadata.dependencies &&
        mod.metadata.dependencies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {mod.metadata.dependencies.map((depId) => (
              <span
                key={depId}
                className="rounded-md border border-slate-500/10 bg-slate-500/[0.04] px-2 py-0.5 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400"
              >
                {depId}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("minimind.evolution.noDependencies")}
          </p>
        )}
      </div>

      {/* Experiments */}
      <div className="mb-3">
        <h4 className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
          <FlaskConical className="size-3" />
          {t("minimind.evolution.experiments")}
          {experiments.length > 0 && (
            <span className="ml-0.5 rounded-full bg-brand/[0.08] px-1.5 py-px text-[0.6rem] text-brand">
              {experiments.length}
            </span>
          )}
        </h4>
        <ExperimentList experiments={experiments} />
      </div>

      {/* Source path */}
      <div className="mb-4">
        <h4 className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
          <FolderOpen className="size-3" />
          {t("minimind.evolution.source")}
        </h4>
        <code className="block rounded-md border border-slate-500/10 bg-slate-500/[0.04] px-2 py-1 text-[0.65rem] font-mono text-slate-500 dark:text-slate-400">
          {mod.sourcePath}
        </code>
      </div>

      {/* Playground link */}
      <div className="mt-auto">
        <Link
          href={mod.metadata.playgroundPath ?? "#"}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all",
            mod.implemented
              ? "border-brand/15 bg-brand/[0.04] text-brand hover:bg-brand/[0.08] hover:border-brand/25"
              : "pointer-events-none border-slate-500/10 bg-slate-500/[0.02] text-slate-400"
          )}
        >
          <ExternalLink className="size-3.5" />
          {t("minimind.evolution.playground")}
          {mod.implemented && (
            <ChevronRight className="size-3.5 ml-auto opacity-50" />
          )}
        </Link>
      </div>
    </motion.div>
  );
}

function PhaseSection({
  phase,
  modules,
}: {
  phase: MiniMindModule["phase"];
  modules: MiniMindModule[];
}) {
  const { t } = useTranslation();

  if (modules.length === 0) return null;

  return (
    <section className="space-y-5">
      {/* Phase header */}
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg border border-brand/15 bg-brand/[0.06]">
          <Package className="size-4 text-brand" />
        </span>
        <h2 className="text-xl font-bold text-foreground">
          {t(`minimind.evolution.phases.${phase}`)}
        </h2>
        <span className="rounded-full border border-slate-500/10 bg-slate-500/[0.04] px-2 py-0.5 text-[0.65rem] text-slate-400">
          {modules.length} {modules.length === 1 ? "module" : "modules"}
        </span>
      </div>

      {/* Card grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod, i) => (
          <ModuleCard key={mod.id} module={mod} index={i} />
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Page-level component
// ============================================================

export function ProjectEvolutionPageClient() {
  const { t } = useTranslation();

  // Group modules by phase, sorted by order
  const phaseGroups = useMemo(() => {
    const groups: Record<string, MiniMindModule[]> = {};
    for (const phase of PHASE_ORDER) {
      groups[phase] = MINIMIND_MODULES.filter(
        (m) => m.phase === phase
      ).sort((a, b) => a.order - b.order);
    }
    return groups;
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ================================================================ */}
      {/* Page Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("minimind.evolution.subhead")}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("minimind.evolution.heading")}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {t("minimind.evolution.intro")}
          </p>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Phase Sections */}
      {/* ================================================================ */}
      <div className="mt-16 space-y-16">
        {PHASE_ORDER.map((phase) => (
          <PhaseSection
            key={phase}
            phase={phase}
            modules={phaseGroups[phase] ?? []}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles (type-check)**

Run: `npx tsc --noEmit --pretty src/components/minimind/evolution/ProjectEvolutionPageClient.tsx 2>&1 | head -20`
Expected: No errors (may show unrelated project-wide errors — focus on errors in this file only)

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/evolution/ProjectEvolutionPageClient.tsx
git commit -m "feat(evolution): add ProjectEvolutionPageClient — module timeline cards by phase"
```

---

### Task 3: Create barrel export for evolution components

**Files:**
- Create: `src/components/minimind/evolution/index.ts`

**Interfaces:**
- Produces: `export { ProjectEvolutionPageClient } from "./ProjectEvolutionPageClient"`

- [ ] **Step 1: Write barrel file**

Create `src/components/minimind/evolution/index.ts`:

```ts
// Component barrel — re-exports all evolution UI components.

export { ProjectEvolutionPageClient } from "./ProjectEvolutionPageClient";
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/evolution/index.ts
git commit -m "feat(evolution): add barrel export for evolution components"
```

---

### Task 4: Update journey page route to use new component

**Files:**
- Modify: `src/app/ai-lab/journey/page.tsx` (line 2, line 5-7, line 11)

**Interfaces:**
- Consumes: `ProjectEvolutionPageClient` from `@/components/minimind/evolution`
- Removes: `LearningJourneyPageClient` import from `@/components/minimind/learning`

- [ ] **Step 1: Update page.tsx**

Replace the contents of `src/app/ai-lab/journey/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { ProjectEvolutionPageClient } from "@/components/minimind/evolution";

export const metadata: Metadata = {
  title: "Project Evolution — MiniMind",
  description:
    "Track the evolution of the MiniMind project — from tokenization through inference, each module building on the last.",
};

export default function JourneyPage() {
  return <ProjectEvolutionPageClient />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/ai-lab/journey/page.tsx
git commit -m "feat(journey): switch /ai-lab/journey from LearningJourney to ProjectEvolution"
```

---

### Task 5: Build and verify

**Files:**
- No new files — verification only

- [ ] **Step 1: Run full build**

Run: `npm run build 2>&1`
Expected: Build succeeds with no errors, no warnings

- [ ] **Step 2: Verify old component still compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "LearningJourneyPageClient" || echo "No errors for LearningJourneyPageClient"`
Expected: `No errors for LearningJourneyPageClient`

- [ ] **Step 3: Verify no forbidden terms in new component**

Run: `grep -inE "learning|mastery|progress|recommendation|student" src/components/minimind/evolution/ProjectEvolutionPageClient.tsx || echo "PASS: No forbidden terms found"`
Expected: `PASS: No forbidden terms found`

- [ ] **Step 4: Verify forbidden terms only appear in i18n key references**

Run: `grep -nE "learning|mastery|progress|recommendation|student" src/components/minimind/evolution/ProjectEvolutionPageClient.tsx`
Expected: No output (no matches at all)

- [ ] **Step 5: Commit (if any build fixes were needed)**

Only if build required changes. Otherwise skip.

---

## Summary

| Task | Files | Action |
|---|---|---|
| 1 | `src/lib/i18n/locales/en.json`, `zh-CN.json` | Add `minimind.evolution` keys |
| 2 | `src/components/minimind/evolution/ProjectEvolutionPageClient.tsx` | Create page component |
| 3 | `src/components/minimind/evolution/index.ts` | Create barrel export |
| 4 | `src/app/ai-lab/journey/page.tsx` | Swap import + component |
| 5 | — | Build verification |
