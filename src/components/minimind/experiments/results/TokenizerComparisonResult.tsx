"use client";

import { cn } from "@/lib/utils";
import type {
  TokenizerComparisonData,
  ExperimentError,
  ExperimentTiming,
} from "@/lib/minimind/experiments";
import { StageCard } from "@/components/minimind/playground/forward/shared/StageCard";
import { StatRow } from "@/components/minimind/playground/forward/shared/StatRow";

// ============================================================
// Helpers
// ============================================================

function ratioColor(ratio: number): string {
  if (ratio <= 2) return "text-emerald-500 dark:text-emerald-400";
  if (ratio <= 4) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function unknownRateColor(rate: number): string {
  if (rate < 0.05) return "text-emerald-500 dark:text-emerald-400";
  if (rate < 0.2) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

// ============================================================
// Component
// ============================================================

interface TokenizerComparisonResultProps {
  data: TokenizerComparisonData;
  errors: ExperimentError[];
  timing: ExperimentTiming;
}

export function TokenizerComparisonResult({
  data,
  errors,
  timing,
}: TokenizerComparisonResultProps) {
  return (
    <div className="space-y-6">
      {/* ── Timing ───────────────────────────────────────────── */}
      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
        Completed in {timing.durationMs.toFixed(0)}ms
      </p>

      {/* ── Errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="font-mono text-xs text-amber-600 dark:text-amber-400">
              [{err.phase}] {err.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Input text display ────────────────────────────────── */}
      <StageCard title="Input">
        <p className="font-mono text-sm text-slate-600 dark:text-slate-300">
          {data.inputText || "(empty)"}
        </p>
      </StageCard>

      {/* ── Side-by-side comparison ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* MiniTokenizer */}
        <StageCard title="MiniTokenizer (Word-level)">
          <div className="space-y-3">
            <StatRow
              items={[
                { label: "Tokens", value: data.miniTokenizer.tokenCount },
                { label: "Vocab", value: data.miniTokenizer.vocabSize },
                { label: "Unknown", value: data.miniTokenizer.unknownCount },
              ]}
            />
            {/* Token table */}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-brand/10 bg-brand/[0.02] dark:border-white/[0.06] dark:bg-white/[0.01]">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-brand/10 dark:border-white/[0.06]">
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">#</th>
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">Token</th>
                    <th className="px-3 py-1.5 text-right text-[0.6rem] text-slate-400">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.miniTokenizer.tokens.map((token, i) => (
                    <tr key={i} className="border-b border-brand/[0.04] dark:border-white/[0.03]">
                      <td className="px-3 py-1 text-slate-400">{i}</td>
                      <td className="px-3 py-1 text-foreground">{token}</td>
                      <td className="px-3 py-1 text-right text-slate-400">
                        {data.miniTokenizer.tokenIds[i]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </StageCard>

        {/* CharacterTokenizer */}
        <StageCard title="CharacterTokenizer (Character-level)">
          <div className="space-y-3">
            <StatRow
              items={[
                { label: "Tokens", value: data.charTokenizer.tokenCount },
                { label: "Vocab", value: data.charTokenizer.vocabSize },
                { label: "Unknown", value: data.charTokenizer.unknownCount },
              ]}
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-brand/10 bg-brand/[0.02] dark:border-white/[0.06] dark:bg-white/[0.01]">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-brand/10 dark:border-white/[0.06]">
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">#</th>
                    <th className="px-3 py-1.5 text-left text-[0.6rem] text-slate-400">Token</th>
                    <th className="px-3 py-1.5 text-right text-[0.6rem] text-slate-400">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.charTokenizer.tokens.map((token, i) => (
                    <tr key={i} className="border-b border-brand/[0.04] dark:border-white/[0.03]">
                      <td className="px-3 py-1 text-slate-400">{i}</td>
                      <td className="px-3 py-1 text-foreground">{token}</td>
                      <td className="px-3 py-1 text-right text-slate-400">
                        {data.charTokenizer.tokenIds[i]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </StageCard>
      </div>

      {/* ── Comparison metrics ────────────────────────────────── */}
      <StageCard title="Comparison Metrics">
        <div className="space-y-3">
          {/* Token count ratio */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Token Ratio (char / word)
            </span>
            <span className={cn("font-mono text-sm font-semibold", ratioColor(data.comparison.tokenRatio))}>
              {data.comparison.tokenRatio.toFixed(2)}×
            </span>
          </div>

          {/* Unknown rate comparison */}
          <StatRow
            items={[
              {
                label: "Mini Unknown Rate",
                value: (data.comparison.miniUnknownRate * 100).toFixed(1) + "%",
              },
              {
                label: "Char Unknown Rate",
                value: (data.comparison.charUnknownRate * 100).toFixed(1) + "%",
              },
            ]}
          />

          {/* Token counts */}
          <StatRow
            items={[
              { label: "Mini Tokens", value: data.comparison.miniTokenCount },
              { label: "Char Tokens", value: data.comparison.charTokenCount },
            ]}
          />
        </div>
      </StageCard>
    </div>
  );
}
