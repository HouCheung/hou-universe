"use client";

// ============================================================
// CrossRefButton — reusable cross-reference link button
// ============================================================
//
// Renders a small rounded-full button that links to another
// AI Lab sub-page with a standardized query parameter.
//
// Variants map to target routes:
//   knowledge   → /ai-lab/knowledge?focus=<targetId>
//   journey     → /ai-lab/lab/model?module=<targetId>
//   experiments → /ai-lab/lab/experiments?experiment=<targetId>
//   training    → /ai-lab/lab/training?epochs=<targetId>
//   playground  → /ai-lab/lab/architecture?module=<targetId>
//   inference   → /ai-lab/inference?prompt=<targetId>
// ============================================================

import Link from "next/link";
import { ArrowRight, Brain, Map, FlaskConical, Gamepad2, Layers, Cpu, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

export type CrossRefVariant =
  | "knowledge"
  | "journey"
  | "experiments"
  | "playground"
  | "forward"
  | "inference"
  | "training";

interface CrossRefButtonProps {
  /** Which target route to link to */
  variant: CrossRefVariant;
  /** The entity id to pass as query param */
  targetId: string;
  /** Display label */
  label: string;
  /** Optional class override */
  className?: string;
}

// ============================================================
// Variant config
// ============================================================

interface VariantConfig {
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  param: string;
  accentClass: string;
}

const VARIANT_MAP: Record<CrossRefVariant, VariantConfig> = {
  knowledge: {
    icon: Brain,
    route: "/ai-lab/knowledge",
    param: "focus",
    accentClass:
      "border-brand/20 text-brand/70 hover:border-brand/35 hover:text-brand hover:bg-brand/[0.04] dark:border-brand/20 dark:text-brand/60 dark:hover:border-brand/35 dark:hover:text-brand/80",
  },
  journey: {
    icon: Map,
    route: "/ai-lab/lab/model",
    param: "module",
    accentClass:
      "border-emerald-500/20 text-emerald-600/70 hover:border-emerald-500/35 hover:text-emerald-600 hover:bg-emerald-500/[0.04] dark:border-emerald-500/20 dark:text-emerald-500/60 dark:hover:border-emerald-500/35 dark:hover:text-emerald-500/80",
  },
  experiments: {
    icon: FlaskConical,
    route: "/ai-lab/lab/experiments",
    param: "experiment",
    accentClass:
      "border-amber-500/20 text-amber-600/70 hover:border-amber-500/35 hover:text-amber-600 hover:bg-amber-500/[0.04] dark:border-amber-500/20 dark:text-amber-500/60 dark:hover:border-amber-500/35 dark:hover:text-amber-500/80",
  },
  playground: {
    icon: Gamepad2,
    route: "/ai-lab/lab/architecture",
    param: "module",
    accentClass:
      "border-brand/20 text-brand/70 hover:border-brand/35 hover:text-brand hover:bg-brand/[0.04] dark:border-brand/20 dark:text-brand/60 dark:hover:border-brand/35 dark:hover:text-brand/80",
  },
  forward: {
    icon: Layers,
    route: "/ai-lab/playground/forward",
    param: "stage",
    accentClass:
      "border-violet-500/20 text-violet-600/70 hover:border-violet-500/35 hover:text-violet-600 hover:bg-violet-500/[0.04] dark:border-violet-500/20 dark:text-violet-500/60 dark:hover:border-violet-500/35 dark:hover:text-violet-500/80",
  },
  inference: {
    icon: Cpu,
    route: "/ai-lab/inference",
    param: "prompt",
    accentClass:
      "border-cyan-500/20 text-cyan-600/70 hover:border-cyan-500/35 hover:text-cyan-600 hover:bg-cyan-500/[0.04] dark:border-cyan-500/20 dark:text-cyan-500/60 dark:hover:border-cyan-500/35 dark:hover:text-cyan-500/80",
  },
  training: {
    icon: GraduationCap,
    route: "/ai-lab/lab/training",
    param: "epochs",
    accentClass:
      "border-rose-500/20 text-rose-600/70 hover:border-rose-500/35 hover:text-rose-600 hover:bg-rose-500/[0.04] dark:border-rose-500/20 dark:text-rose-500/60 dark:hover:border-rose-500/35 dark:hover:text-rose-500/80",
  },
};

// ============================================================
// CrossRefButton
// ============================================================

export function CrossRefButton({
  variant,
  targetId,
  label,
  className,
}: CrossRefButtonProps) {
  const config = VARIANT_MAP[variant];
  const Icon = config.icon;
  const href = `${config.route}?${config.param}=${encodeURIComponent(targetId)}`;

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-300",
        config.accentClass,
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
      <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
    </Link>
  );
}
