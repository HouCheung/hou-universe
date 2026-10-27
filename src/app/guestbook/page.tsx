import { GuestbookPageContent } from "@/components/guestbook/GuestbookPageContent";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Guestbook",
  description: "Guestbook — leave your mark and share your thoughts and suggestions.",
  path: "/guestbook",
});

export default function GuestbookPage() {
  return <GuestbookPageContent />;
}
