# Phase 72 — Chat Reliability & Recovery

## 1. Generation State Machine

The chat generation lifecycle is governed by a single authoritative state:

```
ChatGenerationStatus:
  idle → starting → streaming → completed
                              → stopped (user cancelled, partial result preserved)
                              → failed (error, retry available)
                  → stopping → stopped
```

Previously, the UI used multiple competing booleans (`isGenerating`, `isLoading`, `isStopping`, `hasError`, `isComplete`). Phase 72 replaces all of these with `ChatGenerationStatus` on each `ChatMessage`. The UI derives all behavior from this single field.

### State Derivation

| State | Composer Button | Message Area | User Can Send |
|-------|----------------|-------------|---------------|
| idle | [Send] | Empty state or messages | Yes |
| starting | [Stop] | "Thinking..." indicator | No |
| streaming | [Stop] | Token-by-token display | No |
| stopping | [Stopping…] spinner | Partial text preserved | No |
| completed | [Send] | Message + [Regenerate] | Yes |
| stopped | [Send] | Partial text + "Generation stopped" | Yes |
| failed | [Send] | Error card + [Retry] | Yes |

## 2. Error Propagation

### Before Phase 72

1. `GenerationWorker` emits `{ type: "error" }`
2. `GenerationRuntime` rejects the promise
3. `chatAdapter` adds system message + re-throws
4. `MiniMindChatShell` catches and adds ANOTHER system message
5. `ConversationArea` filters out ALL system messages (`.filter(m => m.role !== "system")`)
6. **User sees nothing** — error is completely invisible

### After Phase 72

1. `GenerationWorker` emits `{ type: "error" }`
2. `GenerationRuntime` rejects the promise
3. `chatAdapter` throws a `ChatGenerationError` (structured, typed)
4. `MiniMindChatShell` catches it, sets `generationState = "failed"`, adds a failed placeholder message
5. `ChatMessage` renders the error card with [Retry] button
6. **User sees**: "Generation failed" + error detail + Retry action

No raw stack traces are shown to users. Error details shown are the error message only.

## 3. Retry Flow

```
User message → Generation → FAILED
                                ↓
                        User clicks [Retry]
                                ↓
            chatHistory.getLastUserMessage() ← retrieves original prompt
            chatHistory.removeLastAssistantMessage() ← removes failed msg
                                ↓
            generateResponse() ← new real generation, new requestId
                                ↓
                        streaming → completed
```

- Retry does NOT add a duplicate user message
- Retry creates a new generation identity (`requestId`)
- The previous failed response is removed from the conversation
- Real model inference only — no cached or fake responses

## 4. Regenerate Flow

```
User: Explain transformers.
Assistant: Response A       ← User clicks [Regenerate]
                                ↓
            chatHistory.getLastUserMessage() ← "Explain transformers."
            chatHistory.removeLastAssistantMessage() ← removes Response A
                                ↓
            generateResponse() ← new real generation, new requestId
                                ↓
Assistant: Response B       ← completely new, real inference
```

- Original user message remains exactly once
- Previous response is removed from the conversation
- New generation identity is created
- Real model inference — not a copy of the previous output

## 5. Persistence Semantics

| Generation State | What Is Persisted |
|-----------------|-------------------|
| completed | Full generated text, `generationRequestId`, timestamp |
| stopped | Partial text (whatever was streamed before stop), `generationStatus: "stopped"` |
| failed | Empty assistant placeholder, `generationStatus: "failed"` |
| streaming (on refresh) | Detected and transitioned to `"stopped"` |

No duplicate assistant messages after refresh. The refresh recovery logic in `MiniMindChatShell` detects messages with `generationStatus: "streaming"` and transitions them to `"stopped"`.

## 6. Refresh Recovery

On page refresh during active generation:

1. `useEffect` on mount checks the active conversation
2. If the last message has `generationStatus === "streaming"`, it's marked as `"stopped"`
3. The UI is never permanently stuck in "Generating..."
4. Partial text (if any) is preserved in the conversation

The `GenerationRuntime` also has a 120-second timeout. If a worker doesn't respond within 2 minutes, it's forcefully terminated and the generation transitions to `"error"`.

## 7. Concurrency Rules

- Only one generation may be active per chat session
- `canStartGeneration` guards: only `idle`, `completed`, `stopped`, `failed` allow new generations
- `isBusy` (derived from `starting | streaming | stopping`) blocks all other actions
- If Send is clicked twice rapidly, only the first starts
- If Retry is clicked twice rapidly, only the first starts
- If Regenerate is clicked while generating: disabled (button hidden during busy states)

## 8. Identity Handling

All IDs use counter-based generation — no `Math.random()`:

| Function | Prefix | Format |
|----------|--------|--------|
| `generateRequestId()` | `gen-` | `gen-{timestamp36}-{counter36}` |
| `generateComparisonId()` | `cmp-` | `cmp-{timestamp36}-{counter36}` |
| `generateHistoryEntryId()` | `hist-` | `hist-{timestamp36}-{counter36}` |
| `generateConversationId()` | `conv-` | `conv-{timestamp36}-{counter36}` |
| `generateMessageId()` | `msg-` | `msg-{timestamp36}-{counter36}` |

Every generation traces to: Generation → Checkpoint → Run → Experiment.

Retry and Regenerate create new generation identities.

## 9. Test Coverage

- **Phase 72:** 28 tests — identity audit, state machine, error handling, ChatHistoryStore helpers, conversation integrity, persistence, error propagation, message ID determinism, real generation via GenerationEvaluator, cancelled generation, unique identity
- **Phase 71:** 14 tests — streaming, token callbacks, cancellation
- **Phase 67:** 33 tests — generation types, history store, evaluator, integration, export, browser boundary

**Total: 75 tests, 0 failures.**

## 10. Known Limitations

1. **Worker-based tests:** Tests that go through `chatSend` → Worker path are not covered in the Node.js test environment because the `MockWorker` doesn't execute real generation. The adapter and store logic is tested through unit tests, and real generation is tested through `GenerationEvaluator` directly.

2. **UI-level tests:** React component rendering tests (error card visibility, retry button click) are not covered. These require a browser testing framework (Playwright, Testing Library).

3. **Timeout granularity:** The 120-second generation timeout is a coarse-grained safety net. Individual token generation steps are not independently timed; they rely on the cooperative cancellation check before each step.

4. **chatRetry/chatRegenerate concurrency:** These are guarded at the UI level (button disabled states, `canStartGeneration` check). There is no adapter-level mutex — the UI guard is the sole concurrency control.

5. **Conversation integrity after refresh:** If a conversation was modified by another tab/window, the in-memory state may diverge from localStorage. Phase 72 relies on localStorage as the source of truth.
