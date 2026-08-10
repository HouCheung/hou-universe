"use client";

// ============================================================
// ArchitectureExplorer — Interactive MiniMind architecture viz
// ============================================================
// Phase 54: Visual exploration of the MiniMind GPT architecture
// pipeline. Each module is a clickable card that navigates to
// the knowledge graph with the relevant focus parameter.
//
// Pipeline flow:
//   Embedding → Transformer Block × N → Attention → FFN → RMSNorm → LM Head
//
// Interactive: clicking a module navigates to
//   /ai-lab/knowledge?focus=<module>
//
// Design: glass UI + Framer Motion + cosmic theme
// ============================================================

import { motion, type Variants } from "framer-motion";
import {
  ArrowDown,
  Layers,
  Brain,
  Eye,
  Cpu,
  Gauge,
  Hash,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { listModels } from "@/lib/minimind/experiments/ModelRegistry";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

// ============================================================
// Types
// ============================================================

interface ArchitectureModule {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  focusParam: string;
  subModules?: string[];
  accent: string; // Tailwind border color class
}

// ============================================================
// Module definitions
// ============================================================

const ARCHITECTURE_MODULES: ArchitectureModule[] = [
  {
    id: "embedding",
    icon: Hash,
    label: "Embedding",
    description: "Token + Position embeddings combine to form input representations",
    focusParam: "embedding",
    accent: "border-violet-500/30 hover:border-violet-500/50",
    subModules: ["Token Embedding", "Position Embedding (RoPE)"],
  },
  {
    id: "transformer",
    icon: Layers,
    label: "Transformer Block",
    description: "Stacked self-attention + FFN layers with residual connections",
    focusParam: "transformer",
    accent: "border-brand/30 hover:border-brand/50",
    subModules: ["Multi-Head Attention", "Feed-Forward Network", "RMSNorm"],
  },
  {
    id: "attention",
    icon: Eye,
    label: "Attention",
    description: "Scaled dot-product multi-head self-attention with causal masking",
    focusParam: "attention",
    accent: "border-cyan-500/30 hover:border-cyan-500/50",
    subModules: ["Q/K/V Projections", "Scaled Dot-Product", "Causal Mask", "Output Projection"],
  },
  {
    id: "ffn",
    icon: Cpu,
    label: "Feed-Forward",
    description: "SwiGLU activation with gated linear units for non-linear transformation",
    focusParam: "ffn",
    accent: "border-emerald-500/30 hover:border-emerald-500/50",
    subModules: ["Gate Projection", "Up Projection", "Down Projection", "SiLU Activation"],
  },
  {
    id: "rmsnorm",
    icon: Gauge,
    label: "RMSNorm",
    description: "Root Mean Square Layer Normalization for training stability",
    focusParam: "rmsnorm",
    accent: "border-amber-500/30 hover:border-amber-500/50",
    subModules: ["Pre-Attention RMSNorm", "Pre-FFN RMSNorm", "Final RMSNorm"],
  },
  {
    id: "lmhead",
    icon: Brain,
    label: "LM Head",
    description: "Final linear projection from hidden state to vocabulary logits",
    focusParam: "lmhead",
    accent: "border-rose-500/30 hover:border-rose-500/50",
    subModules: ["Linear Projection", "Logits → Token Probabilities"],
  },
];

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const nodeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.12, ease: "easeOut" },
  }),
};

const arrowVariants: Variants = {
  hidden: { opacity: 0, scaleY: 0 },
  visible: (i: number) => ({
    opacity: 1,
    scaleY: 1,
    transition: { duration: 0.3, delay: 0.3 + i * 0.12, ease: "easeOut" },
  }),
};

// ============================================================
// Connector Arrow
// ============================================================

function ConnectorArrow({ index }: { index: number }) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={arrowVariants}
      className="flex justify-center py-1"
    >
      <ArrowDown className="size-5 text-brand/30" />
    </motion.div>
  );
}

// ============================================================
// Architecture Module Card
// ============================================================

