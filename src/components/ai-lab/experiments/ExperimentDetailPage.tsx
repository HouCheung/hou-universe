"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Cpu,
  BookOpen,
  TrendingDown,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  BarChart3,
  Layers,
  Target,
  AlertTriangle,
  RotateCcw,
  Microscope,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
// Phase 68: All experiment data now comes from the canonical
// ResearchExperimentStore via the LegacyExperimentAdapter.
// ExperimentStore is a deprecated facade — it routes to the
// same canonical source, so there is no dual persistence.
import {
  get as getRecord,
} from "@/lib/minimind/experiments/history/ExperimentStore";
import type { ExperimentRecord } from "@/lib/minimind/experiments/history/ExperimentRecord";
import {
  listRunsByExperiment,
  getExperiment,
} from "@/lib/minimind/research/ResearchExperimentStore";
import type { ResearchRun } from "@/lib/minimind/research/ResearchRun";
import type { ResearchExperiment } from "@/lib/minimind/research/ResearchExperiment";

// ============================================================
// Animation variants
// ============================================================

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ============================================================
// ExperimentDetailPage
// ============================================================

interface ExperimentDetailPageProps {
  experimentId: string;
}

/**
 * ExperimentDetailPage — detailed view of a single training
 * experiment.
 *
 * Displays:
 *   - Configuration (model + recipe)
 *   - Model stats (architecture, param count)
 *   - Loss summary (initial, final, best, perplexity)
 *   - Training throughput
 *   - Checkpoint information
 *   - Status with lifecycle controls
 */
