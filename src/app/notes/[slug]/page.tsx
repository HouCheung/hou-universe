import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteDetailContent } from "@/components/notes/NoteDetailContent";
import { getNoteBySlug, getNoteSlugs } from "@/lib/notes";
import { pageMetadata } from "@/lib/seo";

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
    return { title: "Note Not Found" };
  }

  return pageMetadata({
    title: note.title,
    description: note.summary,
    path: `/notes/${slug}`,
  });
}

export default async function NoteDetailPage({ params }: NotePageProps) {
  const { slug } = await params;
  const note = getNoteBySlug(slug);

  if (!note) {
    notFound();
  }

  return <NoteDetailContent note={note} />;
}
