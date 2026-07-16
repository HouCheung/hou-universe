import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteDetailContent } from "@/components/notes/NoteDetailContent";
import { getNoteBySlug, getNoteSlugs } from "@/lib/notes";

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
    return { title: "Note Not Found - HOU Universe" };
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

  return <NoteDetailContent note={note} />;
}
