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
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-48 w-48 rounded-full bg-[radial-gradient(ellipse, rgba(96,165,250,0.2)_0%, rgba(37,99,235,0.1)_50%, transparent_70%)] blur-3xl sm:h-64 sm:w-64" />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="h-64 w-64 rounded-full bg-[radial-gradient(ellipse, rgba(96,165,250,0.2)_0%, rgba(37,99,235,0.1)_50%, transparent_70%)] blur-3xl" />
        </div>
      }
    >
      <Planet3D />
    </Suspense>
  );
}
