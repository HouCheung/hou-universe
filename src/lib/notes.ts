import fs from "fs";
import path from "path";
import type { Note } from "@/types";

const notesDirectory = path.join(process.cwd(), "content/notes");

function parseNoteFile(slug: string): Note | null {
  const filePath = path.join(notesDirectory, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  const title = lines[0]?.replace(/^#\s*/, "").trim() || slug;
  const date = lines[1]?.replace(/^>\s*/, "").trim() || "";

  let summaryStart = 2;
  while (summaryStart < lines.length && lines[summaryStart].trim() === "") {
    summaryStart++;
  }
  const summary = lines[summaryStart]?.trim() || "";

  const separatorIndex = lines.findIndex(
    (line, i) => i > summaryStart && line.trim() === "---"
  );
  const contentStart = separatorIndex >= 0 ? separatorIndex + 1 : summaryStart + 1;
  const content = lines
    .slice(contentStart)
    .join("\n")
    .trim();

  return { slug, title, date, summary, content };
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
  return slugs.map((slug) => parseNoteFile(slug)).filter((n): n is Note => n !== null);
}
