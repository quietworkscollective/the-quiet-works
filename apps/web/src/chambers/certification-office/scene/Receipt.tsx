import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  PlaneGeometry,
  type Group,
  type Mesh,
} from 'three';
import { ESCALATION } from '@tqw/engine';
import { TIMING } from '../../../timing.ts';
import { clamp01, easeInCubic, easeInOutCubic, easeOutQuad, smoothstep } from './anim.ts';
import { drawReceipt, RECEIPT_PX } from './canvasArt.ts';
import { facingYaw, useFontsReady, useScene } from './context.ts';
import { SPILL_STEPS } from './beatMotion.ts';
import { OVERLOAD_SCRIPT } from './director.ts';
import { MACHINE } from './machineLayout.ts';
import { createCanvas, makeTexture } from './textures.ts';

/* ------------------------------------------------------------------------------------------ */
/* The receipt that feeds out of the slot                                                     */
/* ------------------------------------------------------------------------------------------ */

/** How far a full receipt hangs out of the slot, along its length. */
const FED = 0.12;
const STRIP_LENGTH = 0.16;
const STRIP_WIDTH = 0.16;
const STATIONS = 16;
/** Seven printer steps in the 7/8 groove: 2 + 2 + 3, group starts weighted heavier. */
const JERK_WEIGHTS = [1.5, 0.8, 1.5, 0.8, 1.5, 0.8, 0.8] as const;
const JERK_TOTAL = JERK_WEIGHTS.reduce((a, b) => a + b, 0);
const JERK_MS = 38;
const RETRACT_MS = 150;

/** The droop curve the strip follows out of the slot: tangent angle below horizontal vs distance. */
const PATH_STEP = 0.002;
const PATH_MAX = 0.24;
const PATH = (() => {
  const n = Math.round(PATH_MAX / PATH_STEP) + 1;
  const z = new Float32Array(n);
  const y = new Float32Array(n);
  const phi = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const d = i * PATH_STEP;
    phi[i] = ((80 * Math.PI) / 180) * (1 - Math.exp(-((d / 0.066) ** 2)));
    if (i > 0) {
      const mid = ((phi[i - 1] ?? 0) + (phi[i] ?? 0)) / 2;
      z[i] = (z[i - 1] ?? 0) + Math.cos(mid) * PATH_STEP;
      y[i] = (y[i - 1] ?? 0) - Math.sin(mid) * PATH_STEP;
    }
  }
  return { z, y, phi };
})();

const sample = { z: 0, y: 0, phi: 0 };
function lerpAt(values: Float32Array, i: number, t: number): number {
  const a = values[i] ?? 0;
  const b = values[i + 1] ?? a;
  return a + (b - a) * t;
}
function samplePath(d: number): void {
  const f = Math.min(PATH_MAX - PATH_STEP, Math.max(0, d)) / PATH_STEP;
  const i = Math.floor(f);
  const t = f - i;
  sample.z = lerpAt(PATH.z, i, t);
  sample.y = lerpAt(PATH.y, i, t);
  sample.phi = lerpAt(PATH.phi, i, t);
}

function feedProfile(dt: number): number {
  let sum = 0;
  const eighth = TIMING.printMs / 8;
  for (let j = 0; j < JERK_WEIGHTS.length; j += 1) {
    const w = JERK_WEIGHTS[j] ?? 0;
    const local = (dt - j * eighth) / JERK_MS;
    if (local <= 0) break;
    sum += w * easeOutQuad(clamp01(local));
  }
  return (FED * sum) / JERK_TOTAL;
}

interface RecSim {
  step: number;
  text: string;
  hasReceipt: boolean;
  restFed: number;
  plan: { printAt: number; step: number; text: string; drawn: boolean } | null;
  retractAt: number;
  lastFed: number;
}

