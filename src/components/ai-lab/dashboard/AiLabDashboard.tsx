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
