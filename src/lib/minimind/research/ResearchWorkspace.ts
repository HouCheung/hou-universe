// ============================================================
// MiniMind — research/ResearchWorkspace.ts
// ============================================================
// Phase 57: Research workspace CRUD manager.
//
// Manages ResearchSession objects in localStorage under the
// "minimind-research-workspace" key. Provides full CRUD
// operations with validation on write and graceful degradation
// on read (returns empty array if storage is corrupted).
//
// Design principles:
//   - Single source of truth — one localStorage key
//   - Validation gate — all writes pass through validateResearchSession
//   - Immutable reads — consumers receive copies, not references
//   - Graceful degradation — corrupted data returns empty state
//   - Browser-safe — no Node.js dependencies
//
// Usage:
//   import { ResearchWorkspace } from "./ResearchWorkspace";
//   const ws = new ResearchWorkspace();
//   const sessions = ws.listSessions();
// ============================================================

import {
  type ResearchSession,
  type SessionConfig,
  createResearchSession,
  validateResearchSession,
  isResearchSession,
  type ResearchStatus,
} from "./ResearchState";

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = "minimind-research-workspace";

// ============================================================
// ResearchWorkspace
// ============================================================

export class ResearchWorkspace {
  /**
   * Create a new research session and persist it.
   *
   * @param config — session configuration
   * @param id — optional session ID (generated if not provided)
   * @returns the newly created ResearchSession
   *
   * Example:
   *   const ws = new ResearchWorkspace();
   *   const session = ws.createSession({
   *     name: "TinyStories LR Study",
   *     modelConfig: getModelConfig("tiny"),
   *     trainingConfig: loadRecipe("tinystories-tiny"),
   *     dataset: "tinystories",
   *     seed: 42,
   *   });
   */
  createSession(config: SessionConfig, id?: string): ResearchSession {
    const session = createResearchSession(config, id);
    const sessions = this.readSessions();
    sessions.push(session);
    this.writeSessions(sessions);
    return { ...session };
  }

  /**
   * Get a single session by ID.
   *
   * @param id — session identifier
   * @returns the ResearchSession, or undefined if not found
   */
  getSession(id: string): ResearchSession | undefined {
    const sessions = this.readSessions();
    const session = sessions.find((s) => s.id === id);
    return session ? { ...session } : undefined;
  }

  /**
   * Update an existing session.
   *
   * Merges partial updates into the stored session and
   * updates the updatedAt timestamp. Validates the result
   * before persisting.
   *
   * @param id — session identifier
   * @param updates — partial session fields to merge
   * @returns the updated ResearchSession
   * @throws if the session is not found or validation fails
   *
   * Example:
   *   ws.updateSession("rs-xxx", { status: "running" });
   */
  updateSession(
    id: string,
    updates: Partial<Omit<ResearchSession, "id" | "createdAt">>
  ): ResearchSession {
    const sessions = this.readSessions();
    const index = sessions.findIndex((s) => s.id === id);

    if (index === -1) {
      throw new Error(
        `ResearchWorkspace: session "${id}" not found`
      );
    }

    const updated: ResearchSession = {
      ...sessions[index],
      ...updates,
      id: sessions[index].id, // immutable
      createdAt: sessions[index].createdAt, // immutable
      updatedAt: Date.now(),
    };

    // Merge nested objects correctly
    if (updates.modelConfig) {
      updated.modelConfig = { ...sessions[index].modelConfig, ...updates.modelConfig };
    }
    if (updates.trainingConfig) {
      updated.trainingConfig = { ...sessions[index].trainingConfig, ...updates.trainingConfig };
    }
    if (updates.metrics) {
      updated.metrics = { ...sessions[index].metrics, ...updates.metrics };
    }
    if (updates.activeCheckpoint) {
      updated.activeCheckpoint = {
        ...sessions[index].activeCheckpoint,
        ...updates.activeCheckpoint,
      };
    }
    if (updates.tags && Array.isArray(updates.tags)) {
      updated.tags = [...updates.tags];
    }

    validateResearchSession(updated);
    sessions[index] = updated;
    this.writeSessions(sessions);

    return { ...updated };
  }

