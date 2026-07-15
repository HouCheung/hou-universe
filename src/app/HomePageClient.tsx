"use client";

import { useTheme } from "@/components/layout/ThemeProvider";
import { ScrollPlanetTransition } from "@/components/shared/ScrollPlanetTransition";
import { MouseGlow } from "@/components/shared/MouseGlow";
import { HeroContent } from "@/components/shared/HeroContent";
import { ScrollIndicator } from "@/components/shared/ScrollIndicator";
import { HomeSections } from "@/components/home/HomeSections";
import { StarPlanet } from "@/components/shared/StarPlanet";

function HomeNebulaGlows() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <>
      {/* Top-left nebula */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-[20%] -left-[10%] h-[60%] w-[60%] rounded-full opacity-[0.06] blur-[120px]"
        style={{
          background: isLight
            ? "radial-gradient(ellipse, rgba(135,180,235,0.35) 0%, rgba(180,210,245,0.2) 40%, transparent 70%)"
            : "radial-gradient(ellipse, rgba(71,85,105,0.5) 0%, rgba(100,116,139,0.3) 40%, transparent 70%)",
          zIndex: -1,
        }}
      />
      {/* Bottom-right nebula */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-[10%] -right-[5%] h-[50%] w-[50%] rounded-full opacity-[0.05] blur-[100px]"
        style={{
          background: isLight
            ? "radial-gradient(ellipse, rgba(135,180,235,0.25) 0%, rgba(180,210,245,0.12) 45%, transparent 70%)"
            : "radial-gradient(ellipse, rgba(100,116,139,0.4) 0%, rgba(71,85,105,0.2) 45%, transparent 70%)",
          zIndex: -1,
        }}
      />
      {/* Center-right nebula */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[40%] left-[60%] h-[40%] w-[40%] rounded-full opacity-[0.04] blur-[140px]"
        style={{
          background: isLight
            ? "radial-gradient(ellipse, rgba(135,180,235,0.2) 0%, rgba(180,210,245,0.1) 50%, transparent 75%)"
            : "radial-gradient(ellipse, rgba(71,85,105,0.35) 0%, rgba(100,116,139,0.2) 50%, transparent 75%)",
          zIndex: -1,
        }}
      />
    </>
  );
}

export function HomePageClient() {
  return (
    <>
      <MouseGlow />
      <HomeNebulaGlows />

      {/* Scroll-driven planet transition wraps both hero + content */}
      <ScrollPlanetTransition planet={<StarPlanet />}>
        {/* Hero section */}
        <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
          <HeroContent />
          <ScrollIndicator targetId="next-section" />
        </section>

        {/* Content sections */}
        <section id="next-section">
          <HomeSections />
        </section>
      </ScrollPlanetTransition>
    </>
  );
}
