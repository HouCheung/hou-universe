"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/layout/ThemeProvider";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

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

interface ConstellationDef {
  name: string;
  stars: { x: number; y: number }[]; // viewport percentage 0-100
  connections: [number, number][];
  screenRegion: "left" | "right" | "center";
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  trail: { x: number; y: number; alpha: number }[];
  maxTrail: number;
}

/* ═══════════════════════════════════════════════════════════
   Layer Config (preserved from original)
   ═══════════════════════════════════════════════════════════ */

const LAYERS = [
  { count: 55, radiusRange: [1.2, 2.8] as [number, number], alphaRange: [0.22, 0.45] as [number, number], speedFactor: 0.12 },
  { count: 100, radiusRange: [0.7, 1.4] as [number, number], alphaRange: [0.35, 0.6] as [number, number], speedFactor: 0.38 },
  { count: 190, radiusRange: [0.3, 0.7] as [number, number], alphaRange: [0.55, 0.92] as [number, number], speedFactor: 1.0 },
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

/* ═══════════════════════════════════════════════════════════
   Constellation Definitions
   ═══════════════════════════════════════════════════════════ */

const CONSTELLATIONS: Record<string, ConstellationDef> = {
  orion: {
    name: "Orion",
    // Hourglass + belt shape, positioned upper-right
    stars: [
      { x: 68, y: 15 },  // left shoulder
      { x: 78, y: 12 },  // right shoulder
      { x: 85, y: 22 },  // arm
      { x: 70, y: 25 },  // belt left
      { x: 76, y: 24 },  // belt center
      { x: 82, y: 23 },  // belt right
      { x: 66, y: 38 },  // left leg
      { x: 80, y: 40 },  // right leg
    ],
    connections: [[0,1],[1,2],[0,3],[1,5],[3,4],[4,5],[3,6],[5,7],[6,7]],
    screenRegion: "right",
  },
  "ursa-major": {
    name: "Ursa Major",
    // Big Dipper shape, positioned upper-left
    stars: [
      { x: 10, y: 16 },  // handle tip
      { x: 16, y: 20 },  // handle mid
      { x: 20, y: 27 },  // handle base / dipper junction
      { x: 12, y: 33 },  // dipper bottom
      { x: 21, y: 36 },  // dipper bottom-right
      { x: 28, y: 34 },  // dipper right
      { x: 33, y: 27 },  // dipper top-right
    ],
    connections: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,2]],
    screenRegion: "left",
  },
  andromeda: {
    name: "Andromeda",
    // Curved chain, positioned mid-right
    stars: [
      { x: 72, y: 18 },
      { x: 66, y: 24 },
      { x: 75, y: 25 },
      { x: 70, y: 32 },
      { x: 80, y: 35 },
      { x: 74, y: 42 },
      { x: 84, y: 44 },
    ],
    connections: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]],
    screenRegion: "right",
  },
};

/* ═══════════════════════════════════════════════════════════
   Meteor Config
   ═══════════════════════════════════════════════════════════ */

const METEOR_MIN_INTERVAL = 15000; // 15 seconds
const METEOR_MAX_INTERVAL = 20000; // 20 seconds
const METEOR_SPEED_MIN = 1.8;
const METEOR_SPEED_MAX = 3.5;
const METEOR_TRAIL_LENGTH = 14;
const METEOR_LIFETIME = 2200; // ms — slow, graceful fade
const METEOR_BASE_OPACITY = 0.28;

function spawnMeteor(w: number, h: number): Meteor {
  // Start from random edge, mostly top or right
  const edge = Math.random();
  let x: number, y: number;
  if (edge < 0.5) {
    // Top edge
    x = Math.random() * w * 0.8 + w * 0.1;
    y = -10;
  } else if (edge < 0.8) {
    // Right edge
    x = w + 10;
    y = Math.random() * h * 0.5;
  } else {
    // Left edge
    x = -10;
    y = Math.random() * h * 0.4;
  }

  // Direction: mostly diagonal down-left or down-right
  const angle = (Math.PI / 2) + (Math.random() - 0.5) * 0.7; // mostly downward with slight angle
  const speed = METEOR_SPEED_MIN + Math.random() * (METEOR_SPEED_MAX - METEOR_SPEED_MIN);

  const maxTrail = Math.floor(METEOR_TRAIL_LENGTH * (0.7 + Math.random() * 0.6));

  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: METEOR_LIFETIME,
    maxLife: METEOR_LIFETIME,
    trail: [],
    maxTrail,
  };
}

/* ═══════════════════════════════════════════════════════════
   StarField Component
   ═══════════════════════════════════════════════════════════ */

