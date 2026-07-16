import type { Metadata } from "next";
import { NotesPageContent } from "@/components/notes/NotesPageContent";
import { getAllNotes, getAllCategories } from "@/lib/notes";

export const metadata: Metadata = {
  title: "Notes - HOU Universe",
  description:
    "Learning notes and technical sharing — covering practical records and reflections on AI engineering, full-stack development, and data engineering.",
};

export default function NotesPage() {
  const notes = getAllNotes();
  const allCategories = getAllCategories();
  return <NotesPageContent notes={notes} allCategories={allCategories} />;
}
