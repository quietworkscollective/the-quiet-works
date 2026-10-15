import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Group,
} from 'three';
import { INITIAL_DISPLAY } from '@tqw/engine';
import { TIMING } from '../../../timing.ts';
import {
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  HEAVY_FALL_BOUNCE,
  lerp,
  smoothstep,
} from './anim.ts';
import {
  drawDisplay,
  drawHatchInterior,
  drawNameplate,
  DISPLAY_H,
  DISPLAY_W,
  HATCH_H,
  HATCH_W,
  NAMEPLATE_H,
  NAMEPLATE_W,
} from './canvasArt.ts';
import { useFontsReady, useScene } from './context.ts';
import { OVERLOAD_SCRIPT, OVERLOAD_LIGHT_RISE_MS, QUIET_HATCH_MS } from './director.ts';
import {
  boxAt,
  createBellGeometry,
  cylinderAlong,
  cylinderAt,
  merge,
  RoundedBoxGeometry,
  roundedBoxAt,
  sphereAt,
} from './geometry.ts';
import { overloadHatchAngle } from './hatchMotion.ts';
import { useHeroModel } from './HeroModel.tsx';
import { MACHINE } from './machineLayout.ts';
import { MemoSheet } from './MemoSheet.tsx';
import { LAYOUT, PALETTE } from './palette.ts';
import { Receipt, SpillReceipts } from './Receipt.tsx';
import { createCanvas, makeTexture } from './textures.ts';

const OPEN = MACHINE.hatch.openRad;
const FACE = MACHINE.faceZ;
const AMBER = new Color(PALETTE.amber);

/** Dim brightness the display settles at after the overload. */
const OVERLOADED_BRIGHTNESS = 0.54;
/** The display is bright, but never brighter than the stamp's grip: ruling 1 keeps the eye path handle-first. */
const DISPLAY_BRIGHTNESS = 0.88;
const PROCESSING_LAYOUT = 'PROCESSING...';
const PROCESSING_BASE = 'PROCESSING'.length;
const DOT_MS = 150;
/** The cavity is never pure black once the hatch is open: the dark has a little depth in it. */
const INTERIOR_DARK = 0.07;

/** Display flickers after the printer finishes: [start, end] of each dark gap, ms after overload. */
const FLICKER_GAPS: ReadonlyArray<readonly [number, number]> = [
  [40, 95],
  [170, 207],
  [300, 362],
];

type DisplayPlan =
  | {
      kind: 'reply';
      printAt: number;
      printEnd: number;
      text: string;
      prevText: string;
      overloadAt: number | null;
    }
  | { kind: 'fade'; at: number; text: string };

type HatchPlan =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'overload'; startAt: number }
  | { kind: 'quiet'; startAt: number }
  | { kind: 'reduced'; startAt: number };

interface Sim {
  text: string;
  overloaded: boolean;
  overloadAt: number;
  plan: DisplayPlan | null;
  hatch: HatchPlan;
  /** Interior light fade: start time and duration; null means "at rest" (level held). */
  lightStart: number;
  lightDur: number;
  lightLevel: number;
  drawnText: string;
  drawnLayout: string;
  drawnVis: number;
}

/** What the display should show this instant. Written into `out`, no allocation. */
interface DisplayOut {
  text: string;
  layout: string;
  vis: number;
  bright: number;
}

