import type { Metadata } from "next";
import { MiniMindPlayground } from "@/components/minimind/playground/MiniMindPlayground";

export const metadata: Metadata = {
  title: "Tokenizer Playground",
  description:
    "MiniMind Learning Edition — interactive tokenizer playground. Explore how text becomes tokens through the full pipeline: whitespace split, vocabulary lookup, encode, and decode.",
};

export default function PlaygroundPage() {
  return <MiniMindPlayground />;
}
