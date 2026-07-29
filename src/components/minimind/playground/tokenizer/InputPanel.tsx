"use client";

import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";

interface InputPanelProps {
  value: string;
  onChange: (text: string) => void;
}

export function InputPanel({ value, onChange }: InputPanelProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (e.g. initial default)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleChange(text: string) {
    setLocalValue(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange(text);
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

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <Type className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Input Text
        </span>
      </div>

      {/* Textarea */}
      <div className="px-5 py-4">
        <textarea
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Type something to tokenize…"
          className="w-full resize-none rounded-lg border border-slate-500/[0.1] bg-slate-500/[0.03] px-4 py-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-slate-500/50 focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20 dark:border-white/[0.04] dark:bg-white/[0.02] dark:placeholder:text-slate-600"
          rows={3}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
