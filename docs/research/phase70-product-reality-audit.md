# Phase 70 — MiniMind Chat Product Reality Audit

**Date:** 2026-08-12
**Status:** Audit Complete — No Code Changes
**Scope:** Full-stack audit of the MiniMind Chat experience (`/ai-lab`)

---

## 1. Executive Summary

MiniMind Chat has the **real engine of a serious AI product** — real model inference, real tokenization, real autoregressive generation running in a Web Worker. However, the **product experience is still a developer demo**. The gap between "it works" and "it feels like a ChatGPT-quality product" is material.

The single most impactful finding: **generation is not streamed to the UI**. The entire generation runs to completion in the worker before any token appears on screen. This is the defining product characteristic that separates "research dashboard" from "usable AI chat product."

**Overall verdict:** The architecture is sound. The engine is real. The product experience needs focused work on streaming, conversation management UX, and error recovery before it feels credible.

---

## 2. Complete Chat Data Flow

### 2.1 End-to-End Trace

```
User types "hello" and presses Enter
│
▼
[1] ChatComposer.tsx:92
    handleKeyDown → Enter (no Shift) → handleSend("hello")
    - Sets value="" and resets textarea height
    - Calls onSubmit("hello") provided by MiniMindChatShell
    STATUS: REAL ✓
│
▼
[2] MiniMindChatShell.tsx:121 — handleSend("hello")
    - Checks isGenerating guard → proceeds
    - Creates new AbortController, stores in abortRef
    - Sets isGenerating = true
    - Optimistically adds temp user message to messages[] state
    - Calls chatSend(activeConversationId, "hello", config, signal)
    STATUS: REAL ✓
│
▼
[3] chatAdapter.ts:109 — chatSend(conversationId, "hello", config, signal)
    - Gets or creates conversation via ChatHistoryStore
    - new: createConversation("hello", modelConfig, checkpointId)
      → auto-derives title from first message ("hello")
      → saves to localStorage
    - existing: addMessage(conversationId, "user", "hello")
    - Formats conversation prompt: "User: hello\nAssistant:"
    - Calls generateBaseline("chat-baseline", fullPrompt, params, signal)
      (since no checkpoint/sessionId available for most users)
    STATUS: REAL ✓
│
▼
[4] generationAdapter.ts:167 — generateBaseline("chat-baseline", prompt, options, signal)
    - Resolves workspace session (may return null → uses defaults)
    - Builds modelConfig (vocabSize:32000, dModel:128, numHeads:4, dFF:512, numLayers:4, maxSeqLen:256)
    - Calls generationRuntime.generate({...isBaseline:true, signal})
    STATUS: REAL ✓
│
▼
[5] GenerationRuntime.ts:125 — generate(options)
    - Validates prompt is non-empty
    - Builds generation params (maxTokens:128, temperature:0.8, topK:40, topP:0.9)
    - Initializes GenerationRuntimeState (status:"generating")
    - Spawns new Worker("./worker/GenerationWorker.ts")
    - Posts "start" command with modelConfig, generationParams, corpus, isBaseline:true
    - Sets up AbortController listener for cancellation
    - Returns Promise<GenerationResult> — waits for worker "completed" event
    - onmessage handler: started → progress → completed/error/cancelled
    STATUS: REAL ✓
│
▼
[6] GenerationWorker.ts:42 — self.onmessage → executeGeneration(cmd, signal)
    - Lazy-loads: BPETokenizer, TensorMiniMindModel, AdamWOptimizer, Random,
      loadCheckpoint, GenerationEvaluator
    - Builds BPETokenizer, trains on TINY_TRAINING_CORPUS (30 sentences)
    - Builds TensorMiniMindModel({vocabSize, dModel:128, numHeads:4, dFF:512, numLayers:4, maxSeqLen:256})
    - isBaseline=true → skips checkpoint loading (model uses random init weights)
    - Emits "started" event
    - Runs GenerationEvaluator.evaluate([prompt], options)
    - Returns ALL tokens at once (synchronous for-loop)
    - Emits "completed" event with full GenerationResult
    STATUS: REAL ✓
│
▼
[7] GenerationEvaluator.ts:112 — evaluate(["User: hello\nAssistant:"], options)
    - For each prompt, calls evaluateSingle()
    - evaluateSingle (line 187):
      - Encodes prompt via tokenizer
      - For step in 0..maxTokens:
        - Truncates to ctx window (128)
        - Tensor.fromArray([ctx])
        - model.forward(input) → logits [1, seqLen, vocabSize]
        - Extracts last-position logits
        - sampleToken(logits, temperature, topK, topP)
        - Computes log-probability
        - Checks EOS
      - Decodes generated tokens → text
      - Returns {prompt, generatedText, generatedIds, tokenCount, avgLogProb, perplexity, stopReason}
    STATUS: REAL ✓
│
▼
[8] TensorMiniMindModel.ts:228 — forward(inputIds)
    - embedding.forward(inputIds) → [B, S, D]
    - For each TransformerBlock: Pre-Norm → Attention(causal) → Residual → Pre-Norm → FFN → Residual
    - finalNorm.forward(hidden)
    - lmHead.forward(flatHidden) → [B, S, vocabSize]
    - Returns logits tensor
    STATUS: REAL ✓ — Full autograd, real matrix operations
│
▼
[9] Result flows back up:
    Worker postMessage("completed", result)
    → GenerationRuntime.onmessage → resolves Promise
    → chatAdapter receives GenerationResult
    → extractAssistantResponse(prompt, generatedText) — strips prompt prefix
    → chatHistory.addMessage(conversationId, "assistant", content, requestId)
    → Returns {message, generation, conversation}
    → MiniMindChatShell: replaces optimistic messages with result.conversation.messages
    → setIsGenerating(false)
    → ConversationArea renders ChatMessage components
    STATUS: REAL ✓
```

