import type { Metadata } from "next";
import { EvaluationLabClient } from "./EvaluationLabClient";

export const metadata: Metadata = {
  title: "Evaluation & Benchmarks",
  description:
    "Benchmark MiniMind model performance — loss curves, perplexity analysis, throughput measurement, and multi-experiment comparison.",
};

export default function EvaluationLabPage() {
  return <EvaluationLabClient />;
}
