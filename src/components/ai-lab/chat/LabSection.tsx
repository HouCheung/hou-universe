"use client";

// ============================================================
// LabSection — "Research Hub" with live data
// ============================================================
// Phase 73: Replaced 6 static cards with a live-updating
// Research Hub that pulls real data from the adapter layer.
// Shows experiment/training/generation status, and falls
// back to a "Getting Started" narrative when no data exists.
// ============================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FlaskConical,
  Sparkles,
  TrendingUp,
  Microscope,
  Layers,
  BarChart3,
  MessageSquare,
  Activity,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LabCard } from "./LabCard";
import { getWorkspaceOverview } from "@/lib/ai-lab/adapters/experimentLauncherAdapter";
import { getActiveTrainingStatusBadge } from "@/lib/ai-lab/adapters/liveTrainingAdapter";
import { getGenerationHistory } from "@/lib/ai-lab/adapters/generationAdapter";
import { getChatConversationCount } from "@/lib/ai-lab/adapters/chatAdapter";
import { getHistoryOverview } from "@/lib/ai-lab/adapters/historyAdapter";
import type { ExperimentWorkspaceOverview } from "@/lib/ai-lab/adapters/experimentLauncherAdapter";
import type { TrainingStatusBadge } from "@/lib/ai-lab/adapters/liveTrainingAdapter";

// ============================================================
// Types
// ============================================================

interface HubData {
  experiments: ExperimentWorkspaceOverview | null;
  training: TrainingStatusBadge | null;
  generationCount: number;
  chatCount: number;
  hasAnyData: boolean;
}

// ============================================================
// Helpers
// ============================================================

function loadHubData(): HubData {
  try {
    const experiments = getWorkspaceOverview();
    const training = getActiveTrainingStatusBadge();
    const generation = getGenerationHistory();
    const historyOverview = getHistoryOverview();
    const chatCount = getChatConversationCount();

    const hasAnyData =
      (experiments && experiments.stats.total > 0) ||
      (training && training.status !== "idle") ||
      generation.totalCount > 0 ||
      chatCount > 0 ||
      historyOverview.totalRuns > 0;

    return {
      experiments: experiments ?? null,
      training: training ?? null,
      generationCount: generation?.totalCount ?? 0,
      chatCount,
      hasAnyData,
    };
  } catch {
    return {
      experiments: null,
      training: null,
      generationCount: 0,
      chatCount: 0,
      hasAnyData: false,
    };
  }
}

// ============================================================
// StatChip — small stat display
// ============================================================

