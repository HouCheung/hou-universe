import type { Metadata } from "next";
import { ExperimentDetailPage } from "@/components/ai-lab/experiments/ExperimentDetailPage";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Experiment Detail",
    description:
      "View detailed training experiment results — configuration, loss curve, model stats, generation comparison, and reproducibility status.",
    path: `/ai-lab/experiments/${id}`,
    section: "AI Lab",
  });
}

/**
 * Pre-render a placeholder page for static export.
 * Actual experiment data is loaded client-side from localStorage.
 */
export function generateStaticParams(): Array<{ id: string }> {
  return [{ id: "placeholder" }];
}

interface ExperimentDetailRouteProps {
  params: Promise<{ id: string }>;
}

export default async function ExperimentDetailRoute({
  params,
}: ExperimentDetailRouteProps) {
  const { id } = await params;
  return <ExperimentDetailPage experimentId={id} />;
}
