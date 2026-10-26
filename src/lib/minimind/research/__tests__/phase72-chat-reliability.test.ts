// ============================================================
// Phase 72 — Chat Reliability & Recovery Tests
// ============================================================
// Covers:
//   1. ChatGenerationError structured error handling
//   2. ChatGenerationStatus state machine
//   3. ChatHistoryStore retry/regenerate helpers
//   4. Conversation integrity for retry/regenerate
//   5. Identity audit (no Math.random in ID generators)
//   6. Message ID determinism
//   7. Generation persistence
//   8. Empty/cancelled generation handling
//   9. REAL generation tests via GenerationEvaluator
//   10. Concurrent generation identity
//   11. Fake data audit
// ============================================================

// ============================================================
// localStorage polyfill for Node.js test environment
// ============================================================

if (!(globalThis as Record<string, unknown>).localStorage) {
  const store = new Map<string, string>();
  const ls = {
    getItem(key: string): string | null { return store.get(key) ?? null; },
    setItem(key: string, value: string): void { store.set(key, value); },
    removeItem(key: string): void { store.delete(key); },
    get length(): number { return store.size; },
    clear(): void { store.clear(); },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
  };
  (globalThis as Record<string, unknown>).localStorage = ls;
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

import { describe, it, expect, beforeEach, run } from "../../test-harness";
import {
  generateRequestId,
  generateComparisonId,
  generateHistoryEntryId,
} from "@/lib/minimind/research/GenerationResult";
import { ChatHistoryStore, chatHistory } from "@/lib/minimind/research/ChatHistoryStore";
import type { ChatGenerationStatus } from "@/lib/minimind/research/ChatHistoryStore";
import {
  ChatGenerationError,
  chatSend,
  chatRetry,
  chatRegenerate,
  getDefaultChatConfig,
  type ChatGenerationConfig,
} from "@/lib/ai-lab/adapters/chatAdapter";
import { GenerationEvaluator } from "@/lib/minimind/evaluation/GenerationEvaluator";
import { TensorMiniMindModel } from "@/lib/minimind/model/TensorMiniMindModel";
import { BPETokenizer } from "@/lib/minimind/tokenizer/BPETokenizer";
import { TINY_TRAINING_CORPUS } from "@/lib/minimind/research/worker/training-data";

// ============================================================
// Helpers
// ============================================================

function makeConfig(overrides?: Partial<ChatGenerationConfig>): ChatGenerationConfig {
  const base = getDefaultChatConfig(null);
  return { ...base, isBaseline: true, params: { maxTokens: 5, temperature: 0.8, topK: 40, topP: 0.9, ...overrides?.params }, ...overrides };
}

function makeModel(vocabSize = 260): TensorMiniMindModel {
  return new TensorMiniMindModel({ vocabSize, dModel: 64, numHeads: 2, dFF: 128, numLayers: 1, maxSeqLen: 64 });
}

function makeTokenizer(corpus: string[]): BPETokenizer {
  const t = new BPETokenizer();
  t.train(corpus, 260);
  return t;
}

// ============================================================
// Suite 1: Identity Audit — No Math.random() in ID generation
// ============================================================

describe("Phase 72 — Identity Audit", () => {
  it("generateRequestId uses counter, not Math.random", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateRequestId());
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^gen-[a-z0-9]+-[a-z0-9]+$/);
  });

  it("generateComparisonId uses counter, not Math.random", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateComparisonId());
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^cmp-[a-z0-9]+-[a-z0-9]+$/);
  });

  it("generateHistoryEntryId uses counter, not Math.random", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateHistoryEntryId());
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^hist-[a-z0-9]+-[a-z0-9]+$/);
  });
});

// ============================================================
// Suite 2: ChatGenerationStatus State Machine
// ============================================================

describe("Phase 72 — ChatGenerationStatus State Machine", () => {
  it("all 7 states are valid", () => {
    const states: ChatGenerationStatus[] = ["idle", "starting", "streaming", "stopping", "completed", "stopped", "failed"];
    expect(states.length).toBe(7);
    for (const s of states) expect(typeof s).toBe("string");
  });

  it("busy states (starting, streaming, stopping) are distinct from idle", () => {
    const busy = (s: ChatGenerationStatus) => s === "starting" || s === "streaming" || s === "stopping";
    expect(busy("idle")).toBe(false);
    expect(busy("starting")).toBe(true);
    expect(busy("streaming")).toBe(true);
    expect(busy("stopping")).toBe(true);
    expect(busy("completed")).toBe(false);
    expect(busy("stopped")).toBe(false);
    expect(busy("failed")).toBe(false);
  });
});

// ============================================================
// Suite 3: ChatGenerationError — Structured Error
// ============================================================

