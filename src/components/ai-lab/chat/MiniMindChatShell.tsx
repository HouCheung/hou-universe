"use client";

// ============================================================
// MiniMindChatShell — Chat-first AI Lab experience
// ============================================================
// Phase 69: Composition root for the new chat-first /ai-lab
// experience. Owns all chat state: messages, conversations,
// generation config, and generation lifecycle.
//
// Phase 72: Replaced isGenerating boolean with authoritative
// generationState machine. Added retry, regenerate, error UI,
// concurrency guard, and refresh recovery.
//
// Architecture:
//   MiniMindChatShell (state owner)
//     ↓ calls
//   chatAdapter (adapter layer)
//     ↓ calls
//   generationAdapter → generationRuntime → Worker → Core
//
// Design:
//   - All generation flows through chatAdapter
//   - Conversation history persisted via ChatHistoryStore
//   - No fake responses — real model inference only
//   - No Math.random() for model output
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeft } from "lucide-react";
import { ChatHeader } from "./ChatHeader";
import { ConversationArea } from "./ConversationArea";
import { ChatComposer } from "./ChatComposer";
import { ChatSidebar } from "./ChatSidebar";
import {
  GenerationControls,
  type TemperaturePreset,
  type GenerationParams,
  type CheckpointImportState,
} from "./GenerationControls";
import { LabSection } from "./LabSection";
import {
  chatSend,
  chatRetry,
  chatRegenerate,
  getChatConversation,
  listChatConversations,
  deleteChatConversation,
  renameChatConversation,
  getDefaultChatConfig,
  ChatGenerationError,
  type ChatGenerationConfig,
  type ChatSendResult,
} from "@/lib/ai-lab/adapters/chatAdapter";
import {
  getGenerationCheckpointInfo,
  getGeneratableSessions,
} from "@/lib/ai-lab/adapters/generationAdapter";
import { getActiveTrainingStatusBadge } from "@/lib/ai-lab/adapters/liveTrainingAdapter";
import { importCheckpoint } from "@/lib/ai-lab/adapters/checkpointImport";
import { trainingRuntime } from "@/lib/minimind/research";
import type { ModelStatus } from "./ModelStatusBadge";
import type { ChatMessage, ChatGenerationStatus } from "@/lib/minimind/research/ChatHistoryStore";

// ============================================================
// Constants
// ============================================================

const DEFAULT_PARAMS: GenerationParams = {
  temperature: 0.8,
  maxTokens: 128,
  topK: 40,
  topP: 0.9,
  /** Explicit deterministic default seed, plumbed to the sampler. */
  seed: 42,
};

// ============================================================
// MiniMindChatShell
// ============================================================

