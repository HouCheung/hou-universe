"use client";

import { useEffect, useCallback } from "react";

/**
 * CardClickRipple — attaches click ripple effect to all .glass-card-hover elements.
 * Listens globally via event delegation for performance.
 * Ripple color synced with deep blue primary.
 */
export function CardClickRipple() {
  const handleClick = useCallback((e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest(".glass-card-hover") as HTMLElement | null;
    if (!target) return;

    // Prevent creating ripple if clicking on a link or button inside the card
    const clickedEl = e.target as HTMLElement;
    if (clickedEl.closest("a, button, [role='button']")) return;

    // Remove existing ripples
    const existing = target.querySelectorAll(".ripple-effect");
    existing.forEach((el) => el.remove());

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;

    target.appendChild(ripple);

    // Auto-cleanup after animation
    ripple.addEventListener("animationend", () => {
      ripple.remove();
    });
  }, []);

  useEffect(() => {
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [handleClick]);

  return null;
}
