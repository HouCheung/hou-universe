"use client";

import type { TokenInfo } from "@/lib/minimind/tokenizer";
import { cn } from "@/lib/utils";

interface TokenListProps {
  tokens: TokenInfo[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function TokenList({ tokens, selectedIndex, onSelect }: TokenListProps) {
  if (tokens.length === 0) {
    return (
      <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
        <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
          <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
            Tokens
          </span>
        </div>
        <div className="px-5 py-6 text-center text-xs text-slate-500/60 dark:text-slate-600">
          Type something to see tokens
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Tokens
        </span>
        <span className="rounded-full border border-slate-500/[0.1] px-1.5 py-0.5 text-[0.55rem] text-slate-500/70 dark:border-white/[0.04] dark:text-slate-500">
          {tokens.length}
        </span>
      </div>

      {/* Token badges */}
      <div className="flex flex-wrap gap-2 px-5 py-4">
        {tokens.map((tokenInfo, i) => {
          const isSelected = selectedIndex === i;
          const isUnknown = !tokenInfo.exists;

          return (
            <button
              key={`${i}-${tokenInfo.token}`}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-sm transition-all duration-300",
                isSelected
                  ? "border-brand/40 bg-brand/[0.08] text-brand shadow-[0_0_12px_rgba(var(--brand-rgb),0.1)] dark:border-brand-light/40 dark:bg-[rgba(var(--brand-rgb),0.12)] dark:text-brand-light"
                  : isUnknown
                    ? "border-amber-500/15 bg-amber-500/[0.04] text-amber-500/80 dark:text-amber-400/70"
                    : "border-slate-500/[0.1] bg-slate-500/[0.03] text-foreground hover:border-brand/20 hover:bg-brand/[0.04] dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04]"
              )}
            >
              {/* Token string */}
              <span
                className={cn(
                  "max-w-[160px] truncate",
                  isUnknown && "line-through decoration-amber-500/30"
                )}
              >
                {tokenInfo.token}
              </span>

              {/* Subtle id indicator */}
              <span
                className={cn(
                  "text-[0.55rem] opacity-50",
                  isSelected ? "text-brand/70" : "text-slate-500"
                )}
              >
                [{tokenInfo.id}]
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected token detail */}
      {selectedIndex !== null && tokens[selectedIndex] && (
        <TokenDetail
          tokenInfo={tokens[selectedIndex]}
          index={selectedIndex}
        />
      )}
    </div>
  );
}

function TokenDetail({
  tokenInfo,
  index,
}: {
  tokenInfo: TokenInfo;
  index: number;
}) {
  return (
    <div className="border-t border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
      <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-slate-500/60 dark:text-slate-500">
        Token Detail
      </span>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <div>
          <span className="text-[0.6rem] text-slate-500/60">Token</span>
          <p className="font-mono text-sm text-foreground">{tokenInfo.token}</p>
        </div>
        <div>
          <span className="text-[0.6rem] text-slate-500/60">ID</span>
          <p className="font-mono text-sm text-foreground">{tokenInfo.id}</p>
        </div>
        <div>
          <span className="text-[0.6rem] text-slate-500/60">Exists</span>
          <p
            className={cn(
              "font-mono text-sm",
              tokenInfo.exists ? "text-emerald-400" : "text-amber-500/80"
            )}
          >
            {tokenInfo.exists ? "true" : "false"}
          </p>
        </div>
        <div>
          <span className="text-[0.6rem] text-slate-500/60">Index</span>
          <p className="font-mono text-sm text-foreground">{index}</p>
        </div>
      </div>
    </div>
  );
}
