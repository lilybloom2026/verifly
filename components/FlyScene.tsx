"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { FlyBrain } from "@/lib/flybrain";
import Brain3D from "./Brain3D";
import HeroOverlay from "./HeroOverlay";

export default function FlyScene() {
  const brain = useMemo(() => new FlyBrain(), []);

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 1.5, 17], fov: 48, near: 0.1, far: 120 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color("#050505"), 1);
        }}
      >
        <fog attach="fog" args={["#050505", 16, 40]} />
        <ambientLight intensity={0.2} />
        <Brain3D brain={brain} />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.06}
          autoRotate
          autoRotateSpeed={0.35}
          minPolarAngle={Math.PI * 0.18}
          maxPolarAngle={Math.PI * 0.82}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.8}
            luminanceThreshold={0.62}
            luminanceSmoothing={0.28}
            mipmapBlur
            radius={0.55}
          />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
      </Canvas>

      {/* soft radial wash behind the HUD for legibility, non-interactive */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 45%, transparent 45%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <HeroOverlay />
    </div>
  );
}
