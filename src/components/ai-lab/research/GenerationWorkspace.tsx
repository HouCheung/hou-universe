"use client";

// ============================================================
// GenerationWorkspace — MiniMind Generation Lab UI
// ============================================================
// Phase 67: Premium research interface for text generation
// from trained MiniMind checkpoints.
//
// Sections:
//   1. Header — "GENERATION LAB" + session/checkpoint selector
//   2. Prompt Workspace — prompt editor + parameter controls
//   3. Live Generation State — status, progress, elapsed time
//   4. Generation Result — generated output + metrics
//   5. Before/After Comparison — side-by-side baseline vs trained
//   6. Generation History — previous generations
//   7. Export — JSON / Markdown download
//
// Design: glass morphism + Framer Motion + cosmic theme
// Data: through generationAdapter
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Sparkles,
  Play,
  Square,
  Clock,
  Hash,
  TrendingUp,
  FileJson,
  FileText,
  Trash2,
  ChevronRight,
  Target,
  MessageSquare,
  Sliders,
  BarChart3,
  Copy,
  XCircle,
  FlaskConical,
  Cpu,
  Fingerprint,
} from "lucide-react";
import {
  generateFromSession,
  generateComparison,
  getGenerationHistory,
  deleteHistoryEntry,
  getGeneratableSessions,
  toGenerationUIData,
  toComparisonUIData,
  type GenerationUIData,
  type ComparisonUIData,
  type GenerationCheckpointInfo,
} from "@/lib/ai-lab/adapters/generationAdapter";
import { GenerationComparison } from "./GenerationComparison";

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

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// ============================================================
// Generation Status Badge
// ============================================================

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  idle: { color: "text-slate-400", bg: "bg-slate-400/10" },
  generating: { color: "text-blue-400", bg: "bg-blue-400/10" },
  completed: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
  error: { color: "text-red-400", bg: "bg-red-400/10" },
  cancelled: { color: "text-amber-400", bg: "bg-amber-400/10" },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const statusKey = status in STATUS_CONFIG ? status : "idle";
  const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.idle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.color}`}
    >
      {status === "generating" && (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      )}
      {t(`aiLab.generation.status.${statusKey}`)}
    </span>
  );
}

// ============================================================
// KPI Card
// ============================================================

function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 backdrop-blur-sm">
      <Icon className="size-3.5 text-slate-500" />
      <div className="flex flex-col">
        <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums text-slate-200">
          {value}
          {unit && (
            <span className="ml-0.5 text-[0.6rem] font-normal text-slate-500">
              {unit}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// GenerationWorkspace
// ============================================================

export function GenerationWorkspace() {
  const { t } = useTranslation();

  // ── State ──
  const [prompt, setPrompt] = useState(t("aiLab.generation.promptPlaceholder"));
  const [maxTokens, setMaxTokens] = useState(64);
  const [temperature, setTemperature] = useState(0.8);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.9);
  const [seed, setSeed] = useState<string>("42");
  const [useSeed, setUseSeed] = useState(true);

  const [status, setStatus] = useState<string>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [elapsedInterval, setElapsedInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const [result, setResult] = useState<GenerationUIData | null>(null);
  const [comparison, setComparison] = useState<ComparisonUIData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<GenerationCheckpointInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [history, setHistory] = useState<ReturnType<typeof getGenerationHistory>["entries"]>([]);

  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load sessions ──
  useEffect(() => {
    const gens = getGeneratableSessions();
    setSessions(gens);
    if (gens.length > 0 && !selectedSessionId) {
      setSelectedSessionId(gens[0].sessionId);
    }
  }, []);

  // ── Load history ──
  useEffect(() => {
    setHistory(getGenerationHistory().entries);
  }, [result]);

  // ── Cleanup elapsed timer ──
  useEffect(() => {
    return () => {
      if (elapsedInterval) clearInterval(elapsedInterval);
    };
  }, [elapsedInterval]);

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    if (!selectedSessionId) return;
    if (!prompt.trim()) return;

    // Cancel any existing generation
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const abort = new AbortController();
    abortRef.current = abort;

    setStatus("generating");
    setError(null);
    setResult(null);
    setComparison(null);
    setElapsedMs(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);
    setElapsedInterval(timer);

    try {
      const genResult = await generateFromSession(
        selectedSessionId,
        prompt,
        {
          maxTokens,
          temperature,
          topK,
          topP,
          seed: useSeed ? parseInt(seed, 10) || 42 : undefined,
        },
        abort.signal
      );

      clearInterval(timer);
      setElapsedInterval(null);

      if (genResult.status === "cancelled") {
        setStatus("cancelled");
        return;
      }

      const session = sessions.find((s) => s.sessionId === selectedSessionId);
      setResult(toGenerationUIData(genResult, session?.sessionName));
      setStatus("completed");
      setElapsedMs(genResult.metrics.durationMs);
    } catch (err) {
      clearInterval(timer);
      setElapsedInterval(null);

      if (abort.signal.aborted) {
        setStatus("cancelled");
        return;
      }

      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSessionId, prompt, maxTokens, temperature, topK, topP, seed, useSeed, sessions]);

  // ── Compare (Baseline vs Trained) ──
  const handleCompare = useCallback(async () => {
    if (!selectedSessionId) return;
    if (!prompt.trim()) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const abort = new AbortController();
    abortRef.current = abort;

    setStatus("generating");
    setError(null);
    setResult(null);
    setComparison(null);
    setElapsedMs(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);
    setElapsedInterval(timer);

    try {
      const comp = await generateComparison(
        selectedSessionId,
        prompt,
        {
          maxTokens,
          temperature,
          topK,
          topP,
          seed: useSeed ? parseInt(seed, 10) || 42 : undefined,
        },
        abort.signal
      );

      clearInterval(timer);
      setElapsedInterval(null);

      const session = sessions.find((s) => s.sessionId === selectedSessionId);
      setComparison(toComparisonUIData(comp, session?.sessionName));
      setResult(toGenerationUIData(comp.trained, session?.sessionName));
      setStatus("completed");
      setElapsedMs(comp.trained.metrics.durationMs + comp.baseline.metrics.durationMs);
    } catch (err) {
      clearInterval(timer);
      setElapsedInterval(null);

      if (abort.signal.aborted) {
        setStatus("cancelled");
        return;
      }

      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSessionId, prompt, maxTokens, temperature, topK, topP, seed, useSeed, sessions]);

  // ── Cancel ──
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (elapsedInterval) {
      clearInterval(elapsedInterval);
      setElapsedInterval(null);
    }
    setStatus("cancelled");
  }, [elapsedInterval]);

  // ── Export ──
  const handleExportJSON = useCallback(() => {
    if (!result) return;
    // We need the raw result for export — use the comparison if available
    const jsonStr = JSON.stringify(
      {
        result: {
          prompt: result.prompt,
          generatedText: result.generatedText,
          metrics: {
            tokenCount: result.tokenCount,
            avgLogProb: result.avgLogProb,
            perplexity: result.perplexity,
            durationMs: result.durationMs,
          },
          isBaseline: result.isBaseline,
        },
        comparison: comparison
          ? {
              changed: comparison.changed,
              logProbDelta: comparison.logProbDelta,
              perplexityDelta: comparison.perplexityDelta,
              baseline: comparison.baseline.generatedText,
              trained: comparison.trained.generatedText,
            }
          : undefined,
      },
      null,
      2
    );
    downloadText(jsonStr, `generation-${result.requestId}.json`, "application/json");
  }, [result, comparison]);

  const handleExportMarkdown = useCallback(() => {
    if (!result) return;
    const lines = [
      "# MiniMind Generation Report",
      "",
      `**Prompt:** ${result.prompt}`,
      `**Session:** ${result.sessionName}`,
      `**Status:** ${result.status}`,
      "",
      "## Generated Output",
      "",
      "```",
      result.generatedText,
      "```",
      "",
      "## Metrics",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Tokens | ${result.tokenCount} |`,
      `| Avg Log-Prob | ${result.avgLogProb.toFixed(4)} |`,
      `| Perplexity | ${result.perplexity.toFixed(2)} |`,
      `| Stop Reason | ${result.stopReason} |`,
      `| Duration | ${result.durationMs}ms |`,
      `| Baseline | ${result.isBaseline ? "Yes" : "No"} |`,
    ];

    if (comparison) {
      lines.push(
        "",
        "## Before/After Comparison",
        "",
        `| Metric | Baseline | Trained | Delta |`,
        `|--------|----------|---------|-------|`,
        `| Avg Log-Prob | ${comparison.baseline.avgLogProb.toFixed(4)} | ${comparison.trained.avgLogProb.toFixed(4)} | ${comparison.logProbDelta >= 0 ? "+" : ""}${comparison.logProbDelta.toFixed(4)} |`,
        `| Perplexity | ${comparison.baseline.perplexity.toFixed(2)} | ${comparison.trained.perplexity.toFixed(2)} | ${comparison.perplexityDelta >= 0 ? "+" : ""}${comparison.perplexityDelta.toFixed(2)} |`,
        `| Changed | — | — | ${comparison.changed ? "Yes" : "No"} |`,
      );
    }

    downloadText(lines.join("\n"), `generation-${result.requestId}.md`, "text/markdown");
  }, [result, comparison]);

  // ── Copy to clipboard ──
  const handleCopy = useCallback(() => {
    if (!result?.generatedText) return;
    navigator.clipboard.writeText(result.generatedText).catch(() => {});
  }, [result]);

  // ── Delete history entry ──
  const handleDeleteHistory = useCallback((id: string) => {
    deleteHistoryEntry(id);
    setHistory(getGenerationHistory().entries);
  }, []);

  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId);
  const isGenerating = status === "generating";
  const hasResult = status === "completed" && result;

  return (
    <motion.div
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <motion.div variants={cardVariants} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/[0.08]">
            <FlaskConical className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("aiLab.generation.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("aiLab.generation.subtitle")}
            </p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={status} />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ============================================================ */}
        {/* Left: Prompt Workspace + Controls */}
        {/* ============================================================ */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Session Selector */}
          <motion.div
            variants={cardVariants}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
          >
            <div className="mb-3 flex items-center gap-2">
              <Cpu className="size-4 text-brand" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {t("aiLab.generation.checkpoint")}
              </h3>
            </div>

            {sessions.length === 0 ? (
              <p className="text-xs text-slate-600">
                {t("aiLab.generation.noSessions")}
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {sessions.map((s) => (
                  <button
                    key={s.sessionId}
                    onClick={() => setSelectedSessionId(s.sessionId)}
                    disabled={isGenerating}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      selectedSessionId === s.sessionId
                        ? "bg-white/[0.06] text-slate-200"
                        : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-300"
                    }`}
                  >
                    <div
                      className={`size-2 rounded-full ${
                        s.isCompleted ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span className="flex-1 truncate">{s.sessionName}</span>
                    <span className="text-[0.6rem] text-slate-500">
                      {s.checkpointCount} ckpt
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedSession && (
              <div className="mt-3 border-t border-white/[0.05] pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Status</span>
                  <span className={selectedSession.isCompleted ? "text-emerald-400" : "text-amber-400"}>
                    {selectedSession.isCompleted ? t("aiLab.generation.status.completed") : "In Progress"}
                  </span>
                </div>
                {selectedSession.finalLoss !== undefined && (
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Final Loss</span>
                    <span className="tabular-nums text-slate-300">
                      {selectedSession.finalLoss.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Prompt Editor */}
          <motion.div
            variants={cardVariants}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
          >
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="size-4 text-brand" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {t("aiLab.generation.prompt")}
              </h3>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              rows={4}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50"
              placeholder={t("aiLab.generation.promptPlaceholder")}
            />

            {/* Parameters */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-slate-500">
                <Sliders className="size-3" />
                {t("aiLab.generation.parameters")}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <ParamControl
                  label={t("aiLab.generation.temperature")}
                  value={temperature}
                  onChange={setTemperature}
                  min={0}
                  max={2}
                  step={0.1}
                  disabled={isGenerating}
                />
                <ParamControl
                  label={t("aiLab.generation.maxTokens")}
                  value={maxTokens}
                  onChange={(v) => setMaxTokens(Math.round(v))}
                  min={8}
                  max={256}
                  step={8}
                  disabled={isGenerating}
                />
                <ParamControl
                  label={t("aiLab.generation.topK")}
                  value={topK}
                  onChange={(v) => setTopK(Math.round(v))}
                  min={1}
                  max={200}
                  step={1}
                  disabled={isGenerating}
                />
                <ParamControl
                  label={t("aiLab.generation.topP")}
                  value={topP}
                  onChange={setTopP}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={isGenerating}
                />
              </div>

              {/* Seed */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={useSeed}
                    onChange={(e) => setUseSeed(e.target.checked)}
                    disabled={isGenerating}
                    className="size-3 rounded border-white/[0.1] bg-white/[0.05]"
                  />
                  {t("aiLab.generation.seed")}
                </label>
                {useSeed && (
                  <input
                    type="text"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    disabled={isGenerating}
                    className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-slate-300 focus:border-brand/30 focus:outline-none"
                  />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedSessionId || !prompt.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand/10 px-4 py-2.5 text-sm font-medium text-brand transition-all hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                    {t("aiLab.generation.generating")}
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    {t("aiLab.generation.generate")}
                  </>
                )}
              </button>

              {isGenerating ? (
                <button
                  onClick={handleCancel}
                  className="flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20"
                >
                  <Square className="size-3" />
                </button>
              ) : (
                <button
                  onClick={handleCompare}
                  disabled={!selectedSessionId || !prompt.trim()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-400 transition-all hover:border-white/[0.15] hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Target className="size-4" />
                  {t("aiLab.generation.compare")}
                </button>
              )}
            </div>

            {/* Elapsed time */}
            {isGenerating && (
              <div className="mt-3 text-center">
                <span className="text-[0.65rem] tabular-nums text-slate-500">
                  {t("aiLab.generation.elapsed")} {(elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>
            )}
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-red-400/10 bg-red-500/[0.04] px-4 py-3 backdrop-blur-sm"
              >
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ============================================================ */}
        {/* Right: Results + History */}
        {/* ============================================================ */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Generation Result */}
          <AnimatePresence mode="wait">
            {hasResult && result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-brand" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      {t("aiLab.generation.generatedOutput")}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopy}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
                      title={t("aiLab.generation.copyToClipboard")}
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      onClick={handleExportJSON}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
                      title={t("aiLab.generation.exportJSON")}
                    >
                      <FileJson className="size-3.5" />
                    </button>
                    <button
                      onClick={handleExportMarkdown}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
                      title={t("aiLab.generation.exportMarkdown")}
                    >
                      <FileText className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Output text */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                    {result.generatedText}
                  </p>
                </div>

                {/* Metrics grid */}
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <KpiCard label={t("aiLab.generation.tokens")} value={String(result.tokenCount)} icon={Hash} />
                  <KpiCard
                    label={t("aiLab.generation.logProb")}
                    value={result.avgLogProb.toFixed(3)}
                    icon={TrendingUp}
                  />
                  <KpiCard
                    label={t("aiLab.generation.perplexity")}
                    value={result.perplexity.toFixed(2)}
                    icon={BarChart3}
                  />
                  <KpiCard
                    label={t("aiLab.generation.duration")}
                    value={`${result.durationMs}ms`}
                    icon={Clock}
                  />
                  <KpiCard label={t("aiLab.generation.stopReason")} value={result.stopReason} icon={Target} />
                  <KpiCard
                    label={t("aiLab.generation.seed")}
                    value={result.generationConfig.seed?.toString() ?? "random"}
                    icon={Hash}
                  />
                </div>

                {/* Provenance */}
                <div className="mt-4 rounded-xl border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-wider text-slate-600">
                    <Fingerprint className="size-2.5" />
                    Provenance
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-[0.65rem]">
                    <span className="text-slate-600">Model</span>
                    <span className="col-span-2 text-slate-400">
                      {result.isBaseline ? "Baseline (untrained)" : selectedSession?.sessionName ?? "Trained"}
                    </span>
                    {result.checkpointId && (
                      <>
                        <span className="text-slate-600">Checkpoint</span>
                        <span className="col-span-2 font-mono text-slate-500">{result.checkpointId}</span>
                      </>
                    )}
                    {result.generationConfig && (
                      <>
                        <span className="text-slate-600">Parameters</span>
                        <span className="col-span-2 text-slate-500">
                          T={result.generationConfig.temperature} · K={result.generationConfig.topK} · P={result.generationConfig.topP} · max={result.generationConfig.maxTokens}
                        </span>
                      </>
                    )}
                    <span className="text-slate-600">Timestamp</span>
                    <span className="col-span-2 font-mono text-slate-600">
                      {new Date(result.timestamp).toISOString()}
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : !isGenerating && !error ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.02] px-8 py-20 text-center backdrop-blur-sm"
              >
                <FlaskConical className="size-12 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-400">
                    {t("aiLab.generation.readyToGenerate")}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-slate-600">
                    {t("aiLab.generation.readyHint")}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Before/After Comparison */}
          <AnimatePresence>
            {comparison && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <GenerationComparison data={comparison} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generation History */}
          <motion.div
            variants={cardVariants}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
          >
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex w-full items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t("aiLab.generation.history")} ({history.length})
                </h3>
              </div>
              <ChevronRight
                className={`size-4 text-slate-500 transition-transform ${showHistory ? "rotate-90" : ""}`}
              />
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {history.length === 0 ? (
                    <p className="mt-4 py-4 text-center text-xs text-slate-600">
                      {t("aiLab.generation.noHistory")}
                    </p>
                  ) : (
                    <div className="mt-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
                      {history.slice(0, 20).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-300">
                              &ldquo;{entry.prompt}&rdquo;
                            </p>
                            <p className="mt-0.5 truncate text-[0.65rem] text-slate-500">
                              {entry.generatedText.slice(0, 80)}...
                            </p>
                            <div className="mt-1 flex items-center gap-3 text-[0.6rem] text-slate-600">
                              <span>{entry.metrics.tokenCount} {t("aiLab.generation.tokens").toLowerCase()}</span>
                              <span>ppl {entry.metrics.perplexity.toFixed(1)}</span>
                              <span>{entry.metrics.durationMs}ms</span>
                              {entry.isBaseline && (
                                <span className="rounded bg-blue-400/10 px-1 py-0.5 text-blue-400">
                                  {t("aiLab.generation.baseline")}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteHistory(entry.id)}
                            className="ml-2 shrink-0 rounded p-1 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Parameter Control
// ============================================================

function ParamControl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[0.6rem] uppercase tracking-wider text-slate-500">
          {label}
        </label>
        <span className="text-[0.65rem] tabular-nums text-slate-400">
          {value}
        </span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-brand disabled:opacity-40"
      />
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
