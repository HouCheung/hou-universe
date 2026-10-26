"use client";

// ============================================================
// TrainingObservatory — MiniMind Training Visualization Dashboard
// ============================================================
// Phase 53: Interactive training metrics observatory for the
// AI Lab dashboard. Displays loss curves, learning rate
// schedules, throughput data, and generation comparisons.
//
// Sections:
//   1. Training Overview — stat tile cards (KPI row)
//   2. Loss Curve — SVG line chart
//   3. Learning Rate — SVG line chart
//   4. Generation Comparison — before/after text panels
//
// All data sourced exclusively through the adapter layer:
//   src/lib/ai-lab/adapters/trainingVisualizationAdapter.ts
//
// Design: glass UI + Framer Motion + cosmic theme
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import {
  TrendingDown,
  Activity,
  Zap,
  Clock,
  Target,
  BarChart3,
  LineChart,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  getLossCurveData,
  getLearningRateCurveData,
  getThroughputData,
  getTrainingSummary,
  getGenerationComparison,
  hasObservatoryData,
  type LossCurveData,
  type LearningRateCurveData,
  type ThroughputData,
  type TrainingSummary,
  type GenerationComparisonData,
} from "@/lib/ai-lab/adapters/trainingVisualizationAdapter";

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
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
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" },
  }),
};

const statVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, delay: 0.2 + i * 0.08, ease: "easeOut" },
  }),
};

// ============================================================
// Chart constants
// ============================================================

const CHART_WIDTH = 600;
const CHART_HEIGHT = 280;
const CHART_PADDING = { top: 20, right: 24, bottom: 40, left: 56 };

// ============================================================
// Helpers
// ============================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatNumber(n: number, decimals: number = 2): string {
  if (!isFinite(n)) return "—";
  return n.toFixed(decimals);
}

// ============================================================
// SVG Line Chart Component
// ============================================================

interface LineChartProps {
  title: string;
  points: Array<{ step: number; value: number }>;
  yLabel: string;
  color: string;
  hasData: boolean;
  emptyMessage?: string;
}

