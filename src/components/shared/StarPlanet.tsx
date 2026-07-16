"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/layout/ThemeProvider";

// Dynamically import Planet3D with SSR disabled.
// Three.js / WebGL cannot run on the server; this guarantees
// the Canvas is never server-rendered, eliminating hydration mismatches.
const Planet3D = dynamic(() => import("./Planet3D"), { ssr: false });

// Dynamically import DayEarth — daytime realistic Earth globe for light mode.
const DayEarth = dynamic(() => import("./DayEarth"), { ssr: false });

interface StarPlanetProps {
  /** Override interactive mode. Defaults to true on non-mobile. */
  interactive?: boolean;
}

export function StarPlanet({ interactive }: StarPlanetProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === "light";

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    setMounted(true);
    return () => window.removeEventListener("resize", check);
  }, []);

  const shouldInteract =
    interactive !== undefined ? interactive : !isMobile;

  // Transparent placeholder matching the planet container size.
  // Prevents layout shift when the 3D canvas mounts.
  const placeholder = useMemo(
    () => (
      <div
        aria-hidden="true"
        className="pointer-events-none h-full w-full rounded-full bg-[radial-gradient(ellipse,rgba(100,140,200,0.15)_0%,rgba(60,90,150,0.06)_45%,transparent_70%)] blur-3xl"
      />
    ),
    []
  );

  // Before mount, render a transparent placeholder to avoid
  // any mismatch between server and client renders.
  if (!mounted) {
    return placeholder;
  }

  // Mobile + light mode: hide 3D earth entirely, let hero text center naturally
  if (isMobile && isLight) {
    return null;
  }

  // Light mode (desktop/tablet): render realistic daytime Earth globe with NASA Blue Marble texture
  if (isLight) {
    return <DayEarth interactive={shouldInteract} />;
  }

  // Dark mode: render the full 3D WebGL planet (procedural nebula-style)
  return <Planet3D interactive={shouldInteract} />;
}
