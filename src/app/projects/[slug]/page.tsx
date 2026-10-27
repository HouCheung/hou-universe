import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetailContent } from "@/components/projects/ProjectDetailContent";
import { getProjectById, getAllProjectIds } from "@/data/projects";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return getAllProjectIds().map((id) => ({ slug: id }));
}

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectById(slug);

  if (!project) {
    return { title: "Project Not Found" };
  }

  return pageMetadata({
    title: project.title,
    description: project.description,
    path: `/projects/${slug}`,
  });
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProjectById(slug);

  if (!project) {
    notFound();
  }

  return <ProjectDetailContent project={project} />;
}
