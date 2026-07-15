"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Calendar, Clock, Tag } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { StarField } from "@/components/shared/StarField";
import { Button } from "@/components/ui/button";
import type { Note } from "@/types";

interface NoteDetailContentProps {
  note: Note;
}

export function NoteDetailContent({ note }: NoteDetailContentProps) {
  const { t } = useTranslation();

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Back link */}
          <Link
            href="/notes"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-12"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("notes.backToList")}
          </Link>

          {/* Article header */}
          <header className="mb-10 sm:mb-14">
            {/* Categories */}
            {note.categories.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {note.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-medium text-brand dark:text-brand-light/90"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {note.title}
            </h1>

            {/* Meta row: date + reading time */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <time dateTime={note.date}>{note.date}</time>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {note.readingTime} {t("notes.readingTimeUnit")}
              </span>
            </div>

            {/* Tags */}
            {note.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-slate-300/30 bg-slate-200/40 dark:border-white/[0.06] dark:bg-white/[0.03] px-2 py-0.5 text-xs text-muted-foreground/70"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* Markdown content */}
          <div className="prose prose-slate dark:prose-invert prose-blue max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {note.content}
            </ReactMarkdown>
          </div>

          {/* Bottom back button */}
          <div className="mt-16 border-t border-border/60 pt-8 text-center sm:pt-10">
            <Button
              render={<Link href="/notes" />}
              variant="outline"
              size="lg"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("notes.backToList")}
            </Button>
          </div>
        </article>
      </div>
    </>
  );
}