function StatChip({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-brand/[0.06] bg-brand/[0.02] px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.01]">
      <Icon
        className={`size-3.5 ${active ? "text-emerald-500/80" : "text-brand/50"}`}
      />
      <span className="font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/40">
        {label}
      </span>
      <span className="ml-auto font-mono text-xs font-semibold tracking-tight text-foreground/80">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      {active && (
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
    </div>
  );
}

// ============================================================
// GettingStarted — shown when no data exists yet
// ============================================================

function GettingStarted({ t }: { t: (key: string) => string }) {
  const steps = [
    {
      icon: MessageSquare,
      title: t("aiLab.chat.lab.gettingStarted.step1.title"),
      description: t("aiLab.chat.lab.gettingStarted.step1.description"),
    },
    {
      icon: TrendingUp,
      title: t("aiLab.chat.lab.gettingStarted.step2.title"),
      description: t("aiLab.chat.lab.gettingStarted.step2.description"),
    },
    {
      icon: Sparkles,
      title: t("aiLab.chat.lab.gettingStarted.step3.title"),
      description: t("aiLab.chat.lab.gettingStarted.step3.description"),
    },
    {
      icon: FlaskConical,
      title: t("aiLab.chat.lab.gettingStarted.step4.title"),
      description: t("aiLab.chat.lab.gettingStarted.step4.description"),
    },
  ];

  return (
    <div className="mb-8 rounded-2xl border border-brand/10 bg-gradient-to-br from-brand/[0.04] to-brand/[0.01] p-6 dark:border-white/[0.06] dark:from-white/[0.02] dark:to-transparent sm:p-8">
      <div className="mb-5 flex items-center gap-2.5">
        <Zap className="size-4 text-brand/60" />
        <h3 className="font-mono text-[0.75rem] font-semibold tracking-[0.06em] uppercase text-brand/80">
          {t("aiLab.chat.lab.gettingStarted.title")}
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="flex gap-3 rounded-xl border border-brand/[0.05] bg-brand/[0.02] p-4 dark:border-white/[0.03] dark:bg-white/[0.01]"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand/[0.08] bg-brand/[0.04] text-brand/50 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <step.icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground/85">
                {step.title}
              </p>
              <p className="mt-0.5 text-[0.7rem] leading-relaxed text-slate-500/60 dark:text-slate-400/45">
                {step.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Lab entries — navigation links enriched with live data
// ============================================================

interface LabEntry {
  key: string;
  icon: LucideIcon;
  href: string;
}

const LAB_ENTRIES: LabEntry[] = [
  { key: "training", icon: TrendingUp, href: "/ai-lab/lab/training" },
  { key: "generation", icon: Sparkles, href: "/ai-lab/lab/generation" },
  { key: "experiments", icon: FlaskConical, href: "/ai-lab/lab/experiments" },
  { key: "evaluation", icon: BarChart3, href: "/ai-lab/lab/evaluation" },
  { key: "research", icon: Microscope, href: "/ai-lab/lab/research" },
  { key: "architecture", icon: Layers, href: "/ai-lab/lab/architecture" },
];

// ============================================================
// LabSection
// ============================================================

export function LabSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<HubData>(() => loadHubData());

  // Refresh hub data every 30s so training/generation status stays current
  useEffect(() => {
    const interval = setInterval(() => {
      setData(loadHubData());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const isTrainingActive =
    data.training?.status === "running" || data.training?.status === "paused";

  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6"
    >
      {/* ── Divider ── */}
      <div className="mb-8 flex items-center gap-4">
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-gradient-to-r from-transparent via-brand/10 to-transparent"
        />
        <span className="font-mono text-[0.65rem] tracking-[0.12em] uppercase text-slate-500/50 dark:text-slate-400/40">
          {t("aiLab.chat.lab.title")}
        </span>
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-gradient-to-r from-transparent via-brand/10 to-transparent"
        />
      </div>

      {/* ── Narrative (Phase 76) — the engineering story ── */}
      <p className="mx-auto mb-8 max-w-2xl text-center text-sm leading-relaxed text-slate-500/70 dark:text-slate-400/50">
        {t("aiLab.chat.lab.narrative")}
      </p>

      {/* ── Getting Started (no data) ── */}
      {!data.hasAnyData && <GettingStarted t={t} />}

      {/* ── Stats bar (with data) ── */}
      {data.hasAnyData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <StatChip
            icon={BarChart3}
            label={t("aiLab.chat.lab.stats.experiments")}
            value={data.experiments?.stats.total ?? 0}
          />
          <StatChip
            icon={Activity}
            label={t("aiLab.chat.lab.stats.training")}
            value={data.training?.label ?? t("aiLab.chat.lab.stats.idle")}
            active={isTrainingActive}
          />
          <StatChip
            icon={Sparkles}
            label={t("aiLab.chat.lab.stats.generations")}
            value={data.generationCount}
          />
          <StatChip
            icon={MessageSquare}
            label={t("aiLab.chat.lab.stats.chats")}
            value={data.chatCount}
          />
        </motion.div>
      )}

      {/* ── Lab cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_ENTRIES.map((entry, index) => {
          // Enrich card descriptions with live data
          let liveBadge: string | undefined;
          if (entry.key === "experiments" && data.experiments) {
            liveBadge =
              data.experiments.stats.total > 0
                ? `${data.experiments.stats.total} ${t("aiLab.chat.lab.badges.experiments")}`
                : undefined;
          } else if (entry.key === "training" && data.training) {
            liveBadge = data.training.label;
          } else if (entry.key === "generation" && data.generationCount > 0) {
            liveBadge = `${data.generationCount} ${t("aiLab.chat.lab.badges.generations")}`;
          }

          return (
            <LabCard
              key={entry.key}
              icon={entry.icon}
              title={t(`aiLab.chat.lab.${entry.key}.title`)}
              description={t(`aiLab.chat.lab.${entry.key}.description`)}
              href={entry.href}
              index={index}
              liveBadge={liveBadge}
            />
          );
        })}
      </div>

      {/* Public research record */}
      <div className="mt-5 flex justify-center">
        <Link
          href="/ai-lab/research"
          className="group inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.04] px-4 py-2 text-xs font-medium text-brand transition-colors duration-200 hover:border-brand/35 hover:bg-brand/[0.08] dark:text-brand-light"
        >
          <Microscope className="size-3.5" />
          {t("aiLab.publicResearch.cta.view")}
          <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </motion.section>
  );
}
