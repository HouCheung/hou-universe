"use client";

import { useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════
   GLSL — 3D Simplex-like noise for surface detail
   ═══════════════════════════════════════════════════════════ */

const NOISE_GLSL = /* glsl */ `
float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

float snoise(vec3 p) {
  vec3 a = floor(p);
  vec3 d = p - a;
  d = d * d * (3.0 - 2.0 * d);
  vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
  vec4 k1 = perm(b.xyxy);
  vec4 k2 = perm(k1.xyxy + b.zzww);
  vec4 c = k2 + a.zzzz;
  vec4 k3 = perm(c);
  vec4 k4 = perm(c + 1.0);
  vec4 o1 = fract(k3 * (1.0 / 41.0));
  vec4 o2 = fract(k4 * (1.0 / 41.0));
  vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
  vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);
  return o4.y * d.y + o4.x * (1.0 - d.y);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p * freq);
    freq *= 2.0;
    a *= 0.5;
  }
  return v;
}
`;

/* ═══════════════════════════════════════════════════════════
   Planet Surface — custom ShaderMaterial
   ═══════════════════════════════════════════════════════════ */

const PLANET_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const PLANET_FRAGMENT = /* glsl */ `
${NOISE_GLSL}

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);

  // ── Surface detail via FBM ──
  float detail = fbm(vWorldPos * 3.5);
  float microDetail = fbm(vWorldPos * 8.0) * 0.3;

  // ── Base color: deep desaturated slate-blue ──
  vec3 darkTone  = vec3(0.09, 0.14, 0.23);
  vec3 midTone   = vec3(0.16, 0.22, 0.34);
  vec3 lightTone = vec3(0.22, 0.28, 0.42);
  float t = detail * 0.5 + 0.5;
  vec3 base = mix(darkTone, midTone, smoothstep(0.3, 0.7, t));
  base = mix(base, lightTone, smoothstep(0.65, 0.85, t) * 0.35);
  base += microDetail * 0.04;

  // ── Subtle nebula-like warm/cool variation ──
  float nebula = fbm(vWorldPos * 2.2 + vec3(0.7, 0.3, 0.0));
  vec3 warmShift = vec3(0.04, 0.02, -0.02);
  vec3 coolShift = vec3(-0.02, 0.0, 0.04);
  base += mix(coolShift, warmShift, nebula * 0.5 + 0.5) * 0.25;

  // ── Lighting: single soft directional (upper-right) ──
  vec3 L = normalize(vec3(0.65, 0.55, 0.75));
  float NdotL = dot(N, L);
  // Wrapped diffuse — soft transition, no harsh terminator
  float wrapped = (NdotL + 0.35) / 1.35;
  wrapped = smoothstep(0.05, 0.95, wrapped);

  // ── Ambient occlusion approximation ──
  float ao = 0.7 + detail * 0.3;
  ao = clamp(ao, 0.55, 1.0);

  // ── Subsurface-ish scattering (thin atmosphere imitation) ──
  float sss = pow(1.0 - abs(NdotL), 4.0) * 0.06;

  // ── Fresnel rim (subtle edge glow) ──
  float fresnel = 1.0 - abs(dot(N, V));
  fresnel = pow(fresnel, 3.5);
  vec3 rimColor = vec3(0.25, 0.42, 0.65);

  // ── Assemble ──
  float ambient = 0.32;
  float diffuse = wrapped * 0.68;
  vec3 lit = base * (ambient + diffuse) * ao;
  lit += base * sss;
  lit += rimColor * fresnel * 0.13;

  // ── Very subtle darkening at grazing angles for depth ──
  lit *= 1.0 - fresnel * 0.18;

  gl_FragColor = vec4(lit, 1.0);
}
`;

/* ═══════════════════════════════════════════════════════════
   Planet Surface Mesh — low-poly for performance
   ═══════════════════════════════════════════════════════════ */

function PlanetSurface() {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  return (
    <mesh>
      {/* Low-poly sphere: 32 segments keeps surface detail via shader, not geometry */}
      <sphereGeometry args={[1.35, 32, 32]} />
      <shaderMaterial
        vertexShader={PLANET_VERTEX}
        fragmentShader={PLANET_FRAGMENT}
        uniforms={uniforms}
      />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════
   Lightweight Atmosphere — reduced layers & segments
   ═══════════════════════════════════════════════════════════ */

function Atmosphere() {
  return (
    <>
      {/* Single atmosphere shell — was 3 layers, now 1 for perf */}
      <mesh>
        <sphereGeometry args={[1.46, 24, 24]} />
        <meshBasicMaterial
          color="#3388cc"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Innermost sharp rim-light layer */}
      <mesh>
        <sphereGeometry args={[1.39, 24, 24]} />
        <meshBasicMaterial
          color="#5599dd"
          transparent
          opacity={0.10}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Orbital Rings — reduced segments
   ═══════════════════════════════════════════════════════════ */

function OrbitalRings() {
  return (
    <>
      {/* Primary ring */}
      <mesh rotation={[Math.PI / 2.4, 0.15, 0]}>
        <torusGeometry args={[1.82, 0.008, 8, 64]} />
        <meshBasicMaterial
          color="#7799bb"
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
      {/* Secondary ring — thinner, different angle */}
      <mesh rotation={[Math.PI / 3.2, -0.4, 0.2]}>
        <torusGeometry args={[2.02, 0.005, 8, 48]} />
        <meshBasicMaterial
          color="#8899cc"
          transparent
          opacity={0.07}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Star Particles
   ═══════════════════════════════════════════════════════════ */

function StarParticles() {
  const count = 80;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.2 + Math.random() * 1.2;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.014}
        color="#bbccee"
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ═══════════════════════════════════════════════════════════
   Interactive Planet Scene — with scroll-pause optimization
   ═══════════════════════════════════════════════════════════ */

function PlanetScene({ interactive }: { interactive: boolean }) {
  const { gl, invalidate } = useThree();
  const isScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Scroll-pause: stop rendering during scroll for smooth page ── */
  useEffect(() => {
    const onScroll = () => {
      isScrolling.current = true;
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => {
        isScrolling.current = false;
        invalidate(); // trigger a render once scroll stops
      }, 120);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [invalidate]);

  /* ── Keep rendering when not scrolling (for autoRotate/damping) ── */
  useFrame(() => {
    if (!isScrolling.current) {
      invalidate();
    }
  });

  /* ── Visibility & Page-focus: pause when hidden ── */
  useEffect(() => {
    const canvas = gl.domElement;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          isScrolling.current = true; // pause rendering when off-screen
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

  /* ── Cursor feedback: grab/grabbing ── */
  useEffect(() => {
    const canvas = gl.domElement;
    // Ensure canvas can receive pointer events
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
        <PlanetSurface />
        <Atmosphere />
        <OrbitalRings />
        <StarParticles />
      </group>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Static Auto-Rotating Planet (mobile / non-interactive)
   ═══════════════════════════════════════════════════════════ */

function StaticPlanet() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
      groupRef.current.rotation.x += delta * 0.018;
    }
  });

  return (
    <group ref={groupRef}>
      <PlanetSurface />
      <Atmosphere />
      <OrbitalRings />
      <StarParticles />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   Exported Planet3D Component
   ═══════════════════════════════════════════════════════════ */

interface Planet3DProps {
  interactive?: boolean;
}

export default function Planet3D({ interactive = true }: Planet3DProps) {
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
      {/* Key light */}
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.0}
        color="#ffffff"
      />
      {/* Fill */}
      <directionalLight
        position={[-3, -1, -3]}
        intensity={0.25}
        color="#8899cc"
      />
      {/* Ambient fill */}
      <ambientLight intensity={0.3} color="#334466" />

      <Suspense fallback={null}>
        {interactive ? (
          <PlanetScene interactive />
        ) : (
          <StaticPlanet />
        )}
      </Suspense>
    </Canvas>
  );
}
