"use client";

import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

/* ── Hook: detect scroll past hero threshold ── */
function useHeroScrollPast() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const currentRef = useRef(0);
  const targetRef = useRef(0);

  useEffect(() => {
    const threshold = window.innerHeight * 0.7;

    const animate = () => {
      currentRef.current +=
        (targetRef.current - currentRef.current) * 0.07;
      setProgress(currentRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };

    const onScroll = () => {
      const p = Math.min(1, Math.max(0, window.scrollY / threshold));
      targetRef.current = p;
    };

    rafRef.current = requestAnimationFrame(animate);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return progress;
}

/* ── Hook: mouse parallax (desktop only, throttled) ── */
function useMouseParallax() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const isMobileRef = useRef(false);

  useEffect(() => {
    isMobileRef.current = window.innerWidth < 768;
    if (isMobileRef.current) return;

    const MAX_OFFSET = 18; // px, subtle parallax range

    const animate = () => {
      currentRef.current.x +=
        (targetRef.current.x - currentRef.current.x) * 0.05;
      currentRef.current.y +=
        (targetRef.current.y - currentRef.current.y) * 0.05;
      setOffset({ x: currentRef.current.x, y: currentRef.current.y });
      rafRef.current = requestAnimationFrame(animate);
    };

    const onMouseMove = (e: MouseEvent) => {
      // Normalize to -1..1 from screen center
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      targetRef.current.x = nx * MAX_OFFSET;
      targetRef.current.y = ny * MAX_OFFSET;
    };

    rafRef.current = requestAnimationFrame(animate);
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return offset;
}

/* ═══════════════════════════════════════════════════════════
   ScrollPlanetTransition
   Planet stays FIXED at bottom-right of hero section.
   It does NOT move with scroll — only fades out smoothly
   when the user scrolls past the hero.
   ═══════════════════════════════════════════════════════════ */

interface ScrollPlanetTransitionProps {
  planet: ReactNode;
  children: ReactNode;
}

export function ScrollPlanetTransition({
  planet,
  children,
}: ScrollPlanetTransitionProps) {
  const progress = useHeroScrollPast();
  const parallax = useMouseParallax();
  const [heroSize, setHeroSize] = useState(460);

  /* ── Determine hero planet size from breakpoint ── */
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setHeroSize(500);
      else if (w >= 1024) setHeroSize(460);
      else if (w >= 640) setHeroSize(400);
      else setHeroSize(340);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const p = Math.min(1, Math.max(0, progress));

  // Opacity: full in hero, fades to 0 when scrolled past threshold
  const opacity = 1 - p;

  return (
    <>
      {/* ── Planet: always fixed at bottom-right, only fades ── */}
      <div
        aria-hidden="true"
        className="planet-entrance"
        style={{
          position: "fixed",
          right: "3vw",
          bottom: "7vh",
          width: heroSize,
          height: heroSize,
          opacity,
          transform: `translate(${parallax.x.toFixed(1)}px, ${parallax.y.toFixed(1)}px)`,
          willChange: "opacity, transform",
          pointerEvents: opacity > 0.3 ? "auto" : "none",
          zIndex: 10,
        }}
      >
        {planet}
      </div>

      {/* ── Content ── */}
      {children}
    </>
  );
}
