// ============================================================
// AI Lab — adapters/studioAdapter.ts
// ============================================================
// Phase 64: Aggregation adapter for the MiniMind Studio Dashboard.
//
// Composes data from existing adapters into UI-ready shapes for
// the redesigned AI research studio homepage. This adapter does
// NOT introduce new data sources or business logic — it purely
// aggregates and reformats data from the existing adapter layer.
//
// Data sources:
//   - progressAdapter        → hero stats
//   - ModelRegistry          → model overview
//   - trainingAdapter        → training summary
//   - trainingVisualizationAdapter → training summary (charts data)
//   - historyAdapter         → recent experiments
//   - researchCopilotAdapter → research insights
//
// Design principles:
//   - Pure functions — no side effects, no state mutation
//   - Typed outputs — every function returns a structured type
//   - Defensive — handles empty/missing data gracefully
//   - Browser-safe — no Node.js fs/path dependencies
//   - UI-ready — all formatting/derivation done here, not in components
// ============================================================

import { computeDashboardProgress } from "./progressAdapter";
import { listModels, getProductionModelConfig } from "@/lib/minimind/experiments/ModelRegistry";
import {
  getTrainingMetrics,
  getTrainingStats,
  hasTrainingHistory,
} from "./trainingAdapter";
import {
  getTrainingSummary as getVizTrainingSummary,
  hasObservatoryData,
} from "./trainingVisualizationAdapter";
import {
  getExperimentSummaryCards,
  hasHistory,
} from "./historyAdapter";
import {
  getLatestCopilotAnalysis,
  hasCopilotData,
} from "./researchCopilotAdapter";
import type { ExperimentSummaryCard } from "./historyAdapter";

// ============================================================
// Studio Hero Types
// ============================================================

export interface StudioAction {
  /** i18n key for the button label */
  labelKey: string;
  /** Route path relative to site root */
  href: string;
  /** lucide-react icon name — resolved in the UI component */
  icon: "Rocket" | "Gamepad2" | "Microscope";
  /** Visual variant for the action button */
  variant: "primary" | "secondary" | "outline";
}

export interface StudioStat {
  /** i18n key for the stat label */
  labelKey: string;
  /** Pre-formatted display value */
  value: string;
  /** lucide-react icon name */
  icon: "Box" | "Layers" | "TrendingUp";
}

export interface StudioHeroData {
  /** i18n key for the hero title */
  titleKey: string;
  /** i18n key for the hero subtitle */
  subtitleKey: string;
  /** i18n key for the mission statement */
  missionKey: string;
  /** Primary CTA buttons */
  primaryActions: StudioAction[];
  /** Live stat indicators below the CTAs */
  stats: StudioStat[];
}

// ============================================================
// Model Overview Types
// ============================================================

export interface ModelOverviewData {
  /** Whether model data is available */
  hasData: boolean;
  /** Unique model name (e.g. "tiny", "small") */
  modelName: string;
  /** Human-readable label (e.g. "MiniMind Small") */
  modelLabel: string;
  /** Model description */
  description: string;
  /** Estimated parameter count */
  params: number;
  /** Formatted param string (e.g. "12.45M") */
  paramsFormatted: string;
  /** Number of transformer layers */
  layers: number;
  /** Number of attention heads */
  heads: number;
  /** Vocabulary size */
  vocabSize: number;
  /** Formatted vocab size */
  vocabSizeFormatted: string;
  /** Hidden dimension (dModel) */
  dModel: number;
  /** Feed-forward dimension (dFF) */
  dFF: number;
  /** Formatted dFF */
  dFFFormatted: string;
  /** Maximum sequence length */
  maxSeqLen: number;
  /** Available model variants for selection */
  availableModels: Array<{ name: string; label: string }>;
  /** Training status derived from experiment history */
  trainingStatus: "idle" | "training" | "completed" | "no_data";
  /** Human-readable status label */
  statusLabel: string;
}

// ============================================================
// Training Summary Types
// ============================================================

export interface TrainingSummaryData {
  /** Whether training data exists */
  hasData: boolean;
  /** Latest experiment name */
  experimentName: string;
  /** Model label used in the experiment */
  modelLabel: string;
  /** Current lifecycle status */
  status: string;
  /** Final training loss */
  finalLoss: number;
  /** Best loss achieved */
  bestLoss: number;
  /** Initial loss */
  initialLoss: number;
  /** Loss reduction as percentage (0-100) */
  lossReductionPercent: number;
  /** Perplexity (exp(loss) or from metrics) */
  perplexity: number;
  /** Training throughput */
  tokensPerSecond: number;
  /** Total optimizer steps */
  totalSteps: number;
  /** Training duration in seconds */
  durationSeconds: number;
  /** Number of completed runs */
  completedRuns: number;
  /** Total number of runs */
  totalRuns: number;
}

