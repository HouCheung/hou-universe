"use client";

import { useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Tilt intensity multiplier (0-1). Default: 0.08 */
  intensity?: number;
  /** Glare opacity (0-1). Default: 0.06 */
  glare?: number;
  /** Perspective distance in px. Default: 800 */
  perspective?: number;
  /** Whether to disable tilt on touch devices. Default: true */
  disableOnTouch?: boolean;
}

export function TiltCard({
  children,
  className,
  intensity = 0.08,
  glare = 0.06,
  perspective = 800,
  disableOnTouch = true,
}: TiltCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const currentRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const targetRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const isTouchRef = useRef(false);
  const isHoveringRef = useRef(false);

  const animate = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const cur = currentRef.current;
    const tgt = targetRef.current;

    // Lerp toward target
    if (isHoveringRef.current) {
      cur.rx += (tgt.rx - cur.rx) * 0.12;
      cur.ry += (tgt.ry - cur.ry) * 0.12;
      cur.gx += (tgt.gx - cur.gx) * 0.12;
      cur.gy += (tgt.gy - cur.gy) * 0.12;
    } else {
      // Smooth reset to neutral
      cur.rx += (0 - cur.rx) * 0.08;
      cur.ry += (0 - cur.ry) * 0.08;
      cur.gx += (50 - cur.gx) * 0.08;
      cur.gy += (50 - cur.gy) * 0.08;
    }

    const rx = cur.rx.toFixed(3);
    const ry = cur.ry.toFixed(3);

    el.style.transform = `perspective(${perspective}px) rotateX(${rx}deg) rotateY(${ry}deg)`;

    // Update glare gradient position via CSS custom property
    el.style.setProperty("--glare-x", `${cur.gx.toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${cur.gy.toFixed(1)}%`);

    rafRef.current = requestAnimationFrame(animate);
  }, [perspective]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isTouchRef.current) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      // Normalize to -1..1
      const nx = (x / w) * 2 - 1;
      const ny = (y / h) * 2 - 1;

      targetRef.current.rx = ny * intensity * -25;
      targetRef.current.ry = nx * intensity * 25;
      targetRef.current.gx = ((x / w) * 100);
      targetRef.current.gy = ((y / h) * 100);
    },
    [intensity]
  );

  const handleMouseEnter = useCallback(() => {
    if (isTouchRef.current) return;
    isHoveringRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
  }, []);

  const handleTouchStart = useCallback(() => {
    if (disableOnTouch) {
      isTouchRef.current = true;
    }
  }, [disableOnTouch]);

  const glareStyle: CSSProperties = glare > 0
    ? {
        backgroundImage: `radial-gradient(ellipse at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255,255,255,${glare}) 0%, transparent 50%)`,
      }
    : {};

  return (
    <div
      ref={containerRef}
      className={cn("tilt-card", className)}
      style={{
        transformStyle: "preserve-3d",
        willChange: "transform",
        transition: "box-shadow 0.3s ease",
        ...glareStyle,
      } as CSSProperties}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
    >
      {children}
    </div>
  );
}
