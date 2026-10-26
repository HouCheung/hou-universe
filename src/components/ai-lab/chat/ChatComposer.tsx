"use client";

// ============================================================
// ChatComposer — Message input area
// ============================================================
// Phase 69: Textarea-based composer with send button.
// Supports Enter to send, Shift+Enter for newline.
// Disabled during generation.
// ============================================================

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Send, Square, Loader2 } from "lucide-react";
import type { ChatGenerationStatus } from "@/lib/minimind/research/ChatHistoryStore";

// ============================================================
// ChatComposer
// ============================================================

interface ChatComposerProps {
  onSubmit: (message: string) => void;
  onStop?: () => void;
  /** Phase 72: Authoritative generation state — replaces isGenerating boolean */
  generationState: ChatGenerationStatus;
}

export function ChatComposer({ onSubmit, onStop, generationState }: ChatComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isBusy = generationState === "starting" ||
    generationState === "streaming" ||
    generationState === "stopping";
  const isStopping = generationState === "stopping";

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;
    onSubmit(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isBusy, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
      className="sticky bottom-0 z-10 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-brand/[0.08] bg-background/70 px-3 py-2 backdrop-blur-xl transition-all duration-300 focus-within:border-brand/20 focus-within:shadow-[0_0_24px_rgba(var(--brand-rgb),0.06)] dark:border-white/[0.06] dark:bg-background/60 sm:px-4 sm:py-3">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("aiLab.chat.composerPlaceholder")}
          disabled={isBusy}
          rows={1}
          className="min-h-[24px] flex-1 resize-none bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-slate-500/50 focus:outline-none disabled:opacity-50 sm:text-base dark:placeholder:text-slate-400/30"
          aria-label={t("aiLab.chat.composerPlaceholder")}
        />

        {/* Phase 72: Stop / Stopping / Send button */}
        {isStopping ? (
          <button
            type="button"
            disabled
            aria-label={t("aiLab.chat.stopping")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/[0.08] text-amber-400"
          >
            <Loader2 className="size-3.5 animate-spin" />
          </button>
        ) : isBusy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t("aiLab.chat.stop")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/[0.08] text-red-400 transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/[0.15] hover:text-red-300"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!value.trim()}
            aria-label={t("aiLab.chat.send")}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand/10 bg-brand/[0.06] text-brand/60 transition-all duration-200 hover:border-brand/20 hover:bg-brand/[0.12] hover:text-brand disabled:border-brand/[0.04] disabled:bg-brand/[0.02] disabled:text-brand/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-brand/70 dark:hover:border-brand/25 dark:hover:bg-brand/[0.12] dark:disabled:border-white/[0.03] dark:disabled:bg-white/[0.01] dark:disabled:text-slate-500/20"
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
