"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/layout/ThemeProvider";

/* ── Fibonacci sphere: evenly distribute N points on a sphere ── */
function fibonacciSphere(n: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  if (n === 0) return points;
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = phi * i;
    points.push(
      new THREE.Vector3(
        Math.cos(theta) * radiusAtY * radius,
        y * radius,
        Math.sin(theta) * radiusAtY * radius
      )
    );
  }
  return points;
}

/* ── Calculate optimal sphere radius + font size from tag count ── */
function calcLayout(tagCount: number) {
  // Base radius grows with tag count to prevent overlap
  const radius = 2.2 + Math.max(0, (tagCount - 10) * 0.09);
  // Font shrinks slightly for many tags
  const fontSize = tagCount > 25 ? 0.21 : tagCount > 15 ? 0.24 : 0.28;
  return { radius, fontSize };
}

/* ═══════════════════════════════════════════════════════════
   Inner 3D scene — tag sphere with drag rotation
   ═══════════════════════════════════════════════════════════ */
interface TagSphereProps {
  tags: string[];
  activeTag: string | null;
  onTagClick: (tag: string) => void;
}

function TagSphere({ tags, activeTag, onTagClick }: TagSphereProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const { gl } = useThree();
  const { radius, fontSize } = useMemo(() => calcLayout(tags.length), [tags.length]);
  const positions = useMemo(
    () => fibonacciSphere(tags.length, radius),
    [tags.length, radius]
  );

  /* ── Drag state refs ── */
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const prevPointer = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });

  /* ── Native DOM events for reliable drag tracking ── */
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.touchAction = "none";
    canvas.style.outline = "none";

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      dragMoved.current = false;
      velocity.current = { x: 0, y: 0 };
      prevPointer.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - prevPointer.current.x;
      const dy = e.clientY - prevPointer.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        dragMoved.current = true;
      }
      velocity.current = { x: dx * 0.005, y: dy * 0.005 };
      if (groupRef.current) {
        groupRef.current.rotation.y += dx * 0.005;
        groupRef.current.rotation.x += dy * 0.005;
        // Clamp X rotation to prevent flipping
        groupRef.current.rotation.x = THREE.MathUtils.clamp(
          groupRef.current.rotation.x,
          -Math.PI / 2.2,
          Math.PI / 2.2
        );
      }
      prevPointer.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      isDragging.current = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [gl]);

  /* ── No auto-rotation; sphere stays still when not dragged ── */
  useFrame(() => {
    if (!groupRef.current) return;
    if (!isDragging.current) {
      // 彻底关闭自动旋转，用户不操作时标签球完全静止
      // Clamp X rotation to prevent flipping
      groupRef.current.rotation.x = THREE.MathUtils.clamp(
        groupRef.current.rotation.x,
        -Math.PI / 2.2,
        Math.PI / 2.2
      );
      velocity.current.x = 0;
      velocity.current.y = 0;
    }
  });

  return (
    <group ref={groupRef}>
      {tags.map((tag, i) => {
        const pos = positions[i];
        if (!pos) return null;
        const isActive = tag === activeTag;

        return (
          <Text
            key={tag}
            position={pos}
            fontSize={fontSize}
            color={isActive ? "#93c5fd" : "#e2e8f0"}
            fillOpacity={isActive ? 1 : 0.78}
            anchorX="center"
            anchorY="middle"
            outlineWidth={isActive ? 0.04 : 0.02}
            outlineColor={isActive ? "#3b82f6" : "#1e293b"}
            outlineOpacity={isActive ? 0.7 : 0.35}
            font={undefined}
            renderOrder={isActive ? 1 : 0}
            onClick={(e) => {
              e.stopPropagation();
              if (dragMoved.current) return;
              onTagClick(tag);
            }}
          >
            {tag}
          </Text>
        );
      })}
    </group>
  );
}




/* ═══════════════════════════════════════════════════════════
   Mobile fallback — horizontal scrollable tag bar
   ═══════════════════════════════════════════════════════════ */
