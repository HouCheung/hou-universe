"use client";

// ============================================================
// PublicResearchPage — curated public MiniMind research record
// ============================================================
// This page is intentionally server-readable content in a client
// shell: every display string comes from the shared i18n locale
// files, while the structure/status data lives in
// src/data/minimind/public-research.ts.
//
// It publishes frozen verdicts, including negative and blocked
// outcomes. Do not promote an "Experimental" or "Planned" item to
// "Completed" without a frozen report and audit trail.
// ============================================================

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Binary,
  Brain,
  Clock3,
  Code2,
  Cpu,
  FlaskConical,
  Gauge,
  Layers,
  Microscope,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import {
  PHASE_124_GATES,
  PRODUCTION_MODEL,
  RESEARCH_PHASES,
  RESEARCH_ROADMAP,
  RESEARCH_STATUSES,
  type Phase124Gate,
  type ResearchPhase,
  type ResearchStatus,
  type VerdictTone,
} from "@/data/minimind/public-research";
import { cn } from "@/lib/utils";

// ============================================================
// Style maps
// ============================================================

const STATUS_STYLES: Record<ResearchStatus, string> = {
  completed:
    "border-slate-400/25 bg-slate-400/[0.06] text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300",
  experimental:
    "border-amber-500/25 bg-amber-500/[0.07] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-300",
  "in-progress":
    "border-brand/25 bg-brand/[0.07] text-brand dark:border-brand/30 dark:bg-brand/[0.08] dark:text-brand-light",
  blocked:
    "border-red-500/25 bg-red-500/[0.07] text-red-700 dark:border-red-400/20 dark:bg-red-400/[0.06] dark:text-red-300",
  planned:
    "border-slate-400/20 bg-transparent text-slate-500 dark:border-white/[0.06] dark:text-slate-400",
};

const VERDICT_STYLES: Record<VerdictTone, string> = {
  positive:
    "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-400/[0.05] dark:text-emerald-300",
  caution:
    "border-amber-500/20 bg-amber-500/[0.06] text-amber-700 dark:border-amber-400/15 dark:bg-amber-400/[0.05] dark:text-amber-300",
  negative:
    "border-red-500/20 bg-red-500/[0.06] text-red-700 dark:border-red-400/15 dark:bg-red-400/[0.05] dark:text-red-300",
  neutral:
    "border-slate-400/20 bg-slate-400/[0.04] text-slate-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-300",
};

const GATE_STYLES: Record<Phase124Gate["tone"], string> = {
  ready:
    "border-brand/25 bg-brand/[0.06] text-brand dark:border-brand/25 dark:bg-brand/[0.07] dark:text-brand-light",
  blocked:
    "border-red-500/25 bg-red-500/[0.06] text-red-700 dark:border-red-400/20 dark:bg-red-400/[0.05] dark:text-red-300",
  design:
    "border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.05] dark:text-amber-300",
  partial:
    "border-slate-400/25 bg-slate-400/[0.06] text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300",
};

// ============================================================
// Small building blocks
// ============================================================

function StatusBadge({ status }: { status: ResearchStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.6rem] font-medium tracking-wide uppercase",
        STATUS_STYLES[status],
      )}
    >
      {t(`aiLab.publicResearch.status.items.${status}.label`)}
    </span>
  );
}

function SectionHeading({
  title,
  intro,
}: {
  title: string;
  intro?: string;
}) {
  return (
    <div className="mb-6 sm:mb-8">
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {intro && (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {intro}
        </p>
      )}
    </div>
  );
}

