// ============================================================
// MiniMind — research/ChatHistoryStore.ts
// ============================================================
// Phase 69: Browser-safe chat conversation persistence.
//
// Stores chat conversations in localStorage, separate from
// generation history. Each assistant message links back to
// its GenerationHistoryEntry via generationRequestId.
//
// Design:
//   - Browser-safe — no Node.js dependencies
//   - Graceful degradation — corrupted data returns empty state
//   - Conversational abstraction on top of GenerationHistoryStore
//   - Compact storage with truncation
//
// Storage key: "minimind-chat-conversations"
// Limits: 20 conversations, 100 messages per conv, 2000 chars per message
// ============================================================

// ============================================================
// Types
// ============================================================

/**
 * Generation state for a chat message.
 *
 * Phase 72: Replaces ad-hoc boolean flags (isGenerating, hasError, etc.)
 * with a single authoritative state per assistant message.
 */
export type ChatGenerationStatus =
  | "idle"
  | "starting"
  | "streaming"
  | "stopping"
  | "completed"
  | "stopped"
  | "failed";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Links to GenerationHistoryEntry for detailed metrics */
  generationRequestId?: string;
  timestamp: number;
  /**
   * Phase 72: Authoritative generation status for assistant messages.
   * Only meaningful for role === "assistant". UI derives all behavior
   * from this field — no more isGenerating/isLoading/isStopping booleans.
   */
  generationStatus?: ChatGenerationStatus;
}

export interface ChatConversation {
  id: string;
  /** Auto-generated from first user message */
  title: string;
  messages: ChatMessage[];
  /** Model config used for this conversation */
  modelConfig: ChatModelConfig;
  /** Checkpoint ID if using a trained checkpoint */
  checkpointId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatModelConfig {
  vocabSize: number;
  dModel: number;
  numHeads: number;
  dFF: number;
  numLayers: number;
  maxSeqLen: number;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessage: string;
  updatedAt: number;
}

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = "minimind-chat-conversations";
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES_PER_CONV = 100;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STORAGE_BYTES = 1_000_000; // ~1MB limit
const TITLE_MAX_LENGTH = 60;

// ============================================================
// ID Generator
// ============================================================

let convCounter = 0;
let msgCounter = 0;

function generateConversationId(): string {
  convCounter++;
  return `conv-${Date.now().toString(36)}-${convCounter.toString(36)}`;
}

function generateMessageId(): string {
  msgCounter++;
  return `msg-${Date.now().toString(36)}-${msgCounter.toString(36)}`;
}

// ============================================================
// Helpers
// ============================================================

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function deriveTitle(message: string): string {
  const cleaned = message.trim().replace(/\n/g, " ");
  return truncateText(cleaned || "New conversation", TITLE_MAX_LENGTH);
}

function isValidConversation(obj: unknown): obj is ChatConversation {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    Array.isArray(c.messages) &&
    typeof c.createdAt === "number" &&
    typeof c.updatedAt === "number"
  );
}

// ============================================================
// ChatHistoryStore
// ============================================================

export class ChatHistoryStore {
  /**
   * Create a new conversation with an initial user message.
   * The assistant response is added later via addMessage().
   */
  createConversation(
    firstMessage: string,
    modelConfig: ChatModelConfig,
    checkpointId?: string
  ): ChatConversation {
    const now = Date.now();
    const conversation: ChatConversation = {
      id: generateConversationId(),
      title: deriveTitle(firstMessage),
      messages: [
        {
          id: generateMessageId(),
          role: "user",
          content: truncateText(firstMessage, MAX_MESSAGE_LENGTH),
          timestamp: now,
        },
      ],
      modelConfig,
      checkpointId,
      createdAt: now,
      updatedAt: now,
    };

    const conversations = this.readConversations();
    conversations.push(conversation);

    // Trim to max conversations
    while (conversations.length > MAX_CONVERSATIONS) {
      conversations.shift();
    }

    this.writeConversations(conversations);
    return { ...conversation, messages: [...conversation.messages] };
  }

