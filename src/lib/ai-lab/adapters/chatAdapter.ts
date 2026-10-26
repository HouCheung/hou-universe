// ============================================================
// AI Lab — adapters/chatAdapter.ts
// ============================================================
// Phase 69: Bridges the MiniMind Chat UI to the real
// GenerationRuntime pipeline.
//
// This adapter is the chat-layer equivalent of generationAdapter.
// It adds conversation-level abstractions (multi-turn history
// formatting, context window management, conversation persistence)
// on top of the existing generation adapter.
//
// Design principles:
//   - Delegates all generation to existing generationRuntime
//   - No new generation engine
//   - No fake responses
//   - No Math.random() for model output
//   - Persists conversations via ChatHistoryStore
//
// Architecture:
//   Chat UI → chatAdapter → generationAdapter → generationRuntime
// ============================================================

import {
  generateFromSession,
  generateBaseline,
  getGeneratableSessions,
  type GenerationUIData,
  type GenerationCheckpointInfo,
  toGenerationUIData,
  getGenerationCheckpointInfo,
} from "./generationAdapter";
import {
  chatHistory,
  type ChatConversation,
  type ChatMessage,
  type ChatModelConfig,
} from "@/lib/minimind/research/ChatHistoryStore";
import type { GenerationEvalOptions } from "@/lib/minimind/evaluation/GenerationEvaluator";
import type { GenerationModelConfig } from "@/lib/minimind/research/GenerationResult";
import { countTokens, truncateToTokens } from "@/lib/minimind/tokenizer/tokenCounter";
import { getProductionModelConfig } from "@/lib/minimind/experiments/ModelRegistry";

// ============================================================
// UI-facing types
// ============================================================

export interface ChatGenerationConfig {
  /** Session ID for checkpoint-based generation */
  sessionId?: string;
  /** Checkpoint ID override */
  checkpointId?: string;
  /** Model config */
  modelConfig: GenerationModelConfig;
  /** Generation parameters */
  params: GenerationEvalOptions;
  /** Whether to use baseline (untrained) generation */
  isBaseline: boolean;
}

export interface ChatSendResult {
  /** The assistant message */
  message: ChatMessage;
  /** Full generation metadata */
  generation: GenerationUIData;
  /** The updated conversation */
  conversation: ChatConversation;
}

/**
 * Phase 72: Structured error for chat generation failures.
 * Carries enough context for the UI to render proper error states
 * and enable retry without re-adding user messages.
 */
export class ChatGenerationError extends Error {
  /** The generation UIData if generation partially completed */
  generation?: GenerationUIData;
  /** The conversation id this generation belonged to (for retry recovery) */
  conversationId?: string;

  constructor(
    message: string,
    generation?: GenerationUIData,
    conversationId?: string
  ) {
    super(message);
    this.name = "ChatGenerationError";
    this.generation = generation;
    this.conversationId = conversationId;
  }
}

/**
 * Phase 74: An AbortError that also carries the conversation id, so the chat
 * shell can adopt a brand-new conversation when the user stops generation.
 */
export interface ChatAbortError extends Error {
  conversationId?: string;
}