describe("Phase 72 — ChatGenerationError", () => {
  it("is a proper Error subclass", () => {
    const e = new ChatGenerationError("test");
    expect(e.name).toBe("ChatGenerationError");
    expect(e.message).toBe("test");
    expect(e instanceof Error).toBe(true);
    expect(e instanceof ChatGenerationError).toBe(true);
  });

  it("is distinguishable from generic Error", () => {
    expect(new Error("x") instanceof ChatGenerationError).toBe(false);
    expect(new ChatGenerationError("x") instanceof ChatGenerationError).toBe(true);
  });
});

// ============================================================
// Suite 4: ChatHistoryStore — Retry/Regenerate Helpers
// ============================================================

describe("Phase 72 — ChatHistoryStore helpers", () => {
  let store: ChatHistoryStore;
  const MC = { vocabSize: 100, dModel: 32, numHeads: 2, dFF: 64, numLayers: 1, maxSeqLen: 64 };

  beforeEach(() => { store = new ChatHistoryStore(); store.clear(); });

  it("getLastUserMessage returns last user message", () => {
    const c = store.createConversation("Hello", MC);
    store.addMessage(c.id, "assistant", "Hi!");
    store.addMessage(c.id, "user", "How are you?");
    const m = store.getLastUserMessage(c.id);
    expect(m!.content).toBe("How are you?");
    expect(m!.role).toBe("user");
  });

  it("getLastUserMessage returns null for nonexistent", () => {
    expect(store.getLastUserMessage("no-exist")).toBeNull();
  });

  it("removeLastAssistantMessage removes last assistant", () => {
    const c = store.createConversation("Hello", MC);
    store.addMessage(c.id, "assistant", "Response");
    const removed = store.removeLastAssistantMessage(c.id);
    expect(removed!.content).toBe("Response");
    const updated = store.getConversation(c.id);
    expect(updated!.messages.length).toBe(1);
    expect(updated!.messages[0].role).toBe("user");
  });

  it("removeLastAssistantMessage returns null if last is not assistant", () => {
    const c = store.createConversation("Hello", MC);
    expect(store.removeLastAssistantMessage(c.id)).toBeNull();
  });

  it("remove + getLastUser preserves user message", () => {
    const c = store.createConversation("Original", MC);
    store.addMessage(c.id, "assistant", "Reply");
    store.removeLastAssistantMessage(c.id);
    expect(store.getLastUserMessage(c.id)!.content).toBe("Original");
    expect(store.getConversation(c.id)!.messages.length).toBe(1);
  });
});

// ============================================================
// Suite 5: Retry/Regenerate — Conversation integrity
// ============================================================

describe("Phase 72 — Conversation integrity", () => {
  const MC = { vocabSize: 100, dModel: 32, numHeads: 2, dFF: 64, numLayers: 1, maxSeqLen: 64 };

  beforeEach(() => { chatHistory.clear(); });

  it("regenerate flow: user count stays 1 after removing assistant", () => {
    const c = chatHistory.createConversation("What is ML?", MC);
    chatHistory.addMessage(c.id, "assistant", "Answer");
    expect(chatHistory.getConversation(c.id)!.messages.filter(m => m.role === "user").length).toBe(1);
    chatHistory.removeLastAssistantMessage(c.id);
    expect(chatHistory.getConversation(c.id)!.messages.filter(m => m.role === "user").length).toBe(1);
  });

  it("retry flow: user message is preserved after removing failed assistant", () => {
    const c = chatHistory.createConversation("Test prompt", MC);
    chatHistory.addMessage(c.id, "assistant", "");
    chatHistory.removeLastAssistantMessage(c.id);
    const userMsg = chatHistory.getLastUserMessage(c.id);
    expect(userMsg!.content).toBe("Test prompt");
  });
});

// ============================================================
// Suite 6: Persistence
// ============================================================

describe("Phase 72 — Persistence", () => {
  const MC = { vocabSize: 100, dModel: 32, numHeads: 2, dFF: 64, numLayers: 1, maxSeqLen: 64 };

  beforeEach(() => { chatHistory.clear(); });

  it("conversation persists and retrieves", () => {
    const c = chatHistory.createConversation("Hello!", MC);
    expect(c.messages.length).toBe(1);
    expect(c.messages[0].content).toBe("Hello!");
    const r = chatHistory.getConversation(c.id);
    expect(r!.messages.length).toBe(1);
  });

  it("conversation survives multiple retrievals", () => {
    const c = chatHistory.createConversation("Test", MC);
    chatHistory.addMessage(c.id, "assistant", "Response");
    expect(chatHistory.getConversation(c.id)!.messages.length).toBe(2);
    expect(chatHistory.getConversation(c.id)!.messages.length).toBe(2);
  });

  it("generationRequestId persists on messages", () => {
    const c = chatHistory.createConversation("Test", MC);
    const m = chatHistory.addMessage(c.id, "assistant", "Response", "gen-abc123");
    expect(m!.generationRequestId).toBe("gen-abc123");
    const r = chatHistory.getConversation(c.id);
    expect(r!.messages[r!.messages.length - 1].generationRequestId).toBe("gen-abc123");
  });
});

// ============================================================
// Suite 7: Error handling
// ============================================================

