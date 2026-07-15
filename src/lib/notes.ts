import fs from "fs";
import path from "path";
import type { Note } from "@/types";

const notesDirectory = path.join(process.cwd(), "content/posts");

interface NoteFrontmatter {
  title?: string;
  date?: string;
  summary?: string;
  categories?: string[];
  tags?: string[];
}

function parseFrontmatter(raw: string): { frontmatter: NoteFrontmatter; body: string } {
  const frontmatter: NoteFrontmatter = {};
  let body = raw;

  if (raw.startsWith("---")) {
    const endIndex = raw.indexOf("---", 3);
    if (endIndex !== -1) {
      const fmBlock = raw.slice(3, endIndex).trim();
      body = raw.slice(endIndex + 3).trim();

      let currentKey: string | null = null;
      const lines = fmBlock.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue;

        // Array items:   - value
        const arrMatch = trimmed.match(/^-\s+(.+)$/);
        if (arrMatch && currentKey) {
          const arr = frontmatter[currentKey as keyof NoteFrontmatter];
          if (Array.isArray(arr)) {
            arr.push(arrMatch[1].trim());
          }
          continue;
        }

        // Key-value: key: value
        const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
        if (kvMatch) {
          const key = kvMatch[1].toLowerCase();
          const value = kvMatch[2].trim();
          const cleanValue = value.replace(/^["']|["']$/g, "");
          currentKey = key;

          if (key === "categories" || key === "tags") {
            const items = cleanValue
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (items.length > 0) {
              (frontmatter as Record<string, string[]>)[key] = items;
            } else {
              (frontmatter as Record<string, string[]>)[key] = [];
            }
          } else {
            (frontmatter as Record<string, string>)[key] = cleanValue;
          }
        }
      }
    }
  }

  return { frontmatter, body };
}

function calculateReadingTime(content: string): number {
  const wordsPerMinute = 300;
  const chineseChars = (content.match(/[一-鿿]/g) || []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
  const totalWords = chineseChars + englishWords;
  return Math.max(1, Math.ceil(totalWords / wordsPerMinute));
}

function parseNoteFile(slug: string): Note | null {
  const filePath = path.join(notesDirectory, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);

  let title = frontmatter.title || "";
  let bodyWithoutTitle = body;
  if (!title) {
    const titleMatch = body.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
      bodyWithoutTitle = body.replace(/^#\s+.+\n?/m, "").trim();
    }
  } else {
    bodyWithoutTitle = body.replace(/^#\s+.+\n?/m, "").trim();
  }

  const date = frontmatter.date || "";
  const summary = frontmatter.summary || "";
  const categories = frontmatter.categories || [];
  const tags = frontmatter.tags || [];
  const readingTime = calculateReadingTime(bodyWithoutTitle);

  return {
    slug,
    title,
    date,
    summary,
    content: bodyWithoutTitle,
    categories,
    tags,
    readingTime,
  };
}

export function getNoteSlugs(): string[] {
  if (!fs.existsSync(notesDirectory)) return [];
  return fs
    .readdirSync(notesDirectory)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

export function getNoteBySlug(slug: string): Note | null {
  return parseNoteFile(slug);
}

export function getAllNotes(): Note[] {
  const slugs = getNoteSlugs();
  return slugs
    .map((slug) => parseNoteFile(slug))
    .filter((n): n is Note => n !== null)
    .sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return 0;
    });
}

export function getAllCategories(): string[] {
  const notes = getAllNotes();
  const categorySet = new Set<string>();
  notes.forEach((note) => {
    note.categories.forEach((c) => categorySet.add(c));
  });
  return Array.from(categorySet).sort();
}

export function getAllTags(): string[] {
  const notes = getAllNotes();
  const tagSet = new Set<string>();
  notes.forEach((note) => {
    note.tags.forEach((t) => tagSet.add(t));
  });
  return Array.from(tagSet).sort();
}
