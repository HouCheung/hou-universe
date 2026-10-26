"use client";

// ============================================================
// LiveTrainingPanel — Real-time Training Monitor UI
// ============================================================
// Phase 58: Live training monitoring panel with real-time
// metrics, progress tracking, training controls, and
// event timeline.
//
// Sections:
//   1. Training Status Badge — RUNNING / PAUSED with pulse
//   2. Realtime Metrics Grid — Loss, PPL, LR, Tokens/s, Grad Norm
//   3. Progress Bar — epoch / step with percentage
//   4. Controls — Start, Pause, Resume, Stop buttons
//   5. Timeline — step, checkpoint, evaluation events
//
// Design: glass morphism + Framer Motion + cosmic theme
// Data: through liveTrainingAdapter
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Activity,
  TrendingDown,
  Zap,
  Target,
  BarChart3,
  Hash,
  Clock,
  Save,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import {
  getLiveTrainingData,
  getCheckpointList,
  getTrainingProgress,
  type LiveMetrics,
  type TrainingTimeline,
  type TrainingTimelineEntry,
  type TrainingStatusBadge,
  type CheckpointList,
  type TrainingProgress,
} from "@/lib/ai-lab/adapters/liveTrainingAdapter";

// ============================================================
// Types
// ============================================================

export interface LiveTrainingPanelProps {
  /** Session ID to monitor */
  sessionId: string;
  /** Session name for display */
  sessionName?: string;
  /** Callback: start training */
  onStart?: () => void;
  /** Callback: pause training */
  onPause?: () => void;
  /** Callback: resume training */
  onResume?: () => void;
  /** Callback: stop training */
  onStop?: () => void;
  /** Callback: save checkpoint */
  onSaveCheckpoint?: () => void;
  /** Callback: restore from checkpoint */
  onRestore?: (checkpointId: string) => void;
  /** Callback: start new run */
  onNewRun?: () => void;
  /** Callback: retry after failure */
  onRetry?: () => void;
  /** Callback: discard session */
  onDiscard?: () => void;
  /** Whether controls are enabled */
  controlsEnabled?: boolean;
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
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

const timelineItemVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, delay: i * 0.04, ease: "easeOut" },
  }),
};

const pulseVariants: Variants = {
  idle: { scale: 1, opacity: 0.6 },
  pulse: {
    scale: [1, 1.4, 1],
    opacity: [0.6, 1, 0.6],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
};

// ============================================================
// Sub-components
// ============================================================

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass?: string;
}) {
  return (
    <motion.div
      variants={cardVariants}
      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur-sm"
    >
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ${colorClass ?? ""}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="truncate text-lg font-semibold tabular-nums text-slate-200">
          {value}
          {unit && (
            <span className="ml-0.5 text-xs font-normal text-slate-500">
              {unit}
            </span>
          )}
        </span>
      </div>
    </motion.div>
  );
}

