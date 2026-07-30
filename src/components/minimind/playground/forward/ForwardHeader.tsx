"use client";

// ============================================================
// ForwardHeader — Static header for the Forward Playground
// ============================================================
//
// Displays the page title, version badge, and a one-line
// description of the forward visualization experience.
// Pure presentational — no state, no props aside from className.
// ============================================================

interface ForwardHeaderProps {
  className?: string;
}

export function ForwardHeader({ className }: ForwardHeaderProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Forward Model Explorer
        </h2>
        <span className="rounded-full border border-brand/15 bg-brand/[0.06] px-2 py-0.5 font-mono text-[0.6rem] text-brand/70 dark:border-brand/30 dark:text-brand/60">
          V1
        </span>
      </div>

      <p className="mt-1 text-[0.75rem] leading-relaxed text-slate-500/80 dark:text-slate-400/70">
        Enter text and trace the complete forward pipeline — from Tokenizer
        through Embedding, RoPE, Transformer Blocks, to LM Head logits.
        Every intermediate result is inspectable.
      </p>
    </div>
  );
}
