"use client";

// ============================================================
// ModelOverviewCard — Model architecture overview card
// ============================================================
// Phase 64: Premium card showing the current MiniMind model
// configuration with key architectural parameters.
//
// Features:
//   - Model name + status badge
//   - 6 stat pills in a responsive grid
//   - Model variant selector (visual only, non-interactive pills)
//   - Glass card with cosmic glow
//
// Data sourced exclusively through studioAdapter.
// ============================================================

import { useState, useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Cpu,
  Brain,
  Layers,
  Hash,
  Activity,
  CheckCircle2,
} from "lucide-react";
import {
  getModelOverview,
  type ModelOverviewData,
} from "@/lib/ai-lab/adapters/studioAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Animation variants
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.3 + i * 0.07, ease: "easeOut" },
  }),
};

// ============================================================
// Stat Pill (internal sub-component)
// ============================================================

function StatPill({
  icon: Icon,
  label,
  value,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  index: number;
}) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={statVariants}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-brand/8 bg-brand/[0.02] px-4 py-3 backdrop-blur-sm",
        "dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)]"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/10 bg-brand/[0.04] dark:border-white/[0.06] dark:bg-white/[0.02]">
        <Icon className="size-4 text-brand/60" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.65rem] text-slate-500/60 dark:text-slate-400/50">
          {label}
        </div>
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {value}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Status badge
// ============================================================

function StatusBadge({ status, label }: { status: ModelOverviewData["trainingStatus"]; label: string }) {
  const config: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    completed: {
      bg: "bg-emerald-500/[0.06]",
      border: "border-emerald-500/20",
      text: "text-emerald-600/80 dark:text-emerald-400/70",
      icon: "text-emerald-500/70",
    },
    training: {
      bg: "bg-brand/[0.06]",
      border: "border-brand/20",
      text: "text-brand dark:text-brand-light",
      icon: "text-brand/70",
    },
    idle: {
      bg: "bg-slate-500/[0.04]",
      border: "border-slate-500/15",
      text: "text-slate-500/80 dark:text-slate-400/70",
      icon: "text-slate-400/60",
    },
    no_data: {
      bg: "bg-slate-500/[0.03]",
      border: "border-slate-500/10",
      text: "text-slate-500/60 dark:text-slate-400/50",
      icon: "text-slate-400/40",
    },
  };

  const c = config[status] ?? config.no_data;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium",
        c.bg,
        c.border,
        c.text
      )}
    >
      <Activity className={cn("size-2.5", c.icon)} />
      {label}
    </span>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-12 text-center backdrop-blur-sm">
      <Cpu className="mx-auto mb-3 size-8 text-slate-400/40" />
      <p className="text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        No models registered yet
      </p>
      <p className="mt-1 text-xs text-slate-400/60 dark:text-slate-500/50">
        Register a model configuration to see architecture details here.
      </p>
    </div>
  );
}

// ============================================================
// ModelOverviewCard
// ============================================================

export function ModelOverviewCard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const data = mounted ? getModelOverview() : ({ hasData: false } as ModelOverviewData);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={cardVariants}
    >
      {/* ── Section header ── */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] dark:border-brand/25 dark:bg-brand/[0.08]">
            <Brain className="size-4 text-brand/70" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Model Overview
            </h2>
            <p className="text-xs text-slate-500/60 dark:text-slate-400/50">
              MiniMind architecture & training status
            </p>
          </div>
        </div>

        {data.hasData && (
          <StatusBadge status={data.trainingStatus} label={data.statusLabel} />
        )}
      </div>

      {/* ── Content ── */}
      {!data.hasData ? (
        <EmptyState />
      ) : (
        <div
          className={cn(
            "rounded-2xl border border-brand/10 bg-brand/[0.02] px-6 py-6 backdrop-blur-sm",
            "dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)]",
            "sm:px-8 sm:py-7"
          )}
        >
          {/* Model name + description */}
          <div className="mb-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold text-foreground">
                {data.modelLabel}
              </h3>
              {data.availableModels.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {data.availableModels.map((m) => (
                    <span
                      key={m.name}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[0.6rem] font-medium backdrop-blur-sm transition-colors",
                        m.name === data.modelName
                          ? "border-brand/30 bg-brand/[0.06] text-brand dark:border-brand/40 dark:bg-brand/[0.08] dark:text-brand-light"
                          : "border-slate-500/12 bg-slate-500/[0.02] text-slate-500/80 dark:border-white/[0.05] dark:text-slate-400/60"
                      )}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500/70 dark:text-slate-400/60 line-clamp-2 max-w-2xl">
              {data.description}
            </p>
          </div>

          {/* Stat grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatPill
              icon={Brain}
              label="Parameters"
              value={data.paramsFormatted}
              index={0}
            />
            <StatPill
              icon={Layers}
              label="Layers"
              value={String(data.layers)}
              index={1}
            />
            <StatPill
              icon={Hash}
              label="Attention Heads"
              value={String(data.heads)}
              index={2}
            />
            <StatPill
              icon={Hash}
              label="Vocabulary Size"
              value={data.vocabSizeFormatted}
              index={3}
            />
            <StatPill
              icon={Cpu}
              label="Hidden Dim (dModel)"
              value={String(data.dModel)}
              index={4}
            />
            <StatPill
              icon={Cpu}
              label="FFN Dim (dFF)"
              value={data.dFFFormatted}
              index={5}
            />
          </div>

          {/* Footer: max seq len + check icon */}
          <div className="mt-5 flex items-center gap-2 text-[0.65rem] text-slate-500/50 dark:text-slate-400/40">
            <CheckCircle2 className="size-3 text-emerald-500/60" />
            Max sequence length: {data.maxSeqLen.toLocaleString()} tokens
          </div>
        </div>
      )}
    </motion.section>
  );
}
