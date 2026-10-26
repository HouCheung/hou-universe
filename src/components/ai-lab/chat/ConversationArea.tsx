"use client";

// ============================================================
// ConversationArea — Scrollable message list
// ============================================================
// Phase 69/71: Displays all messages in the current conversation.
// Auto-scrolls to bottom on new messages. Shows empty state
// when no messages exist. Phase 71: shows real-time streaming
// assistant response during generation.
//
// Phase 72: Accepts generationState, generationError, and
// retry/regenerate callbacks. Passes them to ChatMessage for
// error UI and action buttons. No longer hides system messages
// unconditionally — allows failed/error states to render.
// ============================================================

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ChatMessage } from "./ChatMessage";
import { WelcomeEmptyState } from "./WelcomeEmptyState";
import type { ChatMessage as ChatMessageType, ChatGenerationStatus } from "@/lib/minimind/research/ChatHistoryStore";

// ============================================================
// ConversationArea
// ============================================================

interface ConversationAreaProps {
  messages: ChatMessageType[];
  /** Phase 72: Authoritative generation state */
  generationState: ChatGenerationStatus;
  /** Phase 72: Error message for failed generation */
  generationError?: string | null;
  /** Real-time streaming text (Phase 71) */
  streamingText?: string;
  /** Current streaming token count (Phase 71) */
  streamingTokenCount?: number;
  /** Phase 72: Retry callback */
  onRetry?: () => void;
  /** Phase 72: Regenerate callback */
  onRegenerate?: () => void;
  /** Phase 73: Suggested prompt click handler */
  onPromptClick?: (prompt: string) => void;
  /** Whether the model is untrained (baseline) — drives the welcome warning */
  isBaseline?: boolean;
}

export function ConversationArea({
  messages,
  generationState,
  generationError = null,
  streamingText = "",
  streamingTokenCount = 0,
  onRetry,
  onRegenerate,
  onPromptClick,
  isBaseline = false,
}: ConversationAreaProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generationState, streamingText]);

  const isBusy = generationState === "starting" ||
    generationState === "streaming" ||
    generationState === "stopping";

  // ── Empty state: welcome screen with branding + suggested prompts ──
  if (messages.length === 0 && !isBusy) {
    return (
      <WelcomeEmptyState
        onPromptClick={onPromptClick ?? (() => {})}
        isBaseline={isBaseline}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-1 py-2">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        {messages
          .filter((m) => {
            // Phase 72: Show all messages including system, but hide
            // old-style system error messages (those without generationStatus)
            if (m.role === "system") {
              return false;
            }
            return true;
          })
          .map((message, index) => {
            const isLastAssistant =
              message.role === "assistant" &&
              index === messages.filter((m) => m.role !== "system").length - 1;

            return (
              <ChatMessage
                key={message.id}
                message={message}
                index={index}
                isStreaming={false}
                generationState={
                  isLastAssistant ? message.generationStatus || "completed" : "completed"
                }
                errorMessage={
                  isLastAssistant && message.generationStatus === "failed"
                    ? generationError
                    : null
                }
                onRetry={
                  isLastAssistant && message.generationStatus === "failed"
                    ? onRetry
                    : undefined
                }
                onRegenerate={
                  isLastAssistant && message.generationStatus === "completed"
                    ? onRegenerate
                    : undefined
                }
              />
            );
          })}

        {/* Phase 72: Real streaming assistant message */}
        {isBusy && (
          <>
            {streamingTokenCount > 0 ? (
              <ChatMessage
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: streamingText,
                  generationStatus: generationState,
                  timestamp: Date.now(),
                }}
                index={messages.length}
                isStreaming
                generationState={generationState}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-3 sm:px-6"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-brand/10 bg-brand/[0.04] sm:size-8">
                  <span className="size-2 rounded-full bg-brand/60 animate-pulse" />
                </div>
                <span className="font-mono text-xs tracking-wide text-slate-500/60 dark:text-slate-400/40">
                  {generationState === "starting"
                    ? t("aiLab.chat.thinking")
                    : t("aiLab.chat.generating")}
                </span>
              </motion.div>
            )}
          </>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
