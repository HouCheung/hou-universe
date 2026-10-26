// ============================================================
// MiniMind — data/TextCorpus.ts
// ============================================================
// TextCorpus — abstraction for loading and streaming text corpora.
//
// Supports:
//   - Loading from filesystem (Node.js)
//   - Loading from URL (with optional caching)
//   - In-memory corpus from string[]
//   - Iterable document stream for memory-efficient processing
//
// Used by dataset adapters (TinyStoriesDataset, etc.) to
// provide text data in a uniform format.
// ============================================================

import * as fs from "fs";
import * as path from "path";

// ============================================================
// Types
// ============================================================

/** Source descriptor for a text corpus */
export type CorpusSource =
  | { type: "file"; path: string }
  | { type: "url"; url: string; cachePath?: string }
  | { type: "inline"; texts: string[] };

/** Options for loading a corpus */
export interface TextCorpusOptions {
  /** Maximum number of documents to load (default: unlimited) */
  maxDocuments?: number;
  /** Encoding for file sources (default: "utf-8") */
  encoding?: BufferEncoding;
}

// ============================================================
// TextCorpus
// ============================================================

/**
 * TextCorpus represents a collection of text documents for training.
 *
 * Loads lazily — documents are only read when iterated.
 * Supports filesystem, URL, and inline sources.
 */
export class TextCorpus {
  private source: CorpusSource;
  private options: Required<TextCorpusOptions>;
  private _documents: string[] | null = null;

  constructor(source: CorpusSource, options: TextCorpusOptions = {}) {
    this.source = source;
    this.options = {
      maxDocuments: options.maxDocuments ?? Infinity,
      encoding: options.encoding ?? "utf-8",
    };
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Returns all documents as an array.
   * Loads from source on first call, caches thereafter.
   */
  documents(): string[] {
    if (this._documents === null) {
      this._documents = this.load();
    }
    return this._documents;
  }

  /**
   * Number of documents in the corpus.
   * Triggers loading if not already loaded.
   */
  get length(): number {
    return this.documents().length;
  }

  /**
   * Iterate over documents (lazy, yields one at a time).
   * For file sources, reads and splits the file on first yield.
   */
  *[Symbol.iterator](): Iterator<string> {
    const docs = this.documents();
    for (const doc of docs) {
      yield doc;
    }
  }

  /**
   * Get a single document by index.
   */
  get(index: number): string {
    const docs = this.documents();
    if (index < 0 || index >= docs.length) {
      throw new Error(
        `TextCorpus.get: index ${index} out of range [0, ${docs.length})`
      );
    }
    return docs[index];
  }

  /**
   * Reload the corpus from source (clears cache).
   */
  reload(): void {
    this._documents = null;
  }

  // ============================================================
  // Internal
  // ============================================================

  private load(): string[] {
    switch (this.source.type) {
      case "inline":
        return this.loadInline();
      case "file":
        return this.loadFile();
      case "url":
        return this.loadUrl();
      default:
        throw new Error(`TextCorpus: unknown source type`);
    }
  }

  private loadInline(): string[] {
    const texts = this.source.type === "inline" ? this.source.texts : [];
    return this.applyMaxDocs(texts);
  }

  private loadFile(): string[] {
    const filePath = this.source.type === "file" ? this.source.path : "";
    if (!fs.existsSync(filePath)) {
      throw new Error(`TextCorpus: file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, this.options.encoding);
    return this.splitDocuments(content);
  }

  private loadUrl(): string[] {
    // URL loading requires fetch — sync loading not supported for URLs.
    // Use loadUrlAsync() for async loading.
    if (this.source.type !== "url") return [];

    const { cachePath } = this.source;

    // Check cache first
    if (cachePath && fs.existsSync(cachePath)) {
      const content = fs.readFileSync(cachePath, this.options.encoding);
      return this.splitDocuments(content);
    }

    throw new Error(
      `TextCorpus: URL source requires async loading. Use TextCorpus.loadAsync() for URL sources. ` +
        `URL: ${this.source.url}`
    );
  }

  /**
   * Async loader for URL sources.
   * Downloads the corpus, optionally caches it, and returns documents.
   */
  static async loadAsync(
    source: CorpusSource,
    options: TextCorpusOptions = {}
  ): Promise<TextCorpus> {
    if (source.type !== "url") {
      return new TextCorpus(source, options);
    }

    const corpus = new TextCorpus(source, options);
    await corpus.downloadAndCache();
    return corpus;
  }

  private async downloadAndCache(): Promise<void> {
    if (this.source.type !== "url") return;

    const { url, cachePath } = this.source;

    // Check cache
    if (cachePath && fs.existsSync(cachePath)) {
      return;
    }

    // Download
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(
        `TextCorpus: failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `TextCorpus: HTTP ${response.status} for ${url}`
      );
    }

    const text = await response.text();

    // Cache if path provided
    if (cachePath) {
      const dir = path.dirname(cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(cachePath, text, "utf-8");
    }

    // Store as inline source for future loads
    this.source = { type: "inline", texts: this.splitDocuments(text) };
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Split raw text content into documents.
   *
   * Strategy: split on double-newline (paragraph boundary),
   * then filter empty lines and trim whitespace.
   *
   * For JSONL corpora, each line is a document.
   * Auto-detects: if first non-empty line starts with "{", treats as JSONL.
   */
  private splitDocuments(content: string): string[] {
    const trimmed = content.trim();
    if (trimmed.length === 0) return [];

    // JSONL detection
    const firstLine = trimmed.split("\n")[0].trim();
    if (firstLine.startsWith("{")) {
      return this.splitJsonl(trimmed);
    }

    // Paragraph-based splitting
    const docs = trimmed
      .split(/\n\s*\n/)
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    return this.applyMaxDocs(docs);
  }

  /**
   * Parse JSONL format: each line is a JSON object with a "text" or "story" field.
   */
  private splitJsonl(content: string): string[] {
    const lines = content.split("\n");
    const docs: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      try {
        const obj = JSON.parse(trimmed);
        // TinyStories format: {"story": "..."}
        // Generic format: {"text": "..."}
        const text = obj.story || obj.text || "";
        if (text.trim().length > 0) {
          docs.push(text.trim());
          if (docs.length >= this.options.maxDocuments) break;
        }
      } catch {
        // Non-JSON line — skip
      }
    }

    return docs;
  }

  private applyMaxDocs(docs: string[]): string[] {
    if (docs.length <= this.options.maxDocuments) return docs;
    return docs.slice(0, this.options.maxDocuments);
  }
}
