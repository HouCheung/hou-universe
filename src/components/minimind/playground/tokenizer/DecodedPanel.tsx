"use client";

import { TextCursorInput } from "lucide-react";

interface DecodedPanelProps {
  decoded: string;
  originalText: string;
}

export function DecodedPanel({ decoded, originalText }: DecodedPanelProps) {
  const isRoundTrip = decoded === originalText && originalText.length > 0;

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <TextCursorInput className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Decoded
        </span>
        {originalText.length > 0 && (
          <span
            className={`ml-auto rounded-full border px-1.5 py-0.5 text-[0.55rem] ${
              isRoundTrip
                ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400/80"
                : "border-amber-500/15 bg-amber-500/[0.04] text-amber-500/70"
            }`}
          >
            {isRoundTrip ? "Round-trip ✓" : "Lossy"}
          </span>
        )}
      </div>

      {/* Decoded result */}
      <div className="px-5 py-4">
        {decoded.length > 0 ? (
          <div className="rounded-lg border border-slate-500/[0.1] bg-slate-500/[0.03] px-4 py-3 font-mono text-sm leading-relaxed text-foreground dark:border-white/[0.04] dark:bg-white/[0.02]">
            {decoded}
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-slate-500/60 dark:text-slate-600">
            Type something to see decoded output
          </p>
        )}

        {/* Comparison: original vs decoded */}
        {originalText.length > 0 && !isRoundTrip && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-slate-500/[0.06] bg-slate-500/[0.02] px-4 py-2.5 dark:border-white/[0.03] dark:bg-white/[0.01]">
            <div className="flex items-center gap-2 text-[0.6rem]">
              <span className="text-slate-500/60">Original:</span>
              <span className="font-mono text-foreground/80">
                {originalText}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[0.6rem]">
              <span className="text-slate-500/60">Decoded:</span>
              <span className="font-mono text-foreground/80">{decoded}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
