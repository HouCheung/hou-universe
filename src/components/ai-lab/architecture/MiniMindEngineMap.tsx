"use client";

// ============================================================
// MiniMindEngineMap — full engine map (Phase 77)
// ============================================================
// Renders the complete MiniMind pipeline, not just the forward
// pass:
//   1. Inference path  — Tokenizer → Embedding → RoPE →
//                         Transformer ×N → LM Head → Next Token
//   2. Training path   — Tokenizer → Dataset → DataLoader →
//                         Model → Trainer → Checkpoint
//   3. Train→Use chain — Training → Checkpoint → Inference → Generation
//   4. Research chain  — Experiment → Run → Session → Checkpoint → Generation
//
// No fake data: model metadata is read from the single production
// source of truth (getProductionModelConfig()); live counts come
// from the real research workspace (may be 0 before first run).
// ============================================================

import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Hash,
  Boxes,
  Gauge,
  Layers,
  Brain,
  Sparkles,
  Database,
  Save,
  FlaskConical,
  Play,
  CircleDot,
  GitBranch,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { getProductionModelConfig } from "@/lib/minimind/experiments/ModelRegistry";
import { listExperiments } from "@/lib/minimind/research";
import { getWorkspaceStats } from "@/lib/ai-lab/adapters/researchWorkspaceAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface Stage {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  note?: string;
  accent: string;
}

// ============================================================
// Canonical model config (single source of truth)
// ============================================================

const PRODUCTION = getProductionModelConfig();

function formatParams(params: number): string {
  if (params >= 1_000_000) return `~${(params / 1_000_000).toFixed(1)}M`;
  if (params >= 1_000) return `~${Math.round(params / 1_000)}K`;
  return String(params);
}

// vocab is a tokenizer target (300), not a thousands-scaled count.
function formatVocab(vocab: number): string {
  return vocab >= 1_000 ? `${vocab / 1_000}K` : String(vocab);
}

// ============================================================
// Pipeline stages
// ============================================================

const INFERENCE_STAGES: Stage[] = [
  { id: "tokenizer", icon: Hash, label: "Tokenizer", note: "BPE", accent: "border-violet-500/30" },
  { id: "embedding", icon: Boxes, label: "Embedding", note: "Tok + Pos", accent: "border-violet-500/30" },
  { id: "rope", icon: Gauge, label: "RoPE", note: "Position", accent: "border-cyan-500/30" },
  { id: "transformer", icon: Layers, label: "Transformer", note: `×${PRODUCTION.numLayers} layers`, accent: "border-brand/30" },
  { id: "lmhead", icon: Brain, label: "LM Head", note: "Logits", accent: "border-rose-500/30" },
  { id: "generation", icon: Sparkles, label: "Next Token", note: "Sampling", accent: "border-emerald-500/30" },
];

const TRAINING_STAGES: Stage[] = [
  { id: "tokenizer", icon: Hash, label: "Tokenizer", note: "BPE", accent: "border-violet-500/30" },
  { id: "dataset", icon: Database, label: "Dataset", note: "TextDataset", accent: "border-slate-500/30" },
  { id: "dataloader", icon: RefreshCw, label: "DataLoader", note: "Batched", accent: "border-slate-500/30" },
  { id: "model", icon: Layers, label: "Model", note: `×${PRODUCTION.numLayers} layers`, accent: "border-brand/30" },
  { id: "trainer", icon: Play, label: "Trainer", note: "AdamW", accent: "border-amber-500/30" },
  { id: "checkpoint", icon: Save, label: "Checkpoint", note: "Weights", accent: "border-emerald-500/30" },
];

const RESEARCH_CHAIN: Stage[] = [
  { id: "experiment", icon: FlaskConical, label: "Experiment", note: "Config", accent: "border-brand/30" },
  { id: "run", icon: Play, label: "Run", note: "Attempt", accent: "border-amber-500/30" },
  { id: "session", icon: CircleDot, label: "Session", note: "Live", accent: "border-cyan-500/30" },
  { id: "checkpoint", icon: Save, label: "Checkpoint", note: "Weights", accent: "border-emerald-500/30" },
  { id: "generation", icon: Sparkles, label: "Generation", note: "Inference", accent: "border-rose-500/30" },
];

const TRAIN_USE_CHAIN: Stage[] = [
  { id: "training", icon: Play, label: "Training", note: "Trainer", accent: "border-amber-500/30" },
  { id: "checkpoint", icon: Save, label: "Checkpoint", note: "Weights", accent: "border-emerald-500/30" },
  { id: "inference", icon: Layers, label: "Inference", note: "Forward", accent: "border-brand/30" },
  { id: "generation", icon: Sparkles, label: "Generation", note: "Text", accent: "border-rose-500/30" },
];

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

// ============================================================
// Sub-components
// ============================================================

function StagePill({ stage, index }: { stage: Stage; index: number }) {
  const Icon = stage.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className="flex items-center gap-1.5"
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-brand/[0.02] px-3 py-2 backdrop-blur-sm transition-all duration-200",
          stage.accent,
          "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)]"
        )}
      >
        <Icon className="size-3.5 shrink-0 text-brand/70" />
        <div className="flex flex-col leading-none">
          <span className="text-xs font-medium text-foreground">{stage.label}</span>
          {stage.note && (
            <span className="mt-0.5 font-mono text-[0.55rem] text-slate-500/60 dark:text-slate-400/50">
              {stage.note}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PipelineArrow({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.2 + index * 0.06, duration: 0.3 }}
      className="flex shrink-0 items-center"
    >
      <ArrowRight className="size-3.5 text-brand/25" />
    </motion.div>
  );
}