// ============================================================
// Recent Experiments Types
// ============================================================

export interface RecentExperimentData {
  id: string;
  name: string;
  modelLabel: string;
  status: string;
  bestLoss: number;
  perplexity: number | null;
  tokensPerSecond: number;
  lossReduction: number;
  lossReductionFormatted: string;
  timeAgo: string;
}

// ============================================================
// Research Insight Types
// ============================================================

export interface ResearchInsightFinding {
  type: string;
  severity: "success" | "warning" | "critical" | "info";
  title: string;
  description: string;
}

export interface ResearchInsightRecommendation {
  priority: string;
  title: string;
  rationale: string;
}

export interface ResearchInsightData {
  /** Whether copilot analysis data exists */
  hasData: boolean;
  /** Experiment name being analyzed */
  experimentName: string;
  /** Overall status slug */
  overallStatus: string;
  /** Human-readable status label */
  statusLabel: string;
  /** Status description text */
  statusDescription: string;
  /** Key findings (top 4) */
  keyFindings: ResearchInsightFinding[];
  /** Top recommendations (top 3) */
  topRecommendations: ResearchInsightRecommendation[];
  /** Count of findings by severity */
  findingCounts: {
    success: number;
    warning: number;
    critical: number;
    info: number;
  };
}

// ============================================================
// Quick Navigation Types
// ============================================================

export interface QuickNavCard {
  /** Unique key for the card */
  key: string;
  /** lucide-react icon name */
  icon: "Gamepad2" | "Cpu" | "FlaskConical" | "Microscope" | "GraduationCap";
  /** i18n key for the card label */
  labelKey: string;
  /** i18n key for the card description */
  descriptionKey: string;
  /** Route path relative to site root */
  href: string;
  /** Tailwind classes for the card border color */
  colorBorder: string;
  /** Tailwind classes for the hover border color */
  colorHoverBorder: string;
  /** Tailwind classes for the hover glow effect */
  colorGlow: string;
  /** Tailwind classes for the icon text color */
  colorText: string;
}

// ============================================================
// Helpers
// ============================================================

