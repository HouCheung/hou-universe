import type { Metadata } from "next";
import { GuestbookPageContent } from "@/components/guestbook/GuestbookPageContent";

export const metadata: Metadata = {
  title: "Guestbook - HOU Universe",
  description: "Guestbook — leave your mark and share your thoughts and suggestions.",
};

export default function GuestbookPage() {
  return <GuestbookPageContent />;
}