### 2.2 Per-Layer Analysis

| Layer | Real? | Sync/Async | Streaming? | State | Error Points | Cancel? | Refresh? | Worker Crash? | Empty String? | Long Gen? |
|-------|-------|-----------|-----------|-------|-------------|---------|----------|---------------|---------------|-----------|
| ChatComposer | REAL | Sync (handler) | N/A | React useState | Empty input blocked | Immediate | State lost | N/A | N/A | N/A |
| MiniMindChatShell | REAL | Async (chatSend) | ❌ | React useState + useRef(AbortController) | Network-like errors caught | AbortController.abort() | All state lost (no hydration) | Caught via onerror → error message displayed | Caught as system message | AbortController available |
| chatAdapter | REAL | Async | ❌ | ChatHistoryStore (localStorage) | Missing conversation throws | Passes signal through | localStorage persists conversations | Propagated up | extractAssistantResponse returns "" gracefully | Passed through |
| generationAdapter | REAL | Async | ❌ | Workspace (localStorage) | Missing session throws | Passes signal through | Depends on workspace state | Propagated up | Not handled specially | Passed through |
| GenerationRuntime | REAL | Async (Promise+Worker) | ❌ (protocol exists, unused) | Map<string, State> | Worker.onerror → reject | worker.terminate() | Worker terminates, state lost | onerror → reject(new Error(...)) | Resolves with empty generatedText | No timeout, blocks until cancel |
| GenerationWorker | REAL | Sync (in worker) | ❌ (no progress emits) | Lexical scope | Module load failures, JSON parse errors | AbortController checkpoints: before load, after setup, in-loop missing | Worker context destroyed | self.onmessage handler catches → postMessage("error") | Returns "" from tokenizer.decode([]) | No timeout, runs maxTokens iterations |
| GenerationEvaluator | REAL | Sync | ❌ | Local variables | Empty prompt → Tensor.fromArray([]) throws; EOS not found | No abort-check inside for-loop | N/A (runs in worker) | Exception → caught in worker | Returns prompt + "" | Runs maxTokens iterations (~128) |
| TensorMiniMindModel | REAL | Sync | ❌ | Module parameters | Shape mismatch, invalid input dims | N/A | N/A | Exception → caught in evaluator | N/A | O(seqLen²) attention — bounded by maxCtx=128 |

---

## 3. Capability Reality Matrix

