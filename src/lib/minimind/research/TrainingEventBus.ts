// ============================================================
// MiniMind — research/TrainingEventBus.ts
// ============================================================
// Phase 57: Live training event system.
//
// Provides a lightweight pub/sub event bus for real-time
// training updates. UI components subscribe to events and
// receive live metrics without polling.
//
// Events:
//   - training:start      — training has begun
//   - training:step       — a training step has completed
//   - training:checkpoint — a checkpoint was saved
//   - training:evaluation — an evaluation was completed
//   - training:complete   — training finished successfully
//   - training:error      — training encountered an error
//
// Design:
//   - In-memory pub/sub — no persistence, no networking
//   - Synchronous emit — callbacks fire immediately
//   - Type-safe — event data payloads are typed
//   - No dependencies — zero external imports
//
// Usage:
//   import { TrainingEventBus } from "./TrainingEventBus";
//   const bus = new TrainingEventBus();
//   const unsub = bus.subscribe("training:step", (data) => {
//     console.log("loss:", data.metrics.loss);
//   });
//   // Later:
//   unsub(); // unsubscribe
// ============================================================

import type {
  TrainingMetricsSnapshot,
  ResearchCheckpoint,
} from "./ResearchState";

// ============================================================
// Event Types
// ============================================================

/**
 * Known training event type strings.
 */
export type TrainingEventType =
  | "training:start"
  | "training:step"
  | "training:checkpoint"
  | "training:evaluation"
  | "training:complete"
  | "training:error";

// ============================================================
// Event Data Payloads
// ============================================================

/**
 * Data payload for the training:start event.
 */
export interface TrainingStartData {
  /** Session ID (ResearchSession.id) or experiment ID (ResearchExperiment.id) */
  sessionId: string;
  /** Run ID (ResearchRun.runId) — set when emitted by ResearchExperimentRunner */
  runId?: string;
  /** Human-readable experiment name */
  experimentName: string;
  /** Model configuration */
  modelConfig: unknown;
  /** Training configuration */
  trainingConfig: unknown;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Whether this is a resume (from paused/checkpoint) */
  isResume: boolean;
}

/**
 * Data payload for the training:step event.
 */
export interface TrainingStepData {
  /** Session ID (ResearchSession.id) or experiment ID (ResearchExperiment.id) */
  sessionId: string;
  /** Run ID (ResearchRun.runId) — set when emitted by ResearchExperimentRunner */
  runId?: string;
  /** Current training metrics snapshot */
  metrics: TrainingMetricsSnapshot;
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Data payload for the training:checkpoint event.
 */
export interface TrainingCheckpointData {
  /** Session/experiment ID */
  sessionId: string;
  /** Checkpoint metadata */
  checkpoint: ResearchCheckpoint;
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Data payload for the training:evaluation event.
 */
export interface TrainingEvaluationData {
  /** Session/experiment ID */
  sessionId: string;
  /** Evaluation metrics */
  metrics: Record<string, unknown>;
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Data payload for the training:complete event.
 */
export interface TrainingCompleteData {
  /** Session/experiment ID */
  sessionId: string;
  /** Run ID (ResearchRun.runId) — set when emitted by ResearchExperimentRunner */
  runId?: string;
  /** Human-readable experiment name */
  experimentName: string;
  /** Final loss value */
  finalLoss: number | undefined;
  /** Final perplexity value */
  finalPerplexity: number | undefined;
  /** Best (lowest) loss achieved */
  bestLoss: number | undefined;
  /** Training duration in milliseconds */
  durationMs: number | undefined;
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Data payload for the training:error event.
 */
export interface TrainingErrorData {
  /** Session/experiment ID */
  sessionId: string;
  /** Run ID (ResearchRun.runId) — set when emitted by ResearchExperimentRunner */
  runId?: string;
  /** Human-readable experiment name */
  experimentName: string;
  /** Error message */
  error: string;
  /** Unix timestamp (ms) */
  timestamp: number;
}

// ============================================================
// Event Data Union
// ============================================================

/**
 * Maps each event type to its data payload.
 */
export interface TrainingEventMap {
  "training:start": TrainingStartData;
  "training:step": TrainingStepData;
  "training:checkpoint": TrainingCheckpointData;
  "training:evaluation": TrainingEvaluationData;
  "training:complete": TrainingCompleteData;
  "training:error": TrainingErrorData;
}

// ============================================================
// Callback Type
// ============================================================

/**
 * A subscriber callback function.
 *
 * Receives the typed event data when an event fires.
 * Returns void — subscribers should not throw.
 */
export type EventCallback<T extends TrainingEventType> = (
  data: TrainingEventMap[T]
) => void;

/**
 * An unsubscribe function. Call to stop receiving events.
 */
export type UnsubscribeFn = () => void;

// ============================================================
// TrainingEventBus
// ============================================================

export class TrainingEventBus {
  /** Map from event type to an array of subscriber callbacks */
  private subscribers: Map<TrainingEventType, Array<EventCallback<TrainingEventType>>>;

