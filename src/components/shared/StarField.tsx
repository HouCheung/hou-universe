'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  depth: number;
  phase: number;
  speed: number;
}

const STAR_COUNT = 150;
const PARALLAX_FACTOR = 0.02;

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const targetMouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const timeRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  const initStars = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.2 + 0.4,
        baseAlpha: Math.random() * 0.6 + 0.2,
        depth: Math.random() * 0.8 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.005,
      });
    }
    starsRef.current = stars;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isVisibleRef.current) {
      timeRef.current += 1;

      // Smooth mouse follow
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.05;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const displayW = w / dpr;
      const displayH = h / dpr;

      ctx.clearRect(0, 0, w, h);

      const offsetX = (mouseRef.current.x - 0.5) * displayW * PARALLAX_FACTOR;
      const offsetY = (mouseRef.current.y - 0.5) * displayH * PARALLAX_FACTOR;

      for (const star of starsRef.current) {
        const depthOffsetX = offsetX * star.depth;
        const depthOffsetY = offsetY * star.depth;

        const drawX = (star.x + depthOffsetX) * dpr;
        const drawY = (star.y + depthOffsetY) * dpr;

        // Breathing effect
        const breathe = Math.sin(timeRef.current * star.speed + star.phase);
        const alpha = star.baseAlpha + breathe * 0.25;
        const clampedAlpha = Math.max(0.05, Math.min(1, alpha));

        // Skip very dim stars
        if (clampedAlpha < 0.08) continue;

        ctx.beginPath();
        ctx.arc(drawX, drawY, star.radius * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${clampedAlpha.toFixed(3)})`;
        ctx.fill();

        // Larger stars get a subtle glow
        if (star.radius > 1.4) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, star.radius * dpr * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,210,255,${(clampedAlpha * 0.15).toFixed(3)})`;
          ctx.fill();
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    initStars(w, h);
  }, [initStars]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    targetMouseRef.current.x = e.clientX / window.innerWidth;
    targetMouseRef.current.y = e.clientY / window.innerHeight;
  }, []);

  const handleVisibilityChange = useCallback(() => {
    isVisibleRef.current = !document.hidden;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    handleResize();
    animFrameRef.current = requestAnimationFrame(animate);

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [animate, handleResize, handleMouseMove, handleVisibilityChange]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0"
      style={{ zIndex: -1 }}
    />
  );
}
