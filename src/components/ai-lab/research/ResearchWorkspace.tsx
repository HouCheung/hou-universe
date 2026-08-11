"use client";

// ============================================================
// ResearchWorkspace — MiniMind Research Studio UI
// ============================================================
// Phase 57: Research workspace dashboard with live training
// monitoring, experiment timeline, checkpoint panel, and
// result summary.
// Phase 58: Integrated LiveTrainingPanel for real-time
// training controls and timeline.
//
// Sections:
//   1. Header — "MiniMind Research Studio" + active experiment
//   2. Experiment Timeline — vertical timeline of state transitions
//   3. Live Training Panel — interactive controls + metrics + timeline
//   4. Research Copilot — training intelligence + recommendations (Phase 59)
//   5. Live Training Card — loss, perplexity, LR, tokens/sec, grad norm
//   6. Checkpoint Panel — latest checkpoint + resume button
//   7. Result Summary — final loss, comparison, benchmark score
//
// Design: glass morphism + Framer Motion + cosmic theme
// Data: through researchWorkspaceAdapter + liveTrainingAdapter
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Microscope,
  Activity,
  TrendingDown,
  Zap,
  Clock,
  Target,
  Save,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Circle,
  Play,
  Pause,
  Square,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  BarChart3,
  Hash,
  Fingerprint,
  FlaskConical,
  Gauge,
} from "lucide-react";
import {
  getWorkspaceSessions,
  getActiveSession,
  getTrainingStatus,
  getExperimentTimeline,
  getWorkspaceStats,
  type SessionSummary,
  type TrainingStatusData,
  type SessionTimeline,
  type WorkspaceStats,
} from "@/lib/ai-lab/adapters/researchWorkspaceAdapter";
import { LiveTrainingPanel } from "./LiveTrainingPanel";
import { ResearchCopilot } from "./ResearchCopilot";
import { trainingRuntime } from "@/lib/minimind/research";
import {
  extractExperimentIdentity,
  createExperimentFingerprint,
  formatFingerprint,
} from "@/lib/minimind/research";
import { listExperiments, experimentCount } from "@/lib/minimind/research";
import type { ExperimentFingerprint } from "@/lib/minimind/research";

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const timelineItemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// ============================================================
// Status icon map
// ============================================================

function getStatusIcon(status: string) {
  switch (status) {
    case "running":
      return <Activity className="size-4 text-emerald-400" />;
    case "paused":
      return <Pause className="size-4 text-amber-400" />;
    case "completed":
      return <CheckCircle2 className="size-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="size-4 text-red-400" />;
    case "queued":
      return <Clock className="size-4 text-blue-400" />;
    case "configured":
      return <Circle className="size-4 text-slate-400" />;
    default:
      return <Circle className="size-4 text-slate-500" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "running":
      return "text-emerald-400";
    case "paused":
      return "text-amber-400";
    case "completed":
      return "text-emerald-400";
    case "failed":
      return "text-red-400";
    case "queued":
      return "text-blue-400";
    default:
      return "text-slate-400";
  }
}

// ============================================================
// Sub-components
// ============================================================

function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <motion.div
      variants={cardVariants}
      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur-sm"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon className="size-4 text-slate-400" />
      </div>
      <div className="flex flex-col">
        <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="text-lg font-semibold tabular-nums text-slate-200">
          {value}
          {unit && (
            <span className="ml-0.5 text-xs font-normal text-slate-500">
              {unit}
            </span>
          )}
        </span>
      </div>
      {trend && (
        <TrendingDown
          className={`ml-auto size-3.5 ${
            trend === "down"
              ? "text-emerald-400"
              : trend === "up"
                ? "text-red-400"
                : "text-slate-500"
          }`}
        />
      )}
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <motion.div
      variants={cardVariants}
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.02] px-8 py-16 text-center backdrop-blur-sm"
    >
      <Microscope className="size-12 text-slate-600" />
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
    </motion.div>
  );
}

// ============================================================
// ResearchWorkspace
// ============================================================

// ============================================================
// Phase 62: Benchmark Section
// ============================================================