export function MiniMindChatShell() {
  const { t } = useTranslation();

  // ── State ──
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState(() => listChatConversations());

  // Phase 72: Authoritative generation state — replaces isGenerating boolean
  const [generationState, setGenerationState] = useState<ChatGenerationStatus>("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const [streamingTokenCount, setStreamingTokenCount] = useState<number>(0);

  const [preset, setPreset] = useState<TemperaturePreset>("balanced");
  const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS);
  const [checkpointInfo, setCheckpointInfo] = useState(() => {
    try {
      const sessions = getGeneratableSessions();
      return sessions.length > 0 ? sessions[0] : null;
    } catch {
      return null;
    }
  });

  // Milestone A: checkpoint import lifecycle (validating / success / error).
  const [importState, setImportState] = useState<CheckpointImportState>("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Phase 76→77: Whether a training session is currently active. Drives the
  // header status badge ("Training in progress"). Initialized from the real
  // workspace on mount, then kept in sync with live worker lifecycle events
  // (see the subscription effect below) instead of freezing at mount.
  const [trainingActive, setTrainingActive] = useState<boolean>(() => {
    try {
      const badge = getActiveTrainingStatusBadge();
      return badge.status === "running" || badge.status === "paused";
    } catch {
      return false;
    }
  });

  // Phase 77: Keep the header training status reactive against real shared
  // state. Live worker events flow through trainingRuntime's event bus — NOT
  // the exported `eventBus` singleton (which only ResearchExperimentRunner
  // uses) — so subscribe to start/complete/error there. On completion, also
  // refresh checkpointInfo so the header flips "training" → "trained" without
  // a remount. Lifecycle-safe: unsubscribes on unmount; no polling; no second
  // runtime; does not touch Chat streaming.
  useEffect(() => {
    const bus = trainingRuntime.getEventBus();

    const unsubscribeStart = bus.subscribe("training:start", () => {
      setTrainingActive(true);
    });
    const unsubscribeEnd = bus.subscribe("training:complete", () => {
      setTrainingActive(false);
      // A completed run produces a checkpoint — reflect "trained" now
      // instead of waiting for a remount.
      try {
        const sessions = getGeneratableSessions();
        setCheckpointInfo(sessions.length > 0 ? sessions[0] : null);
      } catch {
        // No generatable session — baseline stays correct.
      }
    });
    const unsubscribeError = bus.subscribe("training:error", () => {
      setTrainingActive(false);
    });

    return () => {
      unsubscribeStart();
      unsubscribeEnd();
      unsubscribeError();
    };
  }, []);

  // Phase 72: Use a ref for the active request ID to guard against
  // concurrent generations. Only one generation may be active at a time.
  const activeRequestRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef<string>("");
  /** Tracks when generation started — used for stuck detection on refresh */
  const generationStartRef = useRef<number>(0);
  /** Phase 72: Ref for current generation state — avoids closure staleness in callbacks */
  const generationStateRef = useRef<ChatGenerationStatus>("idle");

  // ── Build generation config ──
  const buildConfig = useCallback((): ChatGenerationConfig => {
    const defaultConfig = getDefaultChatConfig(checkpointInfo);
    return {
      ...defaultConfig,
      params: {
        ...defaultConfig.params,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        topK: params.topK,
        topP: params.topP,
        seed: params.seed,
      },
    };
  }, [checkpointInfo, params]);

  // ── Phase 72: Detect stuck generation on mount (refresh recovery) ──
  useEffect(() => {
    const convs = listChatConversations();
    setConversations(convs);

    // Phase 74: Restore the most recently updated conversation on mount so a
    // page refresh keeps the user in their conversation instead of dropping
    // them back to the empty state. Streaming state is in-memory only and
    // resets on remount, so an interrupted generation cannot stay "stuck".
    if (convs.length > 0) {
      const latest = getChatConversation(convs[0].id);
      if (latest) {
        setActiveConversationId(latest.id);
        setMessages(latest.messages);
      }
    }

    // Try to get checkpoint info
    try {
      const info = getGenerationCheckpointInfo(
        checkpointInfo?.sessionId ?? ""
      );
      if (info) setCheckpointInfo(info);
    } catch {
      // No checkpoint available — that's fine, use baseline
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 72: Keep generationStateRef in sync with state for callback access
  useEffect(() => {
    generationStateRef.current = generationState;
  }, [generationState]);

  // ── Phase 72: Concurrency guard ──
  const isBusy = generationState === "starting" ||
    generationState === "streaming" ||
    generationState === "stopping";

  const canStartGeneration = generationState === "idle" ||
    generationState === "completed" ||
    generationState === "stopped" ||
    generationState === "failed";

  // ── Phase 72: Cancel any active generation ──
  const cancelActiveGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    activeRequestRef.current = null;
  }, []);

  // ── Phase 72: Core send handler ──
  const handleSend = useCallback(
    async (userMessage: string) => {
      if (!canStartGeneration) return;

      // Cancel any lingering generation
      cancelActiveGeneration();

      const abortController = new AbortController();
      abortRef.current = abortController;

      setGenerationState("starting");
      setGenerationError(null);
      setStreamingText("");
      setStreamingTokenCount(0);
      streamingTextRef.current = "";
      generationStartRef.current = Date.now();

      // Optimistically add user message
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      };

      setMessages((prev) => {
        if (!activeConversationId) {
          return [tempUserMsg];
        }
        return [...prev, tempUserMsg];
      });

      try {
        const config = buildConfig();

        const result: ChatSendResult = await chatSend(
          activeConversationId,
          userMessage,
          config,
          abortController.signal,
          (_token: string, tokenIndex: number, textSoFar: string) => {
            // Transition to streaming on first token
            if (generationStateRef.current === "starting") {
              setGenerationState("streaming");
              generationStateRef.current = "streaming";
            }
            streamingTextRef.current = textSoFar;
            setStreamingText(textSoFar);
            setStreamingTokenCount(tokenIndex + 1);
          }
        );

        // Update conversation ID if this was a new conversation
        if (!activeConversationId) {
          setActiveConversationId(result.conversation.id);
        }

        // Replace optimistic messages with real ones
        setMessages(result.conversation.messages);
        setGenerationState("completed");
        setGenerationError(null);

        // Refresh conversation list
        setConversations(listChatConversations());
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          // Phase 74: Adopt the conversation id on a brand-new conversation so
          // the orphaned conversation (already persisted by chatSend) is
          // connected to the UI and appears in the sidebar.
          const abortedId = (error as { conversationId?: string }).conversationId;
          if (abortedId && !activeConversationId) {
            setActiveConversationId(abortedId);
            setConversations(listChatConversations());
          }

          // User pressed Stop — preserve partial text
          const partialText = streamingTextRef.current;
          if (partialText.trim().length > 0) {
            setMessages((prev) => {
              const streamingMsg: ChatMessage = {
                id: `stopped-${Date.now()}`,
                role: "assistant",
                content: partialText,
                generationStatus: "stopped",
                timestamp: Date.now(),
              };
              return [...prev, streamingMsg];
            });
          }
          setGenerationState("stopped");
          setGenerationError(null);
          return;
        }

        // Phase 72: Structured error handling — show in UI, not as system message
        const errorMsg =
          error instanceof ChatGenerationError
            ? error.message
            : error instanceof Error
              ? error.message
              : t("aiLab.chat.unknownError");

        setGenerationError(errorMsg);

        // Phase 74: If this was a brand-new conversation, adopt its id so
        // Retry can target it and the orphaned conversation shows in the
        // sidebar (chatSend already persisted the user message).
        if (
          error instanceof ChatGenerationError &&
          error.conversationId &&
          !activeConversationId
        ) {
          setActiveConversationId(error.conversationId);
          setConversations(listChatConversations());
        }

        // Add a failed assistant placeholder so the user sees an error state
        setMessages((prev) => {
          // Check if the last message is already a failed placeholder
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && lastMsg.generationStatus === "failed") {
            return prev; // Don't duplicate
          }
          return [
            ...prev,
            {
              id: `failed-${Date.now()}`,
              role: "assistant" as const,
              content: "",
              generationStatus: "failed" as ChatGenerationStatus,
              timestamp: Date.now(),
            },
          ];
        });

        setGenerationState("failed");
      } finally {
        setStreamingText("");
        setStreamingTokenCount(0);
        abortRef.current = null;
        activeRequestRef.current = null;
      }
    },
    [activeConversationId, canStartGeneration, buildConfig, cancelActiveGeneration, t]
  );

  // ── Phase 72: Retry handler ──
  const handleRetry = useCallback(async () => {
    if (!activeConversationId || !canStartGeneration) return;

    cancelActiveGeneration();

    const abortController = new AbortController();
    abortRef.current = abortController;

    setGenerationState("starting");
    setGenerationError(null);
    setStreamingText("");
    setStreamingTokenCount(0);
    streamingTextRef.current = "";
    generationStartRef.current = Date.now();

    try {
      const config = buildConfig();

      const result: ChatSendResult = await chatRetry(
        activeConversationId,
        config,
        abortController.signal,
        (_token: string, tokenIndex: number, textSoFar: string) => {
          if (generationStateRef.current === "starting") {
            setGenerationState("streaming");
            generationStateRef.current = "streaming";
          }
          streamingTextRef.current = textSoFar;
          setStreamingText(textSoFar);
          setStreamingTokenCount(tokenIndex + 1);
        }
      );

      setMessages(result.conversation.messages);
      setGenerationState("completed");
      setGenerationError(null);
      setConversations(listChatConversations());
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setGenerationState("stopped");
        return;
      }

      const errorMsg =
        error instanceof ChatGenerationError
          ? error.message
          : error instanceof Error
            ? error.message
            : t("aiLab.chat.unknownError");

      setGenerationError(errorMsg);
      setGenerationState("failed");
    } finally {
      setStreamingText("");
      setStreamingTokenCount(0);
      abortRef.current = null;
      activeRequestRef.current = null;
    }
  }, [activeConversationId, canStartGeneration, buildConfig, cancelActiveGeneration, t]);

  // ── Phase 72: Regenerate handler ──
  const handleRegenerate = useCallback(async () => {
    if (!activeConversationId || !canStartGeneration) return;

    cancelActiveGeneration();

    const abortController = new AbortController();
    abortRef.current = abortController;

    setGenerationState("starting");
    setGenerationError(null);
    setStreamingText("");
    setStreamingTokenCount(0);
    streamingTextRef.current = "";
    generationStartRef.current = Date.now();

    try {
      const config = buildConfig();

      const result: ChatSendResult = await chatRegenerate(
        activeConversationId,
        config,
        abortController.signal,
        (_token: string, tokenIndex: number, textSoFar: string) => {
          if (generationStateRef.current === "starting") {
            setGenerationState("streaming");
            generationStateRef.current = "streaming";
          }
          streamingTextRef.current = textSoFar;
          setStreamingText(textSoFar);
          setStreamingTokenCount(tokenIndex + 1);
        }
      );

      setMessages(result.conversation.messages);
      setGenerationState("completed");
      setGenerationError(null);
      setConversations(listChatConversations());
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setGenerationState("stopped");
        return;
      }

      const errorMsg =
        error instanceof ChatGenerationError
          ? error.message
          : error instanceof Error
            ? error.message
            : t("aiLab.chat.unknownError");

      setGenerationError(errorMsg);
      setGenerationState("failed");
    } finally {
      setStreamingText("");
      setStreamingTokenCount(0);
      abortRef.current = null;
      activeRequestRef.current = null;
    }
  }, [activeConversationId, canStartGeneration, buildConfig, cancelActiveGeneration, t]);

  // ── Stop handler ──
  const handleStop = useCallback(() => {
    setGenerationState("stopping");
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  // ── Conversation selection ──
  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      if (isBusy) return;

      cancelActiveGeneration();
      setGenerationState("idle");
      setGenerationError(null);
      setStreamingText("");
      setStreamingTokenCount(0);
      streamingTextRef.current = "";

      const conv = getChatConversation(conversationId);
      if (conv) {
        setActiveConversationId(conversationId);
        setMessages(conv.messages);
      }
      setSidebarOpen(false);
    },
    [isBusy, cancelActiveGeneration]
  );

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      deleteChatConversation(conversationId);
      if (activeConversationId === conversationId) {
        setActiveConversationId(undefined);
        setMessages([]);
        setGenerationState("idle");
        setGenerationError(null);
      }
      setConversations(listChatConversations());
    },
    [activeConversationId]
  );

  // Phase 73: Rename conversation handler
  const handleRenameConversation = useCallback(
    (conversationId: string, newTitle: string) => {
      renameChatConversation(conversationId, newTitle);
      setConversations(listChatConversations());
    },
    []
  );

  const handleNewConversation = useCallback(() => {
    if (isBusy) return;

    cancelActiveGeneration();
    setGenerationState("idle");
    setGenerationError(null);
    setStreamingText("");
    setStreamingTokenCount(0);
    streamingTextRef.current = "";

    setActiveConversationId(undefined);
    setMessages([]);
    setSidebarOpen(false);
  }, [isBusy, cancelActiveGeneration]);

  // Phase 73: Ctrl+N keyboard shortcut for new conversation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleNewConversation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNewConversation]);

  const handlePresetChange = useCallback((newPreset: TemperaturePreset) => {
    setPreset(newPreset);
  }, []);

  const handleParamsChange = useCallback(
    (newParams: Partial<GenerationParams>) => {
      setParams((prev) => ({ ...prev, ...newParams }));
    },
    []
  );

  // ── Milestone A: import + activate a local checkpoint ──
  // Validation, storage, and activation happen in checkpointImport. On any
  // failure the current checkpoint stays active; nothing is silently swapped
  // for a partially initialized model.
  const handleImportCheckpoint = useCallback(
    async (fileName: string, json: string) => {
      setImportState("validating");
      setImportMessage(t("aiLab.chat.controls.importValidating"));

      try {
        const result = await importCheckpoint({ fileName, json });
        const info = getGenerationCheckpointInfo(result.sessionId);
        if (!info || !info.hasCheckpoint) {
          throw new Error(t("aiLab.chat.controls.importActivationFailed"));
        }

        setCheckpointInfo(info);

        const base = t("aiLab.chat.controls.importSuccess", {
          name: result.sessionName,
        });
        const warnings =
          result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
        setImportState("success");
        setImportMessage(`${base}${warnings}`);
      } catch (error) {
        setImportState("error");
        setImportMessage(
          error instanceof Error ? error.message : String(error)
        );
      }
    },
    [t]
  );

  // ── Derived state ──
  // Phase 80: label the model by its honest capability (bilingual-trained vs
  // toy-trained vs baseline) instead of a binary "trained" claim.
  const modelName = checkpointInfo?.hasCheckpoint
    ? checkpointInfo.capabilityLabel ?? t("aiLab.chat.modelTrained")
    : t("aiLab.chat.modelBaseline");
  const checkpointName = checkpointInfo?.hasCheckpoint
    ? checkpointInfo.sessionName || t("aiLab.chat.controls.latestCheckpoint")
    : t("aiLab.chat.controls.baseline");

  // Phase 76: Derive the real model status shown in the header. Generation
  // takes priority, then active training, then trained checkpoint, else
  // baseline (untrained).
  const modelStatus: ModelStatus = isBusy
    ? "generating"
    : trainingActive
      ? "training"
      : checkpointInfo?.hasCheckpoint
        ? "trained"
        : "baseline";

  return (
    // Phase 76: The page scrolls naturally — the chat occupies a single
    // viewport and the Lab showcase flows below it (no fixed-height clipping).
    <div className="flex flex-col">
      {/* Sidebar + main area — exactly one viewport tall */}
      <div className="flex h-[calc(100dvh-4rem)] min-h-0 overflow-hidden">
        {/* Sidebar */}
        <ChatSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onNew={handleNewConversation}
        />

        {/* Main chat area */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          {/* Sidebar toggle (when closed) */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="absolute left-3 top-[4.5rem] z-10 rounded-xl p-2 text-slate-500/40 transition-all duration-200 hover:bg-brand/[0.06] hover:text-brand/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:text-slate-400/25 dark:hover:text-brand/60 sm:left-4 sm:top-[5rem]"
            >
              <PanelLeft className="size-4" />
            </button>
          )}

          {/* Header */}
          <ChatHeader
            modelStatus={modelStatus}
            checkpointName={
              checkpointInfo?.hasCheckpoint ? checkpointInfo.sessionName : undefined
            }
            onNewConversation={handleNewConversation}
          />

          {/* Messages */}
          <ConversationArea
            messages={messages}
            generationState={generationState}
            generationError={generationError}
            streamingText={streamingText}
            streamingTokenCount={streamingTokenCount}
            onRetry={handleRetry}
            onRegenerate={handleRegenerate}
            onPromptClick={handleSend}
            isBaseline={!checkpointInfo?.hasCheckpoint}
          />

          {/* Generation controls */}
          <GenerationControls
            modelName={modelName}
            checkpointName={checkpointName}
            isBaseline={!checkpointInfo?.hasCheckpoint}
            params={params}
            preset={preset}
            onPresetChange={handlePresetChange}
            onParamsChange={handleParamsChange}
            onImportCheckpoint={handleImportCheckpoint}
            importState={importState}
            importMessage={importMessage}
            disabled={isBusy}
          />

          {/* Composer */}
          <ChatComposer
            onSubmit={handleSend}
            onStop={handleStop}
            generationState={generationState}
          />
        </div>
      </div>

      {/* Lab section (below the chat, reached by scrolling) */}
      <LabSection />
    </div>
  );
}
