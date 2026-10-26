// ============================================================
// MiniMind — research/GenerationHistoryStore.ts
// ============================================================
// Phase 67: Browser-safe generation history persistence.
//
// Persists compact generation metadata/results in localStorage.
// Does NOT store giant model checkpoints.
//
// Design:
//   - Browser-safe — no Node.js dependencies
//   - Graceful degradation — corrupted data returns empty state
//   - Compact storage — text truncated if too large
//   - Follows ResearchWorkspace pattern
// ============================================================

import type { GenerationHistoryEntry } from "./GenerationResult";
import { generateHistoryEntryId } from "./GenerationResult";

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = "minimind-generation-history";
const MAX_ENTRIES = 50;
const MAX_TEXT_LENGTH = 500;
const MAX_STORAGE_BYTES = 500_000; // ~500KB limit

// ============================================================
// GenerationHistoryStore
// ============================================================

export class GenerationHistoryStore {
  /**
   * Save a generation result to history.
   *
   * Truncates generated text if too long to stay within storage limits.
   *
   * @param entry - The history entry to save (without id)
   * @returns The saved entry with generated id
   */
  save(
    entry: Omit<GenerationHistoryEntry, "id">
  ): GenerationHistoryEntry {
    const id = generateHistoryEntryId();
    const fullEntry: GenerationHistoryEntry = {
      ...entry,
      id,
      generatedText: truncateText(entry.generatedText, MAX_TEXT_LENGTH),
    };

    const entries = this.readEntries();

    // Add new entry
    entries.push(fullEntry);

    // Trim to max entries
    while (entries.length > MAX_ENTRIES) {
      entries.shift();
    }

    // Check storage size and trim further if needed
    this.writeEntries(entries);

    return fullEntry;
  }

  /**
   * List all history entries (newest first).
   */
  list(): GenerationHistoryEntry[] {
    const entries = this.readEntries();
    return entries.slice().reverse();
  }

  /**
   * Get a single history entry by ID.
   */
  get(id: string): GenerationHistoryEntry | undefined {
    const entries = this.readEntries();
    return entries.find((e) => e.id === id);
  }

  /**
   * Get all entries for a specific session.
   */
  getBySession(sessionId: string): GenerationHistoryEntry[] {
    const entries = this.readEntries();
    return entries
      .filter((e) => e.sessionId === sessionId)
      .reverse();
  }

  /**
   * Delete a single history entry.
   *
   * @returns true if deleted, false if not found
   */
  delete(id: string): boolean {
    const entries = this.readEntries();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;

    entries.splice(idx, 1);
    this.writeEntries(entries);
    return true;
  }

  /**
   * Delete all entries for a session.
   *
   * @returns number of entries deleted
   */
  deleteBySession(sessionId: string): number {
    const entries = this.readEntries();
    const before = entries.length;
    const filtered = entries.filter((e) => e.sessionId !== sessionId);
    this.writeEntries(filtered);
    return before - filtered.length;
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.writeEntries([]);
  }

  /**
   * Get the number of entries.
   */
  count(): number {
    return this.readEntries().length;
  }

  /**
   * Get the number of entries for a session.
   */
  countBySession(sessionId: string): number {
    return this.readEntries().filter((e) => e.sessionId === sessionId).length;
  }

  // ============================================================
  // Internal
  // ============================================================

  private readEntries(): GenerationHistoryEntry[] {
    if (typeof window === "undefined") return [];

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(isValidEntry);
    } catch {
      return [];
    }
  }

  private writeEntries(entries: GenerationHistoryEntry[]): void {
    if (typeof window === "undefined") return;

    try {
      let json = JSON.stringify(entries);

      // If over budget, trim oldest entries
      while (json.length > MAX_STORAGE_BYTES && entries.length > 1) {
        entries.shift();
        json = JSON.stringify(entries);
      }

      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // Storage full — try to trim half and retry
      try {
        const trimmed = entries.slice(-Math.max(1, Math.floor(entries.length / 2)));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // Give up — storage is full
      }
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function isValidEntry(obj: unknown): obj is GenerationHistoryEntry {
  if (!obj || typeof obj !== "object") return false;
  const e = obj as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.sessionId === "string" &&
    typeof e.prompt === "string" &&
    typeof e.generatedText === "string" &&
    typeof e.timestamp === "number"
  );
}

// ============================================================
// Singleton
// ============================================================

export const generationHistory = new GenerationHistoryStore();
