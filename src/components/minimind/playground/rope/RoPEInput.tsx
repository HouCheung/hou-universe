"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// RoPEInput — Position selector for RoPE playground
// ============================================================

interface RoPEInputProps {
  position: number;
  maxPosition: number;
  onChange: (position: number) => void;
}

export function RoPEInput({ position, maxPosition, onChange }: RoPEInputProps) {
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 0 && val <= maxPosition) {
        onChange(val);
      }
    },
    [onChange, maxPosition]
  );

  return (
    <StageCard title="Position Selector">
      <p className="mb-3 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
        Choose a token position in the sequence. Different positions get
        different rotation angles — this is how RoPE encodes position
        information without adding extra parameters.
      </p>

      <div className="flex items-center gap-4">
        {/* Slider */}
        <input
          type="range"
          min={0}
          max={maxPosition}
          value={position}
          onChange={handleSliderChange}
          className={cn(
            "h-1.5 w-full max-w-md cursor-pointer appearance-none rounded-full",
            "bg-slate-200 dark:bg-white/[0.08]",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:size-4",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-brand",
            "[&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(var(--brand-rgb),0.3)]",
            "[&::-webkit-slider-thumb]:cursor-pointer"
          )}
          aria-label="Select position"
        />

        {/* Numeric input */}
        <input
          type="number"
          min={0}
          max={maxPosition}
          value={position}
          onChange={handleInputChange}
          className={cn(
            "w-20 rounded-lg border border-brand/10 bg-slate-50/80 px-3 py-1.5 text-center font-mono text-sm",
            "dark:border-white/[0.06] dark:bg-white/[0.03]",
            "text-foreground focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
          )}
          aria-label="Position number"
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
        <span>0</span>
        <span>{maxPosition}</span>
      </div>
    </StageCard>
  );
}
