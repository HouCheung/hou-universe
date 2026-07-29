"use client";

import { useEffect, useRef, useState } from "react";
import { Hash } from "lucide-react";

// ============================================================
// EmbeddingInput — Token ID input with debounce
// ============================================================
//
// Mirrors the TokenizerPlayground InputPanel pattern:
// local state for responsive typing, debounced onChange
// to avoid re-rendering the full vector/matrix on every keystroke.
// ============================================================

interface EmbeddingInputProps {
  /** Current token ID value (controlled from parent) */
  value: number;
  /** Maximum valid token ID (vocabSize - 1) */
  maxTokenId: number;
  /** Called after debounce with the parsed integer token ID */
  onChange: (tokenId: number) => void;
}

export function EmbeddingInput({
  value,
  maxTokenId,
  onChange,
}: EmbeddingInputProps) {
  const [localValue, setLocalValue] = useState(String(value));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  function handleChange(raw: string) {
    setLocalValue(raw);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
      // If NaN, simply don't update — keeps the last valid tokenId
    }, 300);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const isOutOfRange =
    localValue.trim() !== "" &&
    (isNaN(parseInt(localValue, 10)) ||
      parseInt(localValue, 10) < 0 ||
      parseInt(localValue, 10) > maxTokenId);

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <Hash className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Token ID
        </span>
        <span className="ml-auto font-mono text-[0.55rem] text-slate-500/60 dark:text-slate-500/50">
          0 – {maxTokenId}
        </span>
      </div>

      {/* Input */}
      <div className="px-5 py-4">
        <input
          type="number"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter token ID…"
          min={0}
          max={maxTokenId}
          className="w-full rounded-lg border border-slate-500/[0.1] bg-slate-500/[0.03] px-4 py-3 font-mono text-sm text-foreground placeholder:text-slate-500/50 focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20 dark:border-white/[0.04] dark:bg-white/[0.02] dark:placeholder:text-slate-600"
          spellCheck={false}
        />

        {/* Validation hint */}
        {isOutOfRange && (
          <p className="mt-2 font-mono text-[0.6rem] text-amber-500/80 dark:text-amber-400/70">
            Token ID must be between 0 and {maxTokenId}
          </p>
        )}
        {!isOutOfRange && localValue.trim() !== "" && (
          <p className="mt-2 font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-500/50">
            Viewing embedding vector for token{" "}
            <span className="font-semibold text-brand/80 dark:text-brand-light/80">
              #{parseInt(localValue, 10)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