function ModuleCard({
  mod,
  index,
  totalLayers,
}: {
  mod: ArchitectureModule;
  index: number;
  totalLayers?: number;
}) {
  const Icon = mod.icon;

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={nodeVariants}
    >
      <Link
        href={`/ai-lab/knowledge?focus=${encodeURIComponent(mod.focusParam)}`}
        className={cn(
          "group flex flex-col rounded-xl border bg-brand/[0.015] px-5 py-4 backdrop-blur-sm transition-all duration-300",
          mod.accent,
          "hover:scale-[1.02] hover:bg-brand/[0.05] hover:shadow-[0_0_24px_rgba(var(--brand-rgb),0.1)]",
          "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:bg-[rgba(var(--brand-rgb),0.06)]"
        )}
      >
        {/* Header row */}
        <div className="mb-3 flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg border transition-all duration-300",
              mod.accent,
              "bg-brand/[0.03] group-hover:shadow-[0_0_16px_rgba(var(--brand-rgb),0.12)] dark:bg-[rgba(var(--brand-rgb),0.04)]"
            )}
          >
            <Icon className="size-5 text-brand/60 transition-colors group-hover:text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand dark:group-hover:text-brand-light">
              {mod.label}
            </h4>
            {totalLayers !== undefined && mod.id === "transformer" && (
              <span className="text-[0.65rem] text-brand/60 dark:text-brand-light/60">
                × {totalLayers} layers
              </span>
            )}
          </div>
          <Sparkles className="size-3.5 shrink-0 text-slate-400/0 transition-all duration-300 group-hover:text-brand/40" />
        </div>

        {/* Description */}
        <p className="mb-3 text-[0.7rem] leading-relaxed text-slate-500/70 dark:text-slate-400/60">
          {mod.description}
        </p>

        {/* Sub-modules */}
        {mod.subModules && mod.subModules.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {mod.subModules.map((sub) => (
              <span
                key={sub}
                className="rounded-full border border-brand/8 bg-brand/[0.02] px-2 py-0.5 text-[0.6rem] text-slate-500/70 transition-colors group-hover:border-brand/15 group-hover:text-slate-600/90 dark:border-white/[0.05] dark:text-slate-400/60 dark:group-hover:border-brand/20 dark:group-hover:text-slate-300/80"
              >
                {sub}
              </span>
            ))}
          </div>
        )}
      </Link>
    </motion.div>
  );
}

// ============================================================
// Flow pipeline header
// ============================================================

function PipelineHeader({ numLayers }: { numLayers: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="mb-8 text-center"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
        <Layers className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.65rem] tracking-[0.15em] text-slate-500 dark:text-slate-400/60">
          ARCHITECTURE PIPELINE · {numLayers} LAYERS
        </span>
      </div>
      <p className="mt-3 text-[0.7rem] text-slate-500/50 dark:text-slate-400/40">
        Click any module to explore it in the Knowledge Graph
      </p>
    </motion.div>
  );
}

// ============================================================
// ArchitectureExplorer — composition root
// ============================================================

export function ArchitectureExplorer() {
  const numLayers = useMemo(() => {
    const models = listModels();
    if (models.length === 0) return 6;
    // Use the largest model's layer count to show architecture capacity
    const largest = models.reduce((a, b) =>
      a.numLayers > b.numLayers ? a : b
    );
    return largest.numLayers;
  }, []);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.architectureExplorerLabel" />

      <PipelineHeader numLayers={numLayers} />

      {/* Vertical pipeline — mobile: stacked, desktop: max-w-lg centered */}
      <div className="mx-auto max-w-lg space-y-1">
        {ARCHITECTURE_MODULES.map((mod, i) => (
          <div key={mod.id}>
            <ModuleCard
              mod={mod}
              index={i}
              totalLayers={
                mod.id === "transformer" ? numLayers : undefined
              }
            />
            {i < ARCHITECTURE_MODULES.length - 1 && (
              <ConnectorArrow index={i} />
            )}
          </div>
        ))}
      </div>

      {/* Bottom flow visualization — compact summary */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="mx-auto mt-10 max-w-lg rounded-xl border border-brand/8 bg-brand/[0.015] px-5 py-3 backdrop-blur-sm dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.02)]"
      >
        <p className="text-center text-[0.65rem] leading-relaxed text-slate-500/60 dark:text-slate-400/50">
          <span className="font-medium text-slate-600/80 dark:text-slate-300/70">
            Text
          </span>
          {" → "}
          <span className="font-medium text-slate-600/80 dark:text-slate-300/70">
            Tokens
          </span>
          {" → "}
          <span className="font-medium text-slate-600/80 dark:text-slate-300/70">
            Embedding
          </span>
          {" → "}
          <span className="font-medium text-brand/70">
            Transformer ×{numLayers}
          </span>
          {" → "}
          <span className="font-medium text-slate-600/80 dark:text-slate-300/70">
            LM Head
          </span>
          {" → "}
          <span className="font-medium text-slate-600/80 dark:text-slate-300/70">
            Logits
          </span>
          {" → "}
          <span className="font-medium text-brand/80">Next Token</span>
        </p>
      </motion.div>
    </motion.section>
  );
}
