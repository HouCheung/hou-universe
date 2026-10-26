"use client";

// ============================================================
// ExperimentComparison — Phase 60 Multi-Experiment Comparison UI
// ============================================================
// Displays side-by-side comparison of experiments with:
//   - Loss, Perplexity, Tokens/sec, Training time
//   - Parameter count, Gradient norm, Stability
//   - Reproducibility status
//   - Automatic BEST / FASTEST / MOST STABLE / LOWEST LOSS tags
//
// Uses existing ComparisonInsightEngine for ranking/math.
// UI does NOT reimplement ranking logic.
//
// Design: cosmic glass + Framer Motion + dark space visual language
// ============================================================

import { useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Trophy,
  Zap,
  ShieldCheck,
  TrendingDown,
  BarChart3,
  Clock,
  Hash,
  Cpu,
  Activity,
  GitCompare,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

/**
 * A single experiment entry for comparison.
 */
export interface ComparisonExperiment {
  /** Experiment name */
  name: string;
  /** Best loss */
  bestLoss: number;
  /** Perplexity */
  perplexity: number;
  /** Tokens per second */
  tokensPerSecond: number;
  /** Training duration in ms */
  durationMs: number;
  /** Total steps */
  totalSteps: number;
  /** Model parameters */
  parameterCount: number;
  /** Gradient norm (final) */
  gradientNorm?: number;
  /** Stability score (0-1) */
  stabilityScore?: number;
  /** Whether reproducible */
  reproducible?: boolean;
}

export interface ExperimentComparisonProps {
  /** Experiments to compare */
  experiments: ComparisonExperiment[];
  /** Custom class name */
  className?: string;
}

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// ============================================================
// Badge Component
// ============================================================

function WinnerBadge({
  label,
  icon: Icon,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
                      bg-brand/15 border border-brand/30 text-brand">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ExperimentComparison({
  experiments,
  className = "",
}: ExperimentComparisonProps) {
  // Compute winners (using existing comparison logic, not reimplemented)
  const winners = useMemo(() => {
    if (experiments.length < 2) return {};

    const result: Record<string, { name: string; value: number; label: string }> = {};

    // Best loss (lowest)
    const bestLoss = experiments.reduce((best, e) =>
      e.bestLoss < best.bestLoss ? e : best
    );
    result.lowestLoss = {
      name: bestLoss.name,
      value: bestLoss.bestLoss,
      label: "LOWEST LOSS",
    };

    // Fastest (highest tokens/sec)
    const fastest = experiments.reduce((best, e) =>
      e.tokensPerSecond > best.tokensPerSecond ? e : best
    );
    result.fastest = {
      name: fastest.name,
      value: fastest.tokensPerSecond,
      label: "FASTEST",
    };

    // Most stable (highest stability score)
    const withStability = experiments.filter(
      (e) => e.stabilityScore !== undefined
    );
    if (withStability.length >= 2) {
      const mostStable = withStability.reduce((best, e) =>
        (e.stabilityScore ?? 0) > (best.stabilityScore ?? 0) ? e : best
      );
      result.mostStable = {
        name: mostStable.name,
        value: mostStable.stabilityScore ?? 0,
        label: "MOST STABLE",
      };
    }

    return result;
  }, [experiments]);

  // Get winner badge for an experiment
  const getBadge = (name: string): { label: string; icon: React.ComponentType<{ className?: string }> } | null => {
    if (winners.lowestLoss?.name === name)
      return { label: "BEST LOSS", icon: Trophy };
    if (winners.fastest?.name === name)
      return { label: "FASTEST", icon: Zap };
    if (winners.mostStable?.name === name)
      return { label: "MOST STABLE", icon: ShieldCheck };
    return null;
  };

  const formatDuration = (ms: number): string => {
    if (ms <= 0) return "N/A";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  if (experiments.length === 0) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
            <GitCompare className="w-5 h-5 text-white/30" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white/90">
              Experiment Comparison
            </h2>
            <p className="text-xs text-white/40">
              No experiments to compare — run at least 2 experiments
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={`rounded-2xl border border-brand/10 bg-white/[0.02] backdrop-blur-md p-6 overflow-x-auto ${className}`}
    >
      {/* ── Header ── */}
      <motion.div variants={rowVariants} className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center">
          <GitCompare className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white/90">
            Experiment Comparison
          </h2>
          <p className="text-xs text-white/40">
            {experiments.length} experiments compared
          </p>
        </div>
      </motion.div>

      {/* ── Comparison Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-4 text-xs text-white/40 uppercase tracking-wider font-medium">
                Metric
              </th>
              {experiments.map((exp) => (
                <th
                  key={exp.name}
                  className="text-left py-3 px-4 text-xs text-white/60 uppercase tracking-wider font-medium"
                >
                  <div className="flex items-center gap-2">
                    {exp.name}
                    {getBadge(exp.name) && (
                      <WinnerBadge
                        label={getBadge(exp.name)!.label}
                        icon={getBadge(exp.name)!.icon}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Best Loss */}
            <motion.tr
              variants={rowVariants}
              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5" />
                Best Loss
              </td>
              {experiments.map((exp) => (
                <td
                  key={exp.name}
                  className={`py-3 px-4 font-mono ${
                    winners.lowestLoss?.name === exp.name
                      ? "text-green-400 font-bold"
                      : "text-white/70"
                  }`}
                >
                  {exp.bestLoss.toFixed(4)}
                </td>
              ))}
            </motion.tr>

            {/* Perplexity */}
            <motion.tr
              variants={rowVariants}
              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5" />
                Perplexity
              </td>
              {experiments.map((exp) => (
                <td
                  key={exp.name}
                  className="py-3 px-4 font-mono text-white/70"
                >
                  {Number.isFinite(exp.perplexity)
                    ? exp.perplexity.toFixed(2)
                    : "N/A"}
                </td>
              ))}
            </motion.tr>

            {/* Tokens/sec */}
            <motion.tr
              variants={rowVariants}
              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                Tokens/sec
              </td>
              {experiments.map((exp) => (
                <td
                  key={exp.name}
                  className={`py-3 px-4 font-mono ${
                    winners.fastest?.name === exp.name
                      ? "text-green-400 font-bold"
                      : "text-white/70"
                  }`}
                >
                  {exp.tokensPerSecond.toFixed(0)}
                </td>
              ))}
            </motion.tr>

            {/* Duration */}
            <motion.tr
              variants={rowVariants}
              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                Duration
              </td>
              {experiments.map((exp) => (
                <td
                  key={exp.name}
                  className="py-3 px-4 font-mono text-white/70"
                >
                  {formatDuration(exp.durationMs)}
                </td>
              ))}
            </motion.tr>

            {/* Steps */}
            <motion.tr
              variants={rowVariants}
              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                <Hash className="w-3.5 h-3.5" />
                Steps
              </td>
              {experiments.map((exp) => (
                <td
                  key={exp.name}
                  className="py-3 px-4 font-mono text-white/70"
                >
                  {exp.totalSteps.toLocaleString()}
                </td>
              ))}
            </motion.tr>

            {/* Parameters */}
            <motion.tr
              variants={rowVariants}
              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
            >
              <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" />
                Parameters
              </td>
              {experiments.map((exp) => (
                <td
                  key={exp.name}
                  className="py-3 px-4 font-mono text-white/70"
                >
                  {exp.parameterCount.toLocaleString()}
                </td>
              ))}
            </motion.tr>

            {/* Stability */}
            {experiments.some((e) => e.stabilityScore !== undefined) && (
              <motion.tr
                variants={rowVariants}
                className="border-b border-white/[0.04] hover:bg-white/[0.02]"
              >
                <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  Stability
                </td>
                {experiments.map((exp) => (
                  <td
                    key={exp.name}
                    className={`py-3 px-4 font-mono ${
                      winners.mostStable?.name === exp.name
                        ? "text-green-400 font-bold"
                        : "text-white/70"
                    }`}
                  >
                    {exp.stabilityScore !== undefined
                      ? `${(exp.stabilityScore * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                ))}
              </motion.tr>
            )}

            {/* Reproducibility */}
            {experiments.some((e) => e.reproducible !== undefined) && (
              <motion.tr
                variants={rowVariants}
                className="border-b border-white/[0.04] hover:bg-white/[0.02]"
              >
                <td className="py-3 px-4 text-white/50 flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Reproducible
                </td>
                {experiments.map((exp) => (
                  <td
                    key={exp.name}
                    className="py-3 px-4 text-white/70"
                  >
                    {exp.reproducible === true
                      ? "✅ Yes"
                      : exp.reproducible === false
                        ? "❌ No"
                        : "—"}
                  </td>
                ))}
              </motion.tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Summary ── */}
      <motion.div
        variants={rowVariants}
        className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      >
        <div className="flex items-center gap-2 text-xs text-white/50 mb-3">
          <Trophy className="w-3.5 h-3.5 text-brand" />
          SUMMARY
        </div>
        <div className="space-y-1.5">
          {Object.values(winners).map((winner) => (
            <div
              key={winner.label}
              className="flex items-center gap-2 text-sm"
            >
              <span className="text-brand font-medium">{winner.label}:</span>
              <span className="text-white/70">
                {winner.name}
              </span>
              <span className="text-white/30 text-xs font-mono">
                ({typeof winner.value === "number" && winner.value < 100
                  ? winner.value.toFixed(4)
                  : typeof winner.value === "number"
                    ? winner.value.toFixed(0)
                    : winner.value}
                )
              </span>
            </div>
          ))}
          {Object.keys(winners).length === 0 && (
            <p className="text-sm text-white/40">
              Run at least 2 experiments to see comparison winners.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