function Pipeline({
  badge,
  title,
  stages,
}: {
  badge: string;
  title: string;
  stages: Stage[];
}) {
  return (
    <div className="rounded-2xl border border-brand/10 bg-brand/[0.015] p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.02)] sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.05] px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.12em] uppercase text-brand/70 dark:border-brand/20 dark:text-brand/70">
          {badge}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-2">
            <StagePill stage={stage} index={i} />
            {i < stages.length - 1 && <PipelineArrow index={i} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChainRow({ label, stages }: { label: string; stages: Stage[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand/8 bg-brand/[0.012] px-4 py-3.5 backdrop-blur-sm dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.015)] sm:flex-row sm:items-center sm:gap-4">
      <div className="flex shrink-0 items-center gap-1.5 sm:w-40">
        <GitBranch className="size-3.5 text-brand/50" />
        <span className="font-mono text-[0.6rem] tracking-wide text-slate-500/70 dark:text-slate-400/60">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-1.5">
            <StagePill stage={stage} index={i} />
            {i < stages.length - 1 && <PipelineArrow index={i} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MiniMindEngineMap
// ============================================================

export function MiniMindEngineMap() {
  // Live workspace counts are read after mount (localStorage is not
  // available during SSR). Initial zeros keep server/client HTML aligned.
  const [live, setLive] = useState({ experiments: 0, sessions: 0, completed: 0 });

  useEffect(() => {
    try {
      const experiments = listExperiments().length;
      const stats = getWorkspaceStats();
      setLive({
        experiments,
        sessions: stats.totalSessions,
        completed: stats.completed,
      });
    } catch {
      // localStorage may be unavailable — keep the honest zero state.
    }
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28 lg:px-8">
      {/* ── Header ── */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mb-10 text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <GitBranch className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            MiniMind Engine Map
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          One engine, two paths, one identity chain
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          MiniMind is a single transformer trained in-browser and reused for
          generation. The inference path runs the forward pass; the training
          path learns it; the research chain records how every checkpoint was
          produced.
        </p>
      </motion.div>

      {/* ── Real model config ── */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={sectionVariants}
        className="mb-6 flex flex-wrap items-center justify-center gap-2"
      >
        {[
          { label: "vocab", value: formatVocab(PRODUCTION.vocabSize) },
          { label: "dModel", value: String(PRODUCTION.dModel) },
          { label: "heads", value: String(PRODUCTION.numHeads) },
          { label: "dFF", value: String(PRODUCTION.dFF) },
          { label: "layers", value: String(PRODUCTION.numLayers) },
          { label: "context", value: String(PRODUCTION.maxSeqLen) },
          { label: "params", value: formatParams(PRODUCTION.estimatedParams) },
        ].map((chip) => (
          <div
            key={chip.label}
            className="flex items-center gap-1.5 rounded-full border border-brand/[0.08] bg-brand/[0.02] px-3 py-1 dark:border-white/[0.05] dark:bg-white/[0.01]"
          >
            <span className="font-mono text-[0.55rem] uppercase tracking-wider text-slate-400/80 dark:text-slate-500/60">
              {chip.label}
            </span>
            <span className="font-mono text-[0.65rem] font-medium text-slate-600 dark:text-slate-300">
              {chip.value}
            </span>
          </div>
        ))}
      </motion.div>

      {/* ── Pipelines ── */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="space-y-4"
      >
        <Pipeline badge="Inference" title="Forward pass" stages={INFERENCE_STAGES} />
        <Pipeline badge="Training" title="Learning pass" stages={TRAINING_STAGES} />
      </motion.div>

      {/* ── Connection chains ── */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-6 space-y-3"
      >
        <ChainRow label="Train → Use" stages={TRAIN_USE_CHAIN} />
        <ChainRow label="Research identity" stages={RESEARCH_CHAIN} />
      </motion.div>

      {/* ── Live workspace status + deep dive ── */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-brand/8 bg-brand/[0.012] px-5 py-4 backdrop-blur-sm dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.015)] sm:flex-row"
      >
        <div className="flex items-center gap-3">
          <CircleDot className="size-4 text-brand/50" />
          <p className="text-xs text-slate-500/80 dark:text-slate-400/70">
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {live.experiments}
            </span>{" "}
            experiments ·{" "}
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {live.sessions}
            </span>{" "}
            sessions ·{" "}
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {live.completed}
            </span>{" "}
            checkpoints produced
          </p>
        </div>

        <Link
          href="/ai-lab/playground/forward"
          className="group inline-flex items-center gap-1.5 rounded-lg border border-brand/15 bg-brand/[0.04] px-3 py-1.5 text-xs font-medium text-brand/80 transition-all duration-200 hover:border-brand/30 hover:bg-brand/[0.08] dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-brand/80"
        >
          Trace the forward pass interactively
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
    </section>
  );
}
