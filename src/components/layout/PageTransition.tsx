"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

interface DustParticle {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

const DUST_COUNT = 40;
const DUST_DURATION = 0.3;

/**
 * StarDustOverlay — flash of subtle star-dust particles during page transitions.
 * Mobile / reduced-motion: gracefully degrades to nothing (empty fragment).
 */
function StarDustOverlay({ isMobile }: { isMobile: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<DustParticle[]>([]);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Generate random particles once
  if (particlesRef.current.length === 0) {
    for (let i = 0; i < DUST_COUNT; i++) {
      particlesRef.current.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.4 + Math.random() * 1.6,
        opacity: 0.15 + Math.random() * 0.35,
      });
    }
  }

  useEffect(() => {
    if (isMobile) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;
      const progress = Math.min(elapsed / DUST_DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Alpha curve: quick fade in, hold briefly, fade out
      let globalAlpha: number;
      if (progress < 0.15) {
        globalAlpha = progress / 0.15; // fade in
      } else if (progress < 0.7) {
        globalAlpha = 1; // hold
      } else {
        globalAlpha = 1 - (progress - 0.7) / 0.3; // fade out
      }

      if (globalAlpha <= 0) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const particles = particlesRef.current;
      for (let i = 0; i < DUST_COUNT; i++) {
        const p = particles[i];
        const px = p.x * canvas.width;
        const py = p.y * canvas.height;
        const radius = p.size * dpr * globalAlpha;
        const alpha = p.opacity * globalAlpha;

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(148,163,184,${(alpha * 0.15).toFixed(3)})`;
        ctx.fill();

        // Inner core
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [isMobile]);

  if (isMobile) return null;

  return (
    <motion.canvas
      ref={canvasRef}
      key="star-dust-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUST_DURATION, ease: "easeOut" }}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 60 }}
    />
  );
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [showDust, setShowDust] = useState(false);

  useEffect(() => {
    // Detect touch device for mobile degradation
    const checkMobile = () => {
      setIsMobile(
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(max-width: 768px)").matches
      );
    };
    checkMobile();

    // Trigger dust overlay on path change
    setShowDust(true);
    const timer = setTimeout(() => setShowDust(false), DUST_DURATION * 1000 + 50);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <>
      {/* Star dust overlay — only on desktop */}
      <AnimatePresence>
        {showDust && (
          <StarDustOverlay key={pathname} isMobile={isMobile} />
        )}
      </AnimatePresence>

      {/* Page content transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
