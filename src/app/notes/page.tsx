import { NotesPageContent } from "@/components/notes/NotesPageContent";
import { getAllNotes, getAllCategories } from "@/lib/notes";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Notes",
  description:
    "Learning notes and technical sharing — covering practical records and reflections on AI engineering, full-stack development, and data engineering.",
  path: "/notes",
});

export default function NotesPage() {
  const notes = getAllNotes();
  const allCategories = getAllCategories();
  return <NotesPageContent notes={notes} allCategories={allCategories} />;
}
