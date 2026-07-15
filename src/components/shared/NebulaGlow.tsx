/**
 * NebulaGlow — subtle cosmic atmosphere spots rendered on all pages.
 * Dark mode: muted slate-blue nebulas. Light mode: warm sky-blue sun glows.
 */
"use client";

import { useTheme } from "@/components/layout/ThemeProvider";

export function NebulaGlow() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <>
      {/* Top-left glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-[15%] -left-[10%] h-[55%] w-[55%] rounded-full opacity-[0.05] blur-[120px]"
        style={{
          background: isLight
            ? "radial-gradient(ellipse, rgba(135,180,235,0.35) 0%, rgba(180,210,245,0.2) 40%, transparent 70%)"
            : "radial-gradient(ellipse, rgba(71,85,105,0.45) 0%, rgba(100,116,139,0.25) 40%, transparent 70%)",
          zIndex: -1,
        }}
      />
      {/* Bottom-right glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-[8%] -right-[5%] h-[45%] w-[45%] rounded-full opacity-[0.04] blur-[100px]"
        style={{
          background: isLight
            ? "radial-gradient(ellipse, rgba(135,180,235,0.25) 0%, rgba(180,210,245,0.12) 45%, transparent 70%)"
            : "radial-gradient(ellipse, rgba(100,116,139,0.35) 0%, rgba(71,85,105,0.18) 45%, transparent 70%)",
          zIndex: -1,
        }}
      />
      {/* Center-right subtle glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[35%] left-[55%] h-[35%] w-[35%] rounded-full opacity-[0.03] blur-[140px]"
        style={{
          background: isLight
            ? "radial-gradient(ellipse, rgba(135,180,235,0.2) 0%, rgba(180,210,245,0.1) 50%, transparent 75%)"
            : "radial-gradient(ellipse, rgba(71,85,105,0.3) 0%, rgba(100,116,139,0.15) 50%, transparent 75%)",
          zIndex: -1,
        }}
      />
    </>
  );
}
