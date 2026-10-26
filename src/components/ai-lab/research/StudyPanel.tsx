"use client";

// ============================================================
// StudyPanel — Research Study Browser
// ============================================================
// Phase 63: Minimal "Study" section for research UI.
//
// Displays available research studies (currently only the
// gradient clipping study) with metadata, validation status,
// and results when available.
//
// Design: Cosmic glass UI matching ResearchWorkspace.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  BarChart3,
  Variable,
  ShieldCheck,
  Clock,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface StudyInfo {
  id: string;
  name: string;
  researchQuestion: string;
  hypothesis: string;
  independentVariable: {
    name: string;
    baselineValue: string;
    variantValue: string;
  };
  controlledVariables: string[];
  numRuns: number;
  tags: string[];
}

interface StudyValidation {
  valid: boolean;
  summary: string;
  error?: string;
}

interface StudyRunResult {
  verdict: string;
  baselineBestLoss: number;
  clippedBestLoss: number;
  baselineMaxNorm: number;
  clippedMaxNorm: number;
  lossChangePercent: number;
  maxNormChangePercent: number;
  baselineDivergences: number;
  clippedDivergences: number;
  timestamp: number;
  durationMs: number;
}

// ============================================================
// Constants
// ============================================================

const STUDY_INFO: StudyInfo = {
  id: "study-gradient-clipping-v1",
  name: "Gradient Clipping Study",
  researchQuestion:
    "Does gradient clipping improve MiniMind GPT training stability?",
  hypothesis:
    "Gradient clipping reduces gradient explosion / instability " +
    "without materially damaging convergence.",
  independentVariable: {
    name: "gradientClipNorm",
    baselineValue: "undefined (disabled)",
    variantValue: "1.0",
  },
  controlledVariables: [
    "modelConfig (dModel=64, numHeads=4, dFF=128, numLayers=3)",
    "tokenizerConfig (BPE, vocabSize=1000)",
    "datasetConfig (inline corpus, blockSize=32, batchSize=4)",
    "trainingConfig (epochs=5, lr=0.001, AdamW, cosine scheduler)",
    "seed=42",
  ],
  numRuns: 2,
  tags: ["phase-63", "gradient-clipping", "training-stability"],
};

// ============================================================
// Card variants
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

// ============================================================
// Sub-components
// ============================================================

