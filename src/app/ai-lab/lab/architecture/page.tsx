import type { Metadata } from "next";
import { MiniMindEngineMap } from "@/components/ai-lab/architecture/MiniMindEngineMap";
import { MiniMindPlayground } from "@/components/minimind/playground/MiniMindPlayground";

export const metadata: Metadata = {
  title: "MiniMind Engine Map",
  description:
    "The complete MiniMind engine — inference path, training path, and the experiment→run→session→checkpoint→generation identity chain, plus the interactive per-module forward-pass explorer.",
};

export default function ArchitectureLabPage() {
  return (
    <>
      <MiniMindEngineMap />
      <MiniMindPlayground />
    </>
  );
}
