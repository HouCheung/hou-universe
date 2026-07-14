import type { Metadata } from "next";
import { StarField } from "@/components/shared/StarField";
import { GuestbookForm } from "@/components/guestbook/GuestbookForm";
import { MessageCard } from "@/components/guestbook/MessageCard";
import { sampleMessages } from "@/data/guestbook";

export const metadata: Metadata = {
  title: "留言墙 - HOU Universe",
  description:
    "留言墙——留下你的足迹，分享你的想法与建议。",
};

export default function GuestbookPage() {
  return (
    <>
      <StarField />

      <div className="min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          {/* Page header */}
          <header className="mb-16 text-center sm:mb-24">
            <p className="mb-3 font-mono text-sm tracking-[0.25em] text-blue-300/60 uppercase">
              留言墙
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              留言墙
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              有想说的话？留下你的足迹——
              无论是建议、问题还是简单的问候，都欢迎写在下方。
            </p>
          </header>

          {/* Submit form */}
          <section className="mb-16 sm:mb-20">
            <div className="mb-8 flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
              <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
                写留言
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
            </div>
            <GuestbookForm />
          </section>

          {/* Messages */}
          <section>
            <div className="mb-8 flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
              <h2 className="shrink-0 font-mono text-sm tracking-[0.2em] text-blue-300/70 uppercase">
                到访足迹
              </h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
            </div>
            <div className="flex flex-col gap-4">
              {sampleMessages.map((message, index) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  index={index}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Hidden static form for Netlify Forms detection */}
      <form
        name="guestbook"
        data-netlify="true"
        netlify-honeypot="bot-field"
        hidden
        aria-hidden="true"
      >
        <input type="text" name="nickname" />
        <textarea name="content" />
        <input type="hidden" name="form-name" value="guestbook" />
      </form>
    </>
  );
}
