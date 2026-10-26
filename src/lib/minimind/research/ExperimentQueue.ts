// ============================================================
// MiniMind — research/ExperimentQueue.ts
// ============================================================
// Phase 60: Experiment execution queue.
//
// Provides a single-process, single-worker experiment queue.
// Experiments are enqueued and executed in FIFO order.
//
// Queue item states:
//   pending   — waiting to be executed
//   running   — currently executing
//   completed — finished successfully
//   failed    — terminated with error
//   cancelled — removed before execution
//
// Design principles:
//   - Single-process, single-worker (Phase 60)
//   - API ready for future distributed/multi-worker extension
//   - Browser-safe — no Node.js dependencies
//   - No automatic execution — caller drives the queue
// ============================================================

// ============================================================
// Types
// ============================================================

/**
 * Status of a queued experiment item.
 */
export type QueueItemStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * A single item in the experiment queue.
 */
export interface QueueItem {
  /** Unique queue item ID */
  id: string;
  /** The experiment ID being queued */
  experimentId: string;
  /** Human-readable experiment name (for display) */
  experimentName: string;
  /** When this item was enqueued */
  enqueuedAt: number;
  /** When execution started (0 if not yet started) */
  startedAt: number;
  /** When execution completed (0 if not yet completed) */
  completedAt: number;
  /** Current status */
  status: QueueItemStatus;
  /** Error message if failed */
  error: string | undefined;
}

// ============================================================
// ExperimentQueue
// ============================================================

export class ExperimentQueue {
  private items: QueueItem[];
  private idCounter: number;

  constructor() {
    this.items = [];
    this.idCounter = 0;
  }

  /**
   * Add an experiment to the queue.
   *
   * @param experimentId — the experiment to enqueue
   * @param experimentName — human-readable name
   * @returns the queue item ID
   */
  queue(experimentId: string, experimentName: string): string {
    const id = `q-${++this.idCounter}-${Date.now().toString(36)}`;

    const item: QueueItem = {
      id,
      experimentId,
      experimentName,
      enqueuedAt: Date.now(),
      startedAt: 0,
      completedAt: 0,
      status: "pending",
      error: undefined,
    };

    this.items.push(item);
    return id;
  }

  /**
   * Remove and return the next pending item from the queue.
   *
   * The item is marked as "running" before being returned.
   *
   * @returns the next queue item, or null if the queue is empty
   */
  dequeue(): QueueItem | null {
    const idx = this.items.findIndex((item) => item.status === "pending");
    if (idx === -1) return null;

    const item = this.items[idx];
    item.status = "running";
    item.startedAt = Date.now();
    return { ...item };
  }

  /**
   * Peek at the next pending item without removing it.
   *
   * @returns the next queue item, or null if none pending
   */
  peek(): QueueItem | null {
    const item = this.items.find((i) => i.status === "pending");
    return item ? { ...item } : null;
  }

  /**
   * Get the currently running item.
   *
   * @returns the running item, or null if none running
   */
  current(): QueueItem | null {
    const item = this.items.find((i) => i.status === "running");
    return item ? { ...item } : null;
  }

  /**
   * Mark a queued item as completed.
   *
   * @param id — the queue item ID
   * @returns true if the item was found and completed
   */
  complete(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;
    if (item.status !== "running") return false;

    item.status = "completed";
    item.completedAt = Date.now();
    return true;
  }

  /**
   * Mark a queued item as failed.
   *
   * @param id — the queue item ID
   * @param error — error description
   * @returns true if the item was found and failed
   */
  fail(id: string, error: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;

    item.status = "failed";
    item.completedAt = Date.now();
    item.error = error;
    return true;
  }

  /**
   * Cancel a pending queued item.
   *
   * @param id — the queue item ID
   * @returns true if the item was found and cancelled
   */
  cancel(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;
    if (item.status !== "pending") return false;

    item.status = "cancelled";
    item.completedAt = Date.now();
    return true;
  }

  /**
   * Remove a queue item entirely.
   *
   * @param id — the queue item ID
   * @returns true if the item was found and removed
   */
  remove(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  /**
   * Clear all items from the queue.
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Get the number of items in the queue.
   *
   * @param status — optional status filter
   */
  size(status?: QueueItemStatus): number {
    if (status) {
      return this.items.filter((i) => i.status === status).length;
    }
    return this.items.length;
  }

  /**
   * List all queue items.
   *
   * @param status — optional status filter
   */
  list(status?: QueueItemStatus): QueueItem[] {
    let filtered = this.items;
    if (status) {
      filtered = filtered.filter((i) => i.status === status);
    }
    return filtered.map((i) => ({ ...i }));
  }

  /**
   * Check if the queue has any pending items.
   */
  hasPending(): boolean {
    return this.items.some((i) => i.status === "pending");
  }

  /**
   * Check if the queue is currently running an item.
   */
  isRunning(): boolean {
    return this.items.some((i) => i.status === "running");
  }

  /**
   * Check if the queue is idle (no pending, no running).
   */
  isIdle(): boolean {
    return !this.hasPending() && !this.isRunning();
  }

  /**
   * Get a summary of the queue state.
   */
  summary(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    return {
      total: this.items.length,
      pending: this.size("pending"),
      running: this.size("running"),
      completed: this.size("completed"),
      failed: this.size("failed"),
      cancelled: this.size("cancelled"),
    };
  }
}
