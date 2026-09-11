"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { FlyBrain } from "@/lib/flybrain";

const vert = /* glsl */ `
  attribute vec3 aColor;
  attribute float aBright;
  uniform float uSize;
  uniform float uPr;
  varying vec3 vColor;
  varying float vB;
  void main() {
    vColor = aColor;
    vB = aBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPr * (0.6 + aBright * 1.6) * (110.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vB;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.1, d) * 0.85;
    // keep the neurotransmitter hue; only the very brightest spikes tip toward white
    vec3 base = mix(vColor, vec3(1.0), clamp(vB - 1.05, 0.0, 1.0) * 0.6);
    float inten = 0.34 + vB * 0.72;
    gl_FragColor = vec4(base * inten, a);
  }
`;

const NT_COLOR: Record<number, [number, number, number]> = {
  0: [0.353, 0.863, 1.0], // ACh — brain cyan
  1: [1.0, 0.353, 0.784], // GABA — brain magenta
  2: [1.0, 0.353, 0.784], // Glu — brain magenta
};
const EYE: [number, number, number] = [1.0, 0.8, 0.333]; // sensors — gold
const EYE_HOT: [number, number, number] = [1.0, 1.0, 1.0]; // driven — white-hot

export default function Brain3D({ brain }: { brain: FlyBrain }) {
  const groupRef = useRef<THREE.Group>(null);
  const pr = useThree((s) => s.gl.getPixelRatio());

  // ---- neuron point cloud ----
  const neuron = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(brain.positions, 3));
    const col = new Float32Array(brain.P * 3);
    for (let i = 0; i < brain.P; i++) {
      const c = NT_COLOR[brain.nt[i]];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aBright", new THREE.BufferAttribute(brain.bright, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 2.7 }, uPr: { value: pr } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    return new THREE.Points(g, m);
  }, [brain, pr]);

  // ---- synapse web ----
  const edges = useMemo(() => {
    const n = brain.nEdges;
    const pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3);
    const base = new Float32Array(n * 3); // per-edge nt color
    for (let k = 0; k < n; k++) {
      const a = brain.edgePairs[k * 2];
      const b = brain.edgePairs[k * 2 + 1];
      pos[k * 6] = brain.positions[a * 3];
      pos[k * 6 + 1] = brain.positions[a * 3 + 1];
      pos[k * 6 + 2] = brain.positions[a * 3 + 2];
      pos[k * 6 + 3] = brain.positions[b * 3];
      pos[k * 6 + 4] = brain.positions[b * 3 + 1];
      pos[k * 6 + 5] = brain.positions[b * 3 + 2];
      const c = NT_COLOR[brain.nt[brain.edgePre[k]]];
      base[k * 3] = c[0];
      base[k * 3 + 1] = c[1];
      base[k * 3 + 2] = c[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.6,
    });
    return { obj: new THREE.LineSegments(g, m), col, base };
  }, [brain]);

  // ---- compound eyes ----
  const eye = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(brain.eyePos, 3));
    const col = new Float32Array(brain.eyeN * 3);
    const bri = new Float32Array(brain.eyeN);
    for (let i = 0; i < brain.eyeN; i++) {
      col[i * 3] = EYE[0];
      col[i * 3 + 1] = EYE[1];
      col[i * 3 + 2] = EYE[2];
    }
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aBright", new THREE.BufferAttribute(bri, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 3.0 }, uPr: { value: pr } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    return { obj: new THREE.Points(g, m), col, bri };
  }, [brain, pr]);

  // ---- descending tract ----
  const tract = useMemo(() => {
    const ends = [
      [-1.4, -4.6, -0.6],
      [-0.5, -5.2, -0.6],
      [1.4, -4.6, -0.6],
      [0.5, -5.2, -0.6],
    ];
    const pos = new Float32Array(4 * 2 * 3);
    const col = new Float32Array(4 * 2 * 3);
    for (let i = 0; i < 4; i++) {
      pos[i * 6] = 0; pos[i * 6 + 1] = -1.6; pos[i * 6 + 2] = 0;
      pos[i * 6 + 3] = ends[i][0]; pos[i * 6 + 4] = ends[i][1]; pos[i * 6 + 5] = ends[i][2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { obj: new THREE.LineSegments(g, m), col };
  }, []);

  // ---- ambient dust ----
  const dust = useMemo(() => {
    const N = 450;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const bri = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 34;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
      col[i * 3] = 0.4; col[i * 3 + 1] = 0.45; col[i * 3 + 2] = 0.55;
      bri[i] = 0.05 + Math.random() * 0.08;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aBright", new THREE.BufferAttribute(bri, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 2.2 }, uPr: { value: pr } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(g, m);
  }, [pr]);

  useFrame((_, delta) => {
    const now = performance.now();
    brain.step(now);

    // neurons
    (neuron.geometry.attributes.aBright as THREE.BufferAttribute).needsUpdate = true;

    // edges
    const { col, base } = edges;
    const eg = brain.edgeGlow;
    for (let k = 0; k < brain.nEdges; k++) {
      const v = 0.012 + eg[k] * 1.2;
      const r = base[k * 3] * v,
        g = base[k * 3 + 1] * v,
        b = base[k * 3 + 2] * v;
      const o = k * 6;
      col[o] = r; col[o + 1] = g; col[o + 2] = b;
      col[o + 3] = r; col[o + 4] = g; col[o + 5] = b;
    }
    (edges.obj.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // eyes
    for (let i = 0; i < brain.eyeN; i++) {
      const d = brain.eyeDrive[i];
      const t = Math.min(1, d * 1.4);
      eye.col[i * 3] = EYE[0] + (EYE_HOT[0] - EYE[0]) * t;
      eye.col[i * 3 + 1] = EYE[1] + (EYE_HOT[1] - EYE[1]) * t;
      eye.col[i * 3 + 2] = EYE[2] + (EYE_HOT[2] - EYE[2]) * t;
      eye.bri[i] = 0.05 + d * 0.85;
    }
    (eye.obj.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (eye.obj.geometry.attributes.aBright as THREE.BufferAttribute).needsUpdate = true;

    // descending tract
    const tc = tract.col;
    for (let i = 0; i < 4; i++) {
      const glow = brain.dnFired[i] / 10;
      const isClick = i === 3;
      const r = isClick ? 1.0 : 0.353;
      const g = isClick ? 0.8 : 0.863;
      const b = isClick ? 0.333 : 1.0;
      const v = 0.04 + glow * 1.4;
      const o = i * 6;
      tc[o] = r * v; tc[o + 1] = g * v; tc[o + 2] = b * v;
      tc[o + 3] = r * v * 0.2; tc[o + 4] = g * v * 0.2; tc[o + 5] = b * v * 0.2;
    }
    (tract.obj.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // gentle breathing of the whole assembly
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
    // dust drift
    dust.rotation.y -= delta * 0.01;
  });

  return (
    <group ref={groupRef}>
      <primitive object={dust} />
      <primitive object={edges.obj} />
      <primitive object={neuron} />
      <primitive object={eye.obj} />
      <primitive object={tract.obj} />
    </group>
  );
}
