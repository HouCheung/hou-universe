"use client";

// ============================================================
// ResearchCopilot — Training Intelligence Panel
// ============================================================
// Phase 59: Deterministic research-analysis UI.
//
// Displays insights, findings, and recommendations derived
// from real training data. This is NOT an LLM chatbot — it is
// a deterministic research-analysis engine UI.
//
// Sections:
//   1. Overall Status — stable / converging / needs attention
//   2. Key Findings — success + warning + critical insights
//   3. Recommendations — prioritized, evidence-backed
//   4. Experiment Comparison — side-by-side metric winners
//   5. Report Generation — export JSON / Markdown
//
// Design: Cosmic glass UI, matching HOU Universe aesthetic.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Target,
  BarChart3,
  FileText,
  Download,
  Sparkles,
  ShieldCheck,
  Activity,
  ChevronDown,
} from "lucide-react";
import {
  getCopilotAnalysis,
  getAnalyzableRuns,
  getComparisonOfCompleted,
  generateJSONReport,
  generateMarkdownReport,
  hasCopilotData,
  type CopilotAnalysis,
  type CopilotComparison,
} from "@/lib/ai-lab/adapters/researchCopilotAdapter";

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

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// ============================================================
// Status config
// ============================================================

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }> = {
  stable: { icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-400/20" },
  converging: { icon: Activity, color: "text-blue-400", bg: "bg-blue-500/8", border: "border-blue-400/20" },
  needs_attention: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-400/20" },
  critical: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/8", border: "border-red-400/20" },
  no_data: { icon: Info, color: "text-slate-500", bg: "bg-slate-500/8", border: "border-slate-400/10" },
};

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "success": return <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />;
    case "warning": return <AlertTriangle className="size-4 shrink-0 text-amber-400" />;
    case "critical": return <XCircle className="size-4 shrink-0 text-red-400" />;
    default: return <Info className="size-4 shrink-0 text-slate-400" />;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "high":
      return <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-red-400">High</span>;
    case "medium":
      return <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-amber-400">Med</span>;
    default:
      return <span className="shrink-0 rounded bg-slate-500/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-slate-400">Low</span>;
  }
}

// ============================================================
// ResearchCopilot
// ============================================================

