import type { Metadata } from "next";
import { FloatingNavDock } from "@/components/ai-lab/FloatingNavDock";
import { BreadcrumbBar } from "@/components/ai-lab/BreadcrumbBar";

export const metadata: Metadata = {
  title: {
    default: "AI Lab",
    template: "%s | AI Lab · HOU Universe",
  },
  description:
    "AI Lab — Building MiniMind from scratch. A systematic exploration of LLM internals: Tokenizer, Embedding, Attention, Transformer, Pretrain, SFT, LoRA, RLHF, RAG, and Agent.",
};

export default function AiLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* AI Lab cosmic background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-[10%] left-[20%] h-[50%] w-[50%] rounded-full opacity-[0.04] blur-[140px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(var(--brand-rgb),0.3) 0%, rgba(var(--brand-deep-rgb),0.15) 40%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-[15%] right-[10%] h-[45%] w-[45%] rounded-full opacity-[0.03] blur-[120px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(var(--brand-light-rgb),0.2) 0%, rgba(var(--brand-rgb),0.1) 50%, transparent 75%)",
        }}
      />

      {/* Breadcrumb bar — renders on sub-pages only */}
      <BreadcrumbBar />

      {/* Floating navigation dock */}
      <FloatingNavDock />

      {children}
    </>
  );
}
