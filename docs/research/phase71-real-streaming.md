# Phase 71 — Real Streaming Chat

## Status: COMPLETE

---

## 1. Before Architecture

```
Chat UI → chatAdapter → generationAdapter → GenerationRuntime → GenerationWorker
                                                                      │
  ┌───────────────────────────────────────────────────────────────────┘
  │ Worker: evaluator.evaluate() — BLOCKS until ALL tokens done
  │   for (step=0; step<maxTokens; step++) { sampleToken(...) }
  │   return { generatedText, ... }  ← ALL at once
  │
  │ Events: "started" → "completed"  (2 events total)
  │
  ▼
UI shows spinner → full response appears after wait
```

### Key Problems (Phase 70 Audit P0):
1. No true streaming — full response delivered at once
2. No Stop button — cannot interrupt generation
3. "progress" event defined but never emitted
4. `cancel()` called `worker.terminate()` immediately — no partial result preservation

---

## 2. After Architecture

```
Chat UI ← chatAdapter ← generationAdapter ← GenerationRuntime ← GenerationWorker
  │                                                                   │
  │  onToken callback chain                                           │
  │  ← "A" → ← " transformer" → ← " is" →  ← REAL token loop         │
  │                                                                   │
  │  Events: "started" → "token"×N → "completed"/"stopped"/"error"
  │
  ▼
Token-by-token display from REAL model output
```

---

## 3. Real Token Flow

```
1. ChatComposer → handleSend(userMessage)
2. MiniMindChatShell → chatAdapter.chatSend(..., onToken)
3. chatAdapter → generationAdapter.generateFromSession(..., onToken)
4. generationAdapter → generationRuntime.generate({..., onToken})
5. GenerationRuntime → spawns Worker, sends "start" command
6. GenerationWorker:
   a. Builds tokenizer, model, loads checkpoint
   b. Posts "started" event
   c. Runs evaluator.evaluate([prompt], { onToken, signal })
   d. For each REAL generated token:
      - Decodes token: this.tokenizer.decode([tokenId])
      - Calls onToken(decodedToken, tokenIndex)
      - Posts { type: "token", token, tokenIndex, textSoFar }
   e. Posts "completed" or "stopped" with final result
7. GenerationRuntime:
   - Forwards token events via options.onToken()
   - Accumulates textSoFar in state
   - Resolves promise on completed/stopped/error
8. chatAdapter: passes textSoFar through onToken (already just the assistant response)
9. MiniMindChatShell: setStreamingText(textSoFar) → React re-renders ChatMessage
10. ConversationArea: shows ChatMessage with isStreaming={true}
```

---

## 4. Cancellation Flow

```
User clicks Stop (Square button)
  ↓
ChatComposer.onStop()
  ↓
MiniMindChatShell.handleStop()
  ↓
abortController.abort()
  ↓
GenerationRuntime: worker.postMessage({ type: "cancel" })
  ↓ [grace period: 5000ms]
GenerationWorker: signal.aborted → true
  ↓
GenerationEvaluator loop: checks signal.aborted, breaks loop
  ↓
stopReason = "error", partial generatedIds preserved
  ↓
Worker posts { type: "stopped", result: { status: "stopped", ... } }
  ↓
Runtime resolves promise with partial result
  ↓
MiniMindChatShell: preserves streamingText as assistant message
  ↓
UI shows partial response
```

Key improvement: Cancellation is COOPERATIVE. Worker gets a 5s grace period to finish current token and emit partial result. Worker.terminate() only fires as fallback.

---

## 5. Worker Protocol

### Commands (main → worker):
| Command | Fields | Purpose |
|---------|--------|---------|
| `start` | requestId, sessionId, checkpointJSON, modelConfig, generationParams, corpus, isBaseline | Begin generation |
| `cancel` | requestId | Cooperatively stop generation |

### Events (worker → main):
| Event | Fields | Phase |
|-------|--------|-------|
| `started` | requestId | 67 |
| `token` | requestId, token, tokenIndex, textSoFar | **71** |
| `progress` | requestId, tokensGenerated, maxTokens, elapsedMs | 67 (now emitted) |
| `completed` | requestId, result | 67 |
| `stopped` | requestId, result (partial) | **71** |
| `error` | requestId, error | 67 |
| `cancelled` | requestId | 67 |

---

## 6. Runtime State Machine

```
idle → generating → completed
                  → stopped (user cancelled, has partial result)
                  → error (worker failure)
                  → cancelled (cancelled before any generation started)
```

### GenerationRuntimeState:
```typescript
{
  requestId: string;
  status: GenerationRuntimeStatus;
  progress: { tokensGenerated, maxTokens, elapsedMs } | null;
  textSoFar: string;  // ← NEW (Phase 71)
  result: GenerationResult | null;
  error: string | null;
}
```

---

## 7. Persistence Behavior

