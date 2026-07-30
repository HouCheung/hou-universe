"use client";

import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// InputPanel — Text input + Run button for Forward Playground
// ============================================================
//
// Controlled from ForwardPlayground. Emits onChange on every
// keystroke and onRun when the user clicks the button or presses
// Enter. The Run button shows a loading spinner while the model
// is computing.
//
// States:
//   - idle: ready for input
//   - running: model.forward() in progress (button disabled + spinner)
//   - empty: input is whitespace-only (button disabled)
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface InputPanelProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function InputPanel({
  value,
  onChange,
  onRun,
  isRunning,
  className,
}: InputPanelProps) {
  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isEmpty && !isRunning) {
        onRun();
      }
    }
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <label
        htmlFor="forward-input"
        className="text-[0.7rem] font-medium tracking-wide text-slate-500/70 dark:text-slate-400/60"
      >
        Input Text
      </label>

      <textarea
        id="forward-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder="Type text to trace through the forward pipeline..."
        className={cn(
          "w-full resize-none rounded-xl border px-4 py-3 font-mono text-sm",
          "bg-slate-50/80 dark:bg-white/[0.03]",
          "border-brand/10 dark:border-white/[0.06]",
          "text-foreground placeholder:text-slate-400/60 dark:placeholder:text-slate-500/60",
          "transition-colors focus:border-brand/40 focus:outline-none focus:ring-1 focus:ring-brand/20",
          "dark:focus:border-brand/30 dark:focus:ring-brand/10"
        )}
      />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] text-slate-400/70 dark:text-slate-500/60">
          {value.length === 0
            ? "Enter text above"
            : `${value.length} character${value.length !== 1 ? "s" : ""} — ${trimmed.split(/\s+/).length} word${trimmed.split(/\s+/).filter(Boolean).length !== 1 ? "s" : ""}`}
        </span>

        <button
          type="button"
          onClick={onRun}
          disabled={isEmpty || isRunning}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium",
            "transition-all duration-200",
            isEmpty || isRunning
              ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-600"
              : "border border-brand/20 bg-brand/[0.08] text-brand hover:bg-brand/[0.14] active:scale-[0.97] dark:border-brand/25 dark:bg-brand/[0.10] dark:text-brand/90 dark:hover:bg-brand/[0.18]"
          )}
        >
          {isRunning ? (
            <>
              <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Running…
            </>
          ) : (
            <>
              <Send className="size-3" />
              Run Forward
            </>
          )}
        </button>
      </div>
    </div>
  );
}
