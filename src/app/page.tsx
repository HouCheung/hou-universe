import { StarField } from "@/components/shared/StarField";
import { MouseGlow } from "@/components/shared/MouseGlow";
import { HeroContent } from "@/components/shared/HeroContent";
import { ScrollIndicator } from "@/components/shared/ScrollIndicator";
import { HomeSections } from "@/components/home/HomeSections";
import { StarPlanet } from "@/components/shared/StarPlanet";

export default function HomePage() {
  return (
    <>
      <StarField />
      <MouseGlow />

      {/* Nebula glow accents — subtle background atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-[20%] -left-[10%] h-[60%] w-[60%] rounded-full opacity-[0.06] blur-[120px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(59,130,246,0.5) 0%, rgba(139,92,246,0.3) 40%, transparent 70%)",
          zIndex: -1,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-[10%] -right-[5%] h-[50%] w-[50%] rounded-full opacity-[0.05] blur-[100px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(139,92,246,0.4) 0%, rgba(59,130,246,0.2) 45%, transparent 70%)",
          zIndex: -1,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[40%] left-[60%] h-[40%] w-[40%] rounded-full opacity-[0.04] blur-[140px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(59,130,246,0.35) 0%, rgba(99,102,241,0.2) 50%, transparent 75%)",
          zIndex: -1,
        }}
      />

      {/* Hero section */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
        <StarPlanet />
        <HeroContent />
        <ScrollIndicator targetId="next-section" />
      </section>

      {/* Content sections */}
      <section id="next-section">
        <HomeSections />
      </section>
    </>
  );
}
