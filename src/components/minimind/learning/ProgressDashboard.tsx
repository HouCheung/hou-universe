"use client";

// ============================================================
// ProgressDashboard — stats, mastery grid, time remaining
// ============================================================

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Lightbulb,
  FlaskConical,
  Clock,
  Target,
} from "lucide-react";
import type {
  OverallProgress,
  UserProgress,
  MasteryTree,
} from "@/data/minimind/learning-registry";
import { adaptMasteryGrid } from "@/lib/minimind/learning";
import { cn } from "@/lib/utils";

// ============================================================
// Progress Ring
// ============================================================

function ProgressRing({
  percent,
  size = 80,
  strokeWidth = 6,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200 dark:text-slate-800"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-brand"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-lg font-bold text-foreground">
        {percent}%
      </span>
    </div>
  );
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total?: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-500/10 bg-slate-500/[0.02] px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.01]">
      <Icon className={cn("size-4 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-[0.65rem] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {value}
          {total !== undefined && (
            <span className="text-xs font-normal text-slate-400">
              /{total}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Mastery Grid Mini
// ============================================================

function MasteryGridMini({
  tree,
  progress,
}: {
  tree: MasteryTree;
  progress: UserProgress;
}) {
  const grid = useMemo(
    () => adaptMasteryGrid(tree, progress),
    [tree, progress]
  );

  return (
    <div className="space-y-3">
      <h4 className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Concept Mastery
      </h4>
      <div className="space-y-2">
        {grid.rows.map((row) => (
          <div key={row.moduleSourceId} className="space-y-1">
            <span className="text-[0.6rem] font-medium text-slate-500 dark:text-slate-400">
              {row.moduleLabel}
            </span>
            <div className="flex flex-wrap gap-1">
              {row.concepts.map((cell) => (
                <div
                  key={cell.conceptId}
                  className={cn(
                    "size-2.5 rounded-sm border transition-colors",
                    cell.isReviewed
                      ? "border-emerald-500/40 bg-emerald-500/30"
                      : "border-slate-500/15 bg-transparent dark:border-slate-500/20"
                  )}
                  title={cell.conceptLabel}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ProgressDashboard
// ============================================================

interface ProgressDashboardProps {
  overall: OverallProgress;
  tree: MasteryTree;
  progress: UserProgress;
}

export function ProgressDashboard({
  overall,
  tree,
  progress,
}: ProgressDashboardProps) {
  const hours = Math.floor(overall.estimatedRemainingMinutes / 60);
  const mins = overall.estimatedRemainingMinutes % 60;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="space-y-5 rounded-2xl border border-brand/10 bg-brand/[0.02] p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] lg:sticky lg:top-24"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Target className="size-4 text-brand/70" />
        <h3 className="text-sm font-semibold text-foreground">
          Your Progress
        </h3>
      </div>

      {/* Progress Ring */}
      <div className="flex flex-col items-center gap-2">
        <ProgressRing percent={overall.percentComplete} />
        <p className="text-[0.6rem] text-slate-400 dark:text-slate-500">
          Overall Completion
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={BookOpen}
          label="Modules"
          value={overall.modulesCompleted}
          total={overall.modulesTotal}
          color="text-brand"
        />
        <StatCard
          icon={Lightbulb}
          label="Concepts"
          value={overall.conceptsReviewed}
          total={overall.conceptsTotal}
          color="text-amber-500"
        />
        <StatCard
          icon={FlaskConical}
          label="Experiments"
          value={overall.experimentsCompleted}
          total={overall.experimentsTotal}
          color="text-emerald-500"
        />
        <StatCard
          icon={Clock}
          label="Remaining"
          value={hours > 0 ? hours : mins}
          color="text-slate-500"
        />
      </div>

      {/* Time remaining detail */}
      {overall.estimatedRemainingMinutes > 0 && (
        <p className="text-center text-[0.65rem] text-slate-400 dark:text-slate-500">
          Est. {hours > 0 ? `${hours}h ` : ""}
          {mins > 0 ? `${mins}m` : ""} remaining
        </p>
      )}

      {/* All complete */}
      {overall.percentComplete >= 100 && (
        <p className="text-center text-[0.65rem] font-medium text-emerald-600 dark:text-emerald-400">
          🎉 All modules mastered!
        </p>
      )}

      {/* Mastery Grid */}
      <MasteryGridMini tree={tree} progress={progress} />
    </motion.div>
  );
}
