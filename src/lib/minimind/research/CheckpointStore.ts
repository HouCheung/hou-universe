// ============================================================
// MiniMind — research/CheckpointStore.ts
// ============================================================
// Phase 85: Full-checkpoint blob persistence.
//
// Replaces the previous localStorage-inline checkpoint blob, which
// silently failed on QuotaExceededError (a full production checkpoint
// is ~73 MB vs the ~5 MB localStorage quota). The full checkpoint JSON
// string is stored here; the session metadata in ResearchWorkspace keeps
// only a lightweight `checkpointDataPersisted: true` marker.
//
// Backends:
//   - IndexedDB      — browser environment (structured clone, ~unbounded)
//   - in-memory Map  — Node / SSR / test environments without IndexedDB
//
// Design:
//   - All methods are async and NEVER reject — failures degrade silently
//     (consistent with ResearchWorkspace's graceful-degradation policy).
//   - Values are stored as the raw JSON string. The checkpoint format is
//     unchanged; the Serializer Base64 path is intentionally NOT used.
// ============================================================

// ============================================================
// Types
// ============================================================

/** A single stored checkpoint blob record. */
interface CheckpointRecord {
  id: string;
  data: string;
}

/** Where a checkpoint blob actually landed. */
export type CheckpointStoreBackend = "indexeddb" | "memory";

// ============================================================
// Backend detection
// ============================================================

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

// ============================================================
// IndexedDB helpers
// ============================================================

const DB_NAME = "minimind-checkpoint-store";
const STORE_NAME = "checkpoints";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("CheckpointStore: failed to open IndexedDB")
      );
  });
}

function requestValue(request: IDBRequest): CheckpointRecord | undefined {
  const result = request.result as CheckpointRecord | undefined;
  return result ?? undefined;
}

// ============================================================
// CheckpointStore
// ============================================================

export class CheckpointStore {
  private readonly memory: Map<string, string>;

  constructor() {
    this.memory = new Map();
  }

  /**
   * Persist a full checkpoint JSON blob under a checkpoint id.
   *
   * Writes to IndexedDB when available; otherwise (and on IndexedDB
   * failure) falls back to an in-memory Map so writes never throw.
   *
   * @returns the backend that actually stored the blob. Callers that need
   *          durable persistence (checkpoint import) must check this —
   *          `"memory"` does not survive a reload.
   */
  async put(id: string, data: string): Promise<CheckpointStoreBackend> {
    if (!hasIndexedDB()) {
      this.memory.set(id, data);
      return "memory";
    }
    try {
      const db = await openDatabase();
      await this.writeRecord(db, { id, data });
      db.close();
      return "indexeddb";
    } catch {
      this.memory.set(id, data);
      return "memory";
    }
  }

  /**
   * Read a full checkpoint JSON blob by id.
   *
   * @returns the JSON string, or undefined if not found.
   */
  async get(id: string): Promise<string | undefined> {
    if (!hasIndexedDB()) return this.memory.get(id);

    try {
      const db = await openDatabase();
      const record = await this.readRecord(db, id);
      db.close();
      if (record) return record.data;
      return this.memory.get(id);
    } catch {
      return this.memory.get(id);
    }
  }

  /**
   * Delete a stored checkpoint blob by id.
   */
  async delete(id: string): Promise<void> {
    this.memory.delete(id);
    if (!hasIndexedDB()) return;

    try {
      const db = await openDatabase();
      await this.deleteRecord(db, id);
      db.close();
    } catch {
      // Degrade silently — the in-memory copy is already removed.
    }
  }

  /**
   * Check whether a checkpoint blob exists for the given id.
   */
  async has(id: string): Promise<boolean> {
    const value = await this.get(id);
    return value !== undefined;
  }

  /**
   * Remove all stored checkpoint blobs.
   */
  async clear(): Promise<void> {
    this.memory.clear();
    if (!hasIndexedDB()) return;

    try {
      const db = await openDatabase();
      await this.clearStore(db);
      db.close();
    } catch {
      // Degrade silently.
    }
  }

  // ============================================================
  // IndexedDB record helpers
  // ============================================================

  private writeRecord(
    db: IDBDatabase,
    record: CheckpointRecord
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("CheckpointStore: put failed"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("CheckpointStore: put aborted"));
    });
  }

  private readRecord(
    db: IDBDatabase,
    id: string
  ): Promise<CheckpointRecord | undefined> {
    return new Promise<CheckpointRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(requestValue(request));
      request.onerror = () =>
        reject(request.error ?? new Error("CheckpointStore: get failed"));
    });
  }

  private deleteRecord(db: IDBDatabase, id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("CheckpointStore: delete failed"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("CheckpointStore: delete aborted"));
    });
  }

  private clearStore(db: IDBDatabase): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("CheckpointStore: clear failed"));
      tx.onabort = () =>
        reject(tx.error ?? new Error("CheckpointStore: clear aborted"));
    });
  }
}

// ============================================================
// Singleton convenience
// ============================================================

export const checkpointStore = new CheckpointStore();
