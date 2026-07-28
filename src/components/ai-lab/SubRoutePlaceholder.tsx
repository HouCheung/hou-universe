"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

interface SubRoutePlaceholderProps {
  sectionNameKey: string;
}

export function SubRoutePlaceholder({ sectionNameKey }: SubRoutePlaceholderProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full border border-slate-500/[0.12] bg-slate-500/[0.03] dark:border-white/[0.04] dark:bg-white/[0.02]">
        <Construction className="size-7 text-slate-500/40 dark:text-slate-600" />
      </div>

      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
        {t("aiLab.comingSoon")}
      </h1>

      <p className="mt-3 max-w-md text-sm text-slate-500/80 dark:text-slate-500/70">
        <strong className="text-foreground/80">{t(sectionNameKey)}</strong>{" "}
        — {t("aiLab.comingSoonDesc")}
      </p>

      <Link
        href="/ai-lab"
        className="mt-8 inline-flex items-center gap-2 rounded-lg border border-brand/15 bg-brand/[0.04] px-5 py-2.5 text-sm font-medium text-brand/80 transition-all duration-300 hover:bg-brand/[0.08] hover:text-brand dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.06)] dark:text-brand-light/80 dark:hover:bg-[rgba(var(--brand-rgb),0.1)] dark:hover:text-brand-light"
      >
        <ArrowLeft className="size-4" />
        {t("aiLab.backToLab")}
      </Link>
    </div>
  );
}