  /**
   * Delete a session by ID.
   *
   * @param id — session identifier
   * @returns true if the session was deleted, false if not found
   */
  deleteSession(id: string): boolean {
    const sessions = this.readSessions();
    const index = sessions.findIndex((s) => s.id === id);

    if (index === -1) return false;

    sessions.splice(index, 1);
    this.writeSessions(sessions);
    return true;
  }

  /**
   * List all sessions, sorted by updatedAt (most recent first).
   *
   * @returns array of ResearchSession copies
   */
  listSessions(): ResearchSession[] {
    const sessions = this.readSessions();
    return sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => ({ ...s }));
  }

  /**
   * List sessions filtered by status.
   *
   * @param status — ResearchStatus to filter by
   * @returns array of matching ResearchSession copies
   */
  listSessionsByStatus(status: ResearchStatus): ResearchSession[] {
    return this.listSessions().filter((s) => s.status === status);
  }

  /**
   * Get the most recently updated session.
   *
   * @returns the latest ResearchSession, or undefined if empty
   */
  getLatestSession(): ResearchSession | undefined {
    const sessions = this.listSessions(); // already sorted by updatedAt desc
    return sessions.length > 0 ? sessions[0] : undefined;
  }

  /**
   * Get the currently active session (one with status "running" or "paused").
   *
   * Returns the most recently updated one if multiple are active.
   *
   * @returns the active ResearchSession, or undefined if none
   */
  getActiveSession(): ResearchSession | undefined {
    const active = this.listSessions().filter(
      (s) => s.status === "running" || s.status === "paused"
    );
    return active.length > 0 ? active[0] : undefined;
  }

  /**
   * Get total session count.
   */
  count(): number {
    return this.readSessions().length;
  }

  /**
   * Check if a session exists by ID.
   */
  has(id: string): boolean {
    return this.readSessions().some((s) => s.id === id);
  }

  /**
   * Delete all sessions.
   */
  clear(): void {
    this.writeSessions([]);
  }

  /**
   * Export all sessions as a JSON string.
   *
   * Useful for backup or sharing sessions across devices.
   *
   * @returns JSON string of all sessions
   */
  exportJSON(): string {
    return JSON.stringify(this.readSessions(), null, 2);
  }

  /**
   * Import sessions from a JSON string.
   *
   * Validates each session before persisting. Invalid entries
   * are skipped with a warning.
   *
   * @param json — JSON string from exportJSON() or equivalent
   * @returns number of successfully imported sessions
   * @throws if the JSON is malformed
   */
  importJSON(json: string): number {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error("ResearchWorkspace: invalid JSON string");
    }

    if (!Array.isArray(data)) {
      throw new Error(
        "ResearchWorkspace: imported data must be an array of sessions"
      );
    }

    const sessions = this.readSessions();
    const existingIds = new Set(sessions.map((s) => s.id));
    let imported = 0;

    for (const item of data) {
      if (isResearchSession(item)) {
        try {
          validateResearchSession(item);
          if (!existingIds.has(item.id)) {
            sessions.push(item);
            existingIds.add(item.id);
            imported++;
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    this.writeSessions(sessions);
    return imported;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Read sessions from localStorage.
   *
   * Returns an empty array on any error (missing key, corrupted data).
   */
  private readSessions(): ResearchSession[] {
    if (typeof window === "undefined") return [];

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data)) return [];

      // Filter out entries that don't pass the type guard
      return data.filter(isResearchSession) as ResearchSession[];
    } catch {
      // Corrupted data — return empty for graceful recovery
      return [];
    }
  }

  /**
   * Write sessions to localStorage.
   *
   * Silently no-ops in non-browser environments (SSR).
   */
  private writeSessions(sessions: ResearchSession[]): void {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Storage full or unavailable — fail silently
    }
  }
}

// ============================================================
// Singleton convenience
// ============================================================

/**
 * Default singleton instance for convenience.
 *
 * Usage:
 *   import { workspace } from "./ResearchWorkspace";
 *   const sessions = workspace.listSessions();
 */
export const workspace = new ResearchWorkspace();
