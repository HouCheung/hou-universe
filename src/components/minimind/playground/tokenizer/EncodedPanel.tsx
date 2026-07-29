"use client";

import { AlertTriangle, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface EncodedPanelProps {
  encoded: number[];
  unknownTokens: string[];
}

export function EncodedPanel({ encoded, unknownTokens }: EncodedPanelProps) {
  if (encoded.length === 0) {
    return (
      <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
        <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
          <Hash className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
            Encoded IDs
          </span>
        </div>
        <div className="px-5 py-6 text-center text-xs text-slate-500/60 dark:text-slate-600">
          Type something to see encoded IDs
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <Hash className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Encoded IDs
        </span>
        <span className="rounded-full border border-slate-500/[0.1] px-1.5 py-0.5 text-[0.55rem] text-slate-500/70 dark:border-white/[0.04] dark:text-slate-500">
          {encoded.length}
        </span>
      </div>

      {/* ID sequence */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        {encoded.map((id, i) => (
          <div
            key={`${i}-${id}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-sm transition-all duration-300",
              id === 1
                ? "border-amber-500/15 bg-amber-500/[0.04] text-amber-500/80 dark:text-amber-400/70"
                : "border-slate-500/[0.1] bg-slate-500/[0.03] text-foreground dark:border-white/[0.04] dark:bg-white/[0.02]"
            )}
          >
            <span className="text-[0.55rem] text-slate-500/50">{i}</span>
            <span className="text-slate-500/30">:</span>
            <span>{id}</span>
            {id === 1 && (
              <span className="text-[0.55rem] text-amber-500/40">⟨unk⟩</span>
            )}
          </div>
        ))}
      </div>

      {/* Unknown tokens warning */}
      {unknownTokens.length > 0 && (
        <div className="border-t border-amber-500/[0.08] bg-amber-500/[0.02] px-5 py-3 dark:border-amber-500/[0.04]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-amber-500/70" />
            <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-amber-500/80">
              Unknown Tokens
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unknownTokens.map((token) => (
              <span
                key={token}
                className="inline-block rounded-full border border-amber-500/15 bg-amber-500/[0.04] px-2.5 py-1 font-mono text-xs text-amber-500/80 dark:text-amber-400/70"
              >
                {token}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[0.65rem] leading-relaxed text-amber-500/60 dark:text-amber-500/50">
            These words are not in the vocabulary and are mapped to{" "}
            <code className="rounded bg-amber-500/[0.06] px-1 py-0.5 font-mono text-[0.6rem]">
              &lt;unk&gt;
            </code>{" "}
            (id=1).
          </p>
        </div>
      )}
    </div>
  );
}