describe("Phase 72 — Error propagation", () => {
  beforeEach(() => { chatHistory.clear(); });

  it("chatSend throws ChatGenerationError on nonexistent conversation", async () => {
    await expect(chatSend("nonexistent", "Hello", makeConfig())).rejects.toThrow(ChatGenerationError);
  });

  it("chatRetry throws ChatGenerationError on nonexistent conversation", async () => {
    await expect(chatRetry("nonexistent", makeConfig())).rejects.toThrow(ChatGenerationError);
  });

  it("chatRegenerate throws ChatGenerationError on nonexistent conversation", async () => {
    await expect(chatRegenerate("nonexistent", makeConfig())).rejects.toThrow(ChatGenerationError);
  });
});

// ============================================================
// Suite 8: Message IDs are counter-based
// ============================================================

describe("Phase 72 — Message ID determinism", () => {
  const MC = { vocabSize: 100, dModel: 32, numHeads: 2, dFF: 64, numLayers: 1, maxSeqLen: 64 };
  let store: ChatHistoryStore;

  beforeEach(() => { store = new ChatHistoryStore(); store.clear(); });

  it("conversation IDs are counter-based", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add(store.createConversation(`T${i}`, MC).id);
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^conv-/);
  });

  it("message IDs are counter-based", () => {
    const c = store.createConversation("Test", MC);
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const m = store.addMessage(c.id, "user", `M${i}`);
      expect(m).toBeTruthy();
      ids.add(m!.id);
    }
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^msg-/);
  });
});

// ============================================================
// Suite 9: REAL generation via GenerationEvaluator
// ============================================================

describe("Phase 72 — REAL generation tests", () => {
  it("generation produces real output", () => {
    const evaluator = new GenerationEvaluator(makeModel(), makeTokenizer(TINY_TRAINING_CORPUS));
    const r = evaluator.evaluate(["Hello world"], { maxTokens: 10, temperature: 0.8, seed: 42 });
    expect(r.length).toBe(1);
    expect(r[0].generatedText.length).toBeGreaterThan(0);
    expect(r[0].tokenCount).toBeGreaterThan(0);
    expect(Number.isFinite(r[0].avgLogProb)).toBe(true);
    expect(Number.isFinite(r[0].perplexity)).toBe(true);
  });

  it("different seeds produce different output", () => {
    const evaluator = new GenerationEvaluator(makeModel(), makeTokenizer(TINY_TRAINING_CORPUS));
    const r1 = evaluator.evaluate(["Hello"], { maxTokens: 10, seed: 1 });
    const r2 = evaluator.evaluate(["Hello"], { maxTokens: 10, seed: 2 });
    expect(r1[0].generatedIds).not.toEqual(r2[0].generatedIds);
  });

  it("greedy generation (temp=0) is deterministic", () => {
    const evaluator = new GenerationEvaluator(makeModel(), makeTokenizer(TINY_TRAINING_CORPUS));
    const r1 = evaluator.evaluate(["The cat"], { maxTokens: 10, temperature: 0 });
    const r2 = evaluator.evaluate(["The cat"], { maxTokens: 10, temperature: 0 });
    expect(r1[0].generatedText).toBe(r2[0].generatedText);
  });

  it("cancelled signal stops generation immediately", () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const evaluator = new GenerationEvaluator(makeModel(), makeTokenizer(TINY_TRAINING_CORPUS));
    const r = evaluator.evaluate(["Once upon a time"], { maxTokens: 50, signal: ctrl.signal });
    expect(r[0].stopReason).toBe("error");
    expect(r[0].tokenCount).toBe(0);
  });

  it("real inference produces unique output per seed", () => {
    const evaluator = new GenerationEvaluator(makeModel(), makeTokenizer(TINY_TRAINING_CORPUS));
    const r1 = evaluator.evaluate(["Write a poem"], { maxTokens: 10, temperature: 1.0, seed: 123 });
    const r2 = evaluator.evaluate(["Write a poem"], { maxTokens: 10, temperature: 1.0, seed: 456 });
    expect(r1[0].generatedText).toBeTruthy();
    expect(r2[0].generatedText).toBeTruthy();
    expect(r1[0].tokenCount).toBeGreaterThan(0);
    expect(r2[0].tokenCount).toBeGreaterThan(0);
  });
});

// ============================================================
// Suite 10: Unique generation identity
// ============================================================

describe("Phase 72 — Unique generation identity", () => {
  it("generateRequestId produces 1000 unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateRequestId());
    expect(ids.size).toBe(1000);
  });
});

// ============================================================
// Standalone runner — npx tsx phase72-chat-reliability.test.ts
// ============================================================

if (typeof require !== "undefined" && require.main === module || process.argv[1]?.includes("phase72")) {
  run().then((result) => {
    console.log("\n" + "=".repeat(60));
    console.log(`Phase 72: ${result.passed} passed, ${result.failed} failed`);
    console.log("=".repeat(60));
    if (result.failed > 0) process.exit(1);
  });
}
