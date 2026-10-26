"use client";

// ============================================================
// ChatHeader — Compact MiniMind product header
// ============================================================
// Phase 69: Clean, minimal header with MiniMind title,
// subtitle, and model status badge.
//
// Phase 76: Header now reflects real model state (baseline /
// trained / training / generating) via ModelStatusBadge, and
// exposes "New chat" plus a shortcut into the Research area.
// Kept deliberately quiet so the conversation dominates.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { ModelStatusBadge, type ModelStatus } from "./ModelStatusBadge";

// ============================================================
// ChatHeader
// ============================================================

interface ChatHeaderProps {
  /** Real model state derived by MiniMindChatShell */
  modelStatus: ModelStatus;
  /** Checkpoint/session name when trained */
  checkpointName?: string;
  /** Start a new conversation */
  onNewConversation: () => void;
}

export function ChatHeader({
  modelStatus,
  checkpointName,
  onNewConversation,
}: ChatHeaderProps) {
  const { t } = useTranslation();

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative flex flex-col items-center gap-4 px-4 pb-6 pt-8 sm:pt-10"
    >
      {/* ── Top-right controls ── */}
      <div className="absolute right-4 top-5 flex items-center gap-2 sm:right-6 sm:top-6">
        <Link
          href="/ai-lab/lab/research"
          className="group hidden items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-[0.65rem] tracking-wide text-slate-500/60 transition-colors hover:text-brand sm:inline-flex dark:text-slate-400/50 dark:hover:text-brand/80"
        >
          {t("aiLab.chat.openLab")}
          <ArrowUpRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
        <button
          type="button"
          onClick={onNewConversation}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/10 bg-brand/[0.03] px-2.5 py-1.5 font-mono text-[0.65rem] tracking-wide text-brand/70 transition-all duration-200 hover:border-brand/20 hover:bg-brand/[0.08] hover:text-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-brand/70 dark:hover:border-brand/25 dark:hover:bg-brand/[0.1]"
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">{t("aiLab.chat.newChat")}</span>
        </button>
      </div>

      {/* ── Identity ── */}
      <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
        {t("aiLab.chat.title")}
      </h1>

      <p className="-mt-2 font-mono text-xs tracking-wide text-slate-500/70 dark:text-slate-400/50">
        {t("aiLab.chat.subtitle")}
      </p>

      {/* Real model status */}
      <div className="mt-1">
        <ModelStatusBadge status={modelStatus} checkpointName={checkpointName} />
      </div>
    </motion.header>
  );
}
