"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/components/layout/ThemeProvider";

interface StarParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

const POOL_SIZE = 60;
const PARTICLE_LIFETIME = 500; // ms — quick dissipate
const PARTICLES_PER_HOVER = 4; // 3-5 particles
const SPAWN_COOLDOWN = 80; // ms between spawn bursts

/**
 * HoverStarParticles — globally attaches subtle star-particle sparks to all
 * interactive elements (a, button, .glass-card-hover, [role="button"]) on hover.
 *
 * - Renders via a dedicated canvas with pointer-events: none
 * - Uses a pre-allocated particle pool — zero GC pressure
 * - Particles are ~1.5px, very low alpha, brand-tinted, fast fade
 */
export function HoverStarParticles() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<StarParticle[]>([]);
  const animFrameRef = useRef<number>(0);
  const hoveredRectRef = useRef<DOMRect | null>(null);
  const lastSpawnRef = useRef<number>(0);
  const isTouchRef = useRef<boolean>(false);

  // Initialize particle pool once
  if (poolRef.current.length === 0) {
    for (let i = 0; i < POOL_SIZE; i++) {
      poolRef.current.push({
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: PARTICLE_LIFETIME,
        size: 0, active: false,
      });
    }
  }

  const getInactiveParticle = useCallback((): StarParticle | null => {
    const pool = poolRef.current;
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!pool[i].active) return pool[i];
    }
    // Pool exhausted — recycle the oldest active particle
    let oldest = pool[0];
    for (let i = 1; i < POOL_SIZE; i++) {
      if (pool[i].life < oldest.life) oldest = pool[i];
    }
    return oldest;
  }, []);

  const spawnParticles = useCallback((rect: DOMRect) => {
    const now = performance.now();
    if (now - lastSpawnRef.current < SPAWN_COOLDOWN) return;
    lastSpawnRef.current = now;

    const count = PARTICLES_PER_HOVER;
    for (let i = 0; i < count; i++) {
      const p = getInactiveParticle();
      if (!p) break;

      // Random position along the element perimeter
      const edge = Math.random();
      let px: number, py: number;
      if (edge < 0.25) {
        // top edge
        px = rect.left + Math.random() * rect.width;
        py = rect.top;
      } else if (edge < 0.5) {
        // right edge
        px = rect.right;
        py = rect.top + Math.random() * rect.height;
      } else if (edge < 0.75) {
        // bottom edge
        px = rect.left + Math.random() * rect.width;
        py = rect.bottom;
      } else {
        // left edge
        px = rect.left;
        py = rect.top + Math.random() * rect.height;
      }

      // Velocity: slight outward drift + random jitter
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      p.x = px;
      p.y = py;
      p.vx = (dx / dist) * (0.3 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6;
      p.vy = (dy / dist) * (0.3 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6 - 0.5;
      p.life = PARTICLE_LIFETIME + Math.random() * 200;
      p.maxLife = p.life;
      p.size = 0.8 + Math.random() * 1.4;
      p.active = true;
    }
  }, [getInactiveParticle]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = hoveredRectRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Spawn particles if hovering over an element
    if (rect && !isTouchRef.current) {
      spawnParticles(rect);
    }

    const dt = 16;
    const pool = poolRef.current;
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = pool[i];
      if (!p.active) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      p.size *= 0.992;

      if (p.life <= 0 || p.size < 0.3) {
        p.active = false;
        continue;
      }

      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio * 0.55; // Very subtle max opacity
      const px = p.x * dpr;
      const py = p.y * dpr;
      const radius = p.size * dpr;

      // Outer glow ring — ultra subtle brand tint
      ctx.beginPath();
      ctx.arc(px, py, radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148,163,184,${(alpha * 0.12).toFixed(3)})`;
      ctx.fill();

      // Inner star core — cool white
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${alpha.toFixed(3)})`;
      ctx.fill();

      // Tiny cross sparkle for star shape
      if (radius > 1.5) {
        ctx.strokeStyle = `rgba(220,235,255,${(alpha * 0.5).toFixed(3)})`;
        ctx.lineWidth = 0.4 * dpr;
        ctx.beginPath();
        ctx.moveTo(px - radius * 1.8, py);
        ctx.lineTo(px + radius * 1.8, py);
        ctx.moveTo(px, py - radius * 1.8);
        ctx.lineTo(px, py + radius * 1.8);
        ctx.stroke();
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [spawnParticles]);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }, []);

  // Global hover detection via event delegation
  const handleMouseOver = useCallback((e: MouseEvent) => {
    if (isTouchRef.current) return;
    const target = (e.target as HTMLElement).closest(
      "a, button, [role='button'], .glass-card-hover, .glass-card, .hover-spark"
    ) as HTMLElement | null;
    if (target) {
      hoveredRectRef.current = target.getBoundingClientRect();
    } else {
      hoveredRectRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback((e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest(
      "a, button, [role='button'], .glass-card-hover, .glass-card, .hover-spark"
    ) as HTMLElement | null;
    if (target) {
      // Check if we moved to another interactive element
      const related = (e as unknown as { relatedTarget: HTMLElement | null }).relatedTarget;
      if (related) {
        const newTarget = (related as HTMLElement).closest(
          "a, button, [role='button'], .glass-card-hover, .glass-card, .hover-spark"
        );
        if (newTarget) {
          hoveredRectRef.current = (newTarget as HTMLElement).getBoundingClientRect();
          return;
        }
      }
      hoveredRectRef.current = null;
    }
  }, []);

  const handleTouch = useCallback(() => {
    isTouchRef.current = true;
    hoveredRectRef.current = null;
  }, []);

  useEffect(() => {
    handleResize();
    animFrameRef.current = requestAnimationFrame(animate);

    document.addEventListener("mouseover", handleMouseOver, { passive: true });
    document.addEventListener("mouseout", handleMouseLeave, { passive: true });
    window.addEventListener("resize", handleResize);
    window.addEventListener("touchstart", handleTouch, { passive: true, once: true });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("touchstart", handleTouch);
    };
  }, [animate, handleResize, handleMouseOver, handleMouseLeave, handleTouch]);

  // Hide hover stars in light mode
  if (theme === "light") return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 50 }}
    />
  );
}