  /** Total number of events emitted since construction */
  private emitCount: number;

  /** Event history for debugging and UI replay (Phase 58) */
  private eventHistory: Array<{
    event: TrainingEventType;
    data: TrainingEventMap[TrainingEventType];
    timestamp: number;
  }>;

  /** Maximum number of events to keep in history */
  private readonly maxHistory: number;

  constructor(maxHistory = 500) {
    this.subscribers = new Map();
    this.emitCount = 0;
    this.eventHistory = [];
    this.maxHistory = maxHistory;
  }

  /**
   * Subscribe to a training event.
   *
   * Returns an unsubscribe function — call it to stop
   * receiving events for this subscription.
   *
   * @param event — the event type to listen for
   * @param callback — called each time the event fires
   * @returns an unsubscribe function
   *
   * Example:
   *   const unsub = bus.subscribe("training:step", (data) => {
   *     setLoss(data.metrics.loss);
   *   });
   */
  subscribe<T extends TrainingEventType>(
    event: T,
    callback: EventCallback<T>
  ): UnsubscribeFn {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }

    const callbacks = this.subscribers.get(event)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callbacks.push(callback as any);

    return () => {
      const idx = callbacks.indexOf(callback as EventCallback<TrainingEventType>);
      if (idx !== -1) {
        callbacks.splice(idx, 1);
      }
    };
  }

  /**
   * Emit an event to all subscribers.
   *
   * Calls each subscriber synchronously in the order they
   * were registered. Errors in one callback do not prevent
   * other callbacks from running — they are caught and
   * logged to the console.
   *
   * @param event — the event type to emit
   * @param data — the event data payload
   *
   * Example:
   *   bus.emit("training:step", {
   *     sessionId: "rs-xxx",
   *     metrics: { loss: 2.3, perplexity: 9.97, ... },
   *     timestamp: Date.now(),
   *   });
   */
  emit<T extends TrainingEventType>(
    event: T,
    data: TrainingEventMap[T]
  ): void {
    this.emitCount++;

    // Record in event history (Phase 58)
    this.eventHistory.push({
      event,
      data: data as TrainingEventMap[TrainingEventType],
      timestamp: Date.now(),
    });
    // Trim history if exceeding max
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistory);
    }

    const callbacks = this.subscribers.get(event);
    if (!callbacks || callbacks.length === 0) return;

    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (err) {
        // Don't let one broken subscriber break others
        console.error(
          `TrainingEventBus: error in subscriber for "${event}":`,
          err
        );
      }
    }
  }

