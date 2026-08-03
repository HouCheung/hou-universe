"use client";

import { MissionBanner } from "./MissionBanner";
import { RoadmapSection } from "./RoadmapSection";
import { TimelineSection } from "./TimelineSection";
import { KnowledgeMap } from "./KnowledgeMap";
import { JourneySection } from "./JourneySection";
import { ProgressSection } from "./ProgressSection";
import { ResourcesSection } from "./ResourcesSection";
import { GithubSection } from "./GithubSection";
import { BlogSection } from "./BlogSection";
import { ModuleProgressGrid } from "./ModuleProgressGrid";
import { ForwardPlaygroundSection } from "./ForwardPlaygroundSection";

export function AiLabClient() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <MissionBanner />

      <RoadmapSection />

      <JourneySection />

      <ProgressSection />
      <TimelineSection />
      <KnowledgeMap />
      <ForwardPlaygroundSection />
      <ResourcesSection />
      <GithubSection />
      <BlogSection />

      <ModuleProgressGrid />
    </div>
  );
}
