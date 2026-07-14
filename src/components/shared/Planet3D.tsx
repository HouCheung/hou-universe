"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

function RotatingPlanet() {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const planetGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1.3, 64, 64);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const noise = 1 + (Math.random() - 0.5) * 0.06;
      positions.setXYZ(i, (x / len) * noise, (y / len) * noise, (z / len) * noise);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
      groupRef.current.rotation.x += delta * 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main planet — smaller, more transparent */}
      <mesh ref={meshRef} geometry={planetGeometry}>
        <meshStandardMaterial
          color="#4a6cf7"
          emissive="#1a2a6c"
          emissiveIntensity={0.25}
          roughness={0.7}
          metalness={0.15}
          transparent
          opacity={0.5}
        />
      </mesh>
      {/* Atmosphere ring */}
      <Sphere args={[1.42, 48, 48]}>
        <meshBasicMaterial
          color="#6b8cff"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </Sphere>
      {/* Orbital ring 1 */}
      <mesh rotation={[Math.PI / 2.5, 0, 0]}>
        <torusGeometry args={[1.7, 0.012, 16, 100]} />
        <meshBasicMaterial color="#6b8cff" transparent opacity={0.2} />
      </mesh>
      {/* Orbital ring 2 */}
      <mesh rotation={[Math.PI / 3.5, Math.PI / 4, 0]}>
        <torusGeometry args={[1.9, 0.008, 16, 100]} />
        <meshBasicMaterial color="#8babff" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

export default function Planet3D() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-[3%] bottom-[8%] h-[320px] w-[320px] sm:h-[380px] sm:w-[380px] lg:h-[420px] lg:w-[420px]"
      style={{ zIndex: 0 }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 3, 5]} intensity={0.5} />
        <RotatingPlanet />
      </Canvas>
    </div>
  );
}
