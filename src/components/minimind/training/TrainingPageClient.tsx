"use client";

// ============================================================
// TrainingPageClient — Training showcase with real data
// ============================================================
// Phase 73: Replaced Pretrainer/NoOpOptimizer (educational)
// with real TrainingRuntime → TrainingWorker → Trainer chain.
// Shows live metrics from active sessions and completed
// training history from ExperimentStore.
//
// SSR-safe: All localStorage-dependent adapters are loaded
// lazily after mount via useEffect. During SSR, renders a
// minimal skeleton to avoid localStorage ReferenceError.
// ============================================================

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { GraduationCap, Play, Loader2, Zap, Pause, Square, History, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { CrossRefButton } from "@/components/ai-lab/CrossRefButton";
import { LossChart } from "./LossChart";
import { TrainingCapabilityPanel } from "./TrainingCapabilityPanel";
import type { TrainingCapability } from "@/lib/minimind/pretrain";

// Lazy types — adapters loaded after mount
type LiveMetrics = import("@/lib/ai-lab/adapters/liveTrainingAdapter").LiveMetrics;
type TrainingStatusBadge = import("@/lib/ai-lab/adapters/liveTrainingAdapter").TrainingStatusBadge;
type TrainingTimeline = import("@/lib/ai-lab/adapters/liveTrainingAdapter").TrainingTimeline;
type LossHistoryPoint = import("@/lib/ai-lab/adapters/trainingAdapter").LossHistoryPoint;
type TrainingStats = import("@/lib/ai-lab/adapters/trainingAdapter").TrainingStats;
type TrainingRuntimeInstance = import("@/lib/minimind/research/TrainingRuntime").TrainingRuntime;

// ============================================================
// Constants
// ============================================================

const POLL_INTERVAL_MS = 2000;

// ============================================================
// TrainingPageClient
// ============================================================

export function TrainingPageClient() {
  const { t } = useTranslation();

  // SSR guard — only render real content after mount
  const [mounted, setMounted] = useState(false);

  // Adapter functions — loaded lazily
  const [adapters, setAdapters] = useState<{
    getActiveLiveMetrics: () => LiveMetrics | null;
    getActiveTrainingStatusBadge: () => TrainingStatusBadge | null;
    getActiveTrainingTimeline: () => TrainingTimeline | null;
    getLossHistory: () => LossHistoryPoint[];
    getTrainingStats: () => TrainingStats;
    hasTrainingHistory: () => boolean;
    workspace: { getActiveSession: () => { id: string } | undefined };
    trainingRuntime: TrainingRuntimeInstance;
  } | null>(null);

  // ── Load adapters after mount (SSR-safe) ──
  useEffect(() => {
    let cancelled = false;

    async function loadAdapters() {
      const [
        { getActiveLiveMetrics, getActiveTrainingStatusBadge, getActiveTrainingTimeline },
        { getLossHistory, getTrainingStats, hasTrainingHistory },
        { workspace },
        { trainingRuntime },
      ] = await Promise.all([
        import("@/lib/ai-lab/adapters/liveTrainingAdapter"),
        import("@/lib/ai-lab/adapters/trainingAdapter"),
        import("@/lib/minimind/research/ResearchWorkspace"),
        import("@/lib/minimind/research/TrainingRuntime"),
      ]);

      if (!cancelled) {
        setAdapters({
          getActiveLiveMetrics,
          getActiveTrainingStatusBadge,
          getActiveTrainingTimeline,
          getLossHistory,
          getTrainingStats,
          hasTrainingHistory,
          workspace,
          trainingRuntime,
        });
        setMounted(true);
      }
    }

    loadAdapters();
    return () => { cancelled = true; };
  }, []);

  // ── Live training state ──
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const [statusBadge, setStatusBadge] = useState<TrainingStatusBadge | null>(null);
  const [timeline, setTimeline] = useState<TrainingTimeline | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ── History state ──
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(null);
  const [lossHistory, setLossHistory] = useState<LossHistoryPoint[]>([]);

  // ── Quick-start training state ──
  const [isQuickStarting, setIsQuickStarting] = useState(false);
  const [quickStartError, setQuickStartError] = useState<string | null>(null);

  // ── Initial data load (client-only) ──
  useEffect(() => {
    if (!adapters) return;
    setLiveMetrics(adapters.getActiveLiveMetrics());
    setStatusBadge(adapters.getActiveTrainingStatusBadge());
    setTimeline(adapters.getActiveTrainingTimeline());
    setSessionId(adapters.workspace.getActiveSession()?.id ?? null);
    setTrainingStats(adapters.getTrainingStats());
    setLossHistory(adapters.getLossHistory());
  }, [adapters]);

  // ── Poll live data ──
  useEffect(() => {
    if (!adapters) return;
    const interval = setInterval(() => {
      setLiveMetrics(adapters.getActiveLiveMetrics());
      setStatusBadge(adapters.getActiveTrainingStatusBadge());
      setTimeline(adapters.getActiveTrainingTimeline());
      setSessionId(adapters.workspace.getActiveSession()?.id ?? null);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [adapters]);

  // ── Subscribe to TrainingEventBus ──
  useEffect(() => {
    if (!adapters) return;
    const eventBus = adapters.trainingRuntime.getEventBus();
    const unsub = eventBus.subscribe("training:step", (data) => {
      setLiveMetrics((prev) => {
        const m = data.metrics;
        return {
          loss: m.loss,
          perplexity: m.perplexity,
          learningRate: m.learningRate,
          throughput: m.tokensPerSecond ?? 0,
          gradientNorm: m.gradientNorm ?? null,
          currentStep: m.globalStep,
          totalSteps: m.totalSteps,
          progressPercent:
            m.totalSteps > 0
              ? Math.round((m.globalStep / m.totalSteps) * 100)
              : prev?.progressPercent ?? 0,
        };
      });
    });
    return unsub;
  }, [adapters]);

  // ── Derived ──
  const isLive = statusBadge?.status === "running" || statusBadge?.status === "paused";
  const hasHistory = adapters ? adapters.hasTrainingHistory() : false;

  // ── Quick-start training ──
  const handleQuickStart = useCallback(async () => {
    if (!adapters || isQuickStarting) return;
    setIsQuickStarting(true);
    setQuickStartError(null);

    try {
      const newSessionId = sessionId ?? `rs-${Date.now().toString(36)}`;
      await adapters.trainingRuntime.start(newSessionId, {
        name: "Quick Training Run",
        modelConfig: {
          name: "tiny",
          label: "Tiny",
          description: "Quick-start tiny model",
          vocabSize: 260,
          dModel: 64,
          numHeads: 2,
          dFF: 128,
          numLayers: 1,
          maxSeqLen: 64,
          eps: 1e-6,
          estimatedParams: 50000,
        },
        trainingConfig: {
          name: "default",
          label: "Default",
          description: "Default training recipe",
          version: 1 as const,
          model: "tiny",
          dataset: { dataset: "bilingual", blockSize: 32, batchSize: 4 },
          optimizer: { type: "adamw", lr: 0.001 },
          scheduler: { type: "none" },
          epochs: 5,
          gradientAccumulation: 1,
          warmupSteps: 0,
          seed: 42,
        },
        dataset: "bilingual",
        seed: 42,
        epochs: 5,
      });
      setSessionId(newSessionId);
    } catch (err) {
      setQuickStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsQuickStarting(false);
    }
  }, [adapters, isQuickStarting, sessionId]);

  // ── Stop / Pause / Resume ──
  const handleStop = useCallback(() => {
    if (!sessionId || !adapters) return;
    try { adapters.trainingRuntime.stop(sessionId); } catch { /* ignore */ }
  }, [sessionId, adapters]);

  const handlePause = useCallback(() => {
    if (!sessionId || !adapters) return;
    try { adapters.trainingRuntime.pause(sessionId); } catch { /* ignore */ }
  }, [sessionId, adapters]);

  const handleResume = useCallback(() => {
    if (!sessionId || !adapters) return;
    adapters.trainingRuntime.resume(sessionId).catch(() => {});
  }, [sessionId, adapters]);

  // ============================================================
  // SSR Skeleton
  // ============================================================
  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="rounded-2xl border border-brand/10 bg-brand/[0.02] p-6">
          <div className="flex items-start gap-4">
            <div className="size-10 rounded-xl bg-brand/[0.08]" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-48 rounded-lg bg-brand/[0.06]" />
              <div className="h-4 w-96 rounded-lg bg-brand/[0.04]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* ===================================================== */}
      {/* Section 1: Hero */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02] p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/[0.10] dark:bg-brand/[0.15]">
            <GraduationCap className="size-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("minimind.training.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500/80 dark:text-slate-400/70 leading-relaxed">
              {t("minimind.training.subtitle")}
            </p>

            {/* Status badges */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Real training badge */}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1",
                  statusBadge
                    ? "border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06]"
                    : "border-slate-200/60 bg-slate-50/50 dark:border-white/[0.05] dark:bg-white/[0.02]"
                )}
              >
                <div
                  className={cn(
                    "size-1.5 rounded-full",
                    statusBadge?.showPulse
                      ? "bg-emerald-500 animate-pulse"
                      : statusBadge
                        ? "bg-emerald-500 dark:bg-emerald-400"
                        : "bg-slate-300 dark:bg-slate-600"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[0.6rem]",
                    statusBadge
                      ? "text-emerald-700/80 dark:text-emerald-400/70"
                      : "text-slate-500/60 dark:text-slate-400/50"
                  )}
                >
                  {statusBadge
                    ? `Status: ${statusBadge.label}`
                    : "No active training session"}
                </span>
              </div>

              {/* Step badge (live only) */}
              {isLive && liveMetrics && (
                <div className="flex items-center gap-1.5 rounded-lg border border-brand/15 bg-brand/[0.04] px-2.5 py-1 dark:border-brand/20 dark:bg-brand/[0.06]">
                  <Cpu className="size-3 text-brand/60" />
                  <span className="font-mono text-[0.6rem] text-brand/80">
                    Step: {liveMetrics.currentStep}/{liveMetrics.totalSteps}
                  </span>
                </div>
              )}

              {/* History badge */}
              {hasHistory && trainingStats && (
                <div className="flex items-center gap-1.5 rounded-lg border border-blue-200/60 bg-blue-50/50 px-2.5 py-1 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
                  <History className="size-3 text-blue-500/70" />
                  <span className="font-mono text-[0.6rem] text-blue-700/80 dark:text-blue-400/70">
                    {trainingStats.completedRuns} completed runs
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ===================================================== */}
      {/* Section 2: Training Controls */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
        className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02] p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {!isLive ? (
            <button
              type="button"
              onClick={handleQuickStart}
              disabled={isQuickStarting}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 shrink-0",
                "bg-brand text-white shadow-[0_0_20px_rgba(var(--brand-rgb),0.3)]",
                "hover:bg-brand/90 hover:shadow-[0_0_28px_rgba(var(--brand-rgb),0.4)]",
                "active:scale-[0.98]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              )}
            >
              {isQuickStarting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Quick-Start Training (Web Worker)
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {statusBadge?.status === "running" && (
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-2 text-sm font-medium text-amber-700/80 transition-all duration-200 hover:bg-amber-100/50 dark:border-amber-500/15 dark:bg-amber-500/[0.06] dark:text-amber-400/70"
                >
                  <Pause className="size-4" />
                  Pause
                </button>
              )}
              {statusBadge?.status === "paused" && (
                <button
                  type="button"
                  onClick={handleResume}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-2 text-sm font-medium text-emerald-700/80 transition-all duration-200 hover:bg-emerald-100/50 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06] dark:text-emerald-400/70"
                >
                  <Play className="size-4" />
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200/60 bg-red-50/50 px-4 py-2 text-sm font-medium text-red-700/80 transition-all duration-200 hover:bg-red-100/50 dark:border-red-500/15 dark:bg-red-500/[0.06] dark:text-red-400/70"
              >
                <Square className="size-3.5" />
                Stop
              </button>
            </div>
          )}

          {quickStartError && (
            <span className="font-mono text-[0.65rem] text-red-500/80">
              {quickStartError}
            </span>
          )}
        </div>

        {/* Live metrics summary */}
        {liveMetrics && isLive && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand/10 bg-brand/[0.02] px-4 py-2.5 dark:border-brand/15 dark:bg-brand/[0.03]"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="size-3 text-brand/60" />
              <span className="font-mono text-[0.65rem] text-brand/70 dark:text-brand/60">
                {liveMetrics.progressPercent}%
              </span>
            </div>
            <span className="text-[0.6rem] text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
              Loss: {liveMetrics.loss.toFixed(4)}
            </span>
            <span className="text-[0.6rem] text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
              Perplexity: {liveMetrics.perplexity.toFixed(2)}
            </span>
            <span className="text-[0.6rem] text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
              Throughput:{" "}
              {liveMetrics.throughput > 0
                ? `${liveMetrics.throughput.toFixed(0)} tok/s`
                : "—"}
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* ===================================================== */}
      {/* Section 3: Completed Training History */}
      {/* ===================================================== */}
      {hasHistory && !isLive && lossHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
        >
          <LossChart
            lossHistory={lossHistory.map((p) => p.loss)}
            epochs={lossHistory.length}
          />
        </motion.div>
      )}

      {/* ===================================================== */}
      {/* Section 4: Live Training Timeline */}
      {/* ===================================================== */}
      {isLive && timeline && timeline.entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35, ease: "easeOut" }}
        >
          <div className="rounded-xl border border-brand/10 bg-brand/[0.02] dark:border-brand/15 dark:bg-brand/[0.03] p-5">
            <h3 className="mb-4 font-mono text-[0.7rem] font-semibold tracking-[0.08em] uppercase text-slate-500/60 dark:text-slate-400/50">
              Training Timeline
            </h3>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {timeline.entries.slice(-20).map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 font-mono text-[0.65rem]"
                >
                  <span className="w-16 shrink-0 text-slate-500/40 dark:text-slate-400/30">
                    {entry.relativeTime}
                  </span>
                  <span className="flex-1 text-slate-500/80 dark:text-slate-400/60">
                    {entry.label}
                  </span>
                  {entry.loss !== null && (
                    <span className="shrink-0 tabular-nums text-slate-700/70 dark:text-slate-300/60">
                      loss: {entry.loss.toFixed(4)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ===================================================== */}
      {/* Section 5: Capability Panel */}
      {/* ===================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: "easeOut" }}
      >
        <TrainingCapabilityPanel
          capability={{
            forwardPass: true,
            lossCalculation: true,
            gradientComputation: true,
            parameterUpdate: isLive,
          } satisfies TrainingCapability}
        />
      </motion.div>

      {/* Cross-Reference Navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <CrossRefButton
          variant="inference"
          targetId="inference"
          label="Explore Inference"
        />
        <CrossRefButton
          variant="experiments"
          targetId="experiments"
          label="Explore Experiments"
        />
      </div>
    </div>
  );
}
