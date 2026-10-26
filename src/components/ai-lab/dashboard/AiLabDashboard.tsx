"use client";

// ============================================================
// AiLabDashboard — MiniMind Research Studio Dashboard (Phase 70)
// ============================================================
//
// Five curated sections forming one coherent product experience:
//
//   1. DashboardHero       — AI Lab identity + hero CTAs
//   2. CurrentMission      — next recommended action from real data
//   3. ContinueLearning    — resume card (hidden when no progress)
//   4. ModuleProgressGrid  — 8 MiniMind modules with mastery status
//   5. ExplorationLinks    — secondary navigation hub
//
// All data is sourced exclusively through the adapter layer:
//   src/lib/ai-lab/adapters/
//
// Zero direct registry imports in this file or its children.
// ============================================================

import { DashboardHero } from "./DashboardHero";
import { CurrentMission } from "./CurrentMission";
import { ContinueLearning } from "./ContinueLearning";
import { ModuleProgressGrid } from "./ModuleProgressGrid";
import { ExplorationLinks } from "./ExplorationLinks";

// ============================================================
// AiLabDashboard — composition root
// ============================================================

export function AiLabDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ── Section 1: Hero ── */}
      <DashboardHero />

      {/* ── Section 2: Current Mission ── */}
      <CurrentMission />

      {/* ── Section 3: Continue Learning ── */}
      <ContinueLearning />

      {/* ── Section 4: Module Progress Grid ── */}
      <ModuleProgressGrid />

      {/* ── Section 5: Exploration Links ── */}
      <ExplorationLinks />

      {/* ── Bottom spacer ── */}
      <div className="h-16" />
    </div>
  );
}
