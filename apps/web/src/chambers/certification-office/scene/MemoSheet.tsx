import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Group,
} from 'three';
import { TIMING } from '../../../timing.ts';
import { clamp01, smoothstep } from './anim.ts';
import { drawMemoFace, MEMO_PX_H, MEMO_PX_W } from './canvasArt.ts';
import { facingYaw, useFontsReady, useScene } from './context.ts';
import { MACHINE, ramp, RAMP } from './machineLayout.ts';
import { LAYOUT, PALETTE } from './palette.ts';
import { createCanvas, drawPoolGlow, drawRimGlow, makeTexture } from './textures.ts';

const MEMO_W = 0.21;
const MEMO_D = 0.17;
const HALF_D = MEMO_D / 2;
/** Crease: the middle row of the two-segment sheet sits proud of its edges. */
const CREASE_LIFT = 0.0035;
const SHEET_CLEARANCE = 0.0012;
const START_Z = MACHINE.faceZ - HALF_D - 0.004;

/** A folded sheet: two flat segments meeting at a crease, tent-shaped. Lies in XZ, head toward -z. */
function buildMemoGeometry(): BufferGeometry {
  const g = new PlaneGeometry(MEMO_W, MEMO_D, 1, 2);
  g.rotateX(-Math.PI / 2);
  const position = g.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getZ(i)) < 1e-6) position.setY(i, CREASE_LIFT);
  }
  g.computeVertexNormals();
  // Keep the UV set from PlaneGeometry; re-assert it after the vertex edit.
  const uv = g.getAttribute('uv');
  g.setAttribute('uv', new Float32BufferAttribute(uv.array as Float32Array, 2));
  return g;
}

/** Support height beneath the memo at machine-local depth z: the ramp, then a short fall to the desk. */
function support(z: number): number {
  if (z <= RAMP.z1) return ramp(z);
  return ramp(RAMP.z1) * (1 - smoothstep(RAMP.z1, RAMP.z1 + 0.035, z));
}

interface MemoSim {
  slideAt: number;
  landedAt: number;
  revealed: boolean;
  hover: number;
  hoverTarget: number;
}

/**
 * Memo 001. Hidden inside the machine until revealed, it slides out of the open hatch along the
 * hatch as a ramp, tips onto the desk and rests, with a soft paper landing. Once landed it can
 * be opened by clicking or tapping it; a warm rim hints at that without ever pulsing.
 */
