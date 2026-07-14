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

      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
        <StarPlanet />
        <HeroContent />
        <ScrollIndicator targetId="next-section" />
      </section>

      <section id="next-section">
        <HomeSections />
      </section>
    </>
  );
}
