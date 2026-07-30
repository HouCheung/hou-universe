"use client";

import { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  createExperimentContext,
  runExperiment,
} from "@/lib/minimind/experiments";
import type { ExperimentResult } from "@/lib/minimind/experiments";
import {
  getExperimentById,
  type MiniMindExperiment,
} from "@/data/minimind/experiment-registry";
import { ExperimentInputPanel } from "./ExperimentInputPanel";
import { ExperimentResultRenderer } from "./ExperimentResultRenderer";

// ============================================================
// Helpers — build typed input from loose form state
// ============================================================

function buildInput(
  experiment: MiniMindExperiment,
  formInput: Record<string, unknown>
): Record<string, unknown> {
  const moduleNames = new Set(
    experiment.requiredCapabilities.dataRequirements.map((r) => r.module)
  );

  const input: Record<string, unknown> = {};

  if (moduleNames.has("tokenizer")) {
    input.text = (formInput.text as string) ?? "";
  }

  if (moduleNames.has("embedding")) {
    input.mode = (formInput.mode as string) ?? "lookup";
    if (input.mode === "lookup") {
      const rawIds = (formInput.tokenIds as string) ?? "";
      input.tokenIds = rawIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
    }
    if (input.mode === "similarity") {
      input.tokenPair = {
        tokenA: (formInput.tokenA as string) ?? "",
        tokenB: (formInput.tokenB as string) ?? "",
      };
    }
  }

  if (moduleNames.has("attention")) {
    try {
      input.sequence = JSON.parse((formInput.sequence as string) ?? "[]");
    } catch {
      input.sequence = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    }
    input.causalMask = (formInput.causalMask as boolean) ?? true;
  }

  return input;
}

// ============================================================
// ExperimentWorkspace
// ============================================================

interface ExperimentWorkspaceProps {
  experimentId: string;
  onBack: () => void;
}

export function ExperimentWorkspace({
  experimentId,
  onBack,
}: ExperimentWorkspaceProps) {
  const { t } = useTranslation();
  const [formInput, setFormInput] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ExperimentResult<unknown> | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const experiment = getExperimentById(experimentId);

  const handleRun = useCallback(() => {
    if (!experiment) {
      setErrorMsg(
        t("minimind.experiments.errors.experimentNotFound", { id: experimentId })
      );
      setRunStatus("error");
      return;
    }

    setRunStatus("running");
    setErrorMsg(null);
    setResult(null);

    try {
      const context = createExperimentContext(experiment);
      const typedInput = buildInput(experiment, formInput);
      const expResult = runExperiment(experimentId, context, typedInput);

      setResult(expResult);
      setRunStatus(expResult.status === "failed" && expResult.data === null ? "error" : "done");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : t("minimind.experiments.errors.runnerFailed")
      );
      setRunStatus("error");
    }
  }, [experiment, experimentId, formInput, t]);

  // Experiment not found
  if (!experiment) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="font-mono text-sm text-red-500">
          {t("minimind.experiments.errors.experimentNotFound", { id: experimentId })}
        </p>
        <button
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand/10 px-4 py-2 font-mono text-xs text-slate-500 transition-colors hover:border-brand/30 hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          {t("minimind.experiments.backToHub")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 font-mono text-xs text-slate-500 transition-colors hover:text-brand dark:text-slate-400 dark:hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          {t("minimind.experiments.backToHub")}
        </button>
        <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          {experiment.title}
        </h1>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {experiment.description}
        </p>
      </div>

      {/* ── Input Panel ───────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-2xl border p-5 backdrop-blur-sm",
          "border-brand/15 bg-brand/[0.03]",
          "dark:border-white/[0.08] dark:bg-white/[0.02]"
        )}
      >
        <ExperimentInputPanel
          experiment={experiment}
          input={formInput}
          onChange={setFormInput}
        />

        <button
          type="button"
          onClick={handleRun}
          disabled={runStatus === "running"}
          className={cn(
            "mt-5 w-full rounded-full border px-6 py-2.5 font-mono text-sm font-semibold transition-all duration-300 sm:w-auto",
            "border-brand/20 bg-brand/[0.08] text-brand hover:bg-brand/[0.14]",
            "dark:border-brand/30 dark:text-brand/80 dark:hover:bg-brand/[0.12]",
            runStatus === "running" && "cursor-not-allowed opacity-60"
          )}
        >
          {runStatus === "running"
            ? t("minimind.experiments.running")
            : t("minimind.experiments.run")}
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {runStatus === "error" && errorMsg && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-4">
          <p className="font-mono text-sm text-red-600 dark:text-red-400">
            {errorMsg}
          </p>
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────────── */}
      {runStatus === "done" && result && (
        <ExperimentResultRenderer experimentId={experimentId} result={result} />
      )}
    </div>
  );
}
