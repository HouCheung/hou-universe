"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { MiniMindExperiment } from "@/data/minimind/experiment-registry";

// ============================================================
// ExperimentInputPanel — Dynamic input form
// ============================================================
//
// Reads experiment.requiredCapabilities.dataRequirements to
// determine which input fields to render. A single component
// handles all experiment types — per-experiment input components
// are overkill at the current scale (4 experiments).
//
// Each module requirement maps to a section:
//   tokenizer → textarea for input text
//   embedding → mode selector + token IDs or token pair
//   attention → sequence textarea + causal mask checkbox
//   model     → (future) textarea + temperature slider
// ============================================================

interface ExperimentInputPanelProps {
  experiment: MiniMindExperiment;
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}

export function ExperimentInputPanel({
  experiment,
  input,
  onChange,
}: ExperimentInputPanelProps) {
  const moduleNames = new Set(
    experiment.requiredCapabilities.dataRequirements.map((r) => r.module)
  );

  const updateField = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...input, [key]: value });
    },
    [input, onChange]
  );

  return (
    <div className="space-y-4">
      {/* ── Tokenizer input ──────────────────────────────────── */}
      {moduleNames.has("tokenizer") && (
        <div className="space-y-2">
          <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
            Input Text
          </label>
          <textarea
            value={(input.text as string) ?? ""}
            onChange={(e) => updateField("text", e.target.value)}
            placeholder="Enter text to tokenize..."
            rows={3}
            className={cn(
              "w-full resize-y rounded-xl border bg-transparent px-4 py-3 font-mono text-sm",
              "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
              "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
              "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
            )}
          />
        </div>
      )}

      {/* ── Embedding input ──────────────────────────────────── */}
      {moduleNames.has("embedding") && (
        <div className="space-y-3">
          {/* Mode selector */}
          <div className="space-y-2">
            <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
              Mode
            </label>
            <div className="flex gap-2">
              {(["lookup", "similarity"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateField("mode", mode)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 font-mono text-xs transition-colors",
                    (input.mode as string) === mode
                      ? "border-brand/30 bg-brand/[0.08] text-brand dark:border-brand/40 dark:text-brand/80"
                      : "border-brand/10 bg-transparent text-slate-500 dark:border-white/[0.08] dark:text-slate-400"
                  )}
                >
                  {mode === "lookup" ? "Lookup" : "Similarity"}
                </button>
              ))}
            </div>
          </div>

          {/* Lookup fields */}
          {input.mode === "lookup" && (
            <div className="space-y-2">
              <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
                Token IDs (comma-separated)
              </label>
              <input
                type="text"
                value={(input.tokenIds as string) ?? ""}
                onChange={(e) => updateField("tokenIds", e.target.value)}
                placeholder="0, 1, 42"
                className={cn(
                  "w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm",
                  "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                  "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                  "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                )}
              />
            </div>
          )}

          {/* Similarity fields */}
          {input.mode === "similarity" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
                  Token A
                </label>
                <input
                  type="text"
                  value={(input.tokenA as string) ?? ""}
                  onChange={(e) => updateField("tokenA", e.target.value)}
                  placeholder="hello"
                  className={cn(
                    "w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm",
                    "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                    "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                    "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
                  Token B
                </label>
                <input
                  type="text"
                  value={(input.tokenB as string) ?? ""}
                  onChange={(e) => updateField("tokenB", e.target.value)}
                  placeholder="world"
                  className={cn(
                    "w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm",
                    "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                    "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                    "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
                  )}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Attention input ──────────────────────────────────── */}
      {moduleNames.has("attention") && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block font-mono text-[0.65rem] tracking-wider text-slate-500 dark:text-slate-400">
              Sequence Vectors (JSON array of arrays)
            </label>
            <textarea
              value={(input.sequence as string) ?? "[[1,0,0,0],[0,1,0,0],[0,0,1,0]]"}
              onChange={(e) => updateField("sequence", e.target.value)}
              rows={4}
              className={cn(
                "w-full resize-y rounded-xl border bg-transparent px-4 py-3 font-mono text-xs",
                "border-brand/10 bg-brand/[0.02] text-foreground placeholder:text-slate-400",
                "dark:border-white/[0.08] dark:bg-white/[0.02] dark:placeholder:text-slate-500",
                "focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
              )}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(input.causalMask as boolean) ?? true}
              onChange={(e) => updateField("causalMask", e.target.checked)}
              className="rounded border-brand/20 bg-brand/[0.04] accent-brand"
            />
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              Apply causal mask
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
