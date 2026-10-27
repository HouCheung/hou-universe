import { MiniMindChatShell } from "@/components/ai-lab/chat";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "MiniMind Chat",
  description:
    "MiniMind — a language model built from scratch. Chat with a real Transformer model running locally in your browser, powered by actual neural network inference.",
  path: "/ai-lab",
  section: "AI Lab",
});

export default function AiLabPage() {
  return <MiniMindChatShell />;
}
