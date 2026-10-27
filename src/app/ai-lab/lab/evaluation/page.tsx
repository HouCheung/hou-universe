import { pageMetadata } from "@/lib/seo";
import { EvaluationLabClient } from "./EvaluationLabClient";

export const metadata = pageMetadata({
  title: "Evaluation & Benchmarks",
  description:
    "Benchmark MiniMind model performance — loss curves, perplexity analysis, throughput measurement, and multi-experiment comparison.",
  path: "/ai-lab/lab/evaluation",
  section: "MiniMind Lab",
});

export default function EvaluationLabPage() {
  return <EvaluationLabClient />;
}