function evalDisplay(sim: Sim, now: number, reduced: boolean, out: DisplayOut): boolean {
  const rest = sim.overloaded ? OVERLOADED_BRIGHTNESS : DISPLAY_BRIGHTNESS;
  const plan = sim.plan;
  out.vis = -1;
  out.bright = rest;
  out.text = sim.text;
  out.layout = sim.text;
  if (!plan) return false;

  if (plan.kind === 'fade') {
    const t = clamp01((now - plan.at) / 1400);
    out.text = plan.text;
    out.layout = plan.text;
    out.bright = reduced ? rest : lerp(0.12, rest, easeOutCubic(t));
    if (t >= 1) {
      sim.text = plan.text;
      sim.plan = null;
      return false;
    }
    return true;
  }

  const { printAt, printEnd, overloadAt } = plan;
  if (now < printAt) {
    out.text = plan.prevText;
    out.layout = plan.prevText;
    return true;
  }
  if (reduced) {
    // No dots, no flicker: the new line simply replaces the old.
    out.text = plan.text;
    out.layout = plan.text;
    sim.text = plan.text;
    sim.plan = null;
    return false;
  }
  if (now < printEnd) {
    const dots = Math.floor((now - printAt) / DOT_MS) % 4;
    out.text = PROCESSING_LAYOUT;
    out.layout = PROCESSING_LAYOUT;
    out.vis = PROCESSING_BASE + dots;
    return true;
  }
  if (overloadAt === null) {
    out.text = plan.text;
    out.layout = plan.text;
    sim.text = plan.text;
    sim.plan = null;
    return false;
  }

  // The overload: three irregular flickers, then the line, then dimmer for good.
  const dt = now - overloadAt;
  if (dt < OVERLOAD_SCRIPT.stutterEnd) {
    out.text = PROCESSING_LAYOUT;
    out.layout = PROCESSING_LAYOUT;
    out.vis = PROCESSING_BASE + 3;
    for (const [from, to] of FLICKER_GAPS) {
      if (dt >= from && dt < to) out.bright = 0.03;
    }
    return true;
  }
  out.text = plan.text;
  out.layout = plan.text;
  const settle = smoothstep(OVERLOAD_SCRIPT.stutterEnd, OVERLOAD_SCRIPT.stutterEnd + 800, dt);
  out.bright = lerp(DISPLAY_BRIGHTNESS, OVERLOADED_BRIGHTNESS, settle);
  if (settle >= 1) {
    sim.text = plan.text;
    sim.plan = null;
    return false;
  }
  return true;
}

function hatchAngle(plan: HatchPlan, now: number): number {
  switch (plan.kind) {
    case 'closed':
      return 0;
    case 'open':
      return OPEN;
    case 'overload':
      return overloadHatchAngle(now - plan.startAt);
    case 'quiet':
      return OPEN * easeInOutCubic(clamp01((now - plan.startAt) / QUIET_HATCH_MS));
    case 'reduced':
      return OPEN * easeOutCubic(clamp01((now - plan.startAt) / 400));
  }
}

function hatchSettled(plan: HatchPlan, now: number): boolean {
  switch (plan.kind) {
    case 'closed':
    case 'open':
      return true;
    case 'overload':
      return (
        now >=
        plan.startAt +
          TIMING.overloadLatchLeadMs +
          HEAVY_FALL_BOUNCE * (TIMING.overloadLatchLeadMs - OVERLOAD_SCRIPT.hangMs) +
          40
      );
    case 'quiet':
      return now >= plan.startAt + QUIET_HATCH_MS;
    case 'reduced':
      return now >= plan.startAt + 400;
  }
}

