import type { Metadata } from "next";
import { StarField } from "@/components/shared/StarField";
import { NoteCard } from "@/components/notes/NoteCard";
import { getAllNotes } from "@/lib/notes";

export const metadata: Metadata = {
  title: "笔记 - HOU Universe",
  description:
    "学习笔记与技术分享——涵盖 AI 工程化、全栈开发、数据工程等话题的实践记录与思考。",
};

export default function NotesPage() {
  const notes = getAllNotes();

  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-blue-300/60 uppercase">
              笔记
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              学习笔记
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              记录技术学习过程中的思考、实践与心得——
              涵盖 AI 工程化、全栈开发、数据工程等领域。
            </p>
          </header>

          {/* Notes grid */}
          {notes.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {notes.map((note, index) => (
                <NoteCard key={note.slug} note={note} index={index} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-lg text-muted-foreground">
                暂无笔记，敬请期待！
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
