"use client";

import { useState, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import { Sparkles, Construction, ArrowRight, Layers } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TokenizerPlayground } from "./tokenizer/TokenizerPlayground";
import { EmbeddingPlayground } from "./embedding/EmbeddingPlayground";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { CrossRefButton } from "@/components/ai-lab/CrossRefButton";

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// Module display names
// ============================================================

const MODULE_TITLES: Record<string, string> = {
  tokenizer: "Tokenizer",
  embedding: "Embedding",
  rope: "RoPE",
  attention: "Attention",
  transformer: "Transformer",
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  tokenizer:
    "Explore how text becomes tokens. Type anything and watch the full tokenization pipeline in real time — from whitespace split through vocabulary lookup to encode/decode round-trip.",
  embedding:
    "Inspect the embedding matrix. Enter a token ID to see its dense vector representation, browse the full matrix heatmap, and understand how discrete tokens map to continuous semantic space.",
  rope:
    "Rotary Position Embedding — frequency-based positional encoding. Coming soon.",
  attention:
    "Multi-head self-attention mechanism. Coming soon.",
  transformer:
    "Full decoder-only Transformer block. Coming soon.",
};

const MODULE_VERSIONS: Record<string, string> = {
  tokenizer: "V1 Word Tokenizer",
  embedding: "V1 Learned Embedding",
  rope: "V4 — Coming Soon",
  attention: "V3 — Coming Soon",
  transformer: "V5 — Coming Soon",
};

// ============================================================
// MiniMindPlayground
// ============================================================

