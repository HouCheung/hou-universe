"use client";

// ============================================================
// ChatSidebar — Conversation history sidebar
// ============================================================
// Phase 69: Slide-out sidebar listing all conversations.
// Phase 73: Added rename support and improved empty state.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, Plus, MessageSquare } from "lucide-react";
import { ConversationListItem } from "./ConversationListItem";
import type { ChatConversationSummary } from "@/lib/minimind/research/ChatHistoryStore";

// ============================================================
// ChatSidebar
// ============================================================

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  conversations: ChatConversationSummary[];
  activeConversationId: string | undefined;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Phase 73: Rename callback */
  onRename: (id: string, newTitle: string) => void;
  onNew: () => void;
}

export function ChatSidebar({
  isOpen,
  onToggle,
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
  onRename,
  onNew,
}: ChatSidebarProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -280, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-brand/[0.06] bg-background/80 backdrop-blur-xl dark:border-white/[0.04] dark:bg-background/70 sm:relative sm:z-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-brand/[0.05] px-4 py-3 dark:border-white/[0.03]">
            <h2 className="font-mono text-[0.7rem] tracking-[0.1em] uppercase text-slate-500/70 dark:text-slate-400/50">
              {t("aiLab.chat.sidebar.title")}
            </h2>
            <div className="flex items-center gap-1">
              {/* New conversation */}
              <button
                type="button"
                onClick={onNew}
                aria-label={t("aiLab.chat.newConversation")}
                className="rounded-lg p-1.5 text-slate-500/60 transition-all duration-200 hover:bg-brand/[0.06] hover:text-brand dark:text-slate-400/50 dark:hover:text-brand/80"
              >
                <Plus className="size-4" />
              </button>

              {/* Close sidebar */}
              <button
                type="button"
                onClick={onToggle}
                aria-label="Close sidebar"
                className="rounded-lg p-1.5 text-slate-500/60 transition-all duration-200 hover:bg-brand/[0.06] hover:text-brand dark:text-slate-400/50 dark:hover:text-brand/80"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <MessageSquare className="size-8 text-slate-500/20 dark:text-slate-400/15" />
                <p className="font-mono text-[0.65rem] text-slate-500/40 dark:text-slate-400/30">
                  {t("aiLab.chat.sidebar.empty")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {conversations.map((conv) => (
                  <ConversationListItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeConversationId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onRename={onRename}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer: new conversation button */}
          <div className="border-t border-brand/[0.05] px-3 py-2.5 dark:border-white/[0.03]">
            <button
              type="button"
              onClick={onNew}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/10 bg-brand/[0.03] px-3 py-2 font-mono text-[0.7rem] tracking-wide text-brand/60 transition-all duration-200 hover:border-brand/20 hover:bg-brand/[0.08] hover:text-brand dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-brand/70 dark:hover:border-brand/25 dark:hover:bg-brand/[0.1]"
            >
              <Plus className="size-3.5" />
              {t("aiLab.chat.newConversation")}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