function BenchmarkSection({
  activeSession,
}: {
  activeSession: SessionSummary | null;
}) {
  const [fingerprints, setFingerprints] = useState<ExperimentFingerprint[]>([]);
  const [expCount, setExpCount] = useState(0);

  useEffect(() => {
    // Load experiments from store and compute fingerprints
    try {
      const experiments = listExperiments();
      setExpCount(experiments.length);

      const fps: ExperimentFingerprint[] = [];
      for (const exp of experiments) {
        try {
          const identity = extractExperimentIdentity({
            seed: exp.seed,
            modelConfig: exp.modelConfig,
            trainingConfig: {
              ...exp.trainingConfig,
              optimizer: {
                lr: exp.trainingConfig.optimizer.lr,
                weightDecay: exp.trainingConfig.optimizer.weightDecay,
                type: exp.trainingConfig.optimizer.type,
              },
            },
            datasetConfig: exp.datasetConfig as {
              name: string;
              blockSize: number;
              batchSize: number;
              shuffle: boolean;
              type?: string;
            },
            tokenizerConfig: exp.tokenizerConfig as {
              type: string;
              vocabSize: number;
            },
          });
          fps.push(createExperimentFingerprint(identity));
        } catch {
          // Skip experiments with incomplete config
        }
      }
      setFingerprints(fps);
    } catch {
      setExpCount(0);
      setFingerprints([]);
    }
  }, [activeSession]);

  const latestFingerprint = fingerprints[0] ?? null;

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
    >
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical className="size-4 text-brand" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Research Benchmark
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Fingerprint Card */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Fingerprint className="size-3.5 text-indigo-400" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Experiment Fingerprint
            </span>
          </div>

          {latestFingerprint ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Combined</span>
                <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-indigo-400">
                  {latestFingerprint.combined}
                </code>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Model</span>
                <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-slate-400">
                  {latestFingerprint.components.model}
                </code>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Training</span>
                <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-slate-400">
                  {latestFingerprint.components.training}
                </code>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Seed</span>
                <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-slate-400">
                  {latestFingerprint.seed}
                </code>
              </div>
              {fingerprints.length > 1 && (
                <p className="mt-2 text-[0.6rem] text-slate-500">
                  +{fingerprints.length - 1} more experiment(s) in store
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              No experiments in store. Create an experiment to generate a fingerprint.
            </p>
          )}
        </div>

        {/* Benchmark Stats Card */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Gauge className="size-3.5 text-emerald-400" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Benchmark Status
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Experiments</span>
              <span className="text-sm font-semibold tabular-nums text-slate-300">
                {expCount}
              </span>
            </div>

            {activeSession ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Status</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${
                      activeSession.status === "completed"
                        ? "bg-emerald-400/10 text-emerald-400"
                        : activeSession.status === "running"
                          ? "bg-blue-400/10 text-blue-400"
                          : activeSession.status === "failed"
                            ? "bg-red-400/10 text-red-400"
                            : "bg-amber-400/10 text-amber-400"
                    }`}
                  >
                    {activeSession.status}
                  </span>
                </div>

                {activeSession.status === "completed" && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Best Loss</span>
                      <span className="text-sm font-semibold tabular-nums text-slate-300">
                        {activeSession.bestLoss?.toFixed(4) ?? "—"}
                      </span>
                    </div>
                  </>
                )}

                {activeSession.status === "running" && (
                  <p className="text-xs text-blue-400/70">
                    Benchmark will run after training completes.
                  </p>
                )}
              </>
            ) : (
              <div className="mt-2 rounded-lg bg-white/[0.03] p-2">
                <code className="block text-[0.6rem] leading-relaxed text-slate-500">
                  npx tsx src/lib/minimind/cli/minimind-cli.ts{"\n"}
                  {"  "}research benchmark{"\n"}
                  {"  "}--model tiny{"\n"}
                  {"  "}--recipe tiny-overfit-test
                </code>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ResearchWorkspace() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionSummary | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatusData | null>(null);
  const [timeline, setTimeline] = useState<SessionTimeline | null>(null);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // ── Data refresh ──
  useEffect(() => {
    function refresh() {
      setSessions(getWorkspaceSessions());
      setActiveSession(getActiveSession());
      setTrainingStatus(getTrainingStatus());
      setStats(getWorkspaceStats());
    }
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Timeline for selected session ──
  useEffect(() => {
    const id = selectedSessionId ?? activeSession?.id;
    if (id) {
      setTimeline(getExperimentTimeline(id));
    }
  }, [selectedSessionId, activeSession, sessions]);

  const displaySessionId = selectedSessionId ?? activeSession?.id;
  const displayTimeline = timeline;

  const hasSessions = sessions.length > 0;
  const isTraining = trainingStatus?.isTraining ?? false;

  return (
    <motion.div
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <motion.div variants={cardVariants} className="mb-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/[0.08]">
            <Microscope className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              MiniMind Research Studio
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {hasSessions
                ? isTraining
                  ? `Training: ${activeSession?.name ?? "Unknown"}`
                  : activeSession
                    ? `Active: ${activeSession.name}`
                    : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} in workspace`
                : "Create an experiment to get started"}
            </p>
          </div>
        </div>
      </motion.div>

      {!hasSessions ? (
        <EmptyState message="No research sessions yet. Launch an experiment from the Experiments page to see it here." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ============================================================ */}
          {/* Left column: Timeline + Sessions */}
          {/* ============================================================ */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            {/* Session Selector */}
            <motion.div
              variants={cardVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Sessions
              </h3>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      setSelectedSessionId(
                        s.id === selectedSessionId ? null : s.id
                      )
                    }
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      (selectedSessionId ?? activeSession?.id) === s.id
                        ? "bg-white/[0.06] text-slate-200"
                        : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-300"
                    }`}
                  >
                    {getStatusIcon(s.status)}
                    <span className="flex-1 truncate">{s.name}</span>
                    {s.isActive && (
                      <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-emerald-400">
                        Active
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Experiment Timeline */}
            <motion.div
              variants={cardVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Experiment Timeline
              </h3>
              {displayTimeline && displayTimeline.events.length > 0 ? (
                <div className="relative ml-2">
                  {/* Vertical line */}
                  <div className="absolute left-[7px] top-0 h-full w-px bg-white/[0.06]" />
                  <div className="flex flex-col gap-3">
                    {displayTimeline.events.map((event, i) => (
                      <motion.div
                        key={event.timestamp + i}
                        variants={timelineItemVariants}
                        className="relative flex items-start gap-3 pl-6"
                      >
                        {/* Dot */}
                        <div
                          className={`absolute left-0 top-1.5 size-[15px] rounded-full border-2 ${
                            event.type === "failed"
                              ? "border-red-400/30 bg-red-500/10"
                              : event.type === "completed"
                                ? "border-emerald-400/30 bg-emerald-500/10"
                                : event.type === "running"
                                  ? "border-brand/30 bg-brand/10"
                                  : "border-white/[0.08] bg-white/[0.04]"
                          }`}
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-slate-300">
                            {event.label}
                          </span>
                          <span className="text-[0.65rem] text-slate-600">
                            {event.time}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600">No timeline events yet.</p>
              )}
            </motion.div>
          </div>

          {/* ============================================================ */}
          {/* Right column: Live Training Panel + Training + Checkpoint + Results */}
          {/* ============================================================ */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            {/* Live Training Panel (Phase 58) — interactive controls + metrics + timeline */}
            {displaySessionId && (
              <LiveTrainingPanel
                sessionId={displaySessionId}
                sessionName={
                  sessions.find((s) => s.id === displaySessionId)?.name
                }
                onStart={() => {
                  const session = sessions.find(
                    (s) => s.id === displaySessionId
                  );
                  if (session) {
                    trainingRuntime
                      .start(displaySessionId, {
                        name: session.name,
                        modelConfig: {
                          name: "tiny",
                          label: session.modelLabel,
                          description: "",
                          vocabSize: 32000,
                          dModel: 128,
                          numHeads: 4,
                          dFF: 512,
                          numLayers: 4,
                          maxSeqLen: 256,
                          eps: 1e-6,
                          estimatedParams: 600000,
                        },
                        trainingConfig: {
                          name: "tiny-overfit-test",
                          label: session.recipeLabel,
                          description: "",
                          version: 1 as const,
                          model: "tiny",
                          dataset: {
                            dataset: "synthetic" as const,
                            blockSize: 16,
                            batchSize: 4,
                          },
                          optimizer: { type: "adamw", lr: 0.001 },
                          scheduler: { type: "none" },
                          epochs: 5,
                          gradientAccumulation: 1,
                          warmupSteps: 0,
                          seed: 42,
                          gradientClipNorm: 1.0,
                        },
                        dataset: "synthetic",
                        seed: 42,
                      })
                      .catch((err: Error) => {
                        console.error("TrainingRuntime: start failed", err);
                      });
                  }
                }}
                onPause={() => {
                  try {
                    trainingRuntime.pause(displaySessionId);
                  } catch (err) {
                    console.error("TrainingRuntime: pause failed", err);
                  }
                }}
                onResume={() => {
                  trainingRuntime
                    .resume(displaySessionId)
                    .catch((err: Error) => {
                      console.error("TrainingRuntime: resume failed", err);
                    });
                }}
                onStop={() => {
                  try {
                    trainingRuntime.stop(displaySessionId);
                  } catch (err) {
                    console.error("TrainingRuntime: stop failed", err);
                  }
                }}
              />
            )}

            {/* Research Copilot (Phase 59) — training intelligence */}
            <ResearchCopilot />

            {/* Live Training Card */}
            <motion.div
              variants={cardVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Activity className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Live Training
                </h3>
                {isTraining && (
                  <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase text-emerald-400">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Live
                  </span>
                )}
              </div>

              {isTraining && trainingStatus?.metrics ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <KpiCard
                    label="Loss"
                    value={trainingStatus.metrics.loss.toFixed(4)}
                    icon={TrendingDown}
                    trend="down"
                  />
                  <KpiCard
                    label="Perplexity"
                    value={trainingStatus.metrics.perplexity.toFixed(2)}
                    icon={BarChart3}
                  />
                  <KpiCard
                    label="Learning Rate"
                    value={trainingStatus.metrics.learningRate.toExponential(2)}
                    icon={Target}
                  />
                  <KpiCard
                    label="Tokens/sec"
                    value={trainingStatus.metrics.tokensPerSecond.toFixed(1)}
                    icon={Zap}
                  />
                  <KpiCard
                    label="Gradient Norm"
                    value={
                      trainingStatus.metrics.gradientNorm !== undefined
                        ? trainingStatus.metrics.gradientNorm.toFixed(4)
                        : "—"
                    }
                    icon={Activity}
                  />
                  <KpiCard
                    label="Step"
                    value={`${trainingStatus.metrics.globalStep} / ${trainingStatus.metrics.totalSteps}`}
                    icon={Hash}
                  />
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-slate-600">
                  {activeSession
                    ? `Session "${activeSession.name}" is ${activeSession.statusLabel.toLowerCase()}.`
                    : "No active training session. Start an experiment to see live metrics."}
                </p>
              )}
            </motion.div>

            {/* Checkpoint Panel */}
            <motion.div
              variants={cardVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Save className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Checkpoints
                </h3>
              </div>

              {activeSession && activeSession.status === "paused" ? (
                <div className="flex items-center justify-between rounded-xl border border-amber-400/10 bg-amber-500/[0.04] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Pause className="size-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">
                        Training Paused
                      </p>
                      <p className="text-xs text-slate-500">
                        Latest checkpoint at loss{" "}
                        {activeSession.currentLoss?.toFixed(4) ?? "—"}
                      </p>
                    </div>
                  </div>
                  <button
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                    aria-label="Resume training"
                  >
                    <RotateCcw className="size-3" />
                    Resume
                  </button>
                </div>
              ) : activeSession && activeSession.status === "completed" ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-400/10 bg-emerald-500/[0.04] px-4 py-3">
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-emerald-300">
                      Training Complete
                    </p>
                    <p className="text-xs text-slate-500">
                      Checkpoint saved — ready for analysis
                    </p>
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-slate-600">
                  No checkpoints available. Training has not been paused or completed yet.
                </p>
              )}
            </motion.div>

            {/* Result Summary */}
            <motion.div
              variants={cardVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Result Summary
                </h3>
              </div>

              {activeSession && activeSession.status === "completed" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <KpiCard
                    label="Final Loss"
                    value={activeSession.finalLoss?.toFixed(4) ?? "—"}
                    icon={TrendingDown}
                  />
                  <KpiCard
                    label="Best Loss"
                    value={activeSession.bestLoss?.toFixed(4) ?? "—"}
                    icon={Target}
                  />
                  <KpiCard
                    label="Perplexity"
                    value={activeSession.currentPerplexity?.toFixed(2) ?? "—"}
                    icon={BarChart3}
                  />
                </div>
              ) : stats?.completed ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <KpiCard
                    label="Best Overall Loss"
                    value={stats.bestLossOverall?.toFixed(4) ?? "—"}
                    icon={Target}
                    trend="down"
                  />
                  <KpiCard
                    label="Best Perplexity"
                    value={stats.bestPerplexityOverall?.toFixed(2) ?? "—"}
                    icon={BarChart3}
                  />
                  <KpiCard
                    label="Completed Runs"
                    value={String(stats.completed)}
                    icon={CheckCircle2}
                  />
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-slate-600">
                  No completed experiments yet. Results will appear here after training finishes.
                </p>
              )}
            </motion.div>

            {/* Workspace Stats */}
            <motion.div
              variants={cardVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Workspace Overview
                </h3>
              </div>

              {stats ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <span className="text-lg font-bold tabular-nums text-slate-200">
                      {stats.totalSessions}
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                      Total
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <span className="text-lg font-bold tabular-nums text-emerald-400">
                      {stats.running}
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                      Running
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <span className="text-lg font-bold tabular-nums text-amber-400">
                      {stats.paused}
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                      Paused
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <span className="text-lg font-bold tabular-nums text-emerald-400">
                      {stats.completed}
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                      Done
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <span className="text-lg font-bold tabular-nums text-red-400">
                      {stats.failed}
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                      Failed
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <span className="text-lg font-bold tabular-nums text-blue-400">
                      {stats.configured}
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                      Ready
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-slate-600">Loading stats...</p>
              )}
            </motion.div>

            {/* ── Phase 62: Benchmark & Fingerprint Section ── */}
            <BenchmarkSection activeSession={activeSession} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