export function StarField() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const burstParticlesRef = useRef<BurstParticle[]>([]);
  const meteorRef = useRef<Meteor | null>(null);
  const meteorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meteorEnabledRef = useRef<boolean>(true);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const scrollRef = useRef<number>(0);
  const targetScrollRef = useRef<number>(0);
  const scrollDepthRef = useRef<number>(0);
  const targetScrollDepthRef = useRef<number>(0);
  const parallaxXRef = useRef<number>(0);
  const parallaxYRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);
  const isMobileRef = useRef<boolean>(false);
  const displayWRef = useRef<number>(0);
  const displayHRef = useRef<number>(0);

  // ── Constellation state ──
  const activeConstellationRef = useRef<string | null>(null);
  const constellationOpacityRef = useRef<number>(0);
  const constellationStarsRef = useRef<{ x: number; y: number; radius: number; baseAlpha: number }[]>([]);

  const pathname = usePathname();

  /* ── Init stars ── */
  const initStars = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    for (let l = 0; l < LAYERS.length; l++) {
      const layer = LAYERS[l];
      for (let i = 0; i < layer.count; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const tintRand = Math.random();
        const tint: Star["tint"] = tintRand < 0.75 ? "white" : tintRand < 0.95 ? "blue" : "purple";
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

  /* ── Add burst particles ── */
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

  /* ── Determine which constellation should be active ── */
  const getTargetConstellation = useCallback((): string | null => {
    // Only on desktop
    if (isMobileRef.current) return null;

    // Route-based detection
    if (pathname === "/") {
      // Homepage: detect by scroll position
      const vh = displayHRef.current || window.innerHeight;
      if (vh <= 0) return null;
      const scrollRatio = scrollRef.current / vh;

      if (scrollRatio < 0.55) {
        return "orion"; // Hero — Orion
      } else if (scrollRatio < 2.6) {
        return "ursa-major"; // Projects section — Ursa Major
      } else {
        return "andromeda"; // About section — Andromeda
      }
    } else if (pathname.startsWith("/projects")) {
      return "ursa-major";
    } else if (pathname.startsWith("/about")) {
      return "andromeda";
    }

    return null;
  }, [pathname]);

  /* ── Schedule next meteor ── */
  const scheduleMeteor = useCallback(() => {
    if (!meteorEnabledRef.current) return;
    const interval = METEOR_MIN_INTERVAL + Math.random() * (METEOR_MAX_INTERVAL - METEOR_MIN_INTERVAL);
    meteorTimerRef.current = setTimeout(() => {
      if (!meteorEnabledRef.current) return;
      const w = displayWRef.current;
      const h = displayHRef.current;
      if (w > 0 && h > 0 && !meteorRef.current) {
        meteorRef.current = spawnMeteor(w, h);
      }
      scheduleMeteor();
    }, interval);
  }, []);

  /* ── Main animation loop ── */
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
      scrollDepthRef.current +=
        (targetScrollDepthRef.current - scrollDepthRef.current) * 0.06;

      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const displayW = w / dpr;
      const displayH = h / dpr;
      displayWRef.current = displayW;
      displayHRef.current = displayH;
      const scrollY = scrollRef.current;
      const scrollDepth = scrollDepthRef.current;

      ctx.clearRect(0, 0, w, h);

      const mouseDisplayX = mouseRef.current.x * displayW;
      const mouseDisplayY = mouseRef.current.y * displayH;

      // ── Mouse parallax offsets (subtle, opposite to mouse) ──
      const isMobile = isMobileRef.current;
      if (!isMobile) {
        const px = (mouseRef.current.x - 0.5) * 2; // -1..1
        const py = (mouseRef.current.y - 0.5) * 2;
        parallaxXRef.current += (px - parallaxXRef.current) * 0.04;
        parallaxYRef.current += (py - parallaxYRef.current) * 0.04;
      } else {
        parallaxXRef.current = 0;
        parallaxYRef.current = 0;
      }
      const parallaxX = parallaxXRef.current;
      const parallaxY = parallaxYRef.current;

      // ── Depth brightness boost (scroll deeper → stars brighter) ──
      const depthBoost = isMobile
        ? 1 + scrollDepth * 0.15
        : 1 + scrollDepth * 0.4;

      // ── Draw regular stars ──
      for (const star of starsRef.current) {
        const layerDef = LAYERS[star.layer];
        const scrollOffsetY = scrollY * layerDef.speedFactor * 0.5;

        let drawX = star.originX;
        let drawY = star.originY - scrollOffsetY;

        // ── Mouse parallax: subtle layer-based displacement ──
        if (!isMobile) {
          const parallaxFactor = (star.layer + 1) * 6;
          drawX += parallaxX * parallaxFactor;
          drawY += parallaxY * parallaxFactor;
        }

        while (drawY < -10) drawY += displayH + 20;
        while (drawY > displayH + 10) drawY -= displayH + 20;

        if (star.layer === 3 && star.driftSpeed > 0) {
          const driftDx = Math.cos(star.driftAngle) * star.driftSpeed;
          const driftDy = Math.sin(star.driftAngle) * star.driftSpeed;
          drawX += driftDx;
          drawY += driftDy;
          star.originX += driftDx;
          star.originY += driftDy;
          star.driftAngle += (Math.random() - 0.5) * 0.003;
          if (star.originX < -20) star.originX += displayW + 40;
          if (star.originX > displayW + 20) star.originX -= displayW + 40;
          if (star.originY < -20) star.originY += displayH + 40;
          if (star.originY > displayH + 20) star.originY -= displayH + 40;
        }

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
        const boostedBaseAlpha = Math.min(0.98, star.baseAlpha * depthBoost);
        const alpha = Math.max(0.04, Math.min(1, boostedBaseAlpha + breathe * 0.2));

        if (alpha < 0.05) continue;

        const tintColors = TINT_COLORS[star.tint];

        ctx.beginPath();
        ctx.arc(drawX * dpr, drawY * dpr, star.radius * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tintColors.main},${alpha.toFixed(3)})`;
        ctx.fill();

        if (star.radius > 0.8) {
          const depthGlowBoost = 1 + scrollDepth * 0.3;
          const glowRadius = star.radius * dpr * 3.5 * depthGlowBoost;
          const glowAlpha = star.radius > 1.2 ? 0.18 : 0.12;
          ctx.beginPath();
          ctx.arc(drawX * dpr, drawY * dpr, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${tintColors.glow},${(alpha * glowAlpha).toFixed(3)})`;
          ctx.fill();
        }
      }

      // ══════════════════════════════════════════════════════
      // Constellation lines + stars
      // ══════════════════════════════════════════════════════
      const targetConstellation = getTargetConstellation();
      if (activeConstellationRef.current !== targetConstellation) {
        activeConstellationRef.current = targetConstellation;
      }

      const targetOpacity = targetConstellation ? 1 : 0;
      const currentOpacity = constellationOpacityRef.current;
      // Smooth lerp: fade in slowly, fade out slowly
      const lerpSpeed = 0.015;
      const newOpacity = currentOpacity + (targetOpacity - currentOpacity) * lerpSpeed;
      // Snap when very close to avoid perpetual micro-changes
      constellationOpacityRef.current =
        Math.abs(newOpacity - targetOpacity) < 0.001 ? targetOpacity : newOpacity;

      const constOpacity = constellationOpacityRef.current;

      if (constOpacity > 0.005 && targetConstellation) {
        const def = CONSTELLATIONS[targetConstellation];
        if (def) {
          const constStars: { x: number; y: number; radius: number; baseAlpha: number }[] = [];

          // Convert percentage positions to pixel positions
          const pixelStars = def.stars.map((s) => ({
            x: (s.x / 100) * displayW,
            y: (s.y / 100) * displayH,
          }));

          // Draw connection lines
          const lineAlpha = constOpacity * 0.22; // low opacity, very subtle
          for (const [a, b] of def.connections) {
            const sa = pixelStars[a];
            const sb = pixelStars[b];
            if (!sa || !sb) continue;
            ctx.beginPath();
            ctx.moveTo(sa.x * dpr, sa.y * dpr);
            ctx.lineTo(sb.x * dpr, sb.y * dpr);
            ctx.strokeStyle = `rgba(140,190,240,${lineAlpha.toFixed(4)})`;
            ctx.lineWidth = 0.6 * dpr;
            ctx.stroke();
          }

          // Draw constellation star points
          for (const ps of pixelStars) {
            const starAlpha = constOpacity * 0.55;
            const radius = 1.8 * dpr;

            // Core
            ctx.beginPath();
            ctx.arc(ps.x * dpr, ps.y * dpr, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(160,210,255,${starAlpha.toFixed(3)})`;
            ctx.fill();

            // Subtle glow
            ctx.beginPath();
            ctx.arc(ps.x * dpr, ps.y * dpr, radius * 3.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(140,190,240,${(starAlpha * 0.35).toFixed(3)})`;
            ctx.fill();

            constStars.push({
              x: ps.x,
              y: ps.y,
              radius: 1.8,
              baseAlpha: constOpacity * 0.55,
            });
          }
          constellationStarsRef.current = constStars;
        }
      } else if (constOpacity < 0.005) {
        constellationStarsRef.current = [];
      }

      // ══════════════════════════════════════════════════════
      // Meteor
      // ══════════════════════════════════════════════════════
      const meteor = meteorRef.current;
      if (meteor) {
        // Update trail
        meteor.trail.push({ x: meteor.x, y: meteor.y, alpha: 1 });
        if (meteor.trail.length > meteor.maxTrail) {
          meteor.trail.shift();
        }

        // Move meteor
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        meteor.life -= 16;

        // Remove if expired or off-screen
        if (
          meteor.life <= 0 ||
          meteor.x > displayW + 50 ||
          meteor.y > displayH + 50 ||
          meteor.x < -50 ||
          meteor.y < -50
        ) {
          meteorRef.current = null;
        } else {
          const lifeRatio = Math.max(0, meteor.life / meteor.maxLife);
          const meteorAlpha = METEOR_BASE_OPACITY * lifeRatio;

          // Draw trail
          if (meteor.trail.length > 1) {
            for (let i = 1; i < meteor.trail.length; i++) {
              const t = meteor.trail[i];
              const tPrev = meteor.trail[i - 1];
              const segAlpha = (i / meteor.trail.length) * meteorAlpha * 0.7;

              ctx.beginPath();
              ctx.moveTo(tPrev.x * dpr, tPrev.y * dpr);
              ctx.lineTo(t.x * dpr, t.y * dpr);
              ctx.strokeStyle = `rgba(180,210,240,${segAlpha.toFixed(4)})`;
              ctx.lineWidth = (0.4 + (i / meteor.trail.length) * 1.0) * dpr;
              ctx.stroke();
            }
          }

          // Draw head
          const headAlpha = meteorAlpha * 1.3;
          ctx.beginPath();
          ctx.arc(meteor.x * dpr, meteor.y * dpr, 1.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,225,255,${Math.min(1, headAlpha).toFixed(3)})`;
          ctx.fill();

          // Head glow
          ctx.beginPath();
          ctx.arc(meteor.x * dpr, meteor.y * dpr, 4.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,210,240,${(headAlpha * 0.3).toFixed(3)})`;
          ctx.fill();
        }
      }

      // ══════════════════════════════════════════════════════
      // Burst particles
      // ══════════════════════════════════════════════════════
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
  }, [getTargetConstellation]);

  /* ── Resize handler ── */
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
    displayWRef.current = w;
    displayHRef.current = h;
    initStars(w, h);
  }, [initStars]);

  /* ── Event handlers ── */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    targetMouseRef.current.x = e.clientX / window.innerWidth;
    targetMouseRef.current.y = e.clientY / window.innerHeight;
  }, []);

  const handleScroll = useCallback(() => {
    targetScrollRef.current = window.scrollY;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    targetScrollDepthRef.current = docH > 0 ? Math.min(1, window.scrollY / docH) : 0;
  }, []);

  const handleClick = useCallback((e: MouseEvent) => {
    addBurst(e.clientX, e.clientY);
  }, [addBurst]);

  const handleVisibilityChange = useCallback(() => {
    isVisibleRef.current = !document.hidden;
    // Resume meteor scheduling when page becomes visible
    if (!document.hidden && meteorEnabledRef.current && !meteorRef.current) {
      // Don't reschedule here — the existing timer will fire
    }
  }, []);

  const handleMobileCheck = useCallback(() => {
    isMobileRef.current = window.innerWidth < 768;
    meteorEnabledRef.current = !isMobileRef.current;
    if (isMobileRef.current) {
      // Clear any active meteor
      meteorRef.current = null;
      if (meteorTimerRef.current) {
        clearTimeout(meteorTimerRef.current);
        meteorTimerRef.current = null;
      }
      // Clear constellation
      activeConstellationRef.current = null;
      constellationOpacityRef.current = 0;
    } else {
      // Start meteor cycle
      if (!meteorTimerRef.current) {
        scheduleMeteor();
      }
    }
  }, [scheduleMeteor]);

  /* ── Init / cleanup ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    handleMobileCheck();
    handleResize();
    animFrameRef.current = requestAnimationFrame(animate);

    window.addEventListener("resize", handleResize);
    window.addEventListener("resize", handleMobileCheck);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleClick);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Start meteor scheduling on desktop
    if (!isMobileRef.current) {
      scheduleMeteor();
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (meteorTimerRef.current) {
        clearTimeout(meteorTimerRef.current);
        meteorTimerRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("resize", handleMobileCheck);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleClick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [animate, handleResize, handleMobileCheck, handleMouseMove, handleScroll, handleClick, handleVisibilityChange, scheduleMeteor]);

  // Hide starfield in light mode — stars are invisible on a bright sky
  if (theme === "light") return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0"
      style={{ zIndex: -1 }}
    />
  );
}