  /**
   * Subscribe to an event for a single invocation.
   *
   * The callback is automatically unsubscribed after the first
   * time the event fires. Useful for one-shot listeners like
   * waiting for training to complete.
   *
   * @param event — the event type to listen for once
   * @param callback — called exactly once when the event fires
   * @returns an unsubscribe function (call early to cancel)
   *
   * Example:
   *   bus.once("training:complete", (data) => {
   *     console.log("Training done! Final loss:", data.finalLoss);
   *   });
   */
  once<T extends TrainingEventType>(
    event: T,
    callback: EventCallback<T>
  ): UnsubscribeFn {
    const wrapped: EventCallback<T> = ((data: TrainingEventMap[T]) => {
      unsub();
      callback(data);
    }) as EventCallback<T>;

    const unsub = this.subscribe(event, wrapped);
    return unsub;
  }

  /**
   * Get the full event history.
   *
   * Returns a copy of all events emitted since construction
   * (up to maxHistory). Sorted oldest-first.
   *
   * @returns array of { event, data, timestamp } records
   */
  getEventHistory(): Array<{
    event: TrainingEventType;
    data: TrainingEventMap[TrainingEventType];
    timestamp: number;
  }> {
    return [...this.eventHistory];
  }

  /**
   * Get recent events, optionally filtered by type.
   *
   * @param count — maximum number of events to return (default: 50)
   * @param eventType — optional filter: only return events of this type
   * @returns array of recent event records (newest first)
   */
  getRecentEvents(
    count = 50,
    eventType?: TrainingEventType
  ): Array<{
    event: TrainingEventType;
    data: TrainingEventMap[TrainingEventType];
    timestamp: number;
  }> {
    let filtered = this.eventHistory;
    if (eventType) {
      filtered = filtered.filter((e) => e.event === eventType);
    }
    return filtered.slice(-count).reverse();
  }

  /**
   * Get all step events for a specific session.
   *
   * Convenience method for retrieving the training step
   * history for visualization.
   *
   * @param sessionId — session identifier to filter by
   * @returns array of step event records
   */
  getStepEvents(sessionId: string): Array<{
    sessionId: string;
    step: number;
    loss: number;
    lr: number;
    throughput: number;
    timestamp: number;
  }> {
    return this.eventHistory
      .filter(
        (e) =>
          e.event === "training:step" &&
          (e.data as TrainingStepData).sessionId === sessionId
      )
      .map((e) => {
        const data = e.data as TrainingStepData;
        return {
          sessionId: data.sessionId,
          step: data.metrics.globalStep,
          loss: data.metrics.loss,
          lr: data.metrics.learningRate,
          throughput: data.metrics.tokensPerSecond,
          timestamp: data.timestamp,
        };
      });
  }

  /**
   * Get the history length.
   */
  getHistoryLength(): number {
    return this.eventHistory.length;
  }

  /**
   * Clear the event history.
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Unsubscribe all callbacks for a specific event type.
   *
   * @param event — the event type to clear
   */
  clear(event: TrainingEventType): void {
    this.subscribers.delete(event);
  }

  /**
   * Unsubscribe ALL callbacks across all event types.
   *
   * Useful for cleanup when a component unmounts.
   */
  clearAll(): void {
    this.subscribers.clear();
  }

  /**
   * Get the total number of events emitted since construction.
   *
   * Useful for debugging and testing.
   */
  getEmitCount(): number {
    return this.emitCount;
  }

  /**
   * Get the number of subscribers for a specific event type.
   *
   * @param event — the event type to query
   */
  subscriberCount(event: TrainingEventType): number {
    const callbacks = this.subscribers.get(event);
    return callbacks ? callbacks.length : 0;
  }

  /**
   * Get the total number of active subscriptions across all events.
   */
  totalSubscriberCount(): number {
    let total = 0;
    for (const callbacks of this.subscribers.values()) {
      total += callbacks.length;
    }
    return total;
  }
}

// ============================================================
// Singleton convenience
// ============================================================

/**
 * Default singleton event bus for app-wide training events.
 *
 * Usage:
 *   import { eventBus } from "./TrainingEventBus";
 *   eventBus.subscribe("training:step", (data) => { ... });
 */
export const eventBus = new TrainingEventBus();