| Capability | Status | Evidence | Problem | Priority |
|-----------|--------|----------|---------|----------|
| Real generation | **REAL** | [GenerationEvaluator.ts:187-272](src/lib/minimind/evaluation/GenerationEvaluator.ts#L187) — real autoregressive loop with model.forward() | None | — |
| Real tokenization | **REAL** | [BPETokenizer.ts](src/lib/minimind/tokenizer/BPETokenizer.ts) — real BPE training+encode/decode | Each generation retrains tokenizer on corpus (wasteful) | P2 |
| Real inference | **REAL** | [TensorMiniMindModel.ts:228](src/lib/minimind/model/TensorMiniMindModel.ts#L228) — Embedding→Transformer×N→RMSNorm→LMHead, full autograd | None | — |
| Real persistence | **REAL** | [ChatHistoryStore.ts](src/lib/minimind/research/ChatHistoryStore.ts) — localStorage, 20 convs, 100 msgs/conv, 2000 chars/msg | No IndexedDB; 1MB limit with destructive trimming | P2 |
| Real cancellation | **REAL** | [GenerationRuntime.ts:332-339](src/lib/minimind/research/GenerationRuntime.ts#L332) — AbortController + worker.terminate() | No in-loop abort check in GenerationEvaluator; cancellation waits for current token to finish | P3 |
| Real streaming | **FAKE** | [GenerationWorker.ts:193-202](src/lib/minimind/research/worker/GenerationWorker.ts#L193) — protocol defines progress events but worker NEVER emits them; evaluator runs synchronous for-loop | **This is the #1 product gap** — users see nothing until generation completes | **P0** |
| Real checkpoint loading | **REAL** | [GenerationWorker.ts:147-168](src/lib/minimind/research/worker/GenerationWorker.ts#L147) — JSON.parse → loadCheckpoint(model, optimizer, checkpoint) | Only works if checkpointJSON exists in workspace; chat typically uses baseline (untrained) | P1 |
| Real model switching | **PARTIAL** | Chat always uses hardcoded config (vocabSize:32000, dModel:128, numHeads:4, dFF:512, numLayers:4). No UI to switch variants. | No Tiny/Standard selector; no custom config | P1 |
| Real conversation history | **REAL** | [ChatHistoryStore.ts:119-157](src/lib/minimind/research/ChatHistoryStore.ts#L119) — full CRUD via localStorage | See data model gaps below | P1 |
| Conversation rename | **MISSING** | grep confirms no renameConversation/updateConversation exists anywhere | Title auto-derived from first message, never changeable | **P0** |
| Regenerate response | **MISSING** | No regenerate/retry UI or adapter function exists | User must delete conversation and start over | **P0** |
| Copy response | **MISSING** | No clipboard interaction exists in chat components | Basic product expectation | P1 |
| Stop generation | **REAL** | [MiniMindChatShell.tsx:126-128](src/components/ai-lab/chat/MiniMindChatShell.tsx#L126) — AbortController created per-send | No visible "Stop" button in UI — user must wait or reload | **P0** |
| Error recovery | **BROKEN** | Errors displayed as system messages (filtered from ConversationArea); no retry button; error cleared on next action | User sees error text briefly, can't act on it | **P0** |
| Auto conversation title | **PARTIAL** | [ChatHistoryStore.ts:98-101](src/lib/minimind/research/ChatHistoryStore.ts#L98) — derives title from first message verbatim (max 60 chars) | Not semantic; "hello" becomes conversation title | P2 |
| Empty state | **REAL** | [ConversationArea.tsx:40-63](src/components/ai-lab/chat/ConversationArea.tsx#L40) — icon + "Send a message" + hint text | Acceptable but visually weak | P2 |
| Loading state | **REAL** | [ConversationArea.tsx:76-89](src/components/ai-lab/chat/ConversationArea.tsx#L76) — pulsing dot + "MiniMind is thinking..." | No token-by-token feedback during generation | P1 |
| First prompt experience | **PARTIAL** | Works end-to-end but user sees blank screen for ~0.5-3s depending on model | No generation progress, no estimated time | P1 |
| Keyboard shortcuts | **PARTIAL** | Enter=send, Shift+Enter=newline only | No Cmd+K (new conv), Cmd+Enter (send from anywhere), Escape (stop) | P2 |
| Mobile layout | **REAL** | Sidebar is fixed overlay on mobile, responsive breakpoints | Acceptable | P2 |
| Accessibility | **WEAK** | Basic aria-labels on buttons and textarea only; no landmark roles, no focus trap in sidebar, no reduced-motion support | Not WCAG compliant | P3 |
| Model identity display | **PARTIAL** | ModelStatusBadge shows static hardcoded labels | Doesn't reflect actual model config being used; doesn't show training status | P1 |

---

## 4. UX Gap Analysis

### 4.1 ChatGPT Feature Parity

| Feature | ChatGPT | MiniMind Chat | Gap |
|---------|---------|---------------|-----|
| New conversation | ✓ | ✓ | — |
| Conversation list | ✓ | ✓ | Sidebar, not collapsible by default |
| Rename conversation | ✓ | ✗ | **Critical UX gap** |
| Delete conversation | ✓ | ✓ | — |
| Auto title | ✓ (AI-generated) | Partial (first message verbatim) | Not semantic |
| Conversation search | ✓ | ✗ | P3 |
| Conversation archive | ✓ | ✗ | P3 |
| Model selector | ✓ | ✗ | Hardcoded "Tiny" |
| User message | ✓ | ✓ | Right-aligned, glass bubble |
| Assistant message | ✓ | ✓ | Left-aligned, accent border |
| Streaming response | ✓ | ✗ | **#1 product gap** |
| Stop generation | ✓ | ✗ (no visible button) | **Critical UX gap** |
| Regenerate | ✓ | ✗ | **Critical UX gap** |
| Edit message | ✓ | ✗ | P2 |
| Copy response | ✓ | ✗ | P1 |
| Thumbs up/down | ✓ | ✗ | P3 |
| Retry on error | ✓ | ✗ | **Critical UX gap** |
| Error message | ✓ | Partial (system messages filtered from view) | Broken UX |
| Keyboard shortcuts | ✓ | Minimal (Enter/Shift+Enter only) | P2 |
| Dark mode | ✓ | ✓ (inherits HOU Universe theme) | — |
| Mobile responsive | ✓ | ✓ | Sidebar overlay, acceptable |
| Code blocks / markdown | ✓ | ✗ (plain text only) | P2 |
| Token counter | ✗ | ✓ (in advanced panel) | Unique feature, but hidden |

### 4.2 Critical Missing Interactions

1. **Stop Button**: No visible way for user to stop generation. `abortRef.current.abort()` exists in code but never exposed to UI. Users must reload the page.

2. **Regenerate**: No way to re-run the last prompt. User must copy-paste their message and send again.

3. **Rename**: Conversation title is permanently set to the first message. "hello" as a title is not useful after 10 conversations.

4. **Error Recovery**: Errors are added as `role:"system"` messages which are filtered out by [ConversationArea.tsx:70](src/components/ai-lab/chat/ConversationArea.tsx#L70): `.filter((m) => m.role !== "system")`. So errors are silently dropped from the UI with no retry path.

---

## 5. Streaming Analysis

### 5.1 Current State: NOT STREAMED

The protocol has the scaffolding but the implementation never sends progress:

**Protocol (defined but unused):**
```typescript
// GenerationWorkerProtocol.ts:72-81
export interface GenerationWorkerProgressEvent {
  type: "progress";
  requestId: string;
  tokensGenerated: number;
  maxTokens: number;
  elapsedMs: number;
}
```

**Worker (never emits progress):**
```typescript
// GenerationWorker.ts:193-202
// ── Run REAL generation ──
const evaluator = new GenerationEvaluator(model, tokenizer);
const evalResults = evaluator.evaluate([...], {...});
// ← Runs ALL tokens, returns complete array
// NO progress events emitted during the loop
```

**Runtime (listens but never receives):**
```typescript
// GenerationRuntime.ts:218-226
case "progress": {
  state.progress = { tokensGenerated, maxTokens, elapsedMs };
  options.onProgress?.(state.progress);
  break; // ← This code is correct but NEVER REACHED
}
```

**Root cause:** [GenerationEvaluator.ts:206-254](src/lib/minimind/evaluation/GenerationEvaluator.ts#L206) — the `evaluateSingle` method uses a synchronous `for` loop. The worker's `executeGeneration` calls `evaluator.evaluate()` and awaits the full result. There is no callback/hook for per-token events.

### 5.2 Minimum Architectural Change for True Streaming

The architecture is actually very close to supporting streaming. The required changes are:

1. **GenerationEvaluator**: Add an `onToken?: (token: {id: number, text: string, index: number}) => void` callback parameter to `evaluate()` and `evaluateSingle()`. Call it after each token is sampled.

2. **GenerationWorker**: Pass a callback that sends `postMessage({type:"progress", ...})` after each token. Also add an abort check inside the generation loop (currently only checks at setup boundaries).

3. **GenerationRuntime**: The `onmessage` handler for "progress" events already works correctly. No changes needed, but the `onProgress` callback should be wired through to the chat layer.

4. **chatAdapter**: Add an `onToken` callback to `chatSend()` that forwards to the UI. Or return an async generator.

5. **MiniMindChatShell**: Update the last assistant message incrementally as tokens arrive.

6. **ChatMessage**: Add a streaming state that shows partial content with a cursor indicator.

**No new architecture needed.** The existing `UI → Adapter → Runtime → Worker → Core` chain already supports message passing in the worker→main direction. The progress protocol is defined. Only the evaluator's synchronous loop needs to be broken open.

### 5.3 What NOT to do

- ❌ Do NOT fake streaming with `setInterval` or client-side character-by-character reveal
- ❌ Do NOT create a new streaming runtime
- ❌ Do NOT add a separate streaming API alongside the existing one
- ✓ Add a callback to the existing evaluator loop
- ✓ Emit existing progress events from the worker
- ✓ Handle them in the existing runtime event switch

---

## 6. Conversation / Data Model Audit

### 6.1 Current Model

```typescript
// ChatHistoryStore.ts
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  generationRequestId?: string;  // Links to GenerationHistoryStore
  timestamp: number;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelConfig: ChatModelConfig;
  checkpointId?: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatModelConfig {
  vocabSize: number;
  dModel: number;
  numHeads: number;
  dFF: number;
  numLayers: number;
  maxSeqLen: number;
}
```

### 6.2 What's Missing

| Field | Current State | Gap | Priority |
|-------|--------------|-----|----------|
| `ChatMessage.generationMetadata` | Only `generationRequestId` (a foreign key) | No inline tokenCount, durationMs, perplexity, stopReason. Must cross-reference GenerationHistoryStore. | P1 |
| `ChatMessage.error` | Uses `role:"system"` for errors | No structured error type. System messages filtered from UI. | **P0** |
| `ChatConversation.archived` | Missing | No way to hide old conversations without deleting | P3 |
| `ChatConversation.pinned` | Missing | Important conversations can't be prioritized | P3 |
| `ChatConversation.tags` | Missing | No categorization | P3 |
| Message branching | Missing | Regenerate creates a new linear message, not a branch | P2 |
| Message edits | Missing | No way to edit a sent message and re-generate | P2 |
| `ChatMessage.tokenCount` | Missing | Users can't see per-message token usage | P2 |

### 6.3 Separation from Research Systems

✅ **Correctly separated.** Chat conversations (`ChatHistoryStore`) are independent of:
- `ResearchExperiment` / `ResearchRun` / `ResearchSession`
- `Checkpoint` data
- `ExperimentStore`

✅ **Correctly linked.** `ChatMessage.generationRequestId` provides traceability to `GenerationHistoryStore` without coupling schemas.

⚠️ **Risk**: When `generationRequestId` is set, but the corresponding `GenerationHistoryEntry` is deleted from `GenerationHistoryStore`, the link becomes dangling. This is acceptable (loose coupling) but should be documented.

### 6.4 Storage Limits

| Limit | Value | Risk |
|-------|-------|------|
| Max conversations | 20 | Reasonable for localStorage; too low for a real product. Oldest silently dropped. |
| Max messages per conv | 100 | Adequate for most chats |
| Max message length | 2000 chars | Too short for code blocks or long responses |
| Max storage | ~1MB | Easily exceeded with 20 conversations × 100 messages |
| Truncation strategy | Trim oldest convs silently | Data loss without warning; no user-facing indicator |

---

## 7. Visual Design Audit

### 7.1 What Works

- Deep-space/slate-blue color palette is consistent with HOU Universe
- Glassmorphism is restrained — borders are `/[0.06]`, backgrounds are `/[0.03]` opacity
- Framer Motion animations are tasteful (entrance animations, hover transitions)
- Mono typography for technical labels is appropriate
- Dark interface is premium-feeling

### 7.2 What's Wrong

| Issue | Location | Severity |
|-------|----------|----------|
| **Empty state is weak** | [ConversationArea.tsx:42-63](src/components/ai-lab/chat/ConversationArea.tsx#L42) — single icon + two lines of text, no suggested prompts, no visual warmth | High |
| **Header is oversized** | [ChatHeader.tsx:27](src/components/ai-lab/chat/ChatHeader.tsx#L27) — `pt-8 sm:pt-10` with title + subtitle + badge. Pushes conversation below fold on shorter screens | Medium |
| **No message hierarchy** | All assistant messages look identical. No visual distinction between first response (greeting), error, and normal generation | Medium |
| **Generation controls are noisy** | [GenerationControls.tsx:78-141](src/components/ai-lab/chat/GenerationControls.tsx#L78) — 6-8 tiny pills in a row above the composer feels like a developer debug bar, not a product control | High |
| **Model badge is static decoration** | [ModelStatusBadge.tsx:24-64](src/components/ai-lab/chat/ModelStatusBadge.tsx#L24) — green pulsing dot + hardcoded text. Looks like a component but communicates nothing dynamic | Medium |
| **Lab section creates visual whiplash** | After the chat composer, a full-width divider + 6 cards with icons, titles, descriptions. The transition from "chat product" to "research hub" is jarring | Medium |
| **Tiny font sizes** | `text-[0.6rem]` and `text-[0.65rem]` used extensively in controls, sidebar, badges. Barely readable on high-DPI screens | Medium |
| **Sidebar "New conversation" button duplicated** | Same button in sidebar header AND footer. Visual redundancy | Low |
| **No syntax highlighting for code** | Plain text rendering; `whitespace-pre-wrap` only | Low |
| **FloatingNavDock and BreadcrumbBar overlay chat** | [layout.tsx:40-43](src/app/ai-lab/layout.tsx#L40) — persistent nav elements compete for space with the chat shell | Low |

### 7.3 Suggested Tone Adjustments

The current design leans 60% "research dashboard" / 40% "chat product." For a ChatGPT-like experience:

- **Reduce**: Parameter pills (hide behind a single gear icon), Lab section (move to a separate route or footer link), oversized header
- **Add**: Message timestamps, generation speed indicator, token streaming cursor, suggested prompts in empty state
- **Preserve**: Glassmorphism, slate-blue palette, mono labels for technical elements, Framer Motion transitions

---

## 8. Performance Audit

### 8.1 Worker Lifecycle

```
Each generation:
  1. new Worker("GenerationWorker.ts")        ← Fresh Worker created
  2. import("BPETokenizer")                    ← Dynamic imports resolve (cached by browser)
  3. import("TensorMiniMindModel")             ← "
  4. new BPETokenizer().train(corpus, ...)     ← Tokenizer retrained EVERY TIME
  5. new TensorMiniMindModel({...})            ← Model reinitialized EVERY TIME (random weights)
  6. new AdamWOptimizer(model.parameters())    ← Only if checkpoint loading
  7. loadCheckpoint(model, optimizer, ckpt)   ← Only if trained generation
  8. evaluator.evaluate([prompt], options)     ← Forward pass × maxTokens
  9. worker.terminate()                         ← Worker killed immediately
```

### 8.2 Bottlenecks

| Issue | Impact | Evidence | Fix |
|-------|--------|----------|-----|
| **Tokenizer retrained every generation** | ~50-150ms per send | [GenerationWorker.ts:132-134](src/lib/minimind/research/worker/GenerationWorker.ts#L132) — `new BPETokenizer()` + `.train(corpus, ...)` | Cache tokenizer state; only train once |
| **Model rebuilt every generation** | ~50-200ms per send | [GenerationWorker.ts:137-144](src/lib/minimind/research/worker/GenerationWorker.ts#L137) — `new TensorMiniMindModel({...})` | Keep worker alive between generations; reuse model |
| **Worker killed after each generation** | ~20-50ms spawn cost | [GenerationRuntime.ts:387-394](src/lib/minimind/research/GenerationRuntime.ts#L387) — `cleanup()` calls `worker.terminate()` | Pool workers or keep alive with reset |
| **No in-loop abort check** | Cancellation waits for current token | [GenerationEvaluator.ts:206](src/lib/minimind/evaluation/GenerationEvaluator.ts#L206) — `for (let step = 0; step < maxTokens; step++)` has no abort check | Add `if (signal?.aborted) break` inside loop |
| **localStorage 1MB limit** | Data loss when exceeded | [ChatHistoryStore.ts:274](src/lib/minimind/research/ChatHistoryStore.ts#L274) — trims oldest conversations silently | Migrate to IndexedDB for chat; keep localStorage for settings |
| **Message truncation at 2000 chars** | Long responses silently truncated | [ChatHistoryStore.ts:93-96](src/lib/minimind/research/ChatHistoryStore.ts#L93) | Increase to 8000 or remove limit with IndexedDB |
| **No React.memo on ChatMessage** | Re-renders all messages on any state change | [ConversationArea.tsx:69-73](src/components/ai-lab/chat/ConversationArea.tsx#L69) — `.map()` without memo | Add React.memo with message.id+content as key |
| **Auto-scroll on every render** | scrollIntoView on every messages change | [ConversationArea.tsx:35-37](src/components/ai-lab/chat/ConversationArea.tsx#L35) — useEffect fires on every messages/isGenerating change | Only scroll when new message added or user is near bottom |

### 8.3 Memory

- Each `TensorMiniMindModel` instance: ~600K parameters × 4 bytes (float32) = ~2.4MB for Tiny preset
- With gradient buffers (if training): ~2× additional
- Worker memory is reclaimed on `terminate()`
- No memory leak detected (cleanup deletes Map entries + terminates worker)
- localStorage: 1MB cap, but 20 conversations × 100 messages × 2000 chars ≈ 4MB uncompressed → trimming expected

---

## 9. Architecture Risks

### 9.1 Real Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Generation takes >10s with no feedback | High | Users think it's broken, reload page | P0: Streaming + progress |
| Worker crashes on malformed checkpoint JSON | Medium | Error propagated to UI but no retry | P0: Error recovery UI |
| localStorage quota exceeded | Medium | Silent conversation loss | P2: IndexedDB migration |
| Model uses random weights with no training | High (current default) | Output is gibberish — users think "MiniMind is bad" | P1: Clearer model state communication |
| Multiple rapid sends | Low (isGenerating guard) | State corruption | P3: Request queue |
| Page refresh during generation | Medium | Worker killed, conversation state lost (localStorage has partial data) | P2: Rehydrate active conversation |

### 9.2 Non-Risks (Already Handled)

- Model inference is real → no hallucinated architecture
- Tokenization is real BPE → no hardcoded token maps
- Autograd is real → metrics (logProb, perplexity) are computed from actual model outputs
- Cancellation cleans up properly → no zombie workers
- Browser/Node boundary is respected → no fs/path imports in worker or store code

---

## 10. P0 / P1 / P2 / P3 Roadmap

### P0 — Must Fix Before Calling This a Usable AI Product

| # | Task | Effort | Files Affected |
|---|------|--------|---------------|
| P0.1 | **Add per-token progress events in GenerationEvaluator** — Add `onToken` callback to `evaluate()`/`evaluateSingle()`, emit after each sampled token. Add abort check inside generation loop. | Medium | `GenerationEvaluator.ts`, `GenerationWorker.ts` |
| P0.2 | **Stream tokens to UI** — Handle progress events in Runtime, propagate through adapter, update message content incrementally in shell. Show streaming cursor in ChatMessage. | Medium | `GenerationRuntime.ts`, `chatAdapter.ts`, `MiniMindChatShell.tsx`, `ChatMessage.tsx` |
| P0.3 | **Add visible Stop button** — Replace send button with stop button during generation. Wire to `abortRef.current.abort()`. | Small | `ChatComposer.tsx`, `MiniMindChatShell.tsx` |
| P0.4 | **Add error recovery** — Show errors as dismissible banners (not hidden system messages). Add "Retry" button that resends last user message. | Small | `ConversationArea.tsx`, `ChatMessage.tsx`, `MiniMindChatShell.tsx` |
| P0.5 | **Add conversation rename** — Double-click title or add edit button. Update ChatHistoryStore with `renameConversation(id, title)`. | Small | `ChatHistoryStore.ts`, `ChatSidebar.tsx`, `ConversationListItem.tsx` |
| P0.6 | **Add regenerate** — Add "Regenerate" button on last assistant message. Resends the conversation without the last assistant message. | Medium | `chatAdapter.ts`, `ChatMessage.tsx`, `MiniMindChatShell.tsx` |

### P1 — Important Product Quality

| # | Task | Effort | Files Affected |
|---|------|--------|---------------|
| P1.1 | **Improve empty state** — Add suggested prompt chips ("Tell me a story", "Explain attention", "What is MiniMind?"). | Small | `ConversationArea.tsx` |
| P1.2 | **Add copy button** — Copy icon on hover for assistant messages. `navigator.clipboard.writeText()`. | Small | `ChatMessage.tsx` |
| P1.3 | **Add generation metadata to messages** — Show token count and duration below assistant messages in subtle mono text. | Small | `ChatMessage.tsx`, `ChatHistoryStore.ts` |
| P1.4 | **Dynamic model badge** — Show actual model config (dModel, numLayers) and training status. Replace hardcoded labels with real data. | Small | `ModelStatusBadge.tsx`, `MiniMindChatShell.tsx` |
| P1.5 | **Composer stop button** — Already in P0.3. Also add Escape key to stop generation. | Trivial | `ChatComposer.tsx` |
| P1.6 | **Model checkpoint indicator** — Clearly distinguish baseline (untrained/random) from trained checkpoint generation. | Small | `GenerationControls.tsx`, `ChatHeader.tsx` |

### P2 — Polish

| # | Task | Effort | Files Affected |
|---|------|--------|---------------|
| P2.1 | **Reduce header height** — Compact header on mobile, reduce padding. Move subtitle into title line. | Small | `ChatHeader.tsx` |
| P2.2 | **Simplify generation controls** — Hide all pills behind a single gear icon. Show preset chips only (Precise/Balanced/Creative). | Medium | `GenerationControls.tsx` |
| P2.3 | **Cache tokenizer in worker** — Keep worker alive between generations. Only train tokenizer once. | Medium | `GenerationRuntime.ts`, `GenerationWorker.ts` |
| P2.4 | **Migrate to IndexedDB** — Replace localStorage with IndexedDB for conversations. Remove 1MB/2000-char limits. | Large | `ChatHistoryStore.ts` (new) |
| P2.5 | **Cached model in worker** — Reuse model instance across generations from the same conversation. | Medium | `GenerationWorker.ts`, `GenerationRuntime.ts` |
| P2.6 | **Keyboard shortcuts** — Cmd+K new conversation, Escape stop, Cmd+Enter send. | Small | `MiniMindChatShell.tsx` |
| P2.7 | **Auto-scroll refinement** — Only auto-scroll if user is within 100px of bottom. Don't steal scroll position. | Trivial | `ConversationArea.tsx` |
| P2.8 | **Semantic conversation titles** — Use a simple heuristic: take first 60 chars, remove "hello"/"hi"/"test" → use "New conversation (timestamp)" if too generic. | Small | `ChatHistoryStore.ts` |
| P2.9 | **Markdown rendering** — Render code blocks, bold, italic in messages. Use a lightweight markdown parser (no XSS risk). | Medium | `ChatMessage.tsx` |

### P3 — Future Research Features

| # | Task | Effort |
|---|------|--------|
| P3.1 | Conversation search | Medium |
| P3.2 | Conversation archiving/pinning | Small |
| P3.3 | Message branching visualization | Large |
| P3.4 | Model variant selector (Tiny/Standard) | Medium |
| P3.5 | Generation speed benchmarking | Small |
| P3.6 | Side-by-side model comparison in chat | Large |
| P3.7 | Accessibility audit + remediation | Medium |
| P3.8 | Reduced motion support | Trivial |

---

## 11. Recommended Phase 71

**Focus: Streaming + Error Recovery + Conversation UX**

Phase 71 should implement P0 items P0.1 through P0.6:

1. **Per-token streaming from evaluator to UI** (the defining product improvement)
2. **Stop button** visible during generation
3. **Error banners with retry buttons**
4. **Conversation rename** (double-click or edit icon)
5. **Regenerate** on last assistant message

This is a focused ~6-item phase that transforms the experience from "developer demo" to "usable chat product" without touching the core model architecture.

**Estimated scope:** 6-8 files changed, no new files, no new architecture.

---

## 12. Explicit "Do Not Build" List

1. ❌ Do NOT create a new streaming runtime — extend GenerationEvaluator with an `onToken` callback
2. ❌ Do NOT create a new conversation store — extend ChatHistoryStore
3. ❌ Do NOT create a new generation engine — extend GenerationEvaluator
4. ❌ Do NOT create a new message type — use existing ChatMessage
5. ❌ Do NOT duplicate identity generators — use existing generateRequestId
6. ❌ Do NOT introduce fake streaming — use real token-by-token events
7. ❌ Do NOT introduce Math.random() for model behavior
8. ❌ Do NOT add mock/fake data or simulated metrics
9. ❌ Do NOT create a new chat adapter — extend chatAdapter
10. ❌ Do NOT change the UI → Adapter → Runtime → Worker → Core architecture
11. ❌ Do NOT modify `src/lib/minimind/core/*` (Tensor, autograd, ops)
12. ❌ Do NOT modify `src/lib/minimind/model/TensorMiniMindModel.ts`
13. ❌ Do NOT modify `src/lib/minimind/training/*`
14. ❌ Do NOT add OAuth, user accounts, or server-side persistence
15. ❌ Do NOT add API keys or external model providers
16. ❌ Do NOT remove the Lab section (it's the gateway to research features)
17. ❌ Do NOT add a "thinking" animation with fake delay — show real token streaming
18. ❌ Do NOT add a "confidence score" unless it's computed from real model log-probabilities
19. ❌ Do NOT bypass the adapter layer from UI components
20. ❌ Do NOT import React or browser APIs in lib/minimind/*

---

## Appendix A: Files Audited

### Chat UI Components (all real, Phase 69)
- [MiniMindChatShell.tsx](src/components/ai-lab/chat/MiniMindChatShell.tsx) — State owner, composition root
- [ChatHeader.tsx](src/components/ai-lab/chat/ChatHeader.tsx) — Branding + model badge
- [ChatSidebar.tsx](src/components/ai-lab/chat/ChatSidebar.tsx) — Conversation list sidebar
- [ConversationArea.tsx](src/components/ai-lab/chat/ConversationArea.tsx) — Message list + empty state
- [ChatMessage.tsx](src/components/ai-lab/chat/ChatMessage.tsx) — Individual message bubble
- [ChatComposer.tsx](src/components/ai-lab/chat/ChatComposer.tsx) — Textarea + send button
- [ConversationListItem.tsx](src/components/ai-lab/chat/ConversationListItem.tsx) — Sidebar item
- [GenerationControls.tsx](src/components/ai-lab/chat/GenerationControls.tsx) — Parameter controls
- [ModelStatusBadge.tsx](src/components/ai-lab/chat/ModelStatusBadge.tsx) — Model identity pill
- [LabSection.tsx](src/components/ai-lab/chat/LabSection.tsx) — Bottom navigation hub
- [LabCard.tsx](src/components/ai-lab/chat/LabCard.tsx) — Individual lab card

### Adapter Layer (all real)
- [chatAdapter.ts](src/lib/ai-lab/adapters/chatAdapter.ts) — Chat-specific adapter
- [generationAdapter.ts](src/lib/ai-lab/adapters/generationAdapter.ts) — Generation adapter

### Runtime & Worker (all real)
- [GenerationRuntime.ts](src/lib/minimind/research/GenerationRuntime.ts) — Main-thread bridge
- [GenerationWorker.ts](src/lib/minimind/research/worker/GenerationWorker.ts) — Web Worker
- [GenerationWorkerProtocol.ts](src/lib/minimind/research/worker/GenerationWorkerProtocol.ts) — Message types

### Core Model & Evaluation (all real, NOT to be modified)
- [TensorMiniMindModel.ts](src/lib/minimind/model/TensorMiniMindModel.ts) — Full GPT model
- [GenerationEvaluator.ts](src/lib/minimind/evaluation/GenerationEvaluator.ts) — Generation quality evaluation
- [BPETokenizer.ts](src/lib/minimind/tokenizer/BPETokenizer.ts) — BPE tokenizer

### Data Stores (all real)
- [ChatHistoryStore.ts](src/lib/minimind/research/ChatHistoryStore.ts) — Conversation persistence
- [GenerationHistoryStore.ts](src/lib/minimind/research/GenerationHistoryStore.ts) — Generation history
- [ResearchWorkspace.ts](src/lib/minimind/research/ResearchWorkspace.ts) — Session/checkpoint data

### Page & Layout
- [page.tsx](src/app/ai-lab/page.tsx) — Renders MiniMindChatShell
- [layout.tsx](src/app/ai-lab/layout.tsx) — AI Lab layout

### Tests
- [phase67-generation.test.ts](src/lib/minimind/research/__tests__/phase67-generation.test.ts) — 6 suites, 25+ tests, all passing

---

## Appendix B: Test Results

### Existing Tests
- `phase67-generation.test.ts`: 25+ tests covering GenerationResult types, GenerationHistoryStore CRUD, real GenerationEvaluator integration, train→checkpoint→generate→compare pipeline, deterministic generation, checkpoint restoration, export functions, and browser boundary audit.

### Test Status
- All existing tests pass with the MockWorker polyfill
- No chat-adapter-specific tests exist
- No ChatHistoryStore-specific tests exist (tested indirectly through phase67 tests)

---

*Audit completed 2026-08-12. No code was changed. No files were created except this document.*