function buildStrip(): BufferGeometry {
  const g = new BufferGeometry();
  const count = (STATIONS + 1) * 2;
  g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  const index: number[] = [];
  for (let i = 0; i <= STATIONS; i += 1) {
    // Station 0 is the free tip, which hangs lowest: canvas bottom, so the text reads upright.
    const v = i / STATIONS;
    uv.set([0, v, 1, v], i * 4);
    if (i < STATIONS) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

function poseStrip(geometry: BufferGeometry, fed: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  const x0 = MACHINE.slot.x;
  const half = STRIP_WIDTH / 2;
  for (let i = 0; i <= STATIONS; i += 1) {
    const s = (i / STATIONS) * STRIP_LENGTH;
    const d = fed - s;
    let z: number;
    let y: number;
    let phi: number;
    if (d >= 0) {
      samplePath(d);
      z = MACHINE.faceZ + sample.z;
      y = MACHINE.slot.y + sample.y;
      phi = sample.phi;
    } else {
      // Still inside the machine: straight back along the feed path.
      z = MACHINE.faceZ + d;
      y = MACHINE.slot.y;
      phi = 0;
    }
    const ny = Math.cos(phi);
    const nz = Math.sin(phi);
    position.setXYZ(i * 2, x0 - half, y, z);
    position.setXYZ(i * 2 + 1, x0 + half, y, z);
    normal.setXYZ(i * 2, 0, ny, nz);
    normal.setXYZ(i * 2 + 1, 0, ny, nz);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}

/** The current receipt: retracts instantly on each reply, then prints out in seven steps. */
export function Receipt() {
  const { store, director, materials, motion } = useScene();
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();
  const mesh = useRef<Mesh>(null);

  const strip = useMemo(() => {
    const geometry = buildStrip();
    const canvas = createCanvas(RECEIPT_PX, RECEIPT_PX);
    drawReceipt(canvas, 0, '');
    const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
    // A little of the display's amber spills onto the paper, so it reads in the machine's shade.
    const material = new MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
      side: DoubleSide,
      emissive: new Color('#e8d8bb'),
      emissiveMap: texture,
      emissiveIntensity: 0.2,
    });
    return { geometry, canvas, texture, material };
  }, [materials.anisotropy]);

  useEffect(
    () => () => {
      strip.geometry.dispose();
      strip.texture.dispose();
      strip.material.dispose();
    },
    [strip],
  );

  const sim = useRef<RecSim>({
    step: 0,
    text: '',
    hasReceipt: false,
    restFed: 0,
    plan: null,
    retractAt: Number.POSITIVE_INFINITY,
    lastFed: -1,
  });

  useEffect(() => {
    const state = store.getState();
    const s = sim.current;
    // A receipt is hanging only if nothing has opened the hatch since it printed.
    s.hasReceipt = state.receipt !== null && !state.memo.revealed;
    s.step = state.stamps;
    s.text = state.receipt ?? '';
    s.restFed = s.hasReceipt ? FED : 0;
    s.plan = null;
    s.retractAt = Number.POSITIVE_INFINITY;
    s.lastFed = -1;
    if (s.hasReceipt) {
      drawReceipt(strip.canvas, s.step, s.text);
      strip.texture.needsUpdate = true;
    }
    invalidate();
  }, [store, strip, invalidate]);

  useEffect(() => {
    if (!fontsReady) return;
    const s = sim.current;
    drawReceipt(strip.canvas, s.step, s.text);
    strip.texture.needsUpdate = true;
    invalidate();
  }, [fontsReady, strip, invalidate]);

  useEffect(
    () =>
      director.subscribe((event) => {
        const s = sim.current;
        switch (event.type) {
          case 'reply':
            s.plan = { printAt: event.printAt, step: event.step, text: event.line.receipt, drawn: false };
            s.retractAt = Number.POSITIVE_INFINITY;
            break;
          case 'overload':
            // The machine gulps the hanging receipt back just before the hatch lets go.
            s.retractAt = event.at + OVERLOAD_SCRIPT.unlatchAt - 250;
            break;
          case 'memo-revealed':
            if (event.source === 'stillness') s.retractAt = event.hatchAt;
            break;
          case 'reset':
            s.plan = null;
            s.hasReceipt = false;
            s.restFed = 0;
            s.retractAt = Number.POSITIVE_INFINITY;
            s.lastFed = -1;
            break;
          default:
            break;
        }
      }),
    [director],
  );

  useFrame((state) => {
    const s = sim.current;
    const now = performance.now();
    const reduced = motion.reduced;
    let fed = s.restFed;
    let active = false;

    if (s.plan) {
      active = true;
      if (now >= s.plan.printAt) {
        if (!s.plan.drawn) {
          s.plan.drawn = true;
          s.step = s.plan.step;
          s.text = s.plan.text;
          s.hasReceipt = true;
          drawReceipt(strip.canvas, s.step, s.text);
          strip.texture.needsUpdate = true;
        }
        const dt = now - s.plan.printAt;
        fed = reduced ? FED : feedProfile(dt);
        if (reduced || dt >= TIMING.printMs) {
          s.restFed = FED;
          fed = FED;
          s.plan = null;
        }
      }
    }
    if (!s.plan) {
      if (!s.hasReceipt) {
        fed = 0;
      } else if (now >= s.retractAt) {
        const t = reduced ? 1 : clamp01((now - s.retractAt) / RETRACT_MS);
        fed = FED * (1 - easeInCubic(t));
        active = true;
        if (t >= 1) {
          s.hasReceipt = false;
          s.restFed = 0;
          s.retractAt = Number.POSITIVE_INFINITY;
          fed = 0;
        }
      } else if (Number.isFinite(s.retractAt)) {
        active = true;
      }
    }

    if (Math.abs(fed - s.lastFed) > 1e-5) {
      poseStrip(strip.geometry, fed);
      s.lastFed = fed;
    }
    const m = mesh.current;
    if (m) m.visible = fed > 0.0008;
    if (active) state.invalidate();
  });

  return (
    <mesh
      ref={mesh}
      geometry={strip.geometry}
      material={strip.material}
      frustumCulled={false}
      castShadow
      receiveShadow
      visible={false}
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The three extra receipts the overload spills                                                */
/* ------------------------------------------------------------------------------------------ */

interface Landing {
  x: number;
  z: number;
  yaw: number;
  /** Sway phase and direction of the half-turn. */
  phase: number;
  spin: 1 | -1;
}

/** Where each sheet ends up, machine-local: on the desk ahead of the hatch, clear of the memo. */
const LANDINGS: readonly Landing[] = [
  { x: -0.27, z: 0.5, yaw: -0.35, phase: 0.4, spin: 1 },
  { x: -0.15, z: 0.57, yaw: 0.25, phase: 2.1, spin: -1 },
  { x: -0.05, z: 0.48, yaw: -0.12, phase: 4.0, spin: 1 },
];
/** The landscape framing looks nearly straight down -z; the landings are authored for it. */
const LANDSCAPE_FACING = Math.atan2(-0.04, 0.999);
const SPILL_START_STAGGER = 140;
const SPILL_MS = 980;
const EXIT_FRACTION = 0.2;
const SLOT_Y = MACHINE.slot.y - 0.003;

interface SpillSim {
  startAt: number;
  /** All sheets already landed (reduced motion, or restored state). */
  landed: boolean;
  shown: boolean;
}

export function SpillReceipts() {
  const { store, director, materials, motion, view } = useScene();
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();
  const groups = useRef<Array<Group | null>>([]);

  const sheets = useMemo(() => {
    const geometry = new PlaneGeometry(STRIP_WIDTH, STRIP_LENGTH);
    // Lie flat with the printed head toward -z (readable from the camera once landed).
    geometry.rotateX(-Math.PI / 2);
    const items = SPILL_STEPS.map((step) => {
      const canvas = createCanvas(RECEIPT_PX, RECEIPT_PX);
      const text = ESCALATION[step - 1]?.receipt ?? '';
      drawReceipt(canvas, step, text);
      const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
      const material = new MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0, side: DoubleSide });
      return { step, text, canvas, texture, material };
    });
    return { geometry, items };
  }, [materials.anisotropy]);

  useEffect(
    () => () => {
      sheets.geometry.dispose();
      for (const item of sheets.items) {
        item.texture.dispose();
        item.material.dispose();
      }
    },
    [sheets],
  );

  useEffect(() => {
    if (!fontsReady) return;
    for (const item of sheets.items) {
      drawReceipt(item.canvas, item.step, item.text);
      item.texture.needsUpdate = true;
    }
    invalidate();
  }, [fontsReady, sheets, invalidate]);

  const sim = useRef<SpillSim>({ startAt: Number.POSITIVE_INFINITY, landed: false, shown: false });

  useEffect(() => {
    const landed = store.getState().phase === 'overloaded';
    sim.current = { startAt: Number.NEGATIVE_INFINITY, landed, shown: landed };
    invalidate();
  }, [store, invalidate]);

  useEffect(
    () =>
      director.subscribe((event) => {
        const s = sim.current;
        if (event.type === 'overload') {
          s.startAt = event.at + OVERLOAD_SCRIPT.receiptsAt;
          s.landed = false;
          s.shown = true;
        } else if (event.type === 'reset') {
          s.startAt = Number.POSITIVE_INFINITY;
          s.landed = false;
          s.shown = false;
        }
      }),
    [director],
  );

  useFrame((state) => {
    const s = sim.current;
    const now = performance.now();
    const reduced = motion.reduced;
    let active = false;
    // Sheets land upright to the camera, whichever side the picture is framed from.
    const turn = facingYaw(view) - LANDSCAPE_FACING;
    for (let i = 0; i < LANDINGS.length; i += 1) {
      const group = groups.current[i];
      const land = LANDINGS[i];
      if (!group || !land) continue;
      const begin = s.startAt + i * (reduced ? 100 : SPILL_START_STAGGER);
      const dur = SPILL_MS + i * 60;
      const landY = 0.0014 + i * 0.0007;
      if (!s.shown) {
        group.visible = false;
        continue;
      }
      if (s.landed || now >= (reduced ? begin : begin + dur)) {
        group.visible = true;
        group.position.set(land.x, landY, land.z);
        group.rotation.set(0, land.yaw + turn, 0);
        continue;
      }
      active = true;
      if (now < begin) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      const u = (now - begin) / dur;
      if (u < EXIT_FRACTION) {
        // Out of the slot, tip first, flat.
        const e = easeOutQuad(u / EXIT_FRACTION);
        group.position.set(MACHINE.slot.x + land.x * 0.1 * e, SLOT_Y, MACHINE.faceZ - 0.07 + 0.16 * e);
        group.rotation.set(0, Math.PI, 0);
        continue;
      }
      // Fall with drag: slow, swaying, tilting; settles flat with a cushioned landing.
      const w = (u - EXIT_FRACTION) / (1 - EXIT_FRACTION);
      const fall = 1 - Math.pow(1 - w, 1.7);
      const sway = (1 - w) ** 0.7;
      const slide = easeInOutCubic(w);
      const x0 = MACHINE.slot.x + land.x * 0.1;
      const z0 = MACHINE.faceZ + 0.09;
      const x = x0 + (land.x - x0) * slide + Math.sin(w * 9.4 + land.phase) * 0.03 * sway;
      const z = z0 + (land.z - z0) * slide + Math.sin(w * 7.1 + land.phase * 1.7) * 0.02 * sway;
      const y = SLOT_Y + (landY - SLOT_Y) * fall;
      const tilt = (1 - w) ** 1.2;
      const roll = Math.sin(w * 8.6 + land.phase) * 0.62 * tilt;
      const pitch = Math.sin(w * 7.3 + land.phase * 0.7) * 0.5 * tilt;
      const spun = smoothstep(0, 0.9, w);
      const yaw = Math.PI + (land.yaw + turn + (land.spin === 1 ? Math.PI * 2 : 0) - Math.PI) * spun;
      group.position.set(x, y, z);
      group.rotation.set(pitch, yaw, roll, 'YXZ');
    }
    if (active) state.invalidate();
  });

  return (
    <group>
      {sheets.items.map((item, i) => (
        <group
          key={item.step}
          ref={(g) => {
            groups.current[i] = g;
          }}
          visible={false}
        >
          <mesh geometry={sheets.geometry} material={item.material} receiveShadow />
        </group>
      ))}
    </group>
  );
}