/** Check if we're in a browser environment with localStorage available. */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function formatParams(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

// ============================================================
// getStudioHeroData
// ============================================================

export function getStudioHeroData(): StudioHeroData {
  const progress = computeDashboardProgress();

  const primaryActions: StudioAction[] = [
    {
      labelKey: "aiLab.studio.hero.startTraining",
      href: "/ai-lab/training",
      icon: "Rocket",
      variant: "primary",
    },
    {
      labelKey: "aiLab.studio.hero.openPlayground",
      href: "/ai-lab/playground",
      icon: "Gamepad2",
      variant: "secondary",
    },
    {
      labelKey: "aiLab.studio.hero.researchWorkspace",
      href: "/ai-lab/research",
      icon: "Microscope",
      variant: "outline",
    },
  ];

  const stats: StudioStat[] = [
    {
      labelKey: "aiLab.studio.hero.modulesStat",
      value: `${progress.modules.implemented}/${progress.modules.total}`,
      icon: "Box",
    },
    {
      labelKey: "aiLab.studio.hero.phaseStat",
      value: progress.phase.label,
      icon: "Layers",
    },
    {
      labelKey: "aiLab.studio.hero.experimentsStat",
      value: String(progress.experiments.active),
      icon: "TrendingUp",
    },
  ];

  return {
    titleKey: "aiLab.studio.hero.title",
    subtitleKey: "aiLab.studio.hero.subtitle",
    missionKey: "aiLab.studio.hero.mission",
    primaryActions,
    stats,
  };
}

// ============================================================
// getModelOverview
// ============================================================

export function getModelOverview(): ModelOverviewData {
  const models = listModels();

  if (models.length === 0) {
    return {
      hasData: false,
      modelName: "",
      modelLabel: "",
      description: "",
      params: 0,
      paramsFormatted: "",
      layers: 0,
      heads: 0,
      vocabSize: 0,
      vocabSizeFormatted: "",
      dModel: 0,
      dFF: 0,
      dFFFormatted: "",
      maxSeqLen: 0,
      availableModels: [],
      trainingStatus: "no_data",
      statusLabel: "No models registered",
    };
  }

  // Default to the single production model (the only browser-trainable
  // config), NOT the last registry entry (which is insertion-order luck).
  const defaultModel = getProductionModelConfig();

  // Derive training status from experiment history (SSR-safe)
  let trainingStatus: ModelOverviewData["trainingStatus"] = "no_data";
  let statusLabel = "No training data";

  if (isBrowser() && hasTrainingHistory()) {
    const stats = getTrainingStats();
    if (stats.completedRuns > 0) {
      trainingStatus = "completed";
      statusLabel = `${stats.completedRuns} runs completed`;
    } else {
      trainingStatus = "idle";
      statusLabel = "Ready to train";
    }
  }

  return {
    hasData: true,
    modelName: defaultModel.name,
    modelLabel: defaultModel.label,
    description: defaultModel.description,
    params: defaultModel.estimatedParams,
    paramsFormatted: formatParams(defaultModel.estimatedParams),
    layers: defaultModel.numLayers,
    heads: defaultModel.numHeads,
    vocabSize: defaultModel.vocabSize,
    vocabSizeFormatted: formatParams(defaultModel.vocabSize),
    dModel: defaultModel.dModel,
    dFF: defaultModel.dFF,
    dFFFormatted: formatParams(defaultModel.dFF),
    maxSeqLen: defaultModel.maxSeqLen,
    availableModels: models.map((m) => ({ name: m.name, label: m.label })),
    trainingStatus,
    statusLabel,
  };
}

// ============================================================
// getStudioTrainingSummary
// ============================================================

export function getStudioTrainingSummary(): TrainingSummaryData {
  // SSR guard — return empty state when localStorage is unavailable
  if (!isBrowser() || !hasTrainingHistory()) {
    return {
      hasData: false,
      experimentName: "",
      modelLabel: "",
      status: "",
      finalLoss: 0,
      bestLoss: 0,
      initialLoss: 0,
      lossReductionPercent: 0,
      perplexity: 0,
      tokensPerSecond: 0,
      totalSteps: 0,
      durationSeconds: 0,
      completedRuns: 0,
      totalRuns: 0,
    };
  }

  const metrics = getTrainingMetrics();
  const stats = getTrainingStats();

  // Try to get richer data from the visualization adapter
  let experimentName = "";
  let modelLabel = "";
  let status = "completed";
  let totalSteps = 0;
  let durationSeconds = 0;

  if (hasObservatoryData()) {
    const vizSummary = getVizTrainingSummary();
    if (vizSummary) {
      experimentName = vizSummary.experimentName;
      modelLabel = vizSummary.modelLabel;
      status = vizSummary.status;
      totalSteps = vizSummary.totalSteps;
      durationSeconds = vizSummary.durationSeconds;
    }
  }

  const finalLoss = metrics?.finalLoss ?? 0;
  const bestLoss = metrics?.bestLoss ?? 0;
  const initialLoss = metrics?.initialLoss ?? 0;
  const perplexity = metrics?.perplexity ?? 0;
  const tokensPerSecond = metrics?.tokensPerSecond ?? 0;

  const lossReductionPercent =
    Number.isFinite(initialLoss) && initialLoss > 0
      ? ((initialLoss - finalLoss) / initialLoss) * 100
      : 0;

  return {
    hasData: true,
    experimentName,
    modelLabel,
    status,
    finalLoss,
    bestLoss,
    initialLoss,
    lossReductionPercent,
    perplexity,
    tokensPerSecond,
    totalSteps,
    durationSeconds,
    completedRuns: stats?.completedRuns ?? 0,
    totalRuns: stats?.totalRuns ?? 0,
  };
}

// ============================================================
// getRecentExperiments
// ============================================================

export function getRecentExperiments(
  limit: number = 3
): RecentExperimentData[] {
  // SSR guard — return empty when localStorage is unavailable
  if (!isBrowser() || !hasHistory()) return [];

  const cards = getExperimentSummaryCards(limit);

  return cards.map((card: ExperimentSummaryCard) => ({
    id: card.id,
    name: card.name,
    modelLabel: card.modelLabel,
    status: card.status,
    bestLoss: card.bestLoss,
    perplexity: card.perplexity,
    tokensPerSecond: card.tokensPerSecond,
    lossReduction: card.lossReduction,
    lossReductionFormatted: `${(card.lossReduction * 100).toFixed(1)}%`,
    timeAgo: card.timeAgo,
  }));
}

// ============================================================
// getResearchInsights
// ============================================================

export function getResearchInsights(): ResearchInsightData {
  // SSR guard — return empty state when localStorage is unavailable
  if (!isBrowser() || !hasCopilotData()) {
    return {
      hasData: false,
      experimentName: "",
      overallStatus: "no_data",
      statusLabel: "No Data",
      statusDescription: "Run training experiments to generate research insights.",
      keyFindings: [],
      topRecommendations: [],
      findingCounts: { success: 0, warning: 0, critical: 0, info: 0 },
    };
  }

  const analysis = getLatestCopilotAnalysis();

  if (!analysis) {
    return {
      hasData: false,
      experimentName: "",
      overallStatus: "no_data",
      statusLabel: "No Data",
      statusDescription: "Run training experiments to generate research insights.",
      keyFindings: [],
      topRecommendations: [],
      findingCounts: { success: 0, warning: 0, critical: 0, info: 0 },
    };
  }

  // Take top 4 findings (prioritize critical > warning > success > info)
  const sortedFindings = [...analysis.findings].sort((a, b) => {
    const severityOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      success: 2,
      info: 3,
    };
    return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
  });

  return {
    hasData: true,
    experimentName: analysis.experimentName,
    overallStatus: analysis.overallStatus,
    statusLabel: analysis.statusLabel,
    statusDescription: analysis.statusDescription,
    keyFindings: sortedFindings.slice(0, 4).map((f) => ({
      type: f.type,
      severity: f.severity,
      title: f.title,
      description: f.description,
    })),
    topRecommendations: analysis.recommendations.slice(0, 3).map((r) => ({
      priority: r.priority,
      title: r.title,
      rationale: r.rationale,
    })),
    findingCounts: {
      success: analysis.successCount,
      warning: analysis.warningCount,
      critical: analysis.criticalCount,
      info: analysis.infoCount,
    },
  };
}

