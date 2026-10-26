"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";

// ============================================================
// AttentionInput — Text input + head selector
// ============================================================
//
// Renders a textarea for prompt entry and a head-selection
// row (one pill per head). Controlled by parent state.
//
// Props:
//   inputText     — current value of the prompt textarea
//   numHeads      — total number of attention heads
//   selectedHead  — currently selected head (0-indexed)
//   onChange      — (field, value) => void
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface AttentionInputProps {
  inputText: string;
  numHeads: number;
  selectedHead: number;
  onChange: (field: "text" | "head", value: string | number) => void;
}

// ── Component ────────────────────────────────────────────────

export function AttentionInput({
  inputText,
  numHeads,
  selectedHead,
  onChange,
}: AttentionInputProps) {
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange("text", e.target.value);
    },
    [onChange]
  );

  const handleHeadClick = useCallback(
    (h: number) => {
      onChange("head", h);
    },
    [onChange]
  );

  return (
    <div className="space-y-4">
      {/* ── Text input ──────────────────────────────────────── */}
      <div>
        <label
          htmlFor="attention-input-text"
          className="mb-2 block text-[0.7rem] font-semibold tracking-wide text-slate-500 dark:text-slate-400"
        >
          Input Text
        </label>
        <textarea
          id="attention-input-text"
          rows={2}
          value={inputText}
          onChange={handleTextChange}
          className={cn(
            "w-full resize-none rounded-xl border px-4 py-2.5 font-mono text-sm",
            "border-brand/15 bg-brand/[0.03] text-foreground backdrop-blur-sm",
            "placeholder:text-slate-400/60 dark:placeholder:text-slate-500/50",
            "focus:border-brand/40 focus:outline-none focus:ring-1 focus:ring-brand/25",
            "dark:border-white/[0.08] dark:bg-white/[0.02]"
          )}
          placeholder="Type a sentence to explore attention patterns..."
        />
        <p className="mt-1.5 font-mono text-[0.6rem] text-slate-400/80 dark:text-slate-500/70">
          Each word becomes a token. Tokens attend to each other via
          scaled dot-product attention.
        </p>
      </div>

      {/* ── Head selector ───────────────────────────────────── */}
      <div>
        <span className="mb-2 block text-[0.7rem] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          Head
        </span>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: numHeads }, (_, h) => (
            <button
              key={h}
              type="button"
              onClick={() => handleHeadClick(h)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-[0.65rem] transition-all duration-200",
                h === selectedHead
                  ? "border-brand/40 bg-brand/[0.12] text-brand dark:border-brand/35 dark:bg-brand/[0.14] dark:text-brand-light"
                  : "border-brand/10 bg-brand/[0.03] text-slate-500 hover:border-brand/25 hover:text-brand/80 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400 dark:hover:border-brand/25 dark:hover:text-brand/70"
              )}
              aria-pressed={h === selectedHead}
              aria-label={`Head ${h}`}
            >
              H{h}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
