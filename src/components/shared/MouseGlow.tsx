'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '@/components/layout/ThemeProvider';

export function MouseGlow() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const glowRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<{ x: number; y: number }>({ x: -200, y: -200 });
  const targetRef = useRef<{ x: number; y: number }>({ x: -200, y: -200 });
  const animFrameRef = useRef<number>(0);
  const isTouchDeviceRef = useRef<boolean>(false);

  const animate = useCallback(() => {
    const glow = glowRef.current;
    if (!glow || isTouchDeviceRef.current) {
      animFrameRef.current = requestAnimationFrame(animate);
      return;
    }

    posRef.current.x += (targetRef.current.x - posRef.current.x) * 0.06;
    posRef.current.y += (targetRef.current.y - posRef.current.y) * 0.06;

    glow.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    targetRef.current.x = e.clientX;
    targetRef.current.y = e.clientY;
  }, []);

  const handleTouchStart = useCallback(() => {
    isTouchDeviceRef.current = true;
    if (glowRef.current) {
      glowRef.current.style.opacity = '0';
    }
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(animate);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true, once: true });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [animate, handleMouseMove, handleTouchStart]);

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-0"
      style={{
        width: '700px',
        height: '700px',
        borderRadius: '50%',
        background: isLight
          ? 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, rgba(59,130,246,0.03) 28%, rgba(100,116,139,0.015) 52%, rgba(0,0,0,0) 78%)'
          : 'radial-gradient(circle, rgba(100,116,139,0.1) 0%, rgba(71,85,105,0.05) 28%, rgba(51,65,85,0.02) 52%, rgba(0,0,0,0) 78%)',
        transform: 'translate(-350px, -350px)',
        willChange: 'transform',
      }}
    />
  );
}