function SvgLineChart({
  title,
  points,
  yLabel,
  color,
  hasData,
  emptyMessage = "No data available",
}: LineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!hasData || points.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-500/[0.08] bg-slate-500/[0.02] px-6 py-16 text-center dark:border-white/[0.04] dark:bg-white/[0.01]">
        <BarChart3 className="mb-3 size-8 text-slate-400/40" />
        <p className="text-sm text-slate-500/70 dark:text-slate-400/60">
          {emptyMessage}
        </p>
      </div>
    );
  }

  const { top, right, bottom, left } = CHART_PADDING;
  const plotW = CHART_WIDTH - left - right;
  const plotH = CHART_HEIGHT - top - bottom;

  const xMin = points[0].step;
  const xMax = points[points.length - 1].step;
  const xRange = xMax - xMin || 1;

  const yValues = points.map((p) => p.value);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const yRange = yMax - yMin || 1;
  const yPaddedMin = yMin - yRange * 0.05;
  const yPaddedMax = yMax + yRange * 0.05;
  const yPaddedRange = yPaddedMax - yPaddedMin;

  const scaleX = (step: number) =>
    left + ((step - xMin) / xRange) * plotW;
  const scaleY = (value: number) =>
    top + plotH - ((value - yPaddedMin) / yPaddedRange) * plotH;

  // Build path
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.step).toFixed(1)} ${scaleY(p.value).toFixed(1)}`)
    .join(" ");

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => {
    const t = i / (yTicks - 1);
    return yPaddedMin + t * yPaddedRange;
  });

  // X-axis ticks (show ~6 evenly spaced)
  const xTickCount = Math.min(6, points.length);
  const xTickStep = Math.max(1, Math.floor(points.length / xTickCount));
  const xTickIndices: number[] = [];
  for (let i = 0; i < points.length; i += xTickStep) {
    xTickIndices.push(i);
  }
  if (xTickIndices[xTickIndices.length - 1] !== points.length - 1) {
    xTickIndices.push(points.length - 1);
  }

  return (
    <div className="rounded-xl border border-slate-500/[0.08] bg-slate-500/[0.02] px-5 py-5 dark:border-white/[0.04] dark:bg-white/[0.01]">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
        {title}
      </h4>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full min-w-[400px]"
          role="img"
          aria-label={title}
        >
          {/* Grid lines */}
          {yTickValues.map((v, i) => (
            <g key={`grid-${i}`}>
              <line
                x1={left}
                y1={scaleY(v)}
                x2={CHART_WIDTH - right}
                y2={scaleY(v)}
                stroke="currentColor"
                className="text-slate-300/40 dark:text-slate-600/30"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ))}

          {/* Y-axis labels */}
          {yTickValues.map((v, i) => (
            <text
              key={`yl-${i}`}
              x={left - 8}
              y={scaleY(v) + 4}
              textAnchor="end"
              className="fill-slate-400/80 dark:fill-slate-500/70 text-[9px]"
              fontSize={9}
            >
              {v < 0.01 ? v.toExponential(1) : v.toFixed(2)}
            </text>
          ))}

          {/* Y-axis label */}
          <text
            x={12}
            y={top + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 12, ${top + plotH / 2})`}
            className="fill-slate-400/60 dark:fill-slate-500/50 text-[9px]"
            fontSize={9}
          >
            {yLabel}
          </text>

          {/* X-axis labels */}
          {xTickIndices.map((idx) => (
            <text
              key={`xl-${idx}`}
              x={scaleX(points[idx].step)}
              y={CHART_HEIGHT - bottom + 20}
              textAnchor="middle"
              className="fill-slate-400/80 dark:fill-slate-500/70 text-[9px]"
              fontSize={9}
            >
              {points[idx].step}
            </text>
          ))}

          {/* X-axis label */}
          <text
            x={left + plotW / 2}
            y={CHART_HEIGHT - 4}
            textAnchor="middle"
            className="fill-slate-400/60 dark:fill-slate-500/50 text-[9px]"
            fontSize={9}
          >
            Step
          </text>

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Area fill */}
          <path
            d={`${pathD} L ${scaleX(points[points.length - 1].step).toFixed(1)} ${top + plotH} L ${scaleX(points[0].step).toFixed(1)} ${top + plotH} Z`}
            fill={color}
            opacity={0.06}
          />

          {/* Data points (only show on hover, or a few markers) */}
          {hoveredIndex !== null && hoveredIndex < points.length && (
            <>
              <circle
                cx={scaleX(points[hoveredIndex].step)}
                cy={scaleY(points[hoveredIndex].value)}
                r={5}
                fill={color}
                stroke="white"
                strokeWidth={2}
              />
              {/* Tooltip */}
              <g>
                <rect
                  x={scaleX(points[hoveredIndex].step) - 50}
                  y={scaleY(points[hoveredIndex].value) - 36}
                  width={100}
                  height={28}
                  rx={4}
                  className="fill-white dark:fill-slate-800"
                  stroke="currentColor"
                  strokeWidth={1}
                />
                <text
                  x={scaleX(points[hoveredIndex].step)}
                  y={scaleY(points[hoveredIndex].value) - 18}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200"
                  fontSize={10}
                >
                  Step {points[hoveredIndex].step}: {formatNumber(points[hoveredIndex].value, 4)}
                </text>
              </g>
            </>
          )}

          {/* Invisible hover targets */}
          {points.map((p, i) => (
            <rect
              key={`hover-${i}`}
              x={scaleX(p.step) - 4}
              y={top}
              width={Math.max(8, plotW / points.length)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-2">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
          {points.length.toLocaleString()} data points
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Stat Tile Component
// ============================================================

interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  index: number;
  accent?: "default" | "amber" | "emerald" | "red";
}

function StatTile({ label, value, sublabel, icon, index, accent = "default" }: StatTileProps) {
  const accentClasses = {
    default: "border-slate-500/10 bg-slate-500/[0.03] dark:border-white/[0.05] dark:bg-white/[0.02]",
    amber: "border-amber-500/15 bg-amber-500/[0.03] dark:border-amber-500/20 dark:bg-amber-500/[0.04]",
    emerald: "border-emerald-500/15 bg-emerald-500/[0.03] dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]",
    red: "border-red-500/15 bg-red-500/[0.03] dark:border-red-500/20 dark:bg-red-500/[0.04]",
  };

  const iconColors = {
    default: "text-brand/60",
    amber: "text-amber-500/70",
    emerald: "text-emerald-500/70",
    red: "text-red-500/70",
  };

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={statVariants}
      className={`flex items-start gap-3 rounded-xl border px-4 py-4 backdrop-blur-sm ${accentClasses[accent]}`}
    >
      <div className={`mt-0.5 ${iconColors[accent]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
          {label}
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
          {value}
        </p>
        {sublabel && (
          <p className="mt-0.5 text-[0.6rem] text-slate-500/60 dark:text-slate-400/50 truncate">
            {sublabel}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// Generation Comparison Panel
// ============================================================

function GenerationPanel({
  samples,
}: {
  samples: GenerationComparisonData[];
}) {
  if (samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-500/[0.08] bg-slate-500/[0.02] px-6 py-16 text-center dark:border-white/[0.04] dark:bg-white/[0.01]">
        <MessageSquare className="mb-3 size-8 text-slate-400/40" />
        <p className="text-sm text-slate-500/70 dark:text-slate-400/60">
          Run training to see generation samples
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {samples.slice(0, 3).map((sample, i) => (
        <motion.div
          key={i}
          custom={i}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={cardVariants}
          className="rounded-xl border border-slate-500/[0.08] bg-slate-500/[0.02] px-5 py-5 dark:border-white/[0.04] dark:bg-white/[0.01]"
        >
          {/* Prompt */}
          <div className="mb-3">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-brand/60 dark:text-brand-light/60">
              Prompt
            </span>
            <p className="mt-0.5 text-sm font-medium text-foreground font-mono">
              &ldquo;{sample.prompt}&rdquo;
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Before */}
            <div className="rounded-lg border border-red-500/10 bg-red-500/[0.02] px-3 py-3 dark:border-red-500/15 dark:bg-red-500/[0.03]">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-red-500/70">
                Before Training
              </span>
              <p className="mt-1 text-xs leading-relaxed text-slate-600/80 dark:text-slate-400/80 font-mono">
                {sample.before || "(empty)"}
              </p>
            </div>

            {/* After */}
            <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.02] px-3 py-3 dark:border-emerald-500/15 dark:bg-emerald-500/[0.03]">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-500/70">
                After Training
              </span>
              <p className="mt-1 text-xs leading-relaxed text-slate-600/80 dark:text-slate-400/80 font-mono">
                {sample.after || "(empty)"}
              </p>
            </div>
          </div>

          {/* Delta indicators */}
          <div className="mt-2 flex items-center gap-3 text-[0.6rem]">
            {sample.changed && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/15 bg-amber-500/[0.04] px-2 py-0.5 text-amber-600/80 dark:text-amber-400/70">
                <Sparkles className="size-2.5" />
                Changed
              </span>
            )}
            {isFinite(sample.perplexityDelta) && sample.perplexityDelta !== 0 && (
              <span className="text-slate-500/60 dark:text-slate-400/50">
                PPL Δ: {sample.perplexityDelta > 0 ? "+" : ""}
                {sample.perplexityDelta.toFixed(2)}
              </span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.observatoryLabel" />

      <div className="relative mx-auto max-w-2xl rounded-2xl border border-brand/10 bg-brand/[0.03] px-8 py-16 text-center backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />
        <LineChart className="mx-auto mb-4 size-12 text-slate-400/30" />
        <h3 className="text-lg font-semibold text-foreground">
          No Training Data Yet
        </h3>
        <p className="mt-2 text-sm text-slate-500/70 dark:text-slate-400/60">
          Run a MiniMind training experiment to populate the observatory with
          loss curves, learning rate schedules, and generation comparisons.
        </p>
      </div>
    </motion.section>
  );
}

// ============================================================
// TrainingObservatory — main component
// ============================================================

export function TrainingObservatory() {
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [lossCurve, setLossCurve] = useState<LossCurveData | null>(null);
  const [lrCurve, setLrCurve] = useState<LearningRateCurveData | null>(null);
  const [throughput, setThroughput] = useState<ThroughputData | null>(null);
  const [generation, setGeneration] = useState<GenerationComparisonData[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (!hasObservatoryData()) return;

    setSummary(getTrainingSummary());
    setLossCurve(getLossCurveData());
    setLrCurve(getLearningRateCurveData());
    setThroughput(getThroughputData());
    setGeneration(getGenerationComparison());
  }, []);

  // Transform data for SVG charts — MUST be before any early returns
  const lossPoints = useMemo(
    () =>
      lossCurve?.points.map((p) => ({ step: p.step, value: p.loss })) ?? [],
    [lossCurve]
  );

  const lrPoints = useMemo(
    () =>
      lrCurve?.points.map((p) => ({
        step: p.step,
        value: p.learningRate,
      })) ?? [],
    [lrCurve]
  );

  const throughputPoints = useMemo(
    () =>
      throughput?.points.map((p) => ({
        step: p.step,
        value: p.tokensPerSecond,
      })) ?? [],
    [throughput]
  );

  // Chart colors — using the validated palette blue for sequential data
  const lossColor = "#2a78d6";
  const lrColor = "#1baf7a";
  const throughputColor = "#eb6834";

  // Don't render full observatory on the server to avoid hydration mismatch
  if (!isClient) {
    return (
      <section className="mt-20 sm:mt-28">
        <SectionHeader titleKey="aiLab.dashboard.observatoryLabel" />
        <div className="h-64" />
      </section>
    );
  }

  if (!hasObservatoryData() || !summary?.hasData) {
    return <EmptyState />;
  }

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.observatoryLabel" />

      {/* ── Section glow accent ── */}
      <div className="relative mx-auto max-w-5xl">
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/20 to-transparent"
          aria-hidden="true"
        />

        <div className="space-y-8 pt-8">
          {/* ============================================================
              Section 1: Training Overview (KPI stat tiles)
              ============================================================ */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={cardVariants}
            custom={0}
          >
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="size-4 text-brand/60" />
              Training Overview
            </h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatTile
                label="Experiment"
                value={summary.experimentName}
                sublabel={summary.modelLabel}
                icon={<Target className="size-4" />}
                index={0}
              />
              <StatTile
                label="Final Loss"
                value={formatNumber(summary.finalLoss, 4)}
                sublabel={`↓ ${formatNumber(summary.lossReductionPercent, 1)}%`}
                icon={<TrendingDown className="size-4" />}
                index={1}
                accent="emerald"
              />
              <StatTile
                label="Perplexity"
                value={isFinite(summary.perplexity) ? formatNumber(summary.perplexity, 2) : "—"}
                sublabel={`${summary.totalSteps.toLocaleString()} steps`}
                icon={<BarChart3 className="size-4" />}
                index={2}
                accent="amber"
              />
              <StatTile
                label="Throughput"
                value={
                  summary.tokensPerSecond > 0
                    ? `${Math.round(summary.tokensPerSecond).toLocaleString()}/s`
                    : "—"
                }
                sublabel={summary.datasetName}
                icon={<Zap className="size-4" />}
                index={3}
              />
              <StatTile
                label="Duration"
                value={formatDuration(summary.durationSeconds)}
                sublabel={summary.status}
                icon={<Clock className="size-4" />}
                index={4}
              />
            </div>
          </motion.div>

          {/* ============================================================
              Section 2: Loss Curve
              ============================================================ */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={cardVariants}
            custom={1}
          >
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingDown className="size-4 text-brand/60" />
              Loss Curve
            </h3>

            <SvgLineChart
              title={`Loss — ${summary.experimentName}`}
              points={lossPoints}
              yLabel="Loss"
              color={lossColor}
              hasData={lossPoints.length > 0}
              emptyMessage="No loss history available. Run training with logging enabled."
            />
          </motion.div>

          {/* ============================================================
              Section 3: Learning Rate Curve
              ============================================================ */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={cardVariants}
            custom={2}
          >
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <LineChart className="size-4 text-brand/60" />
              Learning Rate Schedule
            </h3>

            <SvgLineChart
              title={
                lrCurve?.hasScheduler
                  ? `Learning Rate — ${summary.experimentName} (scheduler active)`
                  : `Learning Rate — ${summary.experimentName} (constant)`
              }
              points={lrPoints}
              yLabel="LR"
              color={lrColor}
              hasData={lrPoints.length > 0}
              emptyMessage="No learning rate data available."
            />
          </motion.div>

          {/* ============================================================
              Section 4: Throughput (conditional)
              ============================================================ */}
          {throughputPoints.length > 0 && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
              custom={3}
            >
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Zap className="size-4 text-brand/60" />
                Throughput
              </h3>

              <SvgLineChart
                title={`Tokens/sec — ${summary.experimentName}`}
                points={throughputPoints}
                yLabel="Tokens/s"
                color={throughputColor}
                hasData={throughputPoints.length > 0}
                emptyMessage="No throughput data available."
              />
            </motion.div>
          )}

          {/* ============================================================
              Section 5: Generation Comparison
              ============================================================ */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={cardVariants}
            custom={4}
          >
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="size-4 text-brand/60" />
              Generation Comparison
            </h3>

            <GenerationPanel samples={generation} />
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
