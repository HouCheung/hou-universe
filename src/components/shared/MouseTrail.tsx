"use client";

import { useEffect, useRef, useCallback } from "react";

interface TrailParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX_PARTICLES = 40;
const SPAWN_INTERVAL = 50; // ms between spawns
const PARTICLE_LIFETIME = 800; // ms

export function MouseTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<TrailParticle[]>([]);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const lastSpawnRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const isTouchRef = useRef<boolean>(false);
  const isMovingRef = useRef<boolean>(false);
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = performance.now();
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Spawn particles when mouse is moving
    if (isMovingRef.current && !isTouchRef.current && now - lastSpawnRef.current > SPAWN_INTERVAL) {
      lastSpawnRef.current = now;
      if (particlesRef.current.length < MAX_PARTICLES) {
        particlesRef.current.push({
          x: mouseRef.current.x,
          y: mouseRef.current.y,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6 - 0.3,
          life: PARTICLE_LIFETIME,
          maxLife: PARTICLE_LIFETIME,
          size: 0.6 + Math.random() * 1.8,
        });
      }
    }

    // Update and draw particles — 低饱和深空蓝调星尘
    const dt = 16;
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      p.size *= 0.995;

      if (p.life <= 0 || p.size < 0.2) {
        particlesRef.current.splice(i, 1);
        continue;
      }

      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio * 0.7;
      const px = p.x * dpr;
      const py = p.y * dpr;
      const radius = p.size * dpr;

      // Outer glow — 深蓝调
      ctx.beginPath();
      ctx.arc(px, py, radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(37,99,235,${(alpha * 0.1).toFixed(3)})`;
      ctx.fill();

      // Inner core — 淡蓝白
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,210,250,${alpha.toFixed(3)})`;
      ctx.fill();
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
    isMovingRef.current = true;
    if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    moveTimeoutRef.current = setTimeout(() => {
      isMovingRef.current = false;
    }, 150);
  }, []);

  const handleTouch = useCallback(() => {
    isTouchRef.current = true;
  }, []);

  useEffect(() => {
    handleResize();
    animFrameRef.current = requestAnimationFrame(animate);

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("touchstart", handleTouch, { passive: true, once: true });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchstart", handleTouch);
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    };
  }, [animate, handleResize, handleMouseMove, handleTouch]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 1 }}
    />
  );
}