/** The Certification machine: body, amber display, indicator lamps, bell, hatch and cavity. */
export function Machine() {
  const { store, director, materials, motion } = useScene();
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();

  const hero = useHeroModel('machine');
  const hatchGroup = useRef<Group>(null);
  const rearLink = useRef<Group>(null);

  const parts = useMemo(() => {
    const body = new RoundedBoxGeometry(MACHINE.width, MACHINE.height, MACHINE.depth, 5, 0.03);
    body.translate(0, MACHINE.bodyBottom + MACHINE.height / 2, 0);
    // The broad top is the brightest thing the sky can reach: shade it half a stop down so the
    // eye goes to the stamp first.
    const normals = body.getAttribute('normal');
    const shade = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i += 1) {
      const k = 1 - 0.17 * smoothstep(0.4, 0.95, normals.getY(i));
      shade.set([k, k, k], i * 3);
    }
    body.setAttribute('color', new BufferAttribute(shade, 3));

    const footParts = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => cylinderAt(0.026, 0.028, 0.015, sx * 0.29, 0.0075, sz * 0.13, 16)),
    );

    // Raised frames make the display and the hatch read as recessed into the face.
    const d = MACHINE.display;
    const fz = FACE + 0.006;
    const dBar = 0.02;
    const h = MACHINE.hatch;
    const hBar = 0.012;
    const frames = merge([
      roundedBoxAt(d.frameW, dBar, 0.012, 0.003, 0, d.y + d.openH / 2 + dBar / 2, fz, 2),
      roundedBoxAt(d.frameW, dBar, 0.012, 0.003, 0, d.y - d.openH / 2 - dBar / 2, fz, 2),
      roundedBoxAt(dBar, d.frameH, 0.012, 0.003, -(d.openW / 2 + dBar / 2), d.y, fz, 2),
      roundedBoxAt(dBar, d.frameH, 0.012, 0.003, d.openW / 2 + dBar / 2, d.y, fz, 2),
      // Hatch surround.
      roundedBoxAt(h.w + 2 * hBar, hBar, 0.012, 0.0025, 0, h.hingeY + h.h + hBar / 2, fz, 2),
      roundedBoxAt(h.w + 2 * hBar, hBar, 0.012, 0.0025, 0, h.hingeY - hBar / 2, fz, 2),
      roundedBoxAt(hBar, h.h + 2 * hBar, 0.012, 0.0025, -(h.w / 2 + hBar / 2), h.hingeY + h.h / 2, fz, 2),
      roundedBoxAt(hBar, h.h + 2 * hBar, 0.012, 0.0025, h.w / 2 + hBar / 2, h.hingeY + h.h / 2, fz, 2),
    ]);

    const s = MACHINE.slot;
    const dark = merge([
      boxAt(d.openW, d.openH, 0.003, 0, d.y, FACE + 0.0015),
      boxAt(s.w, s.h, 0.002, s.x, s.y, FACE + 0.001),
      ...MACHINE.lamps.xs.map((x) => cylinderAlong('z', 0.0095, 0.0095, 0.003, x, MACHINE.lamps.y, FACE + 0.0015, 14)),
    ]);

    const brass = merge([
      cylinderAlong('x', 0.0045, 0.0045, h.w - 0.02, 0, h.hingeY, h.hingeZ, 12),
      cylinderAt(0.054, 0.056, 0.006, MACHINE.bell.x, MACHINE.bodyTop + 0.003, MACHINE.bell.z, 32),
      boxAt(s.w + 0.02, 0.003, 0.008, s.x, s.y - s.h / 2 - 0.0015, FACE + 0.004),
      // Rivets along the frames: a little hand-made honesty on a flat face.
      ...[-0.335, 0.335].flatMap((x) =>
        [d.y + 0.064, d.y - 0.064, h.hingeY + 0.01, h.hingeY + h.h - 0.01].map((y) =>
          sphereAt(0.0045, x, y, FACE + 0.002, 8),
        ),
      ),
    ]);

    const bell = merge([
      createBellGeometry(),
      cylinderAt(0.0035, 0.0035, 0.016, 0, 0.0545, 0, 10),
      sphereAt(0.0072, 0, 0.064, 0, 14),
    ]);

    const hatchPanel = new RoundedBoxGeometry(h.w, h.h, h.thickness, 3, 0.003);
    hatchPanel.translate(0, h.h / 2, 0);
    const pull = merge([
      roundedBoxAt(0.07, 0.011, 0.011, 0.003, 0, h.h - 0.028, h.thickness / 2 + 0.008, 2),
      boxAt(0.006, 0.011, 0.01, -0.028, h.h - 0.028, h.thickness / 2 + 0.003),
      boxAt(0.006, 0.011, 0.01, 0.028, h.h - 0.028, h.thickness / 2 + 0.003),
    ]);

    const displayPlane = new PlaneGeometry(MACHINE.display.planeW, MACHINE.display.planeH);
    const interiorPlane = new PlaneGeometry(h.w, h.h);
    const namePlane = new PlaneGeometry(0.3, 0.3 * (NAMEPLATE_H / NAMEPLATE_W));
    const lamp = new SphereGeometry(MACHINE.lamps.radius, 14, 10);

    // A cable from the back, so the machine is plugged into something.
    const cable = new TubeGeometry(
      new CatmullRomCurve3(
        [
          new Vector3(0.22, 0.14, -MACHINE.depth / 2 + 0.005),
          new Vector3(0.24, 0.06, -0.25),
          new Vector3(0.18, 0.006, -0.32),
          new Vector3(0.1, 0.006, -0.42),
          new Vector3(0.18, 0.006, -0.55),
        ],
        false,
        'centripetal',
      ),
      40,
      0.0045,
      8,
      false,
    );

    const rubber = merge([...footParts, cable]);

    return {
      body,
      rubber,
      frames,
      dark,
      brass,
      bell,
      hatchPanel,
      pull,
      displayPlane,
      interiorPlane,
      namePlane,
      lamp,
      rearLink: merge([
        boxAt(0.018, 0.24, 0.018, 0, 0.12, 0),
        boxAt(0.018, 0.018, 0.09, 0, 0.24, 0.03),
      ]),
    };
  }, []);

  const display = useMemo(() => {
    const canvas = createCanvas(DISPLAY_W, DISPLAY_H);
    drawDisplay(canvas, INITIAL_DISPLAY);
    const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
    const material = new MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
    return { canvas, texture, material };
  }, [materials.anisotropy]);

  const interior = useMemo(() => {
    const canvas = createCanvas(HATCH_W, HATCH_H);
    drawHatchInterior(canvas);
    const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
    const material = new MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      fog: false,
      color: new Color(0, 0, 0),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    return { canvas, texture, material };
  }, [materials.anisotropy]);

  const plate = useMemo(() => {
    const canvas = createCanvas(NAMEPLATE_W, NAMEPLATE_H);
    drawNameplate(canvas);
    return { canvas, texture: makeTexture(canvas, { anisotropy: materials.anisotropy }) };
  }, [materials.anisotropy]);

  const lamps = useMemo(
    () => [0, 1, 2].map(() => new MeshBasicMaterial({ color: new Color(0, 0, 0), toneMapped: false, fog: false })),
    [],
  );

  useEffect(() => {
    materials.nameplate.map = plate.texture;
    materials.nameplate.needsUpdate = true;
    return () => {
      materials.nameplate.map = null;
      materials.nameplate.needsUpdate = true;
    };
  }, [materials, plate]);

  useEffect(
    () => () => {
      for (const g of Object.values(parts)) g.dispose();
      display.texture.dispose();
      display.material.dispose();
      interior.texture.dispose();
      interior.material.dispose();
      plate.texture.dispose();
      for (const m of lamps) m.dispose();
    },
    [parts, display, interior, plate, lamps],
  );

  const sim = useRef<Sim>({
    text: INITIAL_DISPLAY,
    overloaded: false,
    overloadAt: Number.NEGATIVE_INFINITY,
    plan: null,
    hatch: { kind: 'closed' },
    lightStart: 0,
    lightDur: 1,
    lightLevel: 0,
    drawnText: '',
    drawnLayout: '',
    drawnVis: -2,
  });
  const scratch = useMemo<DisplayOut>(() => ({ text: '', layout: '', vis: -1, bright: 1 }), []);

  // Fonts arrived: repaint every piece of canvas art that carries text.
  useEffect(() => {
    if (!fontsReady) return;
    drawNameplate(plate.canvas);
    plate.texture.needsUpdate = true;
    drawHatchInterior(interior.canvas);
    interior.texture.needsUpdate = true;
    sim.current.drawnText = '';
    invalidate();
  }, [fontsReady, plate, interior, invalidate]);

  // Resting picture from the store: correct after leaving and re-entering 3D mode.
  useEffect(() => {
    const state = store.getState();
    const s = sim.current;
    s.text = state.display;
    s.overloaded = state.phase === 'overloaded';
    s.plan = null;
    const open = state.memo.revealed || state.phase === 'overloaded';
    s.hatch = open ? { kind: 'open' } : { kind: 'closed' };
    s.lightLevel = open ? 1 : 0;
    s.lightStart = 0;
    s.lightDur = 0;
    s.drawnText = '';
    invalidate();
  }, [store, invalidate]);

  useEffect(
    () =>
      director.subscribe((event) => {
        const s = sim.current;
        switch (event.type) {
          case 'reply':
            s.plan = {
              kind: 'reply',
              printAt: event.printAt,
              printEnd: event.printEnd,
              text: event.line.display,
              prevText: s.plan && s.plan.kind === 'reply' ? s.plan.prevText : s.text,
              overloadAt: null,
            };
            break;
          case 'overload':
            s.overloaded = true;
            s.overloadAt = event.at;
            if (s.plan && s.plan.kind === 'reply') s.plan.overloadAt = event.at;
            break;
          case 'stillness':
            s.plan = { kind: 'fade', at: event.at, text: store.getState().display };
            break;
          case 'memo-revealed':
            if (event.source === 'overload') {
              // The hatch lands at hatchAt + latch lead (the sound's thump); the light rises then.
              s.hatch = motion.reduced
                ? { kind: 'reduced', startAt: event.slideAt - TIMING.memoAfterLandMs - 400 }
                : { kind: 'overload', startAt: event.hatchAt };
              s.lightStart = event.hatchAt + TIMING.overloadLatchLeadMs;
              s.lightDur = OVERLOAD_LIGHT_RISE_MS;
            } else {
              s.hatch = motion.reduced
                ? { kind: 'reduced', startAt: event.slideAt - 400 }
                : { kind: 'quiet', startAt: event.hatchAt };
              s.lightStart = event.hatchAt + 300;
              s.lightDur = 1200;
            }
            break;
          case 'reset':
            s.text = store.getState().display;
            s.overloaded = false;
            s.overloadAt = Number.NEGATIVE_INFINITY;
            s.plan = null;
            s.hatch = { kind: 'closed' };
            s.lightLevel = 0;
            s.lightStart = 0;
            s.lightDur = 0;
            s.drawnText = '';
            break;
          default:
            break;
        }
      }),
    [director, store, motion],
  );

  useFrame((state) => {
    const s = sim.current;
    const now = performance.now();
    const reduced = motion.reduced;
    let active = false;

    // --- display -------------------------------------------------------------------------
    if (evalDisplay(s, now, reduced, scratch)) active = true;
    if (scratch.text !== s.drawnText || scratch.vis !== s.drawnVis || scratch.layout !== s.drawnLayout) {
      drawDisplay(display.canvas, scratch.layout, scratch.vis < 0 ? undefined : scratch.vis);
      display.texture.needsUpdate = true;
      s.drawnText = scratch.text;
      s.drawnLayout = scratch.layout;
      s.drawnVis = scratch.vis;
    }
    display.material.color.setScalar(scratch.bright);

    // --- overload: linkage and lamps -----------------------------------------------------
    const od = now - s.overloadAt;
    const overloading = s.overloaded && od >= 0 && od < OVERLOAD_SCRIPT.unlatchAt;
    // This is only the machine linkage; root supplies the separate full-height service panel.
    const link = hero?.getObjectByName('rear_link') ?? rearLink.current;
    if (link) {
      const release = s.overloaded ? smoothstep(900, 1400, od) : 0;
      link.rotation.z = -0.45 * (reduced && s.overloaded ? 1 : release);
      if (s.overloaded && od < 1400) active = true;
    }
    const [l0, l1, l2] = lamps;
    if (l0 && l1 && l2) {
      let a = 1;
      let b = 0.06;
      let c = 0.06;
      if (s.overloaded) {
        if (!reduced && overloading) {
          a = Math.sin(now * 0.047) > 0.1 ? 1 : 0.05;
          b = Math.sin(now * 0.031 + 2.1) > -0.2 ? 0.9 : 0.05;
          c = Math.sin(now * 0.067 + 4) > 0.3 ? 1 : 0.05;
        } else {
          a = 0.05;
          b = 0.55;
          c = 0.05;
        }
      }
      l0.color.copy(AMBER).multiplyScalar(a);
      l1.color.copy(AMBER).multiplyScalar(b);
      l2.color.copy(AMBER).multiplyScalar(c);
    }
    if (overloading) active = true;

    // --- hatch and cavity ----------------------------------------------------------------------
    const angle = hatchAngle(s.hatch, now);
    const authoredHatch = hero?.getObjectByName('hatch');
    if (authoredHatch) authoredHatch.rotation.x = angle;
    const hatch = hatchGroup.current;
    if (hatch) {
      const angle = hatchAngle(s.hatch, now);
      hatch.rotation.x = angle;
      if (!hatchSettled(s.hatch, now)) active = true;
    }
    let level = s.lightLevel;
    if (s.lightDur > 0) {
      const t = clamp01((now - s.lightStart) / s.lightDur);
      level = easeInOutCubic(t);
      if (t >= 1) {
        s.lightLevel = 1;
        s.lightDur = 0;
      } else {
        active = true;
      }
    }
    interior.material.color.setScalar(INTERIOR_DARK + (1 - INTERIOR_DARK) * level);

    if (s.plan || s.hatch.kind === 'overload' || s.hatch.kind === 'quiet' || s.hatch.kind === 'reduced') {
      if (s.plan || !hatchSettled(s.hatch, now)) active = true;
    }
    if (active) state.invalidate();
  });

  const d = MACHINE.display;
  const h = MACHINE.hatch;
  return (
    <group position={[LAYOUT.machine.x, 0, LAYOUT.machine.z]} rotation={[0, LAYOUT.machine.yaw, 0]}>
      <group>
        {hero ? <primitive object={hero} /> : <>
        <mesh geometry={parts.body} material={materials.enamelBody} castShadow receiveShadow />
        <mesh geometry={parts.rubber} material={materials.rubberFoot} />
        <mesh geometry={parts.frames} material={materials.enamel} receiveShadow />
        <mesh geometry={parts.dark} material={materials.bezel} />
        <mesh geometry={parts.brass} material={materials.brass} castShadow />

        </>}
        {/* The amber display. */}
        <mesh geometry={parts.displayPlane} material={display.material} position={[0, d.y, FACE + 0.0035]} />

        {/* Indicator lamps beside the receipt slot. */}
        {lamps.map((material, i) => (
          <mesh
            key={i}
            geometry={parts.lamp}
            material={material}
            position={[MACHINE.lamps.xs[i] ?? 0, MACHINE.lamps.y, FACE + 0.004]}
            scale={[1, 1, 0.5]}
          />
        ))}

        {/* The cavity behind the hatch: a bracket outline, a stencil, a slot. */}
        <mesh
          geometry={parts.interiorPlane}
          material={interior.material}
          position={[0, h.hingeY + h.h / 2, FACE + 0.0003]}
        />

        {/* Front hatch, hinged at its bottom edge. */}
        <group ref={hatchGroup} userData={{ bake: 'dynamic' }} position={[0, h.hingeY, h.hingeZ]}>
          {!hero ? <>
          <mesh geometry={parts.hatchPanel} material={materials.enamelHatch} castShadow receiveShadow />
          <mesh geometry={parts.pull} material={materials.brassWorn} />
          </> : null}
          <mesh
            geometry={parts.namePlane}
            material={materials.nameplate}
            position={[0.03, 0.062, h.thickness / 2 + 0.0006]}
          />
        </group>

        {/* Service bell stays still until a visitor deliberately operates it. */}
        <group userData={{ bake: 'dynamic' }} position={[MACHINE.bell.x, MACHINE.bodyTop + 0.006, MACHINE.bell.z]}>
          {!hero ? <mesh geometry={parts.bell} material={materials.brass} castShadow receiveShadow /> : null}
        </group>

        <group ref={rearLink} userData={{ bake: 'dynamic' }} position={[MACHINE.width / 2 + 0.018, 0.12, -MACHINE.depth / 2]}>
          {!hero ? <mesh geometry={parts.rearLink} material={materials.brassWorn} /> : null}
        </group>
        <group userData={{ bake: 'dynamic' }}><Receipt /></group>
      </group>

      <group userData={{ bake: 'dynamic' }}><SpillReceipts /></group>
      <group userData={{ bake: 'dynamic' }}><MemoSheet /></group>
    </group>
  );
}