export function ExperimentDetailPage({
  experimentId,
}: ExperimentDetailPageProps) {
  const router = useRouter();
  const [record, setRecord] = useState<ExperimentRecord | null>(null);
  const [researchExp, setResearchExp] = useState<ResearchExperiment | null>(null);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 68: Load from canonical ResearchExperimentStore as primary source.
  // The legacy ExperimentStore is now a facade → same canonical data.
  // Both reads hit the same persistence — no dual-store conflict.
  //
  // Phase 75: Poll every 2s so a just-launched experiment's runs, loss, and
  // checkpoint update live after redirecting from the workspace page.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      try {
        // Primary: canonical experiment + runs
        const exp = getExperiment(experimentId);
        if (exp) {
          setResearchExp(exp);
          const associatedRuns = listRunsByExperiment(experimentId);
          setRuns(associatedRuns);
        }

        // Backward-compatible: legacy record view (now from canonical via facade)
        const found = getRecord(experimentId);
        if (found) {
          setRecord(found);
        } else if (!exp) {
          setError(`Experiment "${experimentId}" not found.`);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load experiment."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [experimentId]);

  // ── Derived data ──
  const lossReduction = useMemo(() => {
    if (!record) return NaN;
    const { initialLoss, finalLoss } = record.metrics;
    if (!Number.isFinite(initialLoss) || initialLoss <= 0) return NaN;
    return ((initialLoss - finalLoss) / initialLoss) * 100;
  }, [record]);

  // ── Handlers ──
  const handleBack = useCallback(() => {
    router.push("/ai-lab/lab/experiments");
  }, [router]);

  const handleOpenResearch = useCallback(() => {
    router.push("/ai-lab/lab/research");
  }, [router]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center py-32">
          <div className="size-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !record) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200/60 bg-red-50/50 px-8 py-16 backdrop-blur-sm dark:border-red-500/[0.15] dark:bg-red-500/[0.04]">
          <AlertTriangle className="size-8 text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400">
            {error || "Experiment not found."}
          </p>
          <Button onClick={handleBack} variant="default" size="sm">
            <ArrowLeft className="mr-2 size-4" />
            Back to Workspace
          </Button>
        </div>
      </div>
    );
  }

  const { modelConfig, trainingConfig, metrics, status } = record;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      className="mx-auto max-w-4xl space-y-8 px-4 py-24 sm:px-6 sm:py-32 lg:px-8"
    >
      {/* ── Header with back button ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-start justify-between gap-4"
      >
        <div className="space-y-1">
          <button
            onClick={handleBack}
            className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            <ArrowLeft className="size-3.5" />
            Back to Workspace
          </button>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {record.name}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ID: {record.id}
          </p>
        </div>
        <StatusBadge status={status} />
      </motion.div>

      {/* ── Status — link to research workspace for live training control ── */}
      {(status === "running" || status === "completed" || status === "failed") && (
        <motion.div
          variants={sectionVariants}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 text-sm text-slate-400">
            {status === "running" && <Play className="size-4 animate-pulse text-blue-400" />}
            {status === "completed" && <CheckCircle2 className="size-4 text-emerald-400" />}
            {status === "failed" && <XCircle className="size-4 text-red-400" />}
            <span>Status: <span className="font-medium text-slate-300">{status}</span></span>
          </div>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenResearch}
              className="text-xs"
            >
              <Microscope className="mr-1.5 size-3.5" />
              Open Research Studio
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── Configuration section ── */}
      <motion.section variants={sectionVariants} className="space-y-4">
        <SectionTitle icon={<BookOpen className="size-4" />} title="Configuration" />
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Model config */}
          <ConfigCard title="Model Configuration">
            <ConfigRow label="Model" value={modelConfig.label} />
            <ConfigRow label="Architecture" value={`dModel=${modelConfig.dModel}, ${modelConfig.numLayers} layers, ${modelConfig.numHeads} heads`} />
            <ConfigRow label="Feed-Forward" value={`dFF=${modelConfig.dFF}`} />
            <ConfigRow label="Max Seq Len" value={String(modelConfig.maxSeqLen)} />
            <ConfigRow label="Vocab Size" value={modelConfig.vocabSize.toLocaleString()} />
            <ConfigRow
              label="Parameters"
              value={modelConfig.estimatedParams.toLocaleString()}
            />
          </ConfigCard>

          {/* Training config */}
          <ConfigCard title="Training Configuration">
            <ConfigRow label="Recipe" value={trainingConfig.label} />
            <ConfigRow label="Dataset" value={trainingConfig.dataset.dataset} />
            <ConfigRow label="Block Size" value={String(trainingConfig.dataset.blockSize)} />
            <ConfigRow label="Batch Size" value={String(trainingConfig.dataset.batchSize)} />
            <ConfigRow label="Epochs" value={String(trainingConfig.epochs)} />
            <ConfigRow label="Seed" value={String(trainingConfig.seed)} />
            <ConfigRow
              label="Optimizer"
              value={`${trainingConfig.optimizer.type}, lr=${trainingConfig.optimizer.lr}`}
            />
            <ConfigRow label="Scheduler" value={trainingConfig.scheduler.type} />
            {trainingConfig.gradientClipNorm && (
              <ConfigRow
                label="Grad Clip Norm"
                value={String(trainingConfig.gradientClipNorm)}
              />
            )}
          </ConfigCard>
        </div>
      </motion.section>

      <Separator className="bg-slate-200/60 dark:bg-white/[0.06]" />

      {/* ── Model Stats section ── */}
      <motion.section variants={sectionVariants} className="space-y-4">
        <SectionTitle icon={<Cpu className="size-4" />} title="Model Stats" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Layers className="size-4" />}
            label="Total Parameters"
            value={modelConfig.estimatedParams.toLocaleString()}
          />
          <MetricCard
            icon={<Layers className="size-4" />}
            label="Layers"
            value={String(modelConfig.numLayers)}
          />
          <MetricCard
            icon={<Target className="size-4" />}
            label="Attention Heads"
            value={String(modelConfig.numHeads)}
          />
          <MetricCard
            icon={<BarChart3 className="size-4" />}
            label="dModel"
            value={String(modelConfig.dModel)}
          />
        </div>
      </motion.section>

      <Separator className="bg-slate-200/60 dark:bg-white/[0.06]" />

      {/* ── Loss Curve / Metrics section ── */}
      <motion.section variants={sectionVariants} className="space-y-4">
        <SectionTitle icon={<TrendingDown className="size-4" />} title="Loss Summary" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<TrendingDown className="size-4" />}
            label="Initial Loss"
            value={Number.isFinite(metrics.initialLoss) ? metrics.initialLoss.toFixed(4) : "N/A"}
          />
          <MetricCard
            icon={<TrendingDown className="size-4" />}
            label="Final Loss"
            value={Number.isFinite(metrics.finalLoss) ? metrics.finalLoss.toFixed(4) : "N/A"}
          />
          <MetricCard
            icon={<Target className="size-4" />}
            label="Best Loss"
            value={Number.isFinite(metrics.bestLoss) ? metrics.bestLoss.toFixed(4) : "N/A"}
            highlight
          />
          <MetricCard
            icon={<BarChart3 className="size-4" />}
            label="Perplexity"
            value={Number.isFinite(metrics.perplexity) ? metrics.perplexity.toFixed(2) : "N/A"}
          />
        </div>

        {/* Loss reduction indicator */}
        {Number.isFinite(lossReduction) && (
          <div className="rounded-xl border border-brand/10 bg-brand/[0.02] p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <TrendingDown className="size-5 text-emerald-500" />
              <span className="text-sm font-medium text-foreground">
                Loss reduced by{" "}
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {lossReduction.toFixed(1)}%
                </span>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({metrics.initialLoss.toFixed(4)} → {metrics.finalLoss.toFixed(4)})
              </span>
            </div>
          </div>
        )}
      </motion.section>

      {/* ── Throughput + Timing ── */}
      <motion.section variants={sectionVariants} className="space-y-4">
        <SectionTitle icon={<Zap className="size-4" />} title="Performance" />
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            icon={<Zap className="size-4" />}
            label="Tokens / Second"
            value={metrics.tokensPerSecond > 0 ? metrics.tokensPerSecond.toFixed(1) : "N/A"}
          />
          <MetricCard
            icon={<Clock className="size-4" />}
            label="Created At"
            value={new Date(record.createdAt).toLocaleString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </div>
      </motion.section>

      <Separator className="bg-slate-200/60 dark:bg-white/[0.06]" />

      {/* ── Checkpoint + Reproducibility ── */}
      <motion.section variants={sectionVariants} className="space-y-4">
        <SectionTitle icon={<RotateCcw className="size-4" />} title="Checkpoint & Reproducibility" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ConfigCard title="Checkpoint">
            {record.checkpoint ? (
              <ConfigRow label="Path" value={record.checkpoint} mono />
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No checkpoint saved. Checkpoints are created when training
                completes successfully.
              </p>
            )}
          </ConfigCard>
          <ConfigCard title="Reproducibility">
            <ConfigRow label="Seed" value={String(trainingConfig.seed)} />
            <ConfigRow label="Recipe Version" value={`v${trainingConfig.version}`} />
            <ConfigRow label="Model" value={modelConfig.name} />
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              To verify reproducibility, run the same configuration with
              the same seed. Results should be identical.
            </p>
          </ConfigCard>
        </div>
      </motion.section>

      {/* ── Generation CTA ── */}
      <motion.section variants={sectionVariants} className="space-y-4">
        <SectionTitle icon={<MessageSquare className="size-4" />} title="Generation" />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-brand/10 bg-brand/[0.02] p-6 text-center backdrop-blur-sm sm:flex-row sm:text-left dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Evaluate this model in the Generation Lab
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Generate text from trained checkpoints and compare before/after training output quality.
            </p>
          </div>
          <Link
            href={`/ai-lab/lab/generation?experiment=${encodeURIComponent(experimentId)}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-4 py-2 text-xs font-medium text-brand transition-all hover:border-brand/40 hover:bg-brand/[0.12]"
          >
            <MessageSquare className="size-3.5" />
            Open Generation Lab
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </motion.section>

      {/* ── Research Experiment & Runs (from ResearchExperimentStore) ── */}
      {researchExp && (
        <>
          <Separator className="bg-slate-200/60 dark:bg-white/[0.06]" />

          <motion.section variants={sectionVariants} className="space-y-4">
            <SectionTitle icon={<BookOpen className="size-4" />} title="Research Identity" />
            <div className="rounded-xl border border-slate-200/60 bg-white/50 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="space-y-2">
                {researchExp.hypothesis && (
                  <ConfigRow label="Hypothesis" value={researchExp.hypothesis} />
                )}
                <ConfigRow label="Experiment ID" value={researchExp.id} mono />
                <ConfigRow label="Status" value={researchExp.status} />
                <ConfigRow label="Seed" value={String(researchExp.seed)} />
                {researchExp.tags.length > 0 && (
                  <ConfigRow label="Tags" value={researchExp.tags.join(", ")} />
                )}
              </div>
            </div>
          </motion.section>

          {/* ── Runs ── */}
          {runs.length > 0 && (
            <motion.section variants={sectionVariants} className="space-y-4">
              <SectionTitle icon={<Layers className="size-4" />} title={`Runs (${runs.length})`} />
              <div className="space-y-3">
                {runs.map((run, i) => (
                  <div
                    key={run.runId}
                    className="rounded-xl border border-slate-200/60 bg-white/50 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Run #{i + 1}
                      </span>
                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                        {run.runId}
                      </span>
                      <RunStatusBadge status={run.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Best Loss</span>
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {Number.isFinite(run.bestLoss) ? run.bestLoss.toFixed(4) : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Final Loss</span>
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {Number.isFinite(run.finalLoss) ? run.finalLoss.toFixed(4) : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Perplexity</span>
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {Number.isFinite(run.perplexity) ? run.perplexity.toFixed(2) : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Steps</span>
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {run.totalSteps > 0 ? run.totalSteps.toLocaleString() : "—"}
                        </p>
                      </div>
                    </div>
                    {run.checkpointId && (
                      <div className="mt-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Checkpoint:{" "}
                        </span>
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                          {run.checkpointId}
                        </span>
                      </div>
                    )}
                    {run.errorMessage && (
                      <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                        Error: {run.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </motion.section>
          )}
        </>
      )}
    </motion.div>
  );
}

// ============================================================
// Internal components
// ============================================================

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 dark:bg-brand/20">
        <span className="text-brand">{icon}</span>
      </div>
      <h2 className="text-base font-bold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  );
}

function ConfigCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/50 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ConfigRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span
        className={`text-xs font-medium text-foreground ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 backdrop-blur-sm ${
        highlight
          ? "border-brand/20 bg-brand/[0.03] dark:border-brand/30 dark:bg-brand/[0.06]"
          : "border-slate-200/60 bg-white/50 dark:border-white/[0.06] dark:bg-white/[0.02]"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const config = {
    running: {
      className:
        "border-blue-200/60 bg-blue-100/60 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
      label: "Running",
    },
    completed: {
      className:
        "border-emerald-200/60 bg-emerald-100/60 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
      label: "Completed",
    },
    failed: {
      className:
        "border-red-200/60 bg-red-100/60 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
      label: "Failed",
    },
    cancelled: {
      className:
        "border-amber-200/60 bg-amber-100/60 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
      label: "Cancelled",
    },
    pending: {
      className:
        "border-slate-200/60 bg-slate-100/60 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
      label: "Pending",
    },
  }[status] ?? {
    className:
      "border-slate-200/60 bg-slate-100/60 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
    label: status,
  };

  return (
    <Badge className={`border px-1.5 py-0 text-[10px] leading-none ${config.className}`}>
      {config.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    running: {
      icon: <Play className="size-3.5" />,
      className:
        "border-blue-200/60 bg-blue-100/60 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
      label: "Running",
    },
    completed: {
      icon: <CheckCircle2 className="size-3.5" />,
      className:
        "border-emerald-200/60 bg-emerald-100/60 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
      label: "Completed",
    },
    failed: {
      icon: <XCircle className="size-3.5" />,
      className:
        "border-red-200/60 bg-red-100/60 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
      label: "Failed",
    },
  }[status] ?? {
    icon: <AlertTriangle className="size-3.5" />,
    className:
      "border-slate-200/60 bg-slate-100/60 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
    label: status,
  };

  return (
    <Badge className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