function MobileTagBar({
  tags,
  activeTag,
  onTagClick,
}: {
  tags: string[];
  activeTag: string | null;
  onTagClick: (tag: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      {tags.map((tag) => {
        const isActive = tag === activeTag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick(tag)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-300",
              isActive
                ? "border-blue-400/35 bg-blue-500/20 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                : "border-slate-200/60 bg-slate-100/60 text-slate-600 hover:border-slate-300 hover:bg-slate-200/60 hover:text-slate-800 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/[0.14] dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   3D Canvas wrapper — only renders on client
   ═══════════════════════════════════════════════════════════ */
function TagCloudCanvas({
  tags,
  activeTag,
  onTagClick,
  isLight,
  errorText,
}: {
  tags: string[];
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  isLight: boolean;
  errorText: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="flex h-[380px] items-center justify-center">
        <p className="text-sm text-slate-500">{errorText}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto h-[380px] max-w-[600px] cursor-grab active:cursor-grabbing">
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
        onCreated={() => setHasError(false)}
        onError={() => setHasError(true)}
      >
        {/* Ambient + key/fill/rim lights — theme-aware */}
        <ambientLight intensity={0.65} color={isLight ? "#94a3b8" : "#334155"} />
        <pointLight position={[4, 3, 5]} intensity={60} color={isLight ? "#64748b" : "#64748b"} />
        <pointLight position={[-3, -2, -3]} intensity={30} color={isLight ? "#475569" : "#475569"} />
        <pointLight position={[0, 0, -5]} intensity={15} color={isLight ? "#cbd5e1" : "#334155"} />

        <TagSphere tags={tags} activeTag={activeTag} onTagClick={onTagClick} />
      </Canvas>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SSR-safe placeholder — matches the 3D canvas footprint
   ═══════════════════════════════════════════════════════════ */
function CanvasPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto h-[380px] max-w-[600px] rounded-xl"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(71,85,105,0.08) 0%, transparent 70%)",
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   Main exported component
   ═══════════════════════════════════════════════════════════ */
interface TechTagCloudProps {
  tags: string[];
  activeTag: string | null;
  onTagClick: (tag: string) => void;
}

export function TechTagCloud({
  tags,
  activeTag,
  onTagClick,
}: TechTagCloudProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // All browser-detection logic runs only after mount, ensuring
  // server and client renders are identical.
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    setMounted(true);
    return () => mql.removeEventListener("change", handler);
  }, []);

  if (tags.length === 0) return null;

  // Before mount: render a placeholder identical on server + client
  if (!mounted) {
    return (
      <div className="mb-10">
        <CanvasPlaceholder />
      </div>
    );
  }

  /* ── Mobile: horizontal tag bar ── */
  if (isMobile) {
    return (
      <div className="mb-10">
        <p className="mb-3 font-mono text-xs tracking-[0.2em] text-slate-500/70 uppercase">
          {t("projects.tagCloudTitle")}
        </p>
        <MobileTagBar
          tags={tags}
          activeTag={activeTag}
          onTagClick={onTagClick}
        />
      </div>
    );
  }

  /* ── Desktop: 3D tag cloud only ── */
  return (
    <div className="mb-10">
      <TagCloudCanvas
        tags={tags}
        activeTag={activeTag}
        onTagClick={onTagClick}
        isLight={isLight}
        errorText={t("projects.tagCloudError")}
      />

      {/* Hint text — subdued, low opacity */}
      <p className="mt-3 text-center text-xs text-slate-400/60 dark:text-slate-500/40">
        {t("projects.tagCloudHint")}
      </p>

      {activeTag && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => onTagClick(activeTag)}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-600 transition-all duration-200 hover:border-blue-400/50 hover:bg-blue-500/20 dark:border-blue-400/20 dark:bg-blue-500/8 dark:text-blue-300 dark:hover:border-blue-400/35 dark:hover:bg-blue-500/15"
          >
            {t("projects.tagCloudFilter")}{activeTag}
            <span className="ml-0.5 text-slate-400">{t("projects.tagCloudClear")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
