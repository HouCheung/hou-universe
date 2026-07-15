"use client";

import { useRef, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════
   Textured Earth Surface — NASA Blue Marble daytime map
   ═══════════════════════════════════════════════════════════ */

function EarthSurface() {
  const texture = useTexture("/images/earth-day.jpg");
  // sRGB encoding for natural color reproduction
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh>
      <sphereGeometry args={[1.35, 48, 48]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.72}
        metalness={0.02}
      />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════
   Cloud Layer — semi-transparent shell with subtle rotation offset
   ═══════════════════════════════════════════════════════════ */

function CloudLayer() {
  const cloudRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (cloudRef.current) {
      // Clouds drift slightly faster than the planet surface
      cloudRef.current.rotation.y += delta * 0.04;
    }
  });

  return (
    <mesh ref={cloudRef}>
      <sphereGeometry args={[1.365, 40, 40]} />
      <meshStandardMaterial
        color="#ffffff"
        transparent
        opacity={0.08}
        roughness={1.0}
        metalness={0}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════
   Daytime Atmosphere — soft sky-blue outer glow
   ═══════════════════════════════════════════════════════════ */

function DayAtmosphere() {
  return (
    <>
      {/* Outer soft blue halo */}
      <mesh>
        <sphereGeometry args={[1.48, 32, 32]} />
        <meshBasicMaterial
          color="#87CEEB"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Inner atmosphere rim */}
      <mesh>
        <sphereGeometry args={[1.40, 32, 32]} />
        <meshBasicMaterial
          color="#B0E0FF"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Subtle Orbital Arc — daytime version
   ═══════════════════════════════════════════════════════════ */

function DayOrbitalArc() {
  return (
    <mesh rotation={[Math.PI / 2.5, 0.1, 0]}>
      <torusGeometry args={[1.80, 0.006, 8, 64]} />
      <meshBasicMaterial
        color="#87CEEB"
        transparent
        opacity={0.10}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════
   Interactive Earth Scene — with scroll-pause optimization
   ═══════════════════════════════════════════════════════════ */

function EarthScene({ interactive }: { interactive: boolean }) {
  const { gl, invalidate } = useThree();
  const isScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      isScrolling.current = true;
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => {
        isScrolling.current = false;
        invalidate();
      }, 120);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [invalidate]);

  useFrame(() => {
    if (!isScrolling.current) {
      invalidate();
    }
  });

  useEffect(() => {
    const canvas = gl.domElement;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          isScrolling.current = true;
        } else {
          isScrolling.current = false;
          invalidate();
        }
      },
      { threshold: 0.01 }
    );
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    const onVisibility = () => {
      if (document.hidden) {
        isScrolling.current = true;
      } else {
        isScrolling.current = false;
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gl, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.pointerEvents = "auto";
    canvas.style.touchAction = "none";

    const onDown = () => {
      canvas.style.cursor = "grabbing";
    };
    const onUp = () => {
      canvas.style.cursor = interactive ? "grab" : "default";
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, interactive]);

  return (
    <>
      {interactive && (
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.35}
          enablePan={false}
          enableZoom={false}
          minDistance={3.5}
          maxDistance={8.5}
          rotateSpeed={0.45}
          target={[0, 0, 0]}
        />
      )}
      <group>
        <EarthSurface />
        <CloudLayer />
        <DayAtmosphere />
        <DayOrbitalArc />
      </group>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Static Auto-Rotating Earth (mobile / non-interactive)
   ═══════════════════════════════════════════════════════════ */

function StaticEarth() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.10;
      groupRef.current.rotation.x += delta * 0.018;
    }
  });

  return (
    <group ref={groupRef}>
      <EarthSurface />
      <CloudLayer />
      <DayAtmosphere />
      <DayOrbitalArc />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   Exported DayEarth Component
   ═══════════════════════════════════════════════════════════ */

interface DayEarthProps {
  interactive?: boolean;
}

export default function DayEarth({ interactive = true }: DayEarthProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.2], fov: 42 }}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      }}
      dpr={[1, 1.5]}
      performance={{ min: 0.5 }}
      frameloop="demand"
      style={{
        cursor: interactive ? "grab" : "default",
        pointerEvents: "auto",
      }}
    >
      {/* Key light — sun-like warm white from upper right */}
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.6}
        color="#FFFEF5"
      />
      {/* Fill light — soft sky blue from opposite side */}
      <directionalLight
        position={[-3, -1, -3]}
        intensity={0.55}
        color="#B8D8F0"
      />
      {/* Ambient — sky blue fill to prevent harsh shadows */}
      <ambientLight intensity={0.55} color="#D4E8F8" />

      <Suspense fallback={null}>
        {interactive ? (
          <EarthScene interactive />
        ) : (
          <StaticEarth />
        )}
      </Suspense>
    </Canvas>
  );
}
