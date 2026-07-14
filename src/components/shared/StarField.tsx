"use client";

import { useEffect, useRef, useCallback } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  layer: number;
  phase: number;
  speed: number;
  originX: number;
  originY: number;
  driftAngle: number;
  driftSpeed: number;
  tint: "blue" | "purple" | "white";
}

const LAYERS = [
  // Far background: sparse, dim, larger, slow parallax
  { count: 55, radiusRange: [1.2, 2.8] as [number, number], alphaRange: [0.22, 0.45] as [number, number], speedFactor: 0.12 },
  // Mid ground: medium density, medium brightness
  { count: 100, radiusRange: [0.7, 1.4] as [number, number], alphaRange: [0.35, 0.6] as [number, number], speedFactor: 0.38 },
  // Near foreground: dense, brighter, small, fast parallax
  { count: 190, radiusRange: [0.3, 0.7] as [number, number], alphaRange: [0.55, 0.92] as [number, number], speedFactor: 1.0 },
  // Bright drifting stars: sparse, bright, slow autonomous drift
  { count: 12, radiusRange: [1.4, 2.6] as [number, number], alphaRange: [0.6, 0.95] as [number, number], speedFactor: 0.05 },
];

const GRAVITY_RADIUS = 150;
const GRAVITY_STRENGTH = 0.025;
const BURST_PARTICLE_COUNT = 18;
const BURST_LIFESPAN = 1200;

const TINT_COLORS = {
  blue: { main: "180,210,255", glow: "160,195,255" },
  purple: { main: "200,180,240", glow: "180,160,230" },
  white: { main: "210,230,255", glow: "190,215,250" },
} as const;

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const burstParticlesRef = useRef<BurstParticle[]>([]);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const scrollRef = useRef<number>(0);
  const targetScrollRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  const initStars = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    for (let l = 0; l < LAYERS.length; l++) {
      const layer = LAYERS[l];
      for (let i = 0; i < layer.count; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        // Distribute tints: 60% white, 25% blue, 15% purple
        const tintRand = Math.random();
        const tint: Star["tint"] = tintRand < 0.6 ? "white" : tintRand < 0.85 ? "blue" : "purple";
        // Bright drifting stars: all blue/purple tinted
        const finalTint = l === 3 ? (Math.random() < 0.5 ? "blue" : "purple") : tint;

        stars.push({
          x,
          y,
          originX: x,
          originY: y,
          radius: layer.radiusRange[0] + Math.random() * (layer.radiusRange[1] - layer.radiusRange[0]),
          baseAlpha: layer.alphaRange[0] + Math.random() * (layer.alphaRange[1] - layer.alphaRange[0]),
          layer: l,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.005,
          driftAngle: Math.random() * Math.PI * 2,
          driftSpeed: l === 3 ? 0.015 + Math.random() * 0.04 : 0,
          tint: finalTint,
        });
      }
    }
    starsRef.current = stars;
  }, []);

  const addBurst = useCallback((cx: number, cy: number) => {
    const particles: BurstParticle[] = [];
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / BURST_PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
      const speed = 1.2 + Math.random() * 3.5;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: BURST_LIFESPAN,
        maxLife: BURST_LIFESPAN,
        radius: 0.4 + Math.random() * 1.6,
      });
    }
    burstParticlesRef.current.push(...particles);
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (isVisibleRef.current) {
      timeRef.current += 1;
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.05;
      scrollRef.current += (targetScrollRef.current - scrollRef.current) * 0.08;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const displayW = w / dpr;
      const displayH = h / dpr;
      const scrollY = scrollRef.current;

      ctx.clearRect(0, 0, w, h);

      const mouseDisplayX = mouseRef.current.x * displayW;
      const mouseDisplayY = mouseRef.current.y * displayH;

      for (const star of starsRef.current) {
        const layerDef = LAYERS[star.layer];
        const scrollOffsetY = scrollY * layerDef.speedFactor * 0.5;

        let drawX = star.originX;
        let drawY = star.originY - scrollOffsetY;

        // Wrap around vertically
        while (drawY < -10) drawY += displayH + 20;
        while (drawY > displayH + 10) drawY -= displayH + 20;

        // Autonomous drift for bright drifting stars (layer 3)
        if (star.layer === 3 && star.driftSpeed > 0) {
          const driftDx = Math.cos(star.driftAngle) * star.driftSpeed;
          const driftDy = Math.sin(star.driftAngle) * star.driftSpeed;
          drawX += driftDx;
          drawY += driftDy;
          star.originX += driftDx;
          star.originY += driftDy;
          // Slowly change drift angle for organic movement
          star.driftAngle += (Math.random() - 0.5) * 0.003;
          // Wrap origin
          if (star.originX < -20) star.originX += displayW + 40;
          if (star.originX > displayW + 20) star.originX -= displayW + 40;
          if (star.originY < -20) star.originY += displayH + 40;
          if (star.originY > displayH + 20) star.originY -= displayH + 40;
        }

        // Gravity toward mouse (stronger for near layers)
        const dx = mouseDisplayX - drawX;
        const dy = mouseDisplayY - drawY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GRAVITY_RADIUS) {
          const force = (1 - dist / GRAVITY_RADIUS) * GRAVITY_STRENGTH * (star.layer + 1) * 0.4;
          drawX += dx * force;
          drawY += dy * force;
        }

        star.x = drawX;
        star.y = drawY;

        const breathe = Math.sin(timeRef.current * star.speed + star.phase);
        const alpha = Math.max(0.04, Math.min(1, star.baseAlpha + breathe * 0.2));

        if (alpha < 0.05) continue;

        const tintColors = TINT_COLORS[star.tint];

        // Draw star core
        ctx.beginPath();
        ctx.arc(drawX * dpr, drawY * dpr, star.radius * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tintColors.main},${alpha.toFixed(3)})`;
        ctx.fill();

        // Draw glow for larger stars
        if (star.radius > 0.8) {
          const glowRadius = star.radius * dpr * 3.5;
          const glowAlpha = star.radius > 1.2 ? 0.18 : 0.12;
          ctx.beginPath();
          ctx.arc(drawX * dpr, drawY * dpr, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${tintColors.glow},${(alpha * glowAlpha).toFixed(3)})`;
          ctx.fill();
        }
      }

      // Draw burst particles
      const burstParts = burstParticlesRef.current;
      for (let i = burstParts.length - 1; i >= 0; i--) {
        const p = burstParts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= 16;
        if (p.life <= 0) {
          burstParts.splice(i, 1);
          continue;
        }
        const lifeRatio = p.life / p.maxLife;
        const alpha = lifeRatio * 0.85;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, p.radius * dpr * lifeRatio, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${alpha.toFixed(3)})`;
        ctx.fill();
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

  const handleScroll = useCallback(() => {
    targetScrollRef.current = window.scrollY;
  }, []);

  const handleClick = useCallback((e: MouseEvent) => {
    addBurst(e.clientX, e.clientY);
  }, [addBurst]);

  const handleVisibilityChange = useCallback(() => {
    isVisibleRef.current = !document.hidden;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    handleResize();
    animFrameRef.current = requestAnimationFrame(animate);

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleClick);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleClick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [animate, handleResize, handleMouseMove, handleScroll, handleClick, handleVisibilityChange]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0"
      style={{ zIndex: -1 }}
    />
  );
}
