"use client";

import { Suspense, lazy, useEffect, useState } from "react";

const Planet3D = lazy(() => import("./Planet3D"));

export function StarPlanet() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 h-48 w-48 rounded-full bg-[radial-gradient(ellipse,rgba(96,165,250,0.15)_0%,rgba(37,99,235,0.06)_50%,transparent_70%)] blur-3xl sm:h-56 sm:w-56"
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[3%] bottom-[8%] h-80 w-80 rounded-full bg-[radial-gradient(ellipse,rgba(96,165,250,0.15)_0%,rgba(37,99,235,0.06)_50%,transparent_70%)] blur-3xl"
        />
      }
    >
      <Planet3D />
    </Suspense>
  );
}
