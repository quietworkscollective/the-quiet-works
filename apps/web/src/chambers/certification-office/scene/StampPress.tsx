import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BoxGeometry,
  MeshDepthMaterial,
  RGBADepthPacking,
  type Group,
  type MeshStandardMaterial,
} from 'three';
import { TIMING } from '../../../timing.ts';
import { smoothstep, springResponse } from './anim.ts';
import { composeForm, drawFormBase, FORM_H, FORM_W } from './canvasArt.ts';
import { useFontsReady, useScene } from './context.ts';
import {
  createFerruleGeometry,
  createHandleGeometry,
  createSpringGeometry,
  cylinderAt,
  merge,
  RoundedBoxGeometry,
  roundedBoxAt,
  sphereAt,
} from './geometry.ts';
import { OFFICE_PRESS_TIMING } from '@tqw/engine';
import { impression, pressAt } from './beatMotion.ts';
import { PaperBeats, type PaperBeatsProps } from './PaperBeats.tsx';
import { InkPuff } from './InkPuff.tsx';
import { LAYOUT, PAPER_TOP, REST_HEIGHT } from './palette.ts';
import { createCanvas, makeTexture } from './textures.ts';

/**
 * The brass stamp press: platen and form, two guide rods with return springs, and the carriage
 * that carries the wooden stamp. It animates purely from director events (store cues), so the
 * dock button, the keyboard and a finger on the glass all move it identically.
 */

/** Extra sink under sustained pressure, metres. */
const SINK = 0.004;
/** Rest length includes the 65 mm take-up and compression stroke. */
const SPRING_REST = 0.1075;
const SPRING_CONTACT = 0.0425;
/** Peak return overshoot, metres. */
const OVERSHOOT = 0.008;
const CONTACT_MS = OFFICE_PRESS_TIMING.contactMs;
const RETURN_MS = OFFICE_PRESS_TIMING.returnMs;

type Phase = 'rest' | 'descending' | 'held' | 'lifting';

interface Sim {
  phase: Phase;
  /** Height of the rubber underside above the paper. */
  h: number;
  fromH: number;
  contactAt: number;
  touchAt: number;
  liftAt: number;
  liftStart: number;
  liftFromH: number;
  liftZeta: number;
  liftOmega: number;
  pending: Array<{ at: number; n: number }>;
}

const springUniform = { value: 1 };

/** Patch a standard material so a vertex's ring centre scales with the compression uniform. */
function squashable<T extends MeshStandardMaterial | MeshDepthMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uSquash'] = springUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aT;\nuniform float uSquash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aT * (uSquash - 1.0);');
  };
  material.customProgramCacheKey = () => 'tqw-spring-squash';
  return material;
}