export function MemoSheet() {
  const { store, director, materials, motion, cursor, view } = useScene();
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();
  const group = useRef<Group>(null);

  const memo = useMemo(() => {
    const geometry = buildMemoGeometry();
    const canvas = createCanvas(MEMO_PX_W, MEMO_PX_H);
    drawMemoFace(canvas, 0.5);
    const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
    // A trace of amber lifts the sheet as the desk's little pool of light settles under it.
    const material = new MeshStandardMaterial({
      map: texture,
      emissive: new Color(PALETTE.amber),
      emissiveMap: texture,
      emissiveIntensity: 0.07,
      roughness: 0.92,
      metalness: 0,
      side: DoubleSide,
    });
    const poolTexture = drawPoolGlow();
    const poolMaterial = new MeshBasicMaterial({
      map: poolTexture,
      color: new Color(1.0, 0.7, 0.38),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const pool = new PlaneGeometry(0.66, 0.66);
    pool.rotateX(-Math.PI / 2);
    const rimTexture = drawRimGlow();
    const rimMaterial = new MeshBasicMaterial({
      map: rimTexture,
      color: new Color(PALETTE.amber),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const rim = new PlaneGeometry(MEMO_W + 0.1, MEMO_D + 0.1);
    rim.rotateX(-Math.PI / 2);
    const hit = new PlaneGeometry(MEMO_W + 0.08, MEMO_D + 0.08);
    hit.rotateX(-Math.PI / 2);
    return { geometry, canvas, texture, material, poolTexture, poolMaterial, pool, rimTexture, rimMaterial, rim, hit };
  }, [materials.anisotropy]);

  useEffect(
    () => () => {
      memo.geometry.dispose();
      memo.texture.dispose();
      memo.material.dispose();
      memo.poolTexture.dispose();
      memo.poolMaterial.dispose();
      memo.pool.dispose();
      memo.rimTexture.dispose();
      memo.rimMaterial.dispose();
      memo.rim.dispose();
      memo.hit.dispose();
    },
    [memo],
  );

  useEffect(() => {
    if (!fontsReady) return;
    drawMemoFace(memo.canvas, 0.5);
    memo.texture.needsUpdate = true;
    invalidate();
  }, [fontsReady, memo, invalidate]);

  const sim = useRef<MemoSim>({
    slideAt: Number.POSITIVE_INFINITY,
    landedAt: Number.POSITIVE_INFINITY,
    revealed: false,
    hover: 0,
    hoverTarget: 0,
  });

  useEffect(() => {
    const revealed = store.getState().memo.revealed;
    sim.current = {
      slideAt: Number.NEGATIVE_INFINITY,
      landedAt: Number.NEGATIVE_INFINITY,
      revealed,
      hover: 0,
      hoverTarget: 0,
    };
    invalidate();
  }, [store, invalidate]);

  useEffect(
    () =>
      director.subscribe((event) => {
        const s = sim.current;
        if (event.type === 'memo-revealed') {
          s.revealed = true;
          s.slideAt = event.slideAt;
          s.landedAt = event.slideAt + (motion.reduced ? 0 : TIMING.memoSlideMs);
        } else if (event.type === 'reset') {
          s.revealed = false;
          s.slideAt = Number.POSITIVE_INFINITY;
          s.landedAt = Number.POSITIVE_INFINITY;
          s.hover = 0;
          s.hoverTarget = 0;
          cursor.hover('memo', false);
        }
      }),
    [director, cursor, motion],
  );

  useEffect(() => () => cursor.hover('memo', false), [cursor]);

  const isLanded = useCallback(() => sim.current.revealed && performance.now() >= sim.current.landedAt, []);

  const onOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isLanded()) return;
      e.stopPropagation();
      sim.current.hoverTarget = 1;
      cursor.hover('memo', true);
      invalidate();
    },
    [cursor, invalidate, isLanded],
  );
  const onOut = useCallback(() => {
    sim.current.hoverTarget = 0;
    cursor.hover('memo', false);
    invalidate();
  }, [cursor, invalidate]);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!isLanded()) return;
      e.stopPropagation();
      store.dispatch({ type: 'OPEN_MEMO' });
    },
    [store, isLanded],
  );

  const travel = MACHINE.memoRest.z - START_Z;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const s = sim.current;
    const now = performance.now();
    let active = false;
    // The label faces the viewer, whichever side the picture is framed from, with a little toss.
    const yawFinal = facingYaw(view) - LAYOUT.machine.yaw + MACHINE.memoRest.yaw * 0.35;

    if (!s.revealed) {
      g.visible = false;
    } else {
      g.visible = now >= s.slideAt;
      const t = motion.reduced ? Number(now >= s.slideAt) : clamp01((now - s.slideAt) / TIMING.memoSlideMs);
      if (now < s.slideAt) {
        active = true;
      } else if (!motion.reduced && (t < 1 || now < s.landedAt + 220)) {
        active = true;
        // Fast out of the slot, decelerating as the paper loses speed to friction.
        const e = 1 - Math.pow(1 - t, 2.3);
        const zc = START_Z + travel * e;
        const hLead = support(zc + HALF_D) + SHEET_CLEARANCE;
        const hTail = support(zc - HALF_D) + SHEET_CLEARANCE;
        const pitch = Math.atan2(hTail - hLead, MEMO_D);
        // A soft landing: a hair of settle after the sheet stops.
        const after = Math.max(0, now - s.landedAt) / 1000;
        const settle = motion.reduced ? 0 : 0.014 * Math.exp(-after / 0.05) * Math.sin(after * 2 * Math.PI * 10);
        g.position.set(MACHINE.memoRest.x * smoothstep(0.35, 1, t), (hLead + hTail) / 2, zc);
        g.rotation.set(pitch + settle, yawFinal * smoothstep(0.5, 1, t), 0, 'YXZ');
      } else {
        g.position.set(MACHINE.memoRest.x, SHEET_CLEARANCE, MACHINE.memoRest.z);
        g.rotation.set(0, yawFinal, 0, 'YXZ');
      }
    }

    // Hover rim eases in and out; it never pulses.
    const k = 1 - Math.exp(-delta / 0.11);
    if (Math.abs(s.hover - s.hoverTarget) > 0.002) {
      s.hover += (s.hoverTarget - s.hover) * k;
      active = true;
    } else {
      s.hover = s.hoverTarget;
    }
    memo.rimMaterial.opacity = s.hover * 0.55;

    // A soft warm pool settles under the memo once it lands: the next thing to touch.
    const pool = s.revealed ? motion.reduced ? Number(now >= s.slideAt) : smoothstep(s.landedAt - 150, s.landedAt + 700, now) : 0;
    memo.poolMaterial.opacity = pool * 0.55;
    if (s.revealed && pool < 1) active = true;

    if (active) state.invalidate();
  });

  return (
    <>
      <mesh
        geometry={memo.pool}
        material={memo.poolMaterial}
        position={[MACHINE.memoRest.x, 0.0009, MACHINE.memoRest.z]}
        renderOrder={1}
      />
    <group ref={group} visible={false} position={[MACHINE.memoRest.x, SHEET_CLEARANCE, MACHINE.memoRest.z]}>
      <mesh
        geometry={memo.rim}
        material={memo.rimMaterial}
        position={[0, -0.0008, 0]}
        renderOrder={2}
      />
      <mesh geometry={memo.geometry} material={memo.material} castShadow receiveShadow />
      <mesh
        geometry={memo.hit}
        position={[0, 0.002, 0]}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
    </>
  );
}
