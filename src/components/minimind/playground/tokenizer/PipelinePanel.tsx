"use client";

import { TokenizerPipeline } from "@/lib/minimind/tokenizer";
import type { PipelineStep } from "@/lib/minimind/tokenizer";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function StageIcon({ step }: { step: PipelineStep }) {
  if (step.implemented) {
    return <CheckCircle2 className="size-3.5 text-emerald-400" />;
  }
  if (step.futureVersion) {
    return <Clock className="size-3.5 text-slate-500/50 dark:text-slate-600" />;
  }
  return <Circle className="size-3.5 text-slate-600 dark:text-slate-700" />;
}

export function PipelinePanel() {
  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Pipeline
        </span>
      </div>

      {/* Stages */}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {TokenizerPipeline.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              {/* Connector arrow (except first) */}
              {i > 0 && (
                <span className="text-[0.6rem] text-slate-500/40 dark:text-slate-600">
                  →
                </span>
              )}

              {/* Stage badge */}
              <div
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-300",
                  step.implemented
                    ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-500/80 dark:text-emerald-400/80"
                    : "border-slate-500/10 bg-slate-500/[0.02] text-slate-500/60 dark:border-white/[0.03] dark:text-slate-600"
                )}
                title={step.description}
              >
                <StageIcon step={step} />
                <span className="font-mono text-[0.65rem] font-medium">
                  {step.title}
                </span>
                {!step.implemented && step.futureVersion && (
                  <span className="ml-0.5 rounded-full border border-slate-500/[0.1] px-1 py-0.5 text-[0.5rem] text-slate-500/50 dark:border-white/[0.03] dark:text-slate-600">
                    {step.futureVersion}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Description tooltip: shown below when hovering any stage */}
        <p className="mt-3 text-[0.7rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-2.5 text-emerald-400" />
            <span>Implemented</span>
          </span>
          <span className="mx-2 text-slate-500/30">•</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-2.5 text-slate-500/50" />
            <span>Planned</span>
          </span>
          <span className="mx-2 text-slate-500/30">•</span>
          <span>Normalize → V2 (punctuation & case normalization)</span>
        </p>
      </div>
    </div>
  );
}
