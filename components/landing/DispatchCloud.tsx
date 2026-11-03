"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { easeInOut, mix, seededRandom, seg } from "@/lib/motion/scroll";
import { subscribeTheme } from "@/lib/theme";

export type CloudState = { progress: number; mx: number; my: number; still: boolean };

const COLS = 20;
const ROWS = 15;
const COUNT = COLS * ROWS;
const SLIP_W = 0.6;
const SLIP_H = 0.8;
const GAP_X = 0.84;
const GAP_Y = 1.06;
const SOURCED_RATIO = 0.075;

type Palette = { background: string; fog: string; paper: THREE.Color; dim: THREE.Color; accent: THREE.Color };

function cssColor(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: cssColor(styles, "--bone", "#221811"),
    fog: cssColor(styles, "--scene-fog", "#c9bba8"),
    paper: new THREE.Color(cssColor(styles, "--scene-paper", "#f3ebdf")),
    dim: new THREE.Color(cssColor(styles, "--scene-dim", "#ddd0be")),
    accent: new THREE.Color(cssColor(styles, "--scene-accent", "#e3ad86")),
  };
}

function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => subscribeTheme(() => setPalette(readPalette())), []);
  return palette;
}

type Slip = {
  chaos: THREE.Vector3;
  chaosRot: THREE.Euler;
  order: THREE.Vector3;
  delay: number;
  spin: number;
  phase: number;
  sourced: boolean;
};

function buildSlips(): Slip[] {
  const random = seededRandom(20260611);
  const slips: Slip[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const theta = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.6);
    slips.push({
      chaos: new THREE.Vector3(
        Math.cos(theta) * radius * 9.5,
        Math.sin(theta) * radius * 5.2 + (random() - 0.5) * 1.6,
        (random() - 0.62) * 9,
      ),
      chaosRot: new THREE.Euler((random() - 0.5) * 2.4, (random() - 0.5) * 2.8, (random() - 0.5) * 3.2),
      order: new THREE.Vector3((col - (COLS - 1) / 2) * GAP_X, ((ROWS - 1) / 2 - row) * GAP_Y, 0),
      delay: ((col * 0.6 + row) / (COLS * 0.6 + ROWS)) * 0.42 + random() * 0.06,
      spin: (random() - 0.5) * 0.5,
      phase: random() * Math.PI * 2,
      sourced: random() < SOURCED_RATIO,
    });
  }
  return slips;
}

function paperTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 120, 160);
    ctx.fillStyle = "#8c8c8c";
    ctx.fillRect(12, 14, 58, 7);
    ctx.fillStyle = "#c4c4c4";
    for (let line = 0; line < 9; line += 1) {
      const width = line === 8 ? 48 : 96 - ((line * 13) % 22);
      ctx.fillRect(12, 34 + line * 12, width, 4);
    }
    ctx.fillStyle = "#a3a3a3";
    ctx.fillRect(12, 146, 26, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Slips({ state, palette }: { state: RefObject<CloudState>; palette: Palette }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const slips = useMemo(() => buildSlips(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(SLIP_W, SLIP_H), []);
  const texture = useMemo(() => paperTexture(), []);
  const helper = useMemo(
    () => ({
      object: new THREE.Object3D(),
      color: new THREE.Color(),
      euler: new THREE.Euler(),
      quat: new THREE.Quaternion(),
      target: new THREE.Quaternion(),
    }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      texture.dispose();
    };
  }, [geometry, texture]);

  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    for (let i = 0; i < COUNT; i += 1) instanced.setColorAt(i, palette.paper);
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [palette]);

  useFrame(({ clock, camera }) => {
    const instanced = mesh.current;
    const root = group.current;
    const current = state.current;
    if (!instanced || !root || !current) return;

    const time = current.still ? 0 : clock.elapsedTime;
    const sort = current.still ? 1 : seg(current.progress, 0.4, 0.88);
    const { object, color, euler, quat, target } = helper;

    for (let i = 0; i < COUNT; i += 1) {
      const slip = slips[i];
      const t = easeInOut(seg(sort, slip.delay, slip.delay + 0.55));
      const loose = 1 - t;
      const drift = Math.sin(time * 0.35 + slip.phase) * 0.35 * loose;

      object.position.set(
        mix(slip.chaos.x + drift, slip.order.x, t),
        mix(slip.chaos.y + Math.cos(time * 0.3 + slip.phase) * 0.25 * loose, slip.order.y, t),
        mix(slip.chaos.z, slip.order.z, t),
      );
      euler.set(slip.chaosRot.x + time * slip.spin * 0.4, slip.chaosRot.y + time * slip.spin * 0.3, slip.chaosRot.z);
      target.setFromEuler(euler);
      quat.identity().slerp(target, loose);
      object.quaternion.copy(quat);
      object.scale.setScalar(mix(0.92, 1, t));
      object.updateMatrix();
      instanced.setMatrixAt(i, object.matrix);

      color.copy(palette.paper).lerp(slip.sourced ? palette.accent : palette.dim, t);
      instanced.setColorAt(i, color);
    }

    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;

    root.rotation.y = mix(root.rotation.y, current.mx * 0.14 * (1 - sort * 0.6), 0.06);
    root.rotation.x = mix(root.rotation.x, current.my * 0.08 * (1 - sort * 0.6), 0.06);
    camera.position.z = mix(17.5, 13.2, easeInOut(sort));
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[geometry, undefined, COUNT]} frustumCulled={false}>
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export default function DispatchCloud({ state, active }: { state: RefObject<CloudState>; active: boolean }) {
  const palette = usePalette();
  return (
    <Canvas
      className="dispatch-canvas"
      dpr={[1, 1.6]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 17.5], fov: 34, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      aria-hidden="true"
    >
      <color key={`bg-${palette.background}`} attach="background" args={[palette.background]} />
      <fog key={`fog-${palette.fog}`} attach="fog" args={[palette.fog, 14, 30]} />
      <Slips state={state} palette={palette} />
    </Canvas>
  );
}
