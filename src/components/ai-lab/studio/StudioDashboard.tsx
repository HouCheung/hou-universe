"use client";

// ============================================================
// StudioDashboard — MiniMind Research Studio composition root
// ============================================================
// Phase 64: Premium AI research studio homepage.
//
// Composes 6 studio sections in a curated vertical layout:
//
//   1. StudioHero               — hero with CTAs + live stats
//   2. ModelOverviewCard         — model architecture overview
//   3. TrainingSummarySection    — KPI stat tiles
//   4. RecentExperimentsSection  — experiment history cards
//   5. ResearchInsightSection    — copilot analysis panel
//   6. QuickNavigationCards      — 4-card navigation hub
//
// All data is sourced exclusively through studioAdapter,
// which composes from the existing adapter layer.
//
// Zero direct registry imports in this file or its children.
// Zero business logic in components.
//
// Design: OpenAI Playground × HuggingFace Spaces × W&B
// ============================================================

import { StudioHero } from "./StudioHero";
import { ModelOverviewCard } from "./ModelOverviewCard";
import { TrainingSummarySection } from "./TrainingSummarySection";
import { RecentExperimentsSection } from "./RecentExperimentsSection";
import { ResearchInsightSection } from "./ResearchInsightSection";
import { QuickNavigationCards } from "./QuickNavigationCards";

// ============================================================
// StudioDashboard
// ============================================================

export function StudioDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ── Section 1: Hero ── */}
      <StudioHero />

      {/* ── Section 2 & 3: Model Overview + Training Summary (side-by-side on xl) ── */}
      <div className="mt-20 grid gap-8 sm:mt-28 xl:grid-cols-2">
        <ModelOverviewCard />
        <TrainingSummarySection />
      </div>

      {/* ── Section 4: Recent Experiments ── */}
      <div className="mt-20 sm:mt-28">
        <RecentExperimentsSection />
      </div>

      {/* ── Section 5: Research Insight ── */}
      <div className="mt-20 sm:mt-28">
        <ResearchInsightSection />
      </div>

      {/* ── Section 6: Quick Navigation ── */}
      <div className="mt-20 sm:mt-28">
        <QuickNavigationCards />
      </div>

      {/* ── Bottom spacer for breathing room ── */}
      <div className="h-16" />
    </div>
  );
}
