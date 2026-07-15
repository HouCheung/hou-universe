import type { Metadata } from "next";
import { NotesPageContent } from "@/components/notes/NotesPageContent";
import { getAllNotes, getAllCategories } from "@/lib/notes";

export const metadata: Metadata = {
  title: "笔记 - HOU Universe",
  description:
    "学习笔记与技术分享——涵盖 AI 工程化、全栈开发、数据工程等话题的实践记录与思考。",
};

export default function NotesPage() {
  const notes = getAllNotes();
  const allCategories = getAllCategories();
  return <NotesPageContent notes={notes} allCategories={allCategories} />;
}