  /**
   * Add a message to an existing conversation.
   */
  addMessage(
    conversationId: string,
    role: ChatMessage["role"],
    content: string,
    generationRequestId?: string
  ): ChatMessage | null {
    const conversations = this.readConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return null;

    // Trim messages if needed
    if (conv.messages.length >= MAX_MESSAGES_PER_CONV) {
      conv.messages.shift();
    }

    const message: ChatMessage = {
      id: generateMessageId(),
      role,
      content: truncateText(content, MAX_MESSAGE_LENGTH),
      generationRequestId,
      timestamp: Date.now(),
    };

    conv.messages.push(message);
    conv.updatedAt = Date.now();

    this.writeConversations(conversations);
    return { ...message };
  }

  /**
   * Phase 72: Remove the last assistant message from a conversation.
   * Used by retry/regenerate to replace failed or stale responses.
   * Returns the removed message, or null if the last message isn't an assistant message.
   */
  removeLastAssistantMessage(conversationId: string): ChatMessage | null {
    const conversations = this.readConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return null;

    const lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return null;

    conv.messages.pop();
    conv.updatedAt = Date.now();
    this.writeConversations(conversations);
    return lastMsg;
  }

  /**
   * Phase 72: Get the last user message from a conversation.
   * Used by retry/regenerate to retrieve the original prompt.
   */
  getLastUserMessage(conversationId: string): ChatMessage | null {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return null;

    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      if (conversation.messages[i].role === "user") {
        return conversation.messages[i];
      }
    }
    return null;
  }

  /**
   * Get a conversation by ID.
   */
  getConversation(conversationId: string): ChatConversation | undefined {
    const conversations = this.readConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return undefined;
    return { ...conv, messages: [...conv.messages] };
  }

  /**
   * List all conversations as summaries (newest first), without full message bodies.
   */
  listConversations(): ChatConversationSummary[] {
    const conversations = this.readConversations();
    return [...conversations]
      .reverse()
      .map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        lastMessage: c.messages.length > 0
          ? truncateText(c.messages[c.messages.length - 1].content, 80)
          : "",
        updatedAt: c.updatedAt,
      }));
  }

  /**
   * Phase 73: Rename a conversation.
   */
  renameConversation(conversationId: string, newTitle: string): boolean {
    const conversations = this.readConversations();
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return false;

    conv.title = newTitle.slice(0, TITLE_MAX_LENGTH);
    conv.updatedAt = Date.now();
    this.writeConversations(conversations);
    return true;
  }

  /**
   * Delete a conversation.
   */
  deleteConversation(conversationId: string): boolean {
    const conversations = this.readConversations();
    const idx = conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return false;

    conversations.splice(idx, 1);
    this.writeConversations(conversations);
    return true;
  }

  /**
   * Clear all conversations.
   */
  clear(): void {
    this.writeConversations([]);
  }

  /**
   * Get total conversation count.
   */
  count(): number {
    return this.readConversations().length;
  }

  // ============================================================
  // Internal
  // ============================================================

  private readConversations(): ChatConversation[] {
    if (typeof window === "undefined") return [];

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(isValidConversation);
    } catch {
      return [];
    }
  }

  private writeConversations(conversations: ChatConversation[]): void {
    if (typeof window === "undefined") return;

    try {
      let json = JSON.stringify(conversations);

      // If over budget, trim oldest conversations
      while (json.length > MAX_STORAGE_BYTES && conversations.length > 1) {
        conversations.shift();
        json = JSON.stringify(conversations);
      }

      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // Storage full — trim half and retry
      try {
        const trimmed = conversations.slice(
          -Math.max(1, Math.floor(conversations.length / 2))
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // Give up — storage is full
      }
    }
  }
}

// ============================================================
// Singleton
// ============================================================

export const chatHistory = new ChatHistoryStore();
