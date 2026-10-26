// ============================================================
// moduleLinks — Navigation route configuration with computed badges
// ============================================================
//
// This adapter computes navigation route data for the AI Lab
// dashboard. Each route gets a resolved label/description i18n key,
// a color palette, and optionally a live badge computed from
// registry data. Components import from HERE, never from
// registries directly.
//
// SSOT sources:
//   - src/data/minimind/module-registry.ts
//   - src/data/minimind/experiment-registry.ts
// ============================================================

import type { LucideIcon } from "lucide-react";
import {
  Map,
  Brain,
  Layers,
  FlaskConical,
  Gamepad2,
  Cpu,
} from "lucide-react";
import { MINIMIND_MODULES, type MiniMindModule } from "@/data/minimind/module-registry";
import { computeModuleStats, computeExperimentStats } from "./progressAdapter";

// ============================================================
// Types
// ============================================================

export interface ExploreRoute {
  /** Unique route key (matches nav key) */
  key: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Next.js href */
  href: string;
  /** i18n key for the display label */
  i18nLabel: string;
  /** i18n key for the description */
  i18nDesc: string;
  /** Tailwind classes for the icon container border */
  colorBorder: string;
  /** Tailwind classes for the hover glow effect */
  colorGlow: string;
  /** Tailwind classes for the icon text color */
  colorText: string;
  /** Tailwind classes for the hover border */
  colorHoverBorder: string;
  /** Optional: derive a badge string from live registries */
  getBadge?: () => string | null;
}

export interface ModuleNavLink {
  moduleId: string;
  title: string;
  playgroundPath: string;
  implemented: boolean;
}

// ============================================================
// Route configuration
// ============================================================

/** Build the 6-card exploration hub route list with live badges */
export function buildExploreRoutes(): ExploreRoute[] {
  const moduleStats = computeModuleStats();
  const experimentStats = computeExperimentStats();

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
      getBadge: () => `${moduleStats.implemented}/${moduleStats.total} modules`,
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
      getBadge: () => `${moduleStats.total} modules`,
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
      getBadge: () => `${experimentStats.active} active`,
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

/** Build module-level navigation links for the module galaxy */
export function buildModuleNavLinks(): ModuleNavLink[] {
  return MINIMIND_MODULES.map((m) => ({
    moduleId: m.id,
    title: m.title,
    playgroundPath: m.metadata.playgroundPath ?? "/ai-lab/playground",
    implemented: m.implemented,
  }));
}

/** Re-export for convenience — type-only */
export type { MiniMindModule };