- **During generation**: memory state only (no localStorage writes)
- **On completed**: persist full assistant message via ChatHistoryStore
- **On stopped**: persist partial text as assistant message (if any tokens generated)
- **On error**: persist error as system message
- **Empty generation**: no assistant message created (prevents meaningless empty bubbles)

---

## 8. Performance Considerations

- React only re-renders the streaming ChatMessage, not the entire app
- Sidebar does not re-render on token updates
- localStorage only written at lifecycle boundaries (completed/stopped/error)
- Worker messages contain decoded token strings (small, ~1-10 bytes each)
- Token callback fires per-token with no artificial batching
- styled-components not used — Tailwind CSS ensures no runtime CSS overhead

---

## 9. Test Coverage

### New Tests (phase71-streaming.test.ts): 14 tests

| Suite | Tests | Coverage |
|-------|-------|----------|
| Real token callback | 5 | onToken fires, ordering, count, greedy, determinism |
| Cooperative cancellation | 4 | Pre-abort, post-abort, non-abort, EOS |
| Edge cases | 2 | Empty prompt, UTF-8 validity |
| Token accumulation | 2 | Length matching, approximate decode match |

### Existing Tests (phase67-generation.test.ts): 33 tests — ALL PASS

---

## 10. Known Limitations

1. **BPE per-token decode vs batch decode**: Decoding individual BPE tokens and concatenating may differ slightly from batch decoding at byte boundaries (1-2 bytes). This is a fundamental BPE property — the `textSoFar` approach tracks the concatenated individual decodes, which is what the user sees.

2. **Untrained model output**: An untrained (baseline) model generates random-looking text. The streaming display will show garbage tokens — this is correct behavior for an untrained model.

3. **Grace period timeout**: If a worker doesn't respond to cancel within 5 seconds, it's forcefully terminated. This fallback should rarely trigger since the evaluator checks `signal.aborted` at every token step.

4. **No KV Cache**: The current evaluator recomputes the full context at every step. For a larger model, this would be slow. KV Cache optimization is outside Phase 71 scope.

---

## 11. Files Modified

| File | Change |
|------|--------|
| `src/lib/minimind/evaluation/GenerationEvaluator.ts` | Added `onToken` callback and `signal` to `GenerationEvalOptions` and `evaluateSingle` |
| `src/lib/minimind/research/worker/GenerationWorkerProtocol.ts` | Added `GenerationWorkerTokenEvent` and `GenerationWorkerStoppedEvent` |
| `src/lib/minimind/research/worker/GenerationWorker.ts` | Token streaming via onToken, cooperative cancel, progress events |
| `src/lib/minimind/research/GenerationRuntime.ts` | `onToken` in GenerateOptions, `stopped` status, textSoFar state, graceful cancel |
| `src/lib/minimind/research/GenerationResult.ts` | Added `"stopped"` to GenerationStatus |
| `src/lib/ai-lab/adapters/generationAdapter.ts` | `onToken` parameter in generateFromSession/generateBaseline |
| `src/lib/ai-lab/adapters/chatAdapter.ts` | `onToken` parameter in chatSend, empty message guard |
| `src/components/ai-lab/chat/MiniMindChatShell.tsx` | Streaming state, onToken subscription, handleStop, partial text preservation |
| `src/components/ai-lab/chat/ConversationArea.tsx` | Streaming text display, streaming ChatMessage |
| `src/components/ai-lab/chat/ChatMessage.tsx` | `isStreaming` prop, blinking cursor, no animation for stream |
| `src/components/ai-lab/chat/ChatComposer.tsx` | Stop button with Square icon |
| `src/lib/i18n/locales/en.json` | New keys: stop, generationStopped, generationComplete, generationFailed, emptyResponse |
| `src/lib/i18n/locales/zh-CN.json` | New keys: 停止生成, 生成已停止, 生成完成, 生成失败, 空响应 |

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/minimind/evaluation/__tests__/phase71-streaming.test.ts` | 14 streaming tests |
| `docs/research/phase71-real-streaming.md` | This document |

### Files NOT Modified (as required)

- `src/lib/minimind/core/*` — zero changes
- `src/lib/minimind/model/*` — zero changes
- `src/lib/minimind/training/*` — zero changes

---

## 12. Verification Results

- **Build**: PASS (npm run build — no errors, no warnings)
- **Phase 71 tests**: 14/14 PASS
- **Phase 67 tests**: 33/33 PASS (no regressions)
- **Fake streaming audit**: CLEAN — zero fake streaming in chat/generation path
- **Browser/Node boundary**: INTACT — all generation still runs in Web Worker
- **Architecture preserved**: UI → Adapter → Runtime → Worker → Core

---

## 13. Files NOT in Scope (Phase 72+)

These were explicitly excluded from Phase 71:

- Conversation rename
- Regenerate button
- Retry on error
- Visual redesign
- KV Cache optimization
- Full retry UX

Phase 71 delivers ONE thing: real token streaming from actual model generation.