export function StampPress({
  selectedPosition = 'centre', freshInk = false, windowClipWorld, channelDirection,
}: Omit<PaperBeatsProps, 'formTexture'> = {}) {
  const { store, director, materials, motion, cursor, onPosition, canPress, onPressSelect, onPressStart, onPressEnd } = useScene();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();

  const carriage = useRef<Group>(null);
  const padGroup = useRef<Group>(null);
  const ink = useRef(impression(selectedPosition, freshInk, 150));

  const parts = useMemo(() => {
    const platen = new RoundedBoxGeometry(0.5, 0.01, 0.56, 2, 0.002);
    platen.translate(0, 0.005, -0.02);

    const rodsParts = [];
    for (const side of [-1, 1]) {
      rodsParts.push(cylinderAt(0.006, 0.006, 0.35, side * 0.21, 0.185, 0, 14));
      rodsParts.push(sphereAt(0.0095, side * 0.21, 0.36, 0, 18));
      rodsParts.push(cylinderAt(0.014, 0.016, 0.008, side * 0.21, 0.014, 0, 20));
    }
    const rods = merge(rodsParts);

    const springs = merge(
      [-1, 1].map((side) => {
        const g = createSpringGeometry(SPRING_REST);
        g.translate(side * 0.21, 0.0118, 0);
        return g;
      }),
      ['aT'],
    );

    // The rubber plate is a hair larger than the wooden block above it, so it reads in profile as
    // a separate charcoal lip; the block sits on top of it.
    const pad = new RoundedBoxGeometry(0.164, 0.012, 0.104, 2, 0.0022);
    pad.translate(0, 0.006, 0);
    const block = new RoundedBoxGeometry(0.16, 0.041, 0.1, 2, 0.004);
    block.translate(0, 0.0325, 0);

    const brassParts = [roundedBoxAt(0.44, 0.016, 0.026, 0.003, 0, 0.061, 0, 2)];
    const wornParts = [];
    for (const side of [-1, 1]) {
      // The sleeves ride the rods all day: they are the polished part.
      wornParts.push(cylinderAt(0.016, 0.016, 0.04, side * 0.21, 0.061, 0, 24));
      brassParts.push(cylinderAt(0.0075, 0.0075, 0.004, side * 0.075, 0.071, 0, 12));
      brassParts.push(cylinderAt(0.005, 0.005, 0.004, side * 0.075, 0.0495, 0.0, 12));
    }
    const ferrule = createFerruleGeometry();
    ferrule.translate(0, 0.069, 0);
    wornParts.push(ferrule);
    const carriageBrass = merge(brassParts);
    const carriageWorn = merge(wornParts);

    const handle = createHandleGeometry();
    handle.translate(0, 0.069, 0);

    const hit = new BoxGeometry(0.42, 0.4, 0.4);
    hit.translate(0, 0.2, 0);

    const depth = squashable(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }));

    return { platen, rods, springs, pad, block, carriageBrass, carriageWorn, handle, hit, depth };
  }, []);

  // Form canvas texture, redrawn when fonts arrive and when an imprint lands.
  const form = useMemo(() => {
    const canvas = createCanvas(FORM_W, FORM_H);
    const holder = { base: drawFormBase(), count: 0 };
    composeForm(canvas, holder.base, holder.count);
    const texture = makeTexture(canvas, { anisotropy: materials.anisotropy });
    return { canvas, holder, texture };
  }, [materials.anisotropy]);

  useEffect(
    () => () => {
      for (const g of Object.values(parts)) {
        if ('dispose' in g) g.dispose();
      }
      form.texture.dispose();
    },
    [parts, form],
  );

  // Fonts arrived: redraw the printed form.
  useEffect(() => {
    if (!fontsReady) return;
    form.holder.base = drawFormBase();
    composeForm(form.canvas, form.holder.base, form.holder.count);
    form.texture.needsUpdate = true;
    invalidate();
  }, [fontsReady, form, invalidate]);

  // Spring material compresses via a shader patch; the shared brass material stays untouched.
  useEffect(() => {
    squashable(materials.springSteel);
    materials.springSteel.needsUpdate = true;
    return () => {
      materials.springSteel.onBeforeCompile = () => {};
      materials.springSteel.needsUpdate = true;
    };
  }, [materials]);

  const sim = useRef<Sim>({
    phase: 'rest',
    h: REST_HEIGHT,
    fromH: REST_HEIGHT,
    contactAt: 0,
    touchAt: 0,
    liftAt: Number.POSITIVE_INFINITY,
    liftStart: 0,
    liftFromH: 0,
    liftZeta: 0.68,
    liftOmega: 13,
    pending: [],
  });

  // Restore a coherent picture if the scene mounts mid-session (e.g. leaving text mode).
  useEffect(() => {
    const state = store.getState();
    const n = state.stamps;
    form.holder.count = n;
    composeForm(form.canvas, form.holder.base, n);
    form.texture.needsUpdate = true;
    const s = sim.current;
    if (state.pressing) {
      const now = performance.now();
      s.phase = 'held';
      s.touchAt = now - 1200;
      s.contactAt = s.touchAt - CONTACT_MS;
      s.h = 0;
    } else {
      s.phase = 'rest';
      s.h = REST_HEIGHT;
    }
    invalidate();
  }, [store, form, invalidate]);

  useEffect(
    () =>
      director.subscribe((event) => {
        const s = sim.current;
        switch (event.type) {
          case 'contact':
            s.fromH = s.h;
            s.contactAt = event.at;
            s.touchAt = event.at + CONTACT_MS;
            s.liftAt = Number.POSITIVE_INFINITY;
            s.phase = 'descending';
            break;
          case 'lift':
            s.liftAt = Math.max(event.at, s.touchAt + TIMING.minDwellMs);
            ink.current = impression(selectedPosition, freshInk, s.liftAt - s.touchAt);
            s.pending.push({ at: s.liftAt, n: event.n });
            break;
          case 'reset':
            s.phase = 'rest';
            s.h = REST_HEIGHT;
            s.liftAt = Number.POSITIVE_INFINITY;
            s.pending.length = 0;
            form.holder.count = 0;
            composeForm(form.canvas, form.holder.base, 0);
            form.texture.needsUpdate = true;
            break;
          default:
            break;
        }
      }),
    [director, form, selectedPosition, freshInk],
  );

  // ---- pointer input ------------------------------------------------------------------------
  const activePointer = useRef<number | null>(null);
  const teardown = useRef<(() => void) | null>(null);

  const endPress = useCallback(
    (pointerId: number | null) => {
      if (activePointer.current === null) return;
      if (pointerId !== null && pointerId !== activePointer.current) return;
      activePointer.current = null;
      teardown.current?.();
      teardown.current = null;
      onPressEnd();
    },
    [onPressEnd],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0 || activePointer.current !== null || !canPress()) return;
      e.stopPropagation();
      (e.target as unknown as Element).setPointerCapture(e.pointerId);
      activePointer.current = e.pointerId;
      // R3F does not forward pointercancel or lostpointercapture to objects, so listen natively.
      const canvas = gl.domElement;
      const up = (ev: PointerEvent) => endPress(ev.pointerId);
      const lost = (ev: PointerEvent) => endPress(ev.pointerId);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      canvas.addEventListener('lostpointercapture', lost);
      teardown.current = () => {
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        canvas.removeEventListener('lostpointercapture', lost);
      };
      const local = e.object.worldToLocal(e.point.clone());
      if (local.y < 0.08) onPosition(local.x < -0.045 ? 'left' : local.x > 0.045 ? 'right' : 'centre');
      onPressStart();
    },
    [gl, endPress, onPosition, canPress, onPressStart],
  );

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.pointerId !== activePointer.current) return;
      e.stopPropagation();
      endPress(e.pointerId);
    },
    [endPress],
  );

  useEffect(
    () => () => {
      teardown.current?.();
      teardown.current = null;
      activePointer.current = null;
      cursor.hover('press', false);
    },
    [cursor],
  );

  // ---- the motion model -----------------------------------------------------------------------
  useFrame((state) => {
    const s = sim.current;
    const now = performance.now();
    const reduced = motion.reduced;
    let active = false;

    // Imprints appear the moment the lift begins, never before.
    if (s.pending.length > 0) {
      active = true;
      for (let i = 0; i < s.pending.length; i += 1) {
        const item = s.pending[i];
        if (item && now >= item.at) {
          s.pending.splice(i, 1);
          i -= 1;
          form.holder.count = item.n;
          composeForm(form.canvas, form.holder.base, item.n, ink.current);
          form.texture.needsUpdate = true;
        }
      }
    }

    if (s.phase === 'descending' && now >= s.touchAt) s.phase = 'held';
    if ((s.phase === 'held' || s.phase === 'descending') && now >= s.liftAt) {
      s.liftFromH = 0;
      s.liftStart = s.liftAt;
      const travel = REST_HEIGHT - s.liftFromH;
      s.liftZeta = Math.min(0.95, Math.max(0.3, zetaForOvershoot(OVERSHOOT / travel)));
      s.liftOmega = 4.4 / (s.liftZeta * (RETURN_MS / 1000));
      s.phase = 'lifting';
      s.liftAt = Number.POSITIVE_INFINITY;
    }

    let squashY = 1;
    let squashXZ = 1;

    switch (s.phase) {
      case 'rest':
        s.h = REST_HEIGHT;
        break;
      case 'descending': {
        const travel = pressAt(reduced ? CONTACT_MS : now - s.contactAt, 0).travel;
        s.h = Math.max(0, s.fromH - travel);
        active = true;
        break;
      }
      case 'held': {
        const since = now - s.touchAt;
        const compress = pressAt(CONTACT_MS, since).compression;
        s.h = 0;
        const settle = Math.exp(-since / 20);
        squashY = 1 - 0.12 * compress - 0.14 * settle;
        squashXZ = 1 + 0.045 * compress + 0.03 * settle;
        // Long holds come to rest; pressure never becomes escalating vibration.
        active = active || since < 1200;
        break;
      }
      case 'lifting': {
        const t = (now - s.liftStart) / 1000;
        const travel = REST_HEIGHT - s.liftFromH;
        const response = reduced ? 1 : springResponse(t, s.liftZeta, s.liftOmega);
        const end = RETURN_MS / 1000;
        if (t >= end) {
          s.phase = 'rest';
          s.h = REST_HEIGHT;
        } else {
          // Ease the residual ripple to nothing across the last fifth.
          const r = 1 + (response - 1) * (1 - smoothstep(0.8, 1, t / end));
          s.h = s.liftFromH + travel * r;
          active = true;
        }
        break;
      }
    }

    const c = carriage.current;
    if (c) {
      c.position.set(0, PAPER_TOP + s.h, 0);
    }
    const pad = padGroup.current;
    if (pad) {
      pad.scale.set(squashXZ, squashY, squashXZ);
      pad.position.x = impression(selectedPosition, freshInk, 150).offset;
    }
    const pressure = s.phase === 'held' ? pressAt(CONTACT_MS, now - s.touchAt).compression : 0;
    springUniform.value = Math.max(0.05, (SPRING_CONTACT + s.h - SINK * pressure) / SPRING_REST);

    if (active) state.invalidate();
  });

  return (
    <>
      <group position={[LAYOUT.press.x, 0, LAYOUT.press.z]} rotation={[0, LAYOUT.press.yaw, 0]}>
        <mesh geometry={parts.platen} material={materials.platen} castShadow receiveShadow />
        <mesh geometry={parts.rods} material={materials.brassWorn} castShadow />
        <mesh
          geometry={parts.springs}
          material={materials.springSteel}
          customDepthMaterial={parts.depth}
          castShadow
        />

        <InkPuff />

        <group
          onClick={event => { event.stopPropagation(); if (!canPress()) onPressSelect(); }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerOver={() => cursor.hover('press', true)}
          onPointerOut={() => cursor.hover('press', false)}
        >
          {/* Generous invisible target so a thumb finds the stamp. Invisible meshes still raycast. */}
          <mesh geometry={parts.hit}>
            <meshBasicMaterial visible={false} />
          </mesh>
          <group ref={carriage} position={[0, PAPER_TOP + REST_HEIGHT, 0]}>
            <group ref={padGroup}>
              <mesh geometry={parts.pad} material={materials.rubber} castShadow />
            </group>
            <mesh geometry={parts.block} position={[impression(selectedPosition, freshInk, 150).offset, 0, 0]} material={materials.wood} castShadow receiveShadow />
            <mesh geometry={parts.carriageBrass} material={materials.brass} castShadow receiveShadow />
            <mesh geometry={parts.carriageWorn} material={materials.brassWorn} castShadow receiveShadow />
            <mesh name="office-press-handle" geometry={parts.handle} position={[impression(selectedPosition, freshInk, 150).offset, 0, 0]} material={materials.grip} castShadow receiveShadow />
          </group>
        </group>
      </group>
      <PaperBeats
        selectedPosition={selectedPosition}
        freshInk={freshInk}
        formTexture={form.texture}
        {...(windowClipWorld ? { windowClipWorld } : {})}
        {...(channelDirection ? { channelDirection } : {})}
      />
    </>
  );
}

/** Damping ratio whose peak overshoot fraction is `os`. */
function zetaForOvershoot(os: number): number {
  const o = Math.min(0.5, Math.max(0.001, os));
  const l = Math.log(o);
  return -l / Math.sqrt(Math.PI * Math.PI + l * l);
}
