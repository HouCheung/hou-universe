"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

const STORAGE_KEY = "hou-sound-enabled";

/**
 * SoundToggle — minimal easter-egg sound toggle.
 *
 * - Default OFF (no sound until user explicitly opts in — browser policy friendly)
 * - ON: ultra-low brown-noise ambient + subtle click/transition feedback chirps
 * - Persists choice via localStorage
 * - Hidden on mobile (touch devices)
 */
export function useSoundEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setEnabled(stored === "true");
    } catch {
      // localStorage unavailable — silently stay off
    }
  }, []);

  const persist = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  // Expose a global setter for other components to use
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__houSetSoundEnabled = persist;
    return () => {
      delete (window as unknown as Record<string, unknown>).__houSetSoundEnabled;
    };
  }, [persist]);

  return enabled;
}

export function SoundToggle() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambientNodeRef = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null>(null);
  const initializedRef = useRef(false);

  // Mount detection
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setEnabled(true);
    }
  }, []);

  const stopAmbient = useCallback(() => {
    if (ambientNodeRef.current) {
      try {
        ambientNodeRef.current.source.stop();
      } catch {
        // already stopped
      }
      ambientNodeRef.current = null;
    }
  }, []);

  const startAmbient = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") return;

    stopAmbient();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Generate brown noise buffer (2 seconds, looping)
    const sampleRate = ctx.sampleRate;
    const duration = 2;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Brown noise: integrate white noise over time, then normalize
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Leaky integrator for brown noise
      lastOut = lastOut + 0.02 * white;
      // Gentle clamping
      lastOut = Math.max(-1, Math.min(1, lastOut * 0.995));
      data[i] = lastOut;
    }

    // Normalize
    let maxAmp = 0;
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxAmp) maxAmp = abs;
    }
    if (maxAmp > 0) {
      for (let i = 0; i < length; i++) {
        data[i] = data[i] / maxAmp * 0.4;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Very low gain — barely audible, deep-space ambiance
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.015, ctx.currentTime); // Extremely quiet

    // Low-pass filter to make it even less obtrusive
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, ctx.currentTime);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);

    ambientNodeRef.current = { source, gain: gainNode };
  }, [stopAmbient]);

  // Initialize AudioContext lazily on first user interaction
  const initAudio = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
    } catch {
      // Web Audio not available
    }
  }, []);

  // Play a subtle click feedback sound
  const playClickSound = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") return;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Very short sine blip — soft star chime
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.03, now); // Very quiet
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }

    if (!initializedRef.current) {
      initAudio();
    }

    if (next) {
      startAmbient();
      // Also expose globally
      (window as unknown as Record<string, unknown>).__houSoundEnabled = true;
    } else {
      stopAmbient();
      (window as unknown as Record<string, unknown>).__houSoundEnabled = false;
    }
  }, [enabled, initAudio, startAmbient, stopAmbient]);

  // Start ambient on mount if persisted as enabled
  useEffect(() => {
    if (mounted && enabled && !initializedRef.current) {
      initAudio();
      // Small delay to ensure AudioContext is ready
      const timer = setTimeout(() => startAmbient(), 100);
      return () => clearTimeout(timer);
    }
  }, [mounted, enabled, initAudio, startAmbient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAmbient();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
    };
  }, [stopAmbient]);

  if (!mounted) {
    // Render placeholder to avoid layout shift
    return <div className="hidden md:block w-8 h-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        // Play click sound if enabling
        if (!enabled) {
          initAudio();
          // Delay to let audio context initialize
          setTimeout(() => playClickSound(), 50);
        }
        toggle();
      }}
      onMouseEnter={() => {
        if (enabled) playClickSound();
      }}
      className="hidden md:flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 transition-all duration-300 hover:bg-slate-200/40 dark:text-slate-600 dark:hover:text-slate-300 dark:hover:bg-white/[0.04] group"
      aria-label={enabled ? "Disable sound effects" : "Enable sound effects"}
      title={enabled ? "Sound on" : "Sound off"}
    >
      {enabled ? (
        <Volume2 className="h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110" />
      ) : (
        <VolumeX className="h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110" />
      )}
    </button>
  );
}