export function MiniMindPlayground() {
  const [selectedModule, setSelectedModule] = useState<string>("tokenizer");

  const handleSelectModule = useCallback((moduleId: string) => {
    // Only allow switching to implemented modules
    const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);
    if (mod?.implemented) {
      setSelectedModule(moduleId);
    }
  }, []);

  const activeTitle = MODULE_TITLES[selectedModule] ?? "Tokenizer";
  const activeDesc = MODULE_DESCRIPTIONS[selectedModule] ?? "";
  const activeVersion = MODULE_VERSIONS[selectedModule] ?? "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Platform label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              MiniMind Learning Edition
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {activeTitle} Playground
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {activeDesc}
          </p>

          {/* Version badge */}
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-slate-500/80 dark:text-slate-400/50">
              Version
            </span>
            <span className="font-mono text-[0.6rem] font-semibold text-brand/80 dark:text-brand-light/80">
              {activeVersion}
            </span>
          </div>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Module Cards */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-12 sm:mt-16"
      >
        <div className="mb-6 flex items-center gap-5">
          <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Modules
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MINIMIND_MODULES.map((mod, i) => {
            const isSelected = mod.id === selectedModule;

            return (
              <motion.button
                key={mod.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                onClick={() => handleSelectModule(mod.id)}
                disabled={!mod.implemented}
                className={cn(
                  "group relative rounded-xl border px-4 py-4 text-left transition-all duration-300",
                  mod.implemented && !isSelected
                    ? "border-brand/25 bg-brand/[0.05] shadow-[0_0_20px_rgba(var(--brand-rgb),0.06)] hover:border-brand/40 hover:bg-brand/[0.08] cursor-pointer dark:border-white/[0.1] dark:bg-[rgba(var(--brand-rgb),0.06)] dark:hover:border-white/[0.16] dark:hover:bg-[rgba(var(--brand-rgb),0.09)]"
                    : "",
                  isSelected
                    ? "border-brand/50 bg-brand/[0.1] shadow-[0_0_28px_rgba(var(--brand-rgb),0.12)] ring-1 ring-brand/30 cursor-default dark:border-brand/40 dark:bg-[rgba(var(--brand-rgb),0.12)] dark:ring-brand/25"
                    : "",
                  !mod.implemented
                    ? "border-dashed border-slate-500/15 bg-transparent cursor-not-allowed dark:border-white/[0.03]"
                    : ""
                )}
                aria-pressed={isSelected}
                aria-label={`${mod.title} module${mod.implemented ? "" : " (coming soon)"}`}
              >
                <div className="flex flex-col items-center text-center gap-2">
                  {/* Icon */}
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border transition-colors",
                      mod.implemented
                        ? isSelected
                          ? "border-brand/30 bg-brand/[0.12]"
                          : "border-brand/20 bg-brand/[0.06] group-hover:border-brand/30 group-hover:bg-brand/[0.1]"
                        : "border-slate-500/[0.1] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]"
                    )}
                  >
                    {mod.implemented ? (
                      <Sparkles
                        className={cn(
                          "size-4 transition-colors",
                          isSelected
                            ? "text-brand"
                            : "text-brand/70 group-hover:text-brand/90"
                        )}
                      />
                    ) : (
                      <Construction className="size-4 text-slate-500/40 dark:text-slate-600" />
                    )}
                  </div>

                  {/* Title */}
                  <p
                    className={cn(
                      "text-sm font-semibold transition-colors",
                      mod.implemented
                        ? isSelected
                          ? "text-brand dark:text-brand-light"
                          : "text-foreground group-hover:text-brand/90"
                        : "text-slate-500 dark:text-slate-500"
                    )}
                  >
                    {mod.title}
                  </p>

                  {/* Description */}
                  <p className="text-[0.65rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60 line-clamp-2">
                    {mod.description}
                  </p>

                  {/* Status badge */}
                  {mod.implemented && isSelected && (
                    <span className="inline-block rounded-full border border-brand/25 bg-brand/[0.08] px-2 py-0.5 text-[0.55rem] font-mono text-brand/80 dark:text-brand-light/80">
                      Active
                    </span>
                  )}
                  {mod.implemented && !isSelected && (
                    <span className="inline-block rounded-full border border-brand/15 bg-brand/[0.05] px-2 py-0.5 text-[0.55rem] font-mono text-brand/70 dark:text-brand-light/70">
                      Active
                    </span>
                  )}
                  {!mod.implemented && mod.futureVersion && (
                    <span className="inline-block rounded-full border border-slate-500/[0.1] px-2 py-0.5 text-[0.55rem] font-mono text-slate-500/60 dark:border-white/[0.04] dark:text-slate-600">
                      {mod.futureVersion}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Forward Playground CTA */}
      {/* ================================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mt-8"
      >
        <Link
          href="/ai-lab/playground/forward"
          className="group flex items-center gap-5 rounded-xl border border-brand/15 bg-brand/[0.03] px-6 py-5 backdrop-blur-sm transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.06] dark:border-white/[0.06] dark:hover:border-brand/25 sm:px-8 sm:py-6"
        >
          {/* Icon */}
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.08] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.12)] dark:border-brand/25 dark:bg-brand/[0.1] sm:size-12">
            <Layers className="size-5 text-brand/70 transition-all duration-300 group-hover:text-brand sm:size-5.5" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand sm:text-base">
              Ready for the full pipeline?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500/80 dark:text-slate-400/70 sm:text-sm">
              Trace text through every stage — Tokenizer, Embedding, RoPE,
              Transformer, and LM Head — with real-time visualizations at each
              step.
            </p>
          </div>

          {/* Arrow */}
          <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 sm:flex dark:text-brand/50 dark:group-hover:text-brand/70">
            Open Forward Model Explorer
            <ArrowRight className="size-3.5" />
          </div>
        </Link>
      </motion.div>

      {/* ================================================================ */}
      {/* Active Module Playground */}
      {/* ================================================================ */}
      <motion.section
        key={selectedModule}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-16 sm:mt-20"
      >
        <div className="mb-8 flex items-center gap-5 sm:mb-12">
          <div className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
          <div className="flex flex-col gap-0.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {activeTitle}
            </h2>
          </div>
        </div>

        {selectedModule === "tokenizer" && <TokenizerPlayground />}
        {selectedModule === "embedding" && <EmbeddingPlayground />}
      </motion.section>

      {/* ================================================================ */}
      {/* Cross-Reference Navigation */}
      {/* ================================================================ */}
      <div className="mt-16 flex items-center justify-center sm:mt-20">
        <CrossRefButton
          variant="journey"
          targetId={selectedModule}
          label={`Learn ${activeTitle} in Journey`}
        />
      </div>
    </div>
  );
}
