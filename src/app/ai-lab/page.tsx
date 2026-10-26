import type { Metadata } from "next";
import { MiniMindChatShell } from "@/components/ai-lab/chat";

export const metadata: Metadata = {
  title: "MiniMind Chat",
  description:
    "MiniMind — a language model built from scratch. Chat with a real Transformer model running locally in your browser, powered by actual neural network inference.",
};

export default function AiLabPage() {
  return <MiniMindChatShell />;
}