function MetricBadge({
  label,
  value,
  unit,
  color = "text-slate-300",
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-white/[0.03] px-3 py-2">
      <span className={`text-sm font-bold tabular-nums ${color}`}>
        {value}
      </span>
      {unit && (
        <span className="text-[0.6rem] text-slate-500">{unit}</span>
      )}
      <span className="mt-0.5 text-[0.6rem] uppercase tracking-wider text-slate-500">
        {label}
      </span>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function StudyPanel() {
  const [validation, setValidation] = useState<StudyValidation | null>(null);
  const [runResult, setRunResult] = useState<StudyRunResult | null>(null);

  // ── Validate controlled variables ──
  const validate = useCallback(async () => {
    try {
      const { baselineExperiment, clippedExperiment } = await import(
        "@/lib/minimind/research/studies/gradient-clipping/study"
      );
      const { verifyControlledVariables } = await import(
        "@/lib/minimind/research/ControlledVariableValidator"
      );
      const result = verifyControlledVariables(
        baselineExperiment,
        clippedExperiment,
        "gradientClipNorm",
      );
      setValidation({
        valid: result.valid,
        summary: result.summary,
        error: result.error,
      });
    } catch {
      setValidation({
        valid: false,
        summary: "Unable to validate — study definitions not available",
        error: "Module import failed",
      });
    }
  }, []);

  // Auto-validate on mount
  useEffect(() => {
    validate();
  }, [validate]);

  // ── Load cached results ──
  useEffect(() => {
    try {
      const cached = localStorage.getItem("minimind-study-result-gc-v1");
      if (cached) {
        setRunResult(JSON.parse(cached) as StudyRunResult);
      }
    } catch {
      // No cached result
    }
  }, []);

  // ── Render ──
  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical className="size-4 text-purple-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Research Study
        </h3>
        {validation && (
          <span className="ml-auto">
            {validation.valid ? (
              <CheckCircle2 className="size-3.5 text-emerald-400" />
            ) : (
              <XCircle className="size-3.5 text-red-400" />
            )}
          </span>
        )}
      </div>

      {/* Study Info */}
      <div className="mb-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
        <h4 className="text-sm font-semibold text-slate-200">
          {STUDY_INFO.name}
        </h4>
        <p className="mt-1 text-xs text-slate-400">
          {STUDY_INFO.researchQuestion}
        </p>

        {/* Hypothesis */}
        <div className="mt-3 rounded-lg bg-purple-500/[0.06] px-3 py-2">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Hypothesis:</span>{" "}
            {STUDY_INFO.hypothesis}
          </p>
        </div>

        {/* Independent Variable */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Variable className="size-3 text-purple-400" />
          <span className="text-slate-500">
            <span className="text-slate-400">
              {STUDY_INFO.independentVariable.name}
            </span>
            : {STUDY_INFO.independentVariable.baselineValue} →{" "}
            {STUDY_INFO.independentVariable.variantValue}
          </span>
        </div>

        {/* Controlled Variables */}
        <div className="mt-2 flex flex-wrap gap-1">
          {STUDY_INFO.controlledVariables.slice(0, 4).map((v) => (
            <span
              key={v}
              className="inline-block rounded bg-white/[0.04] px-1.5 py-0.5 text-[0.6rem] text-slate-500"
            >
              {v.length > 50 ? v.slice(0, 50) + "…" : v}
            </span>
          ))}
        </div>
      </div>

      {/* Validation Status */}
      {validation && (
        <motion.div
          variants={rowVariants}
          className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            validation.valid
              ? "bg-emerald-500/[0.06] text-emerald-400"
              : "bg-red-500/[0.06] text-red-400"
          }`}
        >
          <ShieldCheck className="size-3 shrink-0" />
          <span>{validation.summary}</span>
        </motion.div>
      )}

      {/* Results (if available) */}
      {runResult ? (
        <motion.div
          variants={rowVariants}
          className="mb-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="size-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-400">
              Results
            </span>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${
                runResult.verdict.includes("SUPPORTED")
                  ? "bg-emerald-400/10 text-emerald-400"
                  : runResult.verdict.includes("REJECTED")
                    ? "bg-red-400/10 text-red-400"
                    : "bg-amber-400/10 text-amber-400"
              }`}
            >
              {runResult.verdict}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MetricBadge
              label="Loss Δ"
              value={`${runResult.lossChangePercent > 0 ? "+" : ""}${runResult.lossChangePercent.toFixed(1)}%`}
              color={
                runResult.lossChangePercent < 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
            <MetricBadge
              label="Max Norm Δ"
              value={`${runResult.maxNormChangePercent > 0 ? "+" : ""}${runResult.maxNormChangePercent.toFixed(1)}%`}
              color={
                runResult.maxNormChangePercent < 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
            <MetricBadge
              label="Divergences"
              value={`${runResult.baselineDivergences}/${runResult.clippedDivergences}`}
              color={
                runResult.clippedDivergences === 0
                  ? "text-emerald-400"
                  : "text-amber-400"
              }
            />
          </div>

          <div className="mt-3 flex items-center gap-2 text-[0.6rem] text-slate-600">
            <Clock className="size-3" />
            <span>
              {(runResult.durationMs / 1000).toFixed(1)}s ·{" "}
              {new Date(runResult.timestamp).toLocaleString()}
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* Phase 74: Removed the fake "Reproduce in Browser" button — there is no
          browser study runner, and the old handler only toggled a spinner via
          setTimeout. The study is reproduced through the CLI (hint below);
          this panel shows the last cached result. */}
      <Link
        href="/ai-lab/experiments"
        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-500/10 px-4 py-2.5 text-xs font-medium text-purple-400 transition-colors hover:bg-purple-500/20"
      >
        <FlaskConical className="size-3.5" />
        View Experiments
      </Link>

      {/* CLI hint */}
      <p className="mt-3 text-center text-[0.6rem] text-slate-600">
        CLI:{" "}
        <code className="rounded bg-white/[0.04] px-1 py-0.5 font-mono">
          npx tsx src/lib/minimind/cli/minimind-cli.ts research study
        </code>
      </p>
    </motion.div>
  );
}