export function ResearchCopilot() {
  const [analysis, setAnalysis] = useState<CopilotAnalysis | null>(null);
  const [comparison, setComparison] = useState<CopilotComparison | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [availableRuns, setAvailableRuns] = useState<Array<{ id: string; name: string; status: string; timestamp: number }>>([]);
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  // ── Load data ──
  const refresh = useCallback(() => {
    const runs = getAnalyzableRuns();
    setAvailableRuns(runs);

    const targetId = selectedRunId ?? runs[0]?.id;
    if (targetId) {
      const result = getCopilotAnalysis(targetId);
      setAnalysis(result);
      if (!selectedRunId && runs[0]?.id) {
        setSelectedRunId(runs[0].id);
      }
    } else {
      setAnalysis(null);
    }

    const comp = getComparisonOfCompleted();
    setComparison(comp);
  }, [selectedRunId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Handlers ──

  const handleExportJSON = useCallback(() => {
    if (!analysis) return;
    const report = generateJSONReport(analysis.recordId);
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-report-${analysis.recordId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis]);

  const handleExportMarkdown = useCallback(() => {
    if (!analysis) return;
    const md = generateMarkdownReport(analysis.recordId);
    if (!md) return;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-report-${analysis.recordId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis]);

  const statusConfig = analysis ? STATUS_CONFIG[analysis.overallStatus] : STATUS_CONFIG.no_data;
  const StatusIcon = statusConfig.icon;

  // ── Empty state ──
  if (!hasCopilotData()) {
    return (
      <motion.div
        className="rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center backdrop-blur-sm"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <Brain className="mx-auto size-10 text-slate-600" />
        <p className="mt-4 text-sm text-slate-500">
          Run a training experiment to see research insights.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          The Research Copilot analyzes training metrics and provides evidence-backed recommendations.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ================================================================ */}
      {/* Header + Run Selector */}
      {/* ================================================================ */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand/[0.08]">
            <Brain className="size-4 text-brand" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-200">Training Intelligence</h2>
            <p className="text-xs text-slate-500">
              Deterministic analysis — not an LLM
            </p>
          </div>
        </div>

        {/* Run selector */}
        {availableRuns.length > 0 && (
          <select
            value={selectedRunId ?? ""}
            onChange={(e) => setSelectedRunId(e.target.value || null)}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-brand/30"
          >
            {availableRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name} ({run.status})
              </option>
            ))}
          </select>
        )}
      </motion.div>

      {!analysis ? (
        <motion.p variants={itemVariants} className="text-sm text-slate-500">
          Select a training run to analyze.
        </motion.p>
      ) : (
        <>
          {/* ================================================================ */}
          {/* Overall Status */}
          {/* ================================================================ */}
          <motion.div
            variants={itemVariants}
            className={`rounded-2xl border ${statusConfig.border} ${statusConfig.bg} p-5 backdrop-blur-sm`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${statusConfig.bg}`}>
                <StatusIcon className={`size-6 ${statusConfig.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`text-base font-semibold ${statusConfig.color}`}>
                    {analysis.statusLabel}
                  </h3>
                  <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[0.65rem] text-slate-500">
                    {analysis.experimentName}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{analysis.statusDescription}</p>
                <div className="mt-3 flex gap-3">
                  {analysis.criticalCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <XCircle className="size-3" /> {analysis.criticalCount} critical
                    </span>
                  )}
                  {analysis.warningCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                      <AlertTriangle className="size-3" /> {analysis.warningCount} warning
                    </span>
                  )}
                  {analysis.successCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="size-3" /> {analysis.successCount} success
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ================================================================ */}
          {/* Key Findings */}
          {/* ================================================================ */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Key Findings
              </h3>
              <span className="ml-auto text-[0.65rem] text-slate-600">
                {analysis.findings.length} insight{analysis.findings.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {analysis.findings.slice(0, 8).map((finding, idx) => (
                <div key={idx}>
                  <button
                    onClick={() =>
                      setExpandedInsight(expandedInsight === idx ? null : idx)
                    }
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    {getSeverityIcon(finding.severity)}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-300">{finding.title}</span>
                      <span className="ml-2 text-[0.65rem] text-slate-600">
                        {(finding.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-slate-500 transition-transform ${
                        expandedInsight === idx ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {expandedInsight === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mx-8 mb-2 rounded-lg bg-white/[0.02] px-3 py-2">
                          <p className="text-xs text-slate-400">{finding.description}</p>
                          {Object.keys(finding.evidence).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {Object.entries(finding.evidence).slice(0, 6).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[0.6rem] text-slate-500"
                                >
                                  {key}: {typeof value === "number" ? value.toFixed(4) : String(value)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ================================================================ */}
          {/* Recommendations */}
          {/* ================================================================ */}
          {analysis.recommendations.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Target className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Recommendations
                </h3>
                <span className="ml-auto text-[0.65rem] text-slate-600">
                  {analysis.highPriorityCount} high · {analysis.mediumPriorityCount} med · {analysis.lowPriorityCount} low
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {analysis.recommendations.map((rec, idx) => (
                  <div key={idx}>
                    <button
                      onClick={() =>
                        setExpandedRec(expandedRec === idx ? null : idx)
                      }
                      className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="mt-0.5 text-xs font-bold text-slate-500 tabular-nums">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-300">{rec.title}</span>
                          {getPriorityBadge(rec.priority)}
                        </div>
                        <span className="text-[0.65rem] text-slate-600">{rec.category}</span>
                      </div>
                      <ChevronDown
                        className={`size-3.5 shrink-0 text-slate-500 transition-transform ${
                          expandedRec === idx ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <AnimatePresence>
                      {expandedRec === idx && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mx-8 mb-2 rounded-lg bg-white/[0.02] px-3 py-2">
                            <p className="text-xs font-medium text-slate-400">Rationale</p>
                            <p className="text-xs text-slate-500">{rec.rationale}</p>
                            {rec.suggestedChanges.length > 0 && (
                              <>
                                <p className="mt-2 text-xs font-medium text-slate-400">Suggested Changes</p>
                                <ul className="mt-1 list-inside list-disc space-y-0.5">
                                  {rec.suggestedChanges.map((change, ci) => (
                                    <li key={ci} className="text-xs text-slate-500">{change}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {Object.keys(rec.evidence).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(rec.evidence).slice(0, 4).map(([key, value]) => (
                                  <span
                                    key={key}
                                    className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[0.6rem] text-slate-500"
                                  >
                                    {key}: {typeof value === "number" ? value.toFixed(4) : String(value)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* Experiment Comparison */}
          {/* ================================================================ */}
          {comparison && (
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
            >
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="mb-4 flex w-full items-center gap-2"
              >
                <BarChart3 className="size-4 text-brand" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Experiment Comparison
                </h3>
                <ChevronDown
                  className={`ml-auto size-3.5 text-slate-500 transition-transform ${
                    showComparison ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence>
                {showComparison && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="mb-3 text-xs text-slate-400">{comparison.summary}</p>

                    <div className="mb-3 space-y-1.5">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                        Winners by Metric
                      </p>
                      {comparison.winners.map((w) => (
                        <div
                          key={w.metric}
                          className="flex items-center justify-between rounded bg-white/[0.03] px-3 py-1.5"
                        >
                          <span className="text-xs text-slate-400">{w.label}</span>
                          <span className="text-xs tabular-nums text-slate-300">
                            {w.winnerName} ({w.winningValue.toFixed(4)})
                          </span>
                        </div>
                      ))}
                    </div>

                    {comparison.tradeoffs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                          Trade-offs
                        </p>
                        {comparison.tradeoffs.map((t, i) => (
                          <p key={i} className="text-xs text-slate-500">
                            • {t.detail}
                          </p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* Generate Report */}
          {/* ================================================================ */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
          >
            <div className="mb-4 flex items-center gap-2">
              <FileText className="size-4 text-brand" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Generate Research Report
              </h3>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Export a comprehensive research report with all findings, evidence, and recommendations. Suitable for <code className="rounded bg-white/[0.04] px-1 py-0.5 text-[0.65rem]">docs/research/reports/</code>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleExportMarkdown}
                className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
              >
                <Download className="size-3.5" />
                Export Markdown
              </button>
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
              >
                <Download className="size-3.5" />
                Export JSON
              </button>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