function ConfigCell({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-brand/[0.08] bg-brand/[0.02] p-3.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
      <div className="mb-1.5 flex items-center gap-1.5 text-slate-500/70 dark:text-slate-400/60">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[0.65rem] leading-tight">{label}</span>
      </div>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

// ============================================================
// Phase card
// ============================================================

function PhaseCard({ phase }: { phase: ResearchPhase }) {
  const { t } = useTranslation();
  const base = `aiLab.publicResearch.phases.items.${phase.id}`;

  return (
    <article
      className={cn(
        "glass-card flex min-w-0 flex-col rounded-2xl p-5 transition-colors duration-300",
        "hover:border-brand/20 dark:hover:border-brand/20",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold tracking-tight text-foreground">
          {phase.label}
        </span>
        <StatusBadge status={phase.status} />
        <span className="rounded-md border border-slate-400/15 bg-slate-400/[0.04] px-1.5 py-0.5 text-[0.6rem] text-slate-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-slate-400">
          {t(`aiLab.publicResearch.tags.${phase.tag}`)}
        </span>
      </div>

      <span
        className={cn(
          "mb-3 inline-flex w-fit max-w-full rounded-md border px-2 py-0.5 text-[0.65rem] leading-relaxed font-medium break-words",
          VERDICT_STYLES[phase.verdictTone],
        )}
      >
        {t(`${base}.verdict`)}
      </span>

      <h3 className="mb-2 text-sm leading-relaxed font-semibold text-foreground">
        {t(`${base}.question`)}
      </h3>

      <div className="mb-3">
        <span className="font-mono text-[0.6rem] tracking-[0.12em] text-slate-400/70 uppercase dark:text-slate-500/60">
          {t("aiLab.publicResearch.phases.resultLabel")}
        </span>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {t(`${base}.result`)}
        </p>
      </div>

      <div className="mt-auto rounded-lg border border-slate-400/10 bg-slate-400/[0.02] px-3 py-2.5 dark:border-white/[0.04] dark:bg-white/[0.015]">
        <span className="font-mono text-[0.6rem] tracking-[0.12em] text-slate-400/70 uppercase dark:text-slate-500/60">
          {t("aiLab.publicResearch.phases.limitationLabel")}
        </span>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t(`${base}.limitation`)}
        </p>
      </div>
    </article>
  );
}

// ============================================================
// PublicResearchPage
// ============================================================

export function PublicResearchPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ResearchStatus | "all">("all");

  const filters = useMemo(
    () =>
      (["all", "completed", "experimental", "in-progress", "blocked"] as const).map(
        (value) => ({
          value,
          count:
            value === "all"
              ? RESEARCH_PHASES.length
              : RESEARCH_PHASES.filter((phase) => phase.status === value).length,
        }),
      ),
    [],
  );

  const visiblePhases = useMemo(
    () =>
      filter === "all"
        ? RESEARCH_PHASES
        : RESEARCH_PHASES.filter((phase) => phase.status === filter),
    [filter],
  );

  const pipeline = t("aiLab.publicResearch.architecture.pipeline", {
    returnObjects: true,
  }) as unknown as string[];

  const limitationItems = t("aiLab.publicResearch.limitations.items", {
    returnObjects: true,
  }) as unknown as string[];

  const configCells: Array<{ icon: LucideIcon; labelKey: string; value: string }> = [
    {
      icon: Cpu,
      labelKey: "parameters",
      value: PRODUCTION_MODEL.parameters,
    },
    {
      icon: Binary,
      labelKey: "vocabSize",
      value: PRODUCTION_MODEL.vocabSize,
    },
    {
      icon: Brain,
      labelKey: "dModel",
      value: PRODUCTION_MODEL.dModel,
    },
    {
      icon: Layers,
      labelKey: "numLayers",
      value: PRODUCTION_MODEL.numLayers,
    },
    {
      icon: Gauge,
      labelKey: "numHeads",
      value: PRODUCTION_MODEL.numHeads,
    },
    {
      icon: Layers,
      labelKey: "dFF",
      value: PRODUCTION_MODEL.dFF,
    },
    {
      icon: Clock3,
      labelKey: "maxSeqLen",
      value: PRODUCTION_MODEL.maxSeqLen,
    },
    {
      icon: Code2,
      labelKey: "tokenizer",
      value: t("aiLab.publicResearch.architecture.tokenizerValue"),
    },
  ];

  return (
    <main className="relative">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:pt-10 lg:px-8 max-sm:px-5 max-sm:pt-6 max-sm:pb-16">
        {/* Back link */}
        <Link
          href="/ai-lab"
          className="mb-8 inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-brand dark:text-slate-400 dark:hover:text-brand-light sm:mb-10"
        >
          <ArrowLeft className="size-3.5" />
          {t("aiLab.publicResearch.cta.back")}
        </Link>

        {/* Hero */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-10 sm:mb-14"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand/20 bg-brand/[0.05] px-2.5 py-0.5 font-mono text-[0.65rem] tracking-wide text-brand dark:text-brand-light">
              {t("aiLab.publicResearch.eyebrow")}
            </span>
            <span className="font-mono text-[0.65rem] text-slate-400/70 dark:text-slate-500/60">
              {t("aiLab.publicResearch.updated")}
            </span>
          </div>
          <h1 className="max-w-3xl text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("aiLab.publicResearch.title")}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("aiLab.publicResearch.subtitle")}
          </p>
          <p className="mt-3 max-w-3xl border-l-2 border-amber-500/30 pl-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t("aiLab.publicResearch.disclaimer")}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["params", "params"],
                ["vocab", "vocab"],
                ["facts", "facts"],
                ["seeds", "seeds"],
              ] as const
            ).map(([key, labelKey]) => (
              <div
                key={key}
                className="rounded-xl border border-brand/[0.08] bg-brand/[0.02] px-3.5 py-3 dark:border-white/[0.05] dark:bg-white/[0.02]"
              >
                <p className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                  {t(`aiLab.publicResearch.stats.${labelKey}.label`)}
                </p>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                  {t(`aiLab.publicResearch.stats.${labelKey}.value`)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[0.65rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
            {t("aiLab.publicResearch.stats.note")}
          </p>
        </motion.header>

        {/* Status legend */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.status.title")}
            intro={t("aiLab.publicResearch.status.intro")}
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {RESEARCH_STATUSES.map((status) => (
              <div
                key={status}
                className="rounded-xl border border-slate-400/10 bg-slate-400/[0.02] p-3 dark:border-white/[0.04] dark:bg-white/[0.015]"
              >
                <StatusBadge status={status} />
                <p className="mt-2 text-[0.7rem] leading-relaxed text-slate-500 dark:text-slate-400">
                  {t(`aiLab.publicResearch.status.items.${status}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.architecture.title")}
            intro={t("aiLab.publicResearch.architecture.intro")}
          />
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Cpu className="size-4 text-brand/60" />
                {t("aiLab.publicResearch.architecture.configTitle")}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {configCells.map((cell) => (
                  <ConfigCell
                    key={cell.labelKey}
                    icon={cell.icon}
                    label={t(
                      `aiLab.publicResearch.architecture.labels.${cell.labelKey}`,
                    )}
                    value={cell.value}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {t("aiLab.publicResearch.architecture.note")}
              </p>
            </div>

            <div className="glass-card rounded-2xl p-5 sm:p-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Binary className="size-4 text-brand/60" />
                {t("aiLab.publicResearch.architecture.pipelineTitle")}
              </h3>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {pipeline.map((step, index) => (
                  <Fragment key={step}>
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-brand/[0.08] bg-brand/[0.02] px-2.5 py-2.5 text-center text-[0.7rem] leading-snug text-slate-600 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-slate-300">
                      {step}
                    </div>
                    {index < pipeline.length - 1 && (
                      <ArrowRight className="mx-auto size-3.5 shrink-0 rotate-90 text-brand/35 sm:rotate-0" />
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Research log */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.phases.title")}
            intro={t("aiLab.publicResearch.phases.intro")}
          />

          <div className="mb-5 flex flex-wrap gap-2">
            {filters.map((item) => {
              const active = filter === item.value;
              const label =
                item.value === "all"
                  ? t("aiLab.publicResearch.phases.filterAll")
                  : t(
                      `aiLab.publicResearch.status.items.${item.value}.label`,
                    );
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-200",
                    active
                      ? "border-brand/30 bg-brand/[0.08] text-brand dark:text-brand-light"
                      : "border-slate-400/15 bg-transparent text-slate-500 hover:border-brand/20 hover:text-foreground dark:border-white/[0.06] dark:text-slate-400 dark:hover:text-slate-200",
                  )}
                >
                  {label}
                  <span className="font-mono text-[0.6rem] tabular-nums opacity-60">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>

          {visiblePhases.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-400/20 p-8 text-center text-sm text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
              {t("aiLab.publicResearch.phases.empty")}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visiblePhases.map((phase) => (
                <PhaseCard key={phase.id} phase={phase} />
              ))}
            </div>
          )}
        </section>

        {/* Phase 124 gates */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.phase124.title")}
            intro={t("aiLab.publicResearch.phase124.intro")}
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {PHASE_124_GATES.map((gate) => (
              <div
                key={gate.id}
                className="glass-card rounded-xl p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-brand/15 bg-brand/[0.05] font-mono text-[0.65rem] font-bold text-brand dark:text-brand-light">
                    {gate.gate}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {t(`aiLab.publicResearch.phase124.gates.${gate.id}`)}
                  </span>
                </div>
                <span
                  className={cn(
                    "inline-flex rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] leading-relaxed font-semibold tracking-wide uppercase",
                    GATE_STYLES[gate.tone],
                  )}
                >
                  {gate.status}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t("aiLab.publicResearch.phase124.note")}
          </p>
        </section>

        {/* Findings */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.findings.title")}
            intro={t("aiLab.publicResearch.findings.intro")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              ["memory", "paraphrase", "unseen", "augmentation"] as const
            ).map((key) => (
              <div key={key} className="glass-card rounded-2xl p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t(`aiLab.publicResearch.findings.items.${key}.title`)}
                  </h3>
                  <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-brand/80 dark:text-brand-light/80">
                    {t(`aiLab.publicResearch.findings.items.${key}.metric`)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {t(`aiLab.publicResearch.findings.items.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Limitations */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.limitations.title")}
            intro={t("aiLab.publicResearch.limitations.intro")}
          />
          <div className="glass-card rounded-2xl p-5 sm:p-6">
            <ul className="space-y-3">
              {limitationItems.map((item, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500/60" />
                  <span className="min-w-0 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Roadmap */}
        <section className="mb-14 sm:mb-20">
          <SectionHeading
            title={t("aiLab.publicResearch.roadmap.title")}
            intro={t("aiLab.publicResearch.roadmap.intro")}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {RESEARCH_ROADMAP.map((item, index) => (
              <div
                key={item.id}
                className="glass-card flex min-w-0 flex-col rounded-2xl p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-[0.65rem] text-slate-400/70 dark:text-slate-500/60">
                    0{index + 1}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {t(`aiLab.publicResearch.roadmap.items.${item.id}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {t(`aiLab.publicResearch.roadmap.items.${item.id}.body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Source */}
        <section className="mb-12">
          <div className="rounded-2xl border border-dashed border-slate-400/20 bg-slate-400/[0.02] p-5 dark:border-white/[0.08] dark:bg-white/[0.015] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Code2 className="size-4 text-brand/60" />
                  {t("aiLab.publicResearch.source.title")}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {t("aiLab.publicResearch.source.body")}
                </p>
              </div>
              <span className="shrink-0 self-start rounded-full border border-slate-400/20 bg-slate-400/[0.05] px-3 py-1 font-mono text-[0.65rem] text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400">
                {t("aiLab.publicResearch.source.comingSoon")}
              </span>
            </div>
            <p className="mt-3 text-[0.65rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
              {t("aiLab.publicResearch.source.note")}
            </p>
          </div>
        </section>

        {/* Related links */}
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/ai-lab/lab/architecture"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/[0.05] px-3.5 py-2 text-xs font-medium text-brand transition-colors hover:bg-brand/[0.09] dark:text-brand-light"
          >
            <Microscope className="size-3.5" />
            {t("aiLab.publicResearch.cta.architecture")}
            <ArrowRight className="size-3" />
          </Link>
          <Link
            href="/ai-lab/lab/experiments"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/15 bg-transparent px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-brand/20 hover:text-foreground dark:border-white/[0.06] dark:text-slate-300"
          >
            <FlaskConical className="size-3.5" />
            {t("aiLab.publicResearch.cta.experiments")}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </main>
  );
}
