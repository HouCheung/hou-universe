"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useTheme } from "@/components/layout/ThemeProvider";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

type EntrancePhase = "initial" | "stars" | "planet" | "content" | "complete";

interface EntranceContextValue {
  /** Whether the entrance sequence is fully complete */
  isComplete: boolean;
  /** Whether content (hero text, etc.) should be visible */
  contentVisible: boolean;
  /** Current phase for fine-grained control */
  phase: EntrancePhase;
}

/* ═══════════════════════════════════════════════════════════
   Context
   ═══════════════════════════════════════════════════════════ */

const EntranceContext = createContext<EntranceContextValue>({
  isComplete: true,
  contentVisible: true,
  phase: "complete",
});

export function useEntrance() {
  return useContext(EntranceContext);
}

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const SESSION_KEY = "hou-entrance-played";

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function isLowEndDevice(): boolean {
  if (typeof window === "undefined") return false;
  // Mobile devices
  if (window.innerWidth < 768) return true;
  // Reduced motion preference
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  // Low CPU
  const cores = navigator.hardwareConcurrency;
  if (cores !== undefined && cores < 4) return true;
  return false;
}

/* ═══════════════════════════════════════════════════════════
   EntranceSequence Component
   ═══════════════════════════════════════════════════════════ */

interface EntranceSequenceProps {
  children: ReactNode;
}

export function EntranceSequence({ children }: EntranceSequenceProps) {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<EntrancePhase>(() => {
    if (typeof window === "undefined") return "complete";
    // Skip if already played this session
    if (sessionStorage.getItem(SESSION_KEY) === "1") return "complete";
    return "initial";
  });

  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const lowEndRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ── Run entrance sequence ── */
  const runEntrance = useCallback(() => {
    const lowEnd = isLowEndDevice();
    lowEndRef.current = lowEnd;

    if (lowEnd) {
      // Simplified: quick 0.8s fade-in only
      const start = performance.now();
      const duration = 800;

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / duration);
        // Ease-out
        const eased = 1 - Math.pow(1 - progress, 3);
        setOverlayOpacity(1 - eased);

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          setOverlayOpacity(0);
          setPhase("complete");
          sessionStorage.setItem(SESSION_KEY, "1");
        }
      };
      requestAnimationFrame(tick);
      return;
    }

    // Full entrance sequence with phases
    const start = performance.now();
    const totalDuration = 1500; // 1.5s total

    const tick = (now: number) => {
      const elapsed = now - start;

      // Phase transitions
      if (elapsed >= 1500) {
        setPhase("complete");
        setOverlayOpacity(0);
        sessionStorage.setItem(SESSION_KEY, "1");
        return;
      } else if (elapsed >= 1000) {
        setPhase("content");
      } else if (elapsed >= 500) {
        setPhase("planet");
      } else {
        setPhase("stars");
      }

      // Overlay fade: 0-500ms fade from black to transparent
      // Uses a smooth ease-out curve
      const fadeProgress = Math.min(1, elapsed / 500);
      const eased = 1 - Math.pow(1 - fadeProgress, 3);
      setOverlayOpacity(Math.max(0, 1 - eased));

      if (elapsed < totalDuration) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (phase === "initial") {
      // Small delay to let DOM settle before starting
      const initTimer = setTimeout(runEntrance, 50);
      return () => clearTimeout(initTimer);
    }
  }, [phase, runEntrance]);

  /* ── Update body data attribute for CSS coordination ── */
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.entrancePhase = phase;

    return () => {
      delete document.documentElement.dataset.entrancePhase;
    };
  }, [phase]);

  /* ── Cleanup timers on unmount ── */
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const isComplete = phase === "complete";
  const contentVisible = phase === "content" || phase === "complete";

  return (
    <EntranceContext.Provider value={{ isComplete, contentVisible, phase }}>
      {children}

      {/* Black overlay — fades out during entrance */}
      {!isComplete && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[10000] pointer-events-none"
          style={{
            backgroundColor: theme === "light"
              ? `rgba(240,247,255,${overlayOpacity.toFixed(4)})`
              : `rgba(10,10,15,${overlayOpacity.toFixed(4)})`,
            transition: lowEndRef.current ? "none" : undefined,
          }}
        />
      )}
    </EntranceContext.Provider>
  );
}
