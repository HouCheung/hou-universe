import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar } from "lucide-react";
import { StarField } from "@/components/shared/StarField";
import { Button } from "@/components/ui/button";
import { getNoteBySlug, getNoteSlugs } from "@/lib/notes";
import { MarkdownRenderer } from "./MarkdownRenderer";

export function generateStaticParams() {
  return getNoteSlugs().map((slug) => ({ slug }));
}

interface NotePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const note = getNoteBySlug(slug);

  if (!note) {
    return { title: "笔记未找到 - HOU Universe" };
  }

  return {
    title: `${note.title} - HOU Universe`,
    description: note.summary,
  };
}

export default async function NoteDetailPage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = getNoteBySlug(slug);

  if (!note) {
    notFound();
  }

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
            返回笔记列表
          </Link>

          {/* Article header */}
          <header className="mb-10 sm:mb-14">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {note.title}
            </h1>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <time dateTime={note.date}>{note.date}</time>
            </div>
          </header>

          {/* Markdown content */}
          <div className="prose prose-invert prose-blue max-w-none">
            <MarkdownRenderer content={note.content} />
          </div>

          {/* Bottom back button */}
          <div className="mt-16 border-t border-border/60 pt-8 text-center sm:pt-10">
            <Button
              render={<Link href="/notes" />}
              variant="outline"
              size="lg"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回笔记列表
            </Button>
          </div>
        </article>
      </div>
    </>
  );
}