export interface ChatContextInfo {
  /** Total context tokens used by conversation history */
  estimatedContextTokens: number;
  /** Model's maximum sequence length */
  maxSeqLen: number;
  /** Percentage of context window used */
  usagePercent: number;
  /** Whether the context window is nearly full */
  isNearLimit: boolean;
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_CHAT_MAX_TOKENS = 128;
const DEFAULT_CHAT_TEMPERATURE = 0.8;
const DEFAULT_CHAT_TOP_K = 40;
const DEFAULT_CHAT_TOP_P = 0.9;
/** Explicit deterministic default. Seed is plumbed to the sampler. */
const DEFAULT_CHAT_SEED = 42;

// ============================================================
// Internal — Status Mapping (Phase 72)
// ============================================================

/**
 * Map GenerationResult status to ChatGenerationStatus.
 */
function mapGenerationStatus(status: string): import("@/lib/minimind/research/ChatHistoryStore").ChatGenerationStatus {
  switch (status) {
    case "generating":
      return "streaming";
    case "completed":
      return "completed";
    case "stopped":
      return "stopped";
    case "cancelled":
      return "stopped";
    case "error":
      return "failed";
    default:
      return "idle";
  }
}

// ============================================================
// Public API — Chat Generation
// ============================================================

/**
 * Send a message in a conversation and get the model's response.
 *
 * This is the primary chat API. It:
 * 1. Formats conversation history as context
 * 2. Truncates to fit within model's maxSeqLen
 * 3. Calls the real generation pipeline
 * 4. Persists the conversation
 *
 * Phase 71: Accepts optional onToken callback for real-time streaming.
 * When provided, the callback fires for every generated token BEFORE
 * the function returns — enabling progressive UI updates.
 *
 * @param conversationId - Existing conversation ID, or undefined to create new
 * @param userMessage - The user's message text
 * @param config - Generation configuration
 * @param signal - Optional abort signal
 * @param onToken - Optional streaming callback (Phase 71):
 *   (token, tokenIndex, textSoFar) => void
 * @returns ChatSendResult with assistant message and conversation
 */
export async function chatSend(
  conversationId: string | undefined,
  userMessage: string,
  config: ChatGenerationConfig,
  signal?: AbortSignal,
  onToken?: (token: string, tokenIndex: number, textSoFar: string) => void
): Promise<ChatSendResult> {
  // Get or create conversation
  let convId: string;
  if (conversationId) {
    const existing = chatHistory.getConversation(conversationId);
    if (!existing) {
      throw new ChatGenerationError(`Conversation "${conversationId}" not found`);
    }
    // Add user message
    chatHistory.addMessage(conversationId, "user", userMessage);
    convId = conversationId;
  } else {
    const conversation = chatHistory.createConversation(
      userMessage,
      {
        vocabSize: config.modelConfig.vocabSize,
        dModel: config.modelConfig.dModel,
        numHeads: config.modelConfig.numHeads,
        dFF: config.modelConfig.dFF,
        numLayers: config.modelConfig.numLayers,
        maxSeqLen: config.modelConfig.maxSeqLen,
      },
      config.checkpointId
    );
    convId = conversation.id;
  }

  // Delegate to shared generation pipeline
  return generateResponse(convId, userMessage, config, signal, onToken);
}



/**
 * Phase 72: Retry a failed generation.
 *
 * Reuses the last user message. Does NOT duplicate it.
 * Creates a new generation with a new identity.
 */
export async function chatRetry(
  conversationId: string,
  config: ChatGenerationConfig,
  signal?: AbortSignal,
  onToken?: (token: string, tokenIndex: number, textSoFar: string) => void
): Promise<ChatSendResult> {
  const conversation = chatHistory.getConversation(conversationId);
  if (!conversation) {
    throw new ChatGenerationError(`Conversation "${conversationId}" not found`);
  }

  const lastUserMsg = chatHistory.getLastUserMessage(conversationId);
  if (!lastUserMsg) {
    throw new ChatGenerationError("No user message found to retry");
  }

  // Remove the failed assistant message so it gets replaced
  chatHistory.removeLastAssistantMessage(conversationId);

  // Generate new response without adding a duplicate user message
  return generateResponse(conversationId, lastUserMsg.content, config, signal, onToken);
}

/**
 * Phase 72: Regenerate the last assistant response.
 *
 * Uses the same conversation context. Removes the last assistant
 * message and creates a new generation with a new identity.
 * The original user message remains exactly once.
 */
export async function chatRegenerate(
  conversationId: string,
  config: ChatGenerationConfig,
  signal?: AbortSignal,
  onToken?: (token: string, tokenIndex: number, textSoFar: string) => void
): Promise<ChatSendResult> {
  const conversation = chatHistory.getConversation(conversationId);
  if (!conversation) {
    throw new ChatGenerationError(`Conversation "${conversationId}" not found`);
  }

  const lastUserMsg = chatHistory.getLastUserMessage(conversationId);
  if (!lastUserMsg) {
    throw new ChatGenerationError("No user message found to regenerate from");
  }

  // Remove the last assistant message (the one being regenerated)
  chatHistory.removeLastAssistantMessage(conversationId);

  // Generate new response without adding a duplicate user message
  return generateResponse(conversationId, lastUserMsg.content, config, signal, onToken);
}

/**
 * Phase 72: Internal — generate an assistant response for a conversation
 * WITHOUT adding a user message. Used by chatSend (after adding user msg),
 * chatRetry, and chatRegenerate.
 */
async function generateResponse(
  conversationId: string,
  userMessage: string,
  config: ChatGenerationConfig,
  signal?: AbortSignal,
  onToken?: (token: string, tokenIndex: number, textSoFar: string) => void
): Promise<ChatSendResult> {
  const conversation = chatHistory.getConversation(conversationId);
  if (!conversation) {
    throw new ChatGenerationError(`Conversation "${conversationId}" not found`);
  }

  // Format conversation history into a single prompt
  const fullPrompt = formatConversationPrompt(
    conversation,
    config.modelConfig.maxSeqLen
  );

  // Build generation params
  const genParams: GenerationEvalOptions = {
    maxTokens: config.params.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS,
    temperature: config.params.temperature ?? DEFAULT_CHAT_TEMPERATURE,
    topK: config.params.topK ?? DEFAULT_CHAT_TOP_K,
    topP: config.params.topP ?? DEFAULT_CHAT_TOP_P,
    seed: config.params.seed ?? DEFAULT_CHAT_SEED,
    eosTokenId: config.params.eosTokenId ?? 3,
  };

  // Real generation
  let generation: GenerationUIData;
  try {
    if (config.isBaseline || !config.sessionId) {
      const result = await generateBaseline(
        config.sessionId ?? "chat-baseline",
        fullPrompt,
        genParams,
        signal,
        onToken
      );
      generation = toGenerationUIData(result, "MiniMind Chat");
    } else {
      const result = await generateFromSession(
        config.sessionId,
        fullPrompt,
        genParams,
        signal,
        onToken
      );
      generation = toGenerationUIData(result, `Chat: ${conversation.title}`);
    }

    // Extract assistant response
    const assistantContent = extractAssistantResponse(
      fullPrompt,
      generation.generatedText
    );

    // Handle empty/cancelled generation
    if (!assistantContent || assistantContent.trim().length === 0) {
      const updatedConversation = chatHistory.getConversation(conversationId) ?? conversation;
      const isEmptyByCancellation =
        generation.status === "cancelled" || generation.status === "stopped";

      return {
        message: {
          id: `empty-${generation.requestId}`,
          role: "assistant",
          content: "",
          generationRequestId: generation.requestId,
          generationStatus: isEmptyByCancellation ? "stopped" : "failed",
          timestamp: Date.now(),
        },
        generation,
        conversation: updatedConversation,
      };
    }

    // Add assistant message to conversation
    const assistantMessage = chatHistory.addMessage(
      conversationId,
      "assistant",
      assistantContent,
      generation.requestId
    );

    if (!assistantMessage) {
      throw new Error("Failed to save assistant message");
    }

    const updatedConversation = chatHistory.getConversation(conversationId);
    if (!updatedConversation) {
      throw new Error("Conversation lost after message save");
    }

    const genStatus = mapGenerationStatus(generation.status);

    return {
      message: { ...assistantMessage, generationStatus: genStatus },
      generation,
      conversation: updatedConversation,
    };
  } catch (error) {
    if (error instanceof ChatGenerationError) {
      // Attach the conversation id so the shell can adopt a brand-new
      // conversation on failure (enables Retry without a second user message).
      if (error.conversationId === undefined) {
        error.conversationId = conversationId;
      }
      throw error;
    }
    // Phase 74: Propagate abort errors untouched so the chat shell can
    // distinguish a user-initiated Stop from a real generation failure, and
    // attach the conversation id so a brand-new conversation is adopted.
    if (error instanceof Error && error.name === "AbortError") {
      const abortError = error as ChatAbortError;
      abortError.conversationId = conversationId;
      throw abortError;
    }
    const errorMsg =
      error instanceof Error ? error.message : "Unknown generation error";
    throw new ChatGenerationError(errorMsg, undefined, conversationId);
  }
}

/**
 * Get context window info for a conversation.
 */
export function getChatContextInfo(
  conversation: ChatConversation
): ChatContextInfo {
  const maxSeqLen = conversation.modelConfig.maxSeqLen;
  const fullPrompt = formatConversationPrompt(conversation, maxSeqLen);
  // Phase 80: report the REAL token count (not `length / 4`, which is
  // wrong for Chinese UTF-8 text).
  const estimatedTokens = countTokens(fullPrompt);
  const usagePercent = Math.min(
    100,
    Math.round((estimatedTokens / maxSeqLen) * 100)
  );

  return {
    estimatedContextTokens: estimatedTokens,
    maxSeqLen,
    usagePercent,
    isNearLimit: usagePercent > 80,
  };
}

// ============================================================
// Public API — Conversation Management
// ============================================================

/**
 * List all conversations (newest first, summaries only).
 */
export function listChatConversations() {
  return chatHistory.listConversations();
}

/**
 * Get a full conversation by ID.
 */
export function getChatConversation(
  conversationId: string
): ChatConversation | undefined {
  return chatHistory.getConversation(conversationId);
}

/**
 * Phase 73: Rename a conversation.
 */
export function renameChatConversation(conversationId: string, newTitle: string): boolean {
  return chatHistory.renameConversation(conversationId, newTitle);
}

/**
 * Delete a conversation.
 */
export function deleteChatConversation(conversationId: string): boolean {
  return chatHistory.deleteConversation(conversationId);
}

/**
 * Clear all conversations.
 */
export function clearChatConversations(): void {
  chatHistory.clear();
}

/**
 * Get conversation count.
 */
export function getChatConversationCount(): number {
  return chatHistory.count();
}

// ============================================================
// Public API — Default Config
// ============================================================

/**
 * Get the default chat generation config.
 */
export function getDefaultChatConfig(
  checkpointInfo?: GenerationCheckpointInfo | null
): ChatGenerationConfig {
  const hasCheckpoint = checkpointInfo?.hasCheckpoint ?? false;
  const production = getProductionModelConfig();

  return {
    sessionId: checkpointInfo?.sessionId,
    checkpointId: checkpointInfo?.checkpointId,
    modelConfig: {
      vocabSize: production.vocabSize,
      dModel: production.dModel,
      numHeads: production.numHeads,
      dFF: production.dFF,
      numLayers: production.numLayers,
      maxSeqLen: production.maxSeqLen,
    },
    params: {
      maxTokens: DEFAULT_CHAT_MAX_TOKENS,
      temperature: DEFAULT_CHAT_TEMPERATURE,
      topK: DEFAULT_CHAT_TOP_K,
      topP: DEFAULT_CHAT_TOP_P,
      seed: DEFAULT_CHAT_SEED,
    },
    isBaseline: !hasCheckpoint,
  };
}

/**
 * Get available checkpoints for chat.
 */
export function getChatCheckpointOptions(): GenerationCheckpointInfo[] {
  return getGeneratableSessions();
}

// ============================================================
// Internal — Prompt Formatting
// ============================================================

/**
 * Format a conversation into a single prompt string for the model.
 *
 * Uses a simple chat format:
 *   User: {message}
 *   Assistant: {response}
 *   User: {new message}
 *   Assistant:
 *
 * The model sees this and completes the "Assistant:" line.
 *
 * Truncates from the beginning (oldest messages first) to fit
 * within maxSeqLen.
 */
function formatConversationPrompt(
  conversation: ChatConversation,
  maxSeqLen: number
): string {
  // Build the prompt from messages
  const parts: string[] = [];

  for (const msg of conversation.messages) {
    switch (msg.role) {
      case "user":
        parts.push(`User: ${msg.content}`);
        break;
      case "assistant":
        parts.push(`Assistant: ${msg.content}`);
        break;
      case "system":
        // Skip system messages in prompt — they're errors or metadata
        break;
    }
  }

  // Add final "Assistant:" prompt for the model to complete
  // (this is already added if the last message was from user, which it should be)
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  if (lastMessage && lastMessage.role !== "assistant") {
    parts.push("Assistant:");
  }

  const fullPrompt = parts.join("\n");

  // Phase 80: truncate by REAL tokens (keeps the most recent content) so
  // Chinese / mixed prompts respect the actual context window instead of
  // a `maxSeqLen * 4` character guess.
  return truncateToTokens(fullPrompt, maxSeqLen);
}

/**
 * Extract the assistant's response from the full generated text.
 *
 * The model generates the full prompt + continuation.
 * We isolate only the text after the last "Assistant:" marker.
 */
function extractAssistantResponse(
  prompt: string,
  generatedText: string
): string {
  // If the generated text starts with the prompt, strip it
  if (generatedText.startsWith(prompt)) {
    return generatedText.slice(prompt.length).trim();
  }

  // Otherwise, look for the last "Assistant:" marker
  const marker = "Assistant:";
  const lastIdx = generatedText.lastIndexOf(marker);
  if (lastIdx !== -1) {
    return generatedText.slice(lastIdx + marker.length).trim();
  }

  // Fallback: return the whole generated text
  return generatedText.trim();
}