function StatusBadge({ badge }: { badge: TrainingStatusBadge }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase ${badge.colorClasses}`}
    >
      {badge.showPulse && (
        <motion.span
          variants={pulseVariants}
          animate="pulse"
          className="size-1.5 rounded-full bg-current"
        />
      )}
      {badge.label}
    </span>
  );
}

function TimelineEventRow({
  entry,
  index,
}: {
  entry: TrainingTimelineEntry;
  index: number;
}) {
  const icon = getTimelineIcon(entry.type);
  const colorClass = getTimelineColor(entry.type);

  return (
    <motion.div
      variants={timelineItemVariants}
      custom={index}
      className="relative flex items-start gap-3 pl-6"
    >
      {/* Dot */}
      <div
        className={`absolute left-0 top-1.5 size-[15px] rounded-full border-2 ${colorClass}`}
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-slate-300">
            {entry.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[0.65rem] text-slate-600">
            {entry.relativeTime}
          </span>
          {entry.step > 0 && (
            <span className="text-[0.65rem] text-slate-600">
              Step {entry.step}
            </span>
          )}
          {entry.loss !== null && (
            <span className="text-[0.65rem] tabular-nums text-slate-500">
              Loss {entry.loss.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyTimeline() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8">
      <Clock className="size-8 text-slate-600" />
      <p className="text-xs text-slate-500">No training events yet.</p>
      <p className="text-[0.65rem] text-slate-600">
        Events will appear as training progresses.
      </p>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function getTimelineIcon(type: TrainingTimelineEntry["type"]) {
  switch (type) {
    case "start":
      return <Play className="size-3 text-brand" />;
    case "step":
      return <Activity className="size-3 text-blue-400" />;
    case "checkpoint":
      return <Save className="size-3 text-amber-400" />;
    case "evaluation":
      return <Sparkles className="size-3 text-violet-400" />;
    case "complete":
      return <CheckCircle2 className="size-3 text-emerald-400" />;
    case "error":
      return <AlertTriangle className="size-3 text-red-400" />;
    case "paused":
      return <Pause className="size-3 text-amber-400" />;
    case "resumed":
      return <RotateCcw className="size-3 text-blue-400" />;
    default:
      return <ChevronRight className="size-3 text-slate-500" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function getTimelineColor(type: TrainingTimelineEntry["type"]): string {
  switch (type) {
    case "start":
      return "border-brand/30 bg-brand/10";
    case "step":
      return "border-blue-400/30 bg-blue-500/10";
    case "checkpoint":
      return "border-amber-400/30 bg-amber-500/10";
    case "evaluation":
      return "border-violet-400/30 bg-violet-500/10";
    case "complete":
      return "border-emerald-400/30 bg-emerald-500/10";
    case "error":
      return "border-red-400/30 bg-red-500/10";
    case "paused":
      return "border-amber-400/30 bg-amber-500/10";
    case "resumed":
      return "border-blue-400/30 bg-blue-500/10";
    default:
      return "border-white/[0.08] bg-white/[0.04]";
  }
}

// ============================================================
// LiveTrainingPanel
// ============================================================

export function LiveTrainingPanel({
  sessionId,
  sessionName,
  onStart,
  onPause,
  onResume,
  onStop,
  onSaveCheckpoint,
  onRestore,
  onNewRun,
  onRetry,
  onDiscard,
  controlsEnabled = true,
  className = "",
}: LiveTrainingPanelProps) {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [timeline, setTimeline] = useState<TrainingTimeline | null>(null);
  const [badge, setBadge] = useState<TrainingStatusBadge>({
    status: "idle",
    label: "Idle",
    colorClasses: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    showPulse: false,
  });
  const [isExpanded, setIsExpanded] = useState(true);
  const [checkpoints, setCheckpoints] = useState<CheckpointList | null>(null);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data refresh ──
  const refresh = useCallback(() => {
    const data = getLiveTrainingData(sessionId);
    setMetrics(data.metrics);
    setTimeline(data.timeline);
    setBadge(data.badge);
    setCheckpoints(getCheckpointList(sessionId));
    setProgress(getTrainingProgress(sessionId));
  }, [sessionId]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 1500);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh]);

  const isRunning = badge.status === "running";
  const isPaused = badge.status === "paused";
  const isCompleted = badge.status === "completed";
  const isFailed = badge.status === "failed";
  const isIdle = badge.status === "idle";
  const hasMetrics = metrics !== null;

  // Phase 74: Restore from the latest checkpoint that has serialized training
  // data. (getCheckpointList sorts checkpoints newest-first.)
  const handleRestore = useCallback(() => {
    const latest = checkpoints?.checkpoints.find((c) => c.hasTrainingData);
    if (latest && onRestore) {
      onRestore(latest.id);
    }
  }, [checkpoints, onRestore]);

  return (
    <motion.div
      className={`flex flex-col gap-5 ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ============================================================ */}
      {/* Header + Status Badge + Controls */}
      {/* ============================================================ */}
      <motion.div
        variants={cardVariants}
        className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand/[0.08]">
              <Activity className="size-4 text-brand" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                {sessionName ?? "Live Training"}
              </h3>
              <div className="mt-0.5 flex items-center gap-2">
                <StatusBadge badge={badge} />
                {hasMetrics && (
                  <span className="text-[0.6rem] text-slate-500">
                    Step {metrics.currentStep}/{metrics.totalSteps}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          {controlsEnabled && (
            <div className="flex items-center gap-1.5">
              {/* Idle / Created / Queued → Start */}
              {(isIdle || badge.status === "restored") && (
                <button
                  onClick={onStart}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                  aria-label="Start training"
                >
                  <Play className="size-3" />
                  <span className="hidden sm:inline">Start</span>
                </button>
              )}
              {/* Running → Pause + Save Checkpoint + Stop */}
              {isRunning && (
                <>
                  <button
                    onClick={onPause}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                    aria-label="Pause training"
                  >
                    <Pause className="size-3" />
                    <span className="hidden sm:inline">Pause</span>
                  </button>
                  <button
                    onClick={onSaveCheckpoint}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
                    aria-label="Save checkpoint"
                  >
                    <Save className="size-3" />
                    <span className="hidden sm:inline">Save</span>
                  </button>
                  <button
                    onClick={onStop}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                    aria-label="Stop training"
                  >
                    <Square className="size-3" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                </>
              )}
              {/* Paused → Resume + Save Checkpoint + Stop */}
              {isPaused && (
                <>
                  <button
                    onClick={onResume}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                    aria-label="Resume training"
                  >
                    <RotateCcw className="size-3" />
                    <span className="hidden sm:inline">Resume</span>
                  </button>
                  <button
                    onClick={onSaveCheckpoint}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
                    aria-label="Save checkpoint"
                  >
                    <Save className="size-3" />
                    <span className="hidden sm:inline">Save</span>
                  </button>
                  <button
                    onClick={onStop}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                    aria-label="Stop training"
                  >
                    <Square className="size-3" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                </>
              )}
              {/* Stopped → Restore + New Run */}
              {badge.status === "stopped" && (
                <>
                  <button
                    onClick={handleRestore}
                    className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
                    aria-label="Restore from checkpoint"
                  >
                    <RotateCcw className="size-3" />
                    <span className="hidden sm:inline">Restore</span>
                  </button>
                  <button
                    onClick={onNewRun}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-500/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-500/20"
                    aria-label="Start new run"
                  >
                    <Play className="size-3" />
                    <span className="hidden sm:inline">New Run</span>
                  </button>
                </>
              )}
              {/* Completed → Restore + New Run */}
              {isCompleted && (
                <>
                  <button
                    onClick={handleRestore}
                    className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
                    aria-label="Restore from checkpoint"
                  >
                    <RotateCcw className="size-3" />
                    <span className="hidden sm:inline">Restore</span>
                  </button>
                  <button
                    onClick={onNewRun}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-500/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-500/20"
                    aria-label="Start new run"
                  >
                    <Play className="size-3" />
                    <span className="hidden sm:inline">New Run</span>
                  </button>
                </>
              )}
              {/* Failed → Restore + Retry + Discard */}
              {isFailed && (
                <>
                  <button
                    onClick={handleRestore}
                    className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
                    aria-label="Restore from latest checkpoint"
                  >
                    <RotateCcw className="size-3" />
                    <span className="hidden sm:inline">Restore</span>
                  </button>
                  <button
                    onClick={onRetry}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                    aria-label="Retry training"
                  >
                    <Play className="size-3" />
                    <span className="hidden sm:inline">Retry</span>
                  </button>
                  <button
                    onClick={onDiscard}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                    aria-label="Discard session"
                  >
                    <XCircle className="size-3" />
                    <span className="hidden sm:inline">Discard</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/* Progress Bar */}
      {/* ============================================================ */}
      {hasMetrics && (
        <motion.div
          variants={cardVariants}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">
              Progress
            </span>
            <span className="text-xs font-medium tabular-nums text-slate-300">
              {metrics.progressPercent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand/60"
              initial={{ width: 0 }}
              animate={{ width: `${metrics.progressPercent}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.6rem] text-slate-500">
            <span>
              Epoch {Math.floor((metrics.currentStep / Math.max(1, metrics.totalSteps)) * 5) + 1} / 5
            </span>
            <span>
              {metrics.currentStep.toLocaleString()} /{" "}
              {metrics.totalSteps.toLocaleString()} steps
            </span>
          </div>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/* Realtime Metrics Grid */}
      {/* ============================================================ */}
      {hasMetrics ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Loss"
            value={metrics.loss.toFixed(4)}
            icon={TrendingDown}
            colorClass="text-red-400"
          />
          <MetricCard
            label="Perplexity"
            value={metrics.perplexity.toFixed(2)}
            icon={BarChart3}
            colorClass="text-amber-400"
          />
          <MetricCard
            label="Learning Rate"
            value={metrics.learningRate.toExponential(2)}
            icon={Target}
            colorClass="text-blue-400"
          />
          <MetricCard
            label="Tokens/sec"
            value={metrics.throughput.toFixed(1)}
            icon={Zap}
            colorClass="text-emerald-400"
          />
          <MetricCard
            label="Gradient Norm"
            value={
              metrics.gradientNorm !== null
                ? metrics.gradientNorm.toFixed(4)
                : "—"
            }
            icon={Activity}
            colorClass="text-violet-400"
          />
          <MetricCard
            label="Step"
            value={`${metrics.currentStep} / ${metrics.totalSteps}`}
            icon={Hash}
            colorClass="text-slate-400"
          />
        </div>
      ) : (
        <motion.div
          variants={cardVariants}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center backdrop-blur-sm"
        >
          <Activity className="size-10 text-slate-600" />
          <div>
            <p className="text-sm text-slate-400">No live metrics available</p>
            <p className="mt-1 text-xs text-slate-600">
              {isIdle
                ? "Start training to see real-time metrics."
                : isCompleted
                  ? "Training completed. Check the results below."
                  : isFailed
                    ? "Training failed. Check the error details."
                    : "Metrics will appear once training begins."}
            </p>
          </div>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/* Timeline */}
      {/* ============================================================ */}
      <motion.div
        variants={cardVariants}
        className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-brand" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Training Timeline
            </h3>
          </div>
          {timeline && timeline.entryCount > 0 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[0.6rem] text-slate-500 transition-colors hover:text-slate-400"
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {timeline && timeline.entryCount > 0 && isExpanded ? (
            <div className="relative ml-2 max-h-64 overflow-y-auto">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-0 h-full w-px bg-white/[0.06]" />
              <div className="flex flex-col gap-3">
                {timeline.entries.map((entry, i) => (
                  <TimelineEventRow
                    key={`${entry.timestamp}-${i}`}
                    entry={entry}
                    index={i}
                  />
                ))}
              </div>
            </div>
          ) : timeline && timeline.entryCount > 0 && !isExpanded ? (
            <p className="py-2 text-center text-xs text-slate-500">
              {timeline.entryCount} events — expand to view
            </p>
          ) : (
            <EmptyTimeline />
          )}
        </AnimatePresence>
      </motion.div>

      {/* ============================================================ */}
      {/* Checkpoint History */}
      {/* ============================================================ */}
      {checkpoints && checkpoints.hasCheckpoints && (
        <motion.div
          variants={cardVariants}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Save className="size-4 text-brand" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Checkpoints
              </h3>
            </div>
            <span className="text-[0.6rem] text-slate-600">
              {checkpoints.count} saved
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="flex flex-col gap-2">
              {checkpoints.checkpoints.map((ckpt) => (
                <div
                  key={ckpt.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                    ckpt.isActive
                      ? "border-brand/20 bg-brand/[0.04]"
                      : "border-white/[0.04] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-medium tabular-nums text-slate-300">
                        Step {ckpt.step}
                      </span>
                      <span className="text-[0.6rem] text-slate-500">
                        Loss {ckpt.loss.toFixed(4)}
                        {ckpt.perplexity !== null &&
                          ` · PPL ${ckpt.perplexity.toFixed(1)}`}
                      </span>
                    </div>
                    {ckpt.isActive && (
                      <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.55rem] font-medium text-brand">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.6rem] text-slate-600">
                      {ckpt.relativeTime}
                    </span>
                    {ckpt.sizeBytes !== null && (
                      <span className="text-[0.6rem] text-slate-600">
                        {(ckpt.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/* Progress detail (Phase 66) */}
      {/* ============================================================ */}
      {progress && hasMetrics && (
        <motion.div
          variants={cardVariants}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
        >
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-4 text-brand" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Training Progress
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <span className="text-slate-500">Step</span>
              <p className="mt-0.5 font-medium tabular-nums text-slate-300">
                {progress.currentStep.toLocaleString()} /{" "}
                {progress.totalSteps.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Epoch</span>
              <p className="mt-0.5 font-medium tabular-nums text-slate-300">
                {progress.currentEpoch} / {progress.totalEpochs}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Elapsed</span>
              <p className="mt-0.5 font-medium tabular-nums text-slate-300">
                {progress.elapsedMs !== null
                  ? formatDuration(progress.elapsedMs)
                  : "--"}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Est. Remaining</span>
              <p className="mt-0.5 font-medium tabular-nums text-slate-300">
                {progress.estimatedRemainingMs !== null
                  ? formatDuration(progress.estimatedRemainingMs)
                  : "--"}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/* Error state */}
      {/* ============================================================ */}
      {isFailed && (
        <motion.div
          variants={cardVariants}
          className="flex items-center gap-3 rounded-2xl border border-red-400/10 bg-red-500/[0.04] px-5 py-4 backdrop-blur-sm"
        >
          <AlertTriangle className="size-5 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">
              Training Failed
            </p>
            <p className="text-xs text-slate-500">
              Check the error details in the experiment workspace.
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
