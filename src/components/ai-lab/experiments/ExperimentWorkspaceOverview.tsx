"use client";

import { useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  TrendingDown,
  BarChart3,
  ArrowRight,
  FlaskConical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getWorkspaceOverview,
  hasExperimentHistory,
} from "@/lib/ai-lab/adapters/experimentLauncherAdapter";
import type { ExperimentRecord } from "@/lib/minimind/experiments/history/ExperimentRecord";

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// ============================================================
// ExperimentWorkspaceOverview
// ============================================================

interface ExperimentWorkspaceOverviewProps {
  /** Callback when user clicks to view a specific experiment */
  onViewExperiment: (id: string) => void;
}

/**
 * ExperimentWorkspaceOverview — displays recent, running, and
 * completed training experiments with summary statistics.
 */
export function ExperimentWorkspaceOverview({
  onViewExperiment,
}: ExperimentWorkspaceOverviewProps) {
  const overview = useMemo(() => {
    try {
      return getWorkspaceOverview();
    } catch {
      return null;
    }
  }, []);

  const hasHistory = useMemo(() => {
    try {
      return hasExperimentHistory();
    } catch {
      return false;
    }
  }, []);

  // Empty state
  if (!hasHistory || !overview || overview.stats.total === 0) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="space-y-4"
      >
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200/60 bg-white/40 px-8 py-12 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
        >
          <FlaskConical className="size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No experiments yet. Launch your first training run above.
          </p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* ── Stats row ── */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <StatCard
          label="Total Runs"
          value={overview.stats.total}
          icon={<BarChart3 className="size-4" />}
        />
        <StatCard
          label="Running"
          value={overview.stats.running}
          icon={<Play className="size-4 text-blue-500" />}
        />
        <StatCard
          label="Completed"
          value={overview.stats.completed}
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
        />
        <StatCard
          label="Failed"
          value={overview.stats.failed}
          icon={<XCircle className="size-4 text-red-500" />}
        />
      </motion.div>

      {/* ── Running experiments ── */}
      {overview.running.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Play className="size-4 text-blue-500" />
            Running Experiments
          </h3>
          <div className="space-y-2">
            {overview.running.map((record) => (
              <ExperimentRow
                key={record.id}
                record={record}
                onView={onViewExperiment}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Recent experiments ── */}
      {overview.recent.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="size-4 text-slate-500" />
            Recent Experiments
          </h3>
          <div className="space-y-2">
            {overview.recent.map((record) => (
              <ExperimentRow
                key={record.id}
                record={record}
                onView={onViewExperiment}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Completed experiments ── */}
      {overview.completed.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Completed Reports
          </h3>
          <div className="space-y-2">
            {overview.completed.map((record) => (
              <ExperimentRow
                key={record.id}
                record={record}
                onView={onViewExperiment}
              />
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================
// Internal: StatCard
// ============================================================

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

// ============================================================
// Internal: ExperimentRow
// ============================================================

function ExperimentRow({
  record,
  onView,
}: {
  record: ExperimentRecord;
  onView: (id: string) => void;
}) {
  const statusIcon = {
    running: <Play className="size-3.5 text-blue-500" />,
    completed: <CheckCircle2 className="size-3.5 text-emerald-500" />,
    failed: <XCircle className="size-3.5 text-red-500" />,
  }[record.status];

  const statusBadge = {
    running: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    completed:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  }[record.status];

  return (
    <div
      onClick={() => onView(record.id)}
      className="group flex cursor-pointer items-center justify-between rounded-lg border border-slate-200/60 bg-white/50 px-4 py-3 backdrop-blur-sm transition-all duration-200 hover:border-brand/20 hover:bg-brand/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-brand/30 dark:hover:bg-brand/[0.04]"
    >
      <div className="flex items-center gap-3 min-w-0">
        {statusIcon}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {record.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {record.modelConfig.label} ·{" "}
            {new Date(record.createdAt).toLocaleDateString("zh-CN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {record.status === "completed" && Number.isFinite(record.metrics.bestLoss) && (
          <span className="flex items-center gap-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <TrendingDown className="size-3" />
            {record.metrics.bestLoss.toFixed(3)}
          </span>
        )}
        <Badge className={`text-xs ${statusBadge}`}>
          {record.status}
        </Badge>
        <ArrowRight className="size-4 text-slate-300 transition-colors group-hover:text-brand dark:text-slate-600" />
      </div>
    </div>
  );
}
