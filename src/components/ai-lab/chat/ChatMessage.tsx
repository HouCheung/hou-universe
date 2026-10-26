"use client";

// ============================================================
// ChatMessage — Individual message bubble
// ============================================================
// Phase 69/71: Renders a single chat message with role-based
// styling. Phase 71: supports isStreaming for real-time
// token-by-token display without re-animation.
//
// Phase 72: Added error UI with retry button, regenerate button
// for completed messages, empty response state, and
// generationStatus-driven rendering.
//
// Phase 73: Added markdown rendering (react-markdown + GFM +
// syntax highlighting), code block copy button, and message
// copy button.
// ============================================================

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { User, Sparkles, RefreshCw, AlertTriangle, RotateCcw, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType, ChatGenerationStatus } from "@/lib/minimind/research/ChatHistoryStore";

// ============================================================
// CodeBlock — Fenced code block with copy button
// ============================================================

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — silently fail
    }
  }, [children]);

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-brand/[0.08] dark:border-white/[0.06]">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-slate-500/[0.04] px-3 py-1.5 dark:bg-white/[0.02]">
        <span className="font-mono text-[0.6rem] tracking-wider text-slate-400/60 dark:text-slate-500/50">
          {language ?? "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] text-slate-400/50 opacity-0 transition-all duration-200 hover:text-slate-600 group-hover/code:opacity-100 dark:text-slate-500/50 dark:hover:text-slate-300"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check className="size-2.5 text-emerald-500" />
          ) : (
            <Copy className="size-2.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-slate-700 dark:text-slate-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ============================================================
// MarkdownRenderer — GFM markdown with styled code blocks
// ============================================================

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Fenced code blocks
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? "");
          const isInline = !match && !String(children).includes("\n");
          if (isInline) {
            return (
              <code
                className="rounded bg-slate-500/[0.06] px-1 py-0.5 font-mono text-[0.8em] text-brand/80 dark:bg-white/[0.06]"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <CodeBlock language={match?.[1]}>
              {String(children).replace(/\n$/, "")}
            </CodeBlock>
          );
        },
        // Links open in new tab
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand/70 underline decoration-brand/20 underline-offset-2 transition-colors hover:text-brand hover:decoration-brand/40"
            >
              {children}
            </a>
          );
        },
        // Bold
        strong({ children }) {
          return <strong className="font-semibold text-foreground/90">{children}</strong>;
        },
        // Italic
        em({ children }) {
          return <em className="italic text-foreground/80">{children}</em>;
        },
        // Lists
        ul({ children }) {
          return <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>;
        },
        // Paragraphs — use div to avoid margin collapse issues
        p({ children }) {
          return <div className="leading-relaxed">{children}</div>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ============================================================
// ChatMessage
// ============================================================

interface ChatMessageProps {
  message: ChatMessageType;
  index: number;
  /** When true, skips entrance animation — content is streaming (Phase 71) */
  isStreaming?: boolean;
  /** Phase 72: Authoritative generation state for this message */
  generationState?: ChatGenerationStatus;
  /** Phase 72: Error message for failed generation */
  errorMessage?: string | null;
  /** Phase 72: Retry callback for failed messages */
  onRetry?: () => void;
  /** Phase 72: Regenerate callback for completed messages */
  onRegenerate?: () => void;
}

export function ChatMessage({
  message,
  index,
  isStreaming = false,
  generationState = "completed",
  errorMessage = null,
  onRetry,
  onRegenerate,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const isFailed = generationState === "failed";
  const isEmpty =
    isAssistant && !message.content.trim() && generationState === "completed";
  const isEmptyByStop =
    isAssistant && !message.content.trim() && generationState === "stopped";

  // Phase 73: Copy entire message content
  const handleCopyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [message.content]);

  // ── System messages: render subtly ──
  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="flex justify-center px-4 py-2"
      >
        <span className="font-mono text-[0.65rem] text-slate-500/60 dark:text-slate-400/40">
          {message.content}
        </span>
      </motion.div>
    );
  }

  // ── Phase 72: Failed state ──
  if (isFailed && isAssistant) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
        className="flex px-4 py-3 sm:px-6 justify-start"
      >
        <div className="group relative flex max-w-[85%] sm:max-w-[75%] flex-row gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-red-500/20 bg-red-500/[0.06] sm:size-8">
            <AlertTriangle className="size-3.5 text-red-500/60 sm:size-4" />
          </div>
          <div className="relative rounded-2xl rounded-tl-md border border-red-500/[0.08] bg-red-500/[0.02] px-4 py-3 sm:px-5 sm:py-3.5">
            <span
              aria-hidden="true"
              className="absolute inset-y-3 left-0 w-px rounded-full bg-gradient-to-b from-red-500/30 via-red-500/15 to-transparent"
            />
            <p className="text-sm font-medium text-red-600/80 dark:text-red-400/70">
              {t("aiLab.chat.generationFailed")}
            </p>
            {errorMessage && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500/70 dark:text-slate-400/50 max-w-md">
                {errorMessage}
              </p>
            )}
            {onRetry && (
              <button
                type="button"
                disabled={isRetrying}
                onClick={() => {
                  setIsRetrying(true);
                  onRetry();
                  setTimeout(() => setIsRetrying(false), 1000);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/[0.04] px-3 py-1.5 text-xs font-medium text-brand/70 transition-all duration-200 hover:bg-brand/[0.08] hover:border-brand/30 disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-3 ${isRetrying ? "animate-spin" : ""}`}
                />
                {t("aiLab.chat.retry")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Phase 72: Empty response ──
  if (isEmpty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
        className="flex px-4 py-3 sm:px-6 justify-start"
      >
        <div className="group relative flex max-w-[85%] sm:max-w-[75%] flex-row gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/[0.06] sm:size-8">
            <AlertTriangle className="size-3.5 text-amber-600/60 sm:size-4" />
          </div>
          <div className="relative rounded-2xl rounded-tl-md border border-amber-500/[0.06] bg-amber-500/[0.02] px-4 py-3 sm:px-5 sm:py-3.5">
            <p className="text-sm text-amber-600/80 dark:text-amber-400/70">
              {t("aiLab.chat.emptyResponse")}
            </p>
            {onRegenerate && (
              <button
                type="button"
                disabled={isRegenerating}
                onClick={() => {
                  setIsRegenerating(true);
                  onRegenerate();
                  setTimeout(() => setIsRegenerating(false), 1000);
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/[0.04] px-3 py-1.5 text-xs font-medium text-brand/70 transition-all duration-200 hover:bg-brand/[0.08] hover:border-brand/30 disabled:opacity-50"
              >
                <RotateCcw className="size-3" />
                {t("aiLab.chat.regenerate")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Phase 72: Cancelled before first token ──
  if (isEmptyByStop) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
        className="flex px-4 py-3 sm:px-6 justify-start"
      >
        <div className="group relative flex max-w-[85%] sm:max-w-[75%] flex-row gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-500/15 bg-slate-500/[0.04] sm:size-8">
            <Sparkles className="size-3.5 text-slate-500/50 sm:size-4" />
          </div>
          <div className="relative rounded-2xl rounded-tl-md border border-brand/[0.06] bg-brand/[0.02] px-4 py-3 sm:px-5 sm:py-3.5">
            <p className="text-sm text-slate-500/60 dark:text-slate-400/40">
              {t("aiLab.chat.generationStopped")}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Normal message bubble ──
  const bubbleContent = (
    <div
      className={`group relative flex max-w-[85%] gap-3 sm:max-w-[75%] ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border sm:size-8 ${
          isUser
            ? "border-brand/15 bg-brand/[0.06]"
            : "border-brand/10 bg-brand/[0.04] dark:border-white/[0.06] dark:bg-white/[0.02]"
        }`}
      >
        {isUser ? (
          <User className="size-3.5 text-brand/60 sm:size-4" />
        ) : (
          <Sparkles className="size-3.5 text-brand/60 sm:size-4" />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={`relative rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 ${
          isUser
            ? "rounded-tr-md border border-brand/10 bg-brand/[0.04] dark:border-white/[0.06] dark:bg-white/[0.03]"
            : "rounded-tl-md border border-brand/[0.06] bg-brand/[0.02] backdrop-blur-sm dark:border-white/[0.04] dark:bg-white/[0.01]"
        }`}
      >
        {/* Assistant left accent line */}
        {isAssistant && (
          <span
            aria-hidden="true"
            className="absolute inset-y-3 left-0 w-px rounded-full bg-gradient-to-b from-brand/20 via-brand/10 to-transparent"
          />
        )}

        {/* Content — Phase 73: markdown rendering for assistant, plain text for user */}
        <div className="text-sm leading-relaxed text-foreground/85 sm:text-base">
          {isAssistant && !isStreaming ? (
            <MarkdownRenderer content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap">
              {message.content}
              {isStreaming && (
                <span className="ml-0.5 inline-block w-[0.5em] h-[1.1em] align-text-bottom bg-brand/60 animate-pulse rounded-sm" />
              )}
            </p>
          )}
        </div>

        {/* Phase 73: Message action buttons (appear on hover) */}
        <div
          className={`mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          {/* Copy message button */}
          <button
            type="button"
            onClick={handleCopyMessage}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] text-slate-400/50 transition-colors hover:text-slate-600 dark:text-slate-500/50 dark:hover:text-slate-300"
            aria-label={messageCopied ? "Copied" : "Copy message"}
          >
            {messageCopied ? (
              <Check className="size-2.5 text-emerald-500" />
            ) : (
              <Copy className="size-2.5" />
            )}
          </button>

          {/* Regenerate button for completed assistant messages */}
          {isAssistant && generationState === "completed" && onRegenerate && message.content.trim() && (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => {
                setIsRegenerating(true);
                onRegenerate();
                setTimeout(() => setIsRegenerating(false), 1000);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6rem] text-slate-400/50 transition-colors hover:text-brand/60 dark:text-slate-500/50 dark:hover:text-brand/50"
              title={t("aiLab.chat.regenerate")}
            >
              <RotateCcw className="size-2.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Streaming messages: no entrance animation
  if (isStreaming) {
    return (
      <div className={`flex px-4 py-3 sm:px-6 ${isUser ? "justify-end" : "justify-start"}`}>
        {bubbleContent}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
      className={`flex px-4 py-3 sm:px-6 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {bubbleContent}
    </motion.div>
  );
}
