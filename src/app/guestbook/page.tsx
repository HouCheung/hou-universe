import type { Metadata } from "next";
import { GuestbookPageContent } from "@/components/guestbook/GuestbookPageContent";

export const metadata: Metadata = {
  title: "留言墙 - HOU Universe",
  description: "留言墙——留下你的足迹，分享你的想法与建议。",
};

export default function GuestbookPage() {
  return <GuestbookPageContent />;
}