// ============================================================
// getQuickNavCards
// ============================================================

const QUICK_NAV_CARDS: QuickNavCard[] = [
  {
    key: "playground",
    icon: "Gamepad2",
    labelKey: "aiLab.studio.nav.playgroundLabel",
    descriptionKey: "aiLab.studio.nav.playgroundDesc",
    href: "/ai-lab/playground",
    colorBorder: "border-brand/10",
    colorHoverBorder: "hover:border-brand/30",
    colorGlow: "group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.12)]",
    colorText: "text-brand/70 group-hover:text-brand",
  },
  {
    key: "training",
    icon: "Cpu",
    labelKey: "aiLab.studio.nav.trainingLabel",
    descriptionKey: "aiLab.studio.nav.trainingDesc",
    href: "/ai-lab/training",
    colorBorder: "border-emerald-500/10",
    colorHoverBorder: "hover:border-emerald-500/30",
    colorGlow: "group-hover:shadow-[0_0_20px_rgba(16,185,129,0.12)]",
    colorText: "text-emerald-500/70 group-hover:text-emerald-500",
  },
  {
    key: "experiments",
    icon: "FlaskConical",
    labelKey: "aiLab.studio.nav.experimentsLabel",
    descriptionKey: "aiLab.studio.nav.experimentsDesc",
    href: "/ai-lab/experiments",
    colorBorder: "border-amber-500/10",
    colorHoverBorder: "hover:border-amber-500/30",
    colorGlow: "group-hover:shadow-[0_0_20px_rgba(245,158,11,0.12)]",
    colorText: "text-amber-500/70 group-hover:text-amber-500",
  },
  {
    key: "research",
    icon: "Microscope",
    labelKey: "aiLab.studio.nav.researchLabel",
    descriptionKey: "aiLab.studio.nav.researchDesc",
    href: "/ai-lab/research",
    colorBorder: "border-purple-500/10",
    colorHoverBorder: "hover:border-purple-500/30",
    colorGlow: "group-hover:shadow-[0_0_20px_rgba(168,85,247,0.12)]",
    colorText: "text-purple-500/70 group-hover:text-purple-500",
  },
];

export function getQuickNavCards(): QuickNavCard[] {
  return QUICK_NAV_CARDS;
}
