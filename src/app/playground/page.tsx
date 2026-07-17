import type { Metadata } from "next";
import { PlaygroundContent } from "@/components/playground/PlaygroundContent";

export const metadata: Metadata = {
  title: "Playground - HOU Universe",
  description:
    "Interactive algorithm lab — a collection of fun browser games blending data science concepts with playful interactions.",
};

export default function PlaygroundPage() {
  return <PlaygroundContent />;
}
