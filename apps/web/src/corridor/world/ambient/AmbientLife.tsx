import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { BufferAttribute, BufferGeometry, Color, DataTexture, LinearFilter, PlaneGeometry, RedFormat, RepeatWrapping, type Group, type Material, type Mesh, type Points } from 'three';
import { useWorldAmbient as useAmbient, useWorldFrame } from './useWorldAmbient.ts';
import { bayCentreZ, CORRIDOR } from '../../layout.ts';
import { clockPivot } from '../architecture/lobbyDecor.ts';
import { LOBBY_FRAMES } from '../architecture/lobby.ts';
import { FAN_SWITCH, LOBBY_WINDOW } from '../architecture/lobbyPlan.ts';
import { at } from '../architecture/wall.ts';
import { boardToWorld } from '../board.ts';
import { RADIATOR_SLOTS } from '../fixtures.ts';
import type { WorldMaterials } from '../materials.ts';
import { mulberry32 } from '../math.ts';
import { DUST, FAN_RAD_PER_S, mobileTurn, reflectionLevel, secondHandSteps, shimmerAmount, tagSwing } from './curves.ts';
import { fanBlades, fanTag, clockHands, repairMobile } from './parts.ts';
import { AmbientScheduler, type AmbientId } from './schedule.ts';

/**
 * The corridor's ambient life, as components (ADR 0004): the lobby fan, the clock, the tag at the
 * fan's switch, the plant's crown, a drip, motes in a lamp's pool, the window's reflection, the
 * mobile over the repair bench and the shimmer over a radiator. Each reads the ambient clock in
 * `useFrame` and moves only while a window for it is `active`; none starts a frame, and under
 * reduced motion none ever moves. The one-time poses (the clock's time) are set at mount.
 */

interface LifeProps {
  materials: WorldMaterials;
  reducedMotion: boolean;
  scheduler: MutableRefObject<AmbientScheduler | null>;
}

/** A hook for the rising edge of a window: the ambient time it opened at, or null while closed. */
function useWindow(id: AmbientId): (now: number) => number | null {
  const ambient = useAmbient();
  const opened = useRef<number | null>(null);
  return (now: number) => {
    if (ambient.active(id)) {
      opened.current ??= now;
      return now - opened.current;
    }
    opened.current = null;
    return null;
  };
}

/** Geometry from buckets, disposed when it changes or on unmount. */
function useGeometry<T extends { toGeometry(): BufferGeometry }>(make: () => T[]): BufferGeometry[] {
  const geometries = useMemo(() => make().map((b) => b.toGeometry()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      for (const g of geometries) g.dispose();
    },
    [geometries],
  );
  return geometries;
}

/** The extractor fan in the lobby window's middle light: turns while its window is open. */
function Fan({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const group = useRef<Group>(null);
  const centre = useMemo(() => at(LOBBY_FRAMES.left, LOBBY_WINDOW.fan.depth, LOBBY_WINDOW.fan.y, LOBBY_WINDOW.fan.s), []);
  const [paint, brass] = useGeometry(() => {
    const f = fanBlades();
    return [f.paint, f.brass];
  });
  const state = useRef({ angle: 0, last: 0 });
  useWorldFrame(() => {
    if (reducedMotion) return;
    const t = ambient.now();
    const s = state.current;
    if (ambient.active('lobby-fan')) s.angle += (t - s.last) * FAN_RAD_PER_S;
    s.last = t;
    if (group.current) group.current.rotation.x = s.angle;
  });
  return (
    <group ref={group} position={[centre[0], centre[1], centre[2]]}>
      {paint && <mesh geometry={paint} material={materials.byKey.paint} />}
      {brass && <mesh geometry={brass} material={materials.byKey.brass} />}
    </group>
  );
}

/** The lobby clock's hands: the visitor's own local time, and a second hand that steps once a second while frames are drawn. */
function ClockHands({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const pivot = useMemo(() => clockPivot(), []);
  const [hour, minute, second] = useGeometry(() => {
    const h = clockHands();
    return [h.hour, h.minute, h.second];
  });
  const hourHand = useRef<Mesh>(null);
  const minuteHand = useRef<Mesh>(null);
  const secondHand = useRef<Mesh>(null);
  // The time is read once at mount, then again on every drawn frame (a Date read is nothing).
  const base = useRef(new Date().getSeconds());
  const apply = (): void => {
    const now = new Date();
    const m = now.getMinutes() + now.getSeconds() / 60;
    const h = (now.getHours() % 12) + m / 60;
    // Clockwise as the visitor sees it, with the dial facing +z: negative about z.
    if (hourHand.current) hourHand.current.rotation.z = -(h / 12) * Math.PI * 2;
    if (minuteHand.current) minuteHand.current.rotation.z = -(m / 60) * Math.PI * 2;
  };
  useEffect(apply, []);
  useWorldFrame(() => {
    apply();
    if (reducedMotion || !secondHand.current) return;
    // Discrete steps: whole seconds of ambient time, which advances only while a window is open.
    secondHand.current.rotation.z = -(((base.current + secondHandSteps(ambient.now())) % 60) / 60) * Math.PI * 2;
  });
  return (
    <group position={[pivot[0], pivot[1], pivot[2]]}>
      {hour && <mesh ref={hourHand} geometry={hour} material={materials.byKey.paint} />}
      {minute && <mesh ref={minuteHand} geometry={minute} material={materials.byKey.paint} />}
      {second && <mesh ref={secondHand} geometry={second} material={materials.byKey.paint} />}
    </group>
  );
}

/** The paper tag tied to the fan's switch: one slow swing once in a while. */
function FanTag({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const group = useRef<Group>(null);
  const attach = useMemo(() => at(LOBBY_FRAMES.left, 0.036, FAN_SWITCH.y + 0.008, FAN_SWITCH.s), []);
  const [paper, string] = useGeometry(() => {
    const t = fanTag();
    return [t.paper, t.string];
  });
  const windowAge = useWindow('fan-tag');
  useWorldFrame(() => {
    if (reducedMotion || !group.current) return;
    const age = windowAge(ambient.now());
    group.current.rotation.x = age === null ? 0 : tagSwing(age);
  });
  return (
    <group ref={group} position={[attach[0], attach[1], attach[2]]}>
      {paper && <mesh geometry={paper} material={materials.byKey.paint} />}
      {string && <mesh geometry={string} material={materials.byKey.brass} />}
    </group>
  );
}

/** Motes in the notice board's lamp: a few specks that drift across its pool for four seconds. */
function Dust({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const points = useRef<Points>(null);
  const centre = useMemo(() => boardToWorld(0.1, 0.5, 0.34), []);
  const seeds = useMemo(() => {
    const rng = mulberry32(0xd057);
    return Array.from({ length: DUST.motes }, () => ({
      off: [(rng() - 0.5) * 0.7, (rng() - 0.5) * 0.45, (rng() - 0.5) * 0.5] as const,
      dir: [(rng() - 0.5) * 2, 0.3 + rng() * 0.7, (rng() - 0.5) * 2] as const,
      phase: rng() * Math.PI * 2,
      speed: DUST.speedMps * (0.7 + rng() * 0.6),
    }));
  }, []);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(DUST.motes * 3), 3));
    return g;
  }, []);
  const material = useMemo(() => {
    // Over-unity additive colour: a mote must out-shine the plaster behind it to read at 24 mm.
    return materials.moteMaterial(0.024, new Color(3.4, 2.7, 1.8));
  }, [materials]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const age = useWindow('lobby-dust');
  useWorldFrame(() => {
    const p = points.current;
    if (!p || reducedMotion) return;
    const t = age(ambient.now());
    p.visible = t !== null;
    if (t === null) return;
    const pos = geometry.getAttribute('position') as BufferAttribute;
    seeds.forEach((s, i) => {
      const len = Math.hypot(s.dir[0], s.dir[1], s.dir[2]);
      const d = s.speed * t;
      pos.setXYZ(
        i,
        centre[0] + s.off[0] * 0.3 + (s.dir[0] / len) * d + Math.sin(t * 1.3 + s.phase) * 0.004,
        centre[1] + s.off[1] + (s.dir[1] / len) * d,
        centre[2] + s.off[2] + (s.dir[2] / len) * d + Math.cos(t * 1.1 + s.phase) * 0.004,
      );
    });
    pos.needsUpdate = true;
  });
  return <points ref={points} geometry={geometry} material={material} visible={false} frustumCulled={false} />;
}

/** The faint broad change of light in the high glass: outside, ordinary traffic, never a figure. */
function WindowReflection({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const material = useMemo(() => materials.glowMaterial(materials.textures.radial, '#cfe2ff', 0), [materials]);
  const geometry = useMemo(() => new PlaneGeometry(LOBBY_WINDOW.s[1] - LOBBY_WINDOW.s[0], LOBBY_WINDOW.y[1] - LOBBY_WINDOW.y[0]), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const pos = useMemo(() => at(LOBBY_FRAMES.left, -0.07, (LOBBY_WINDOW.y[0] + LOBBY_WINDOW.y[1]) / 2, (LOBBY_WINDOW.s[0] + LOBBY_WINDOW.s[1]) / 2), []);
  const age = useWindow('window-reflection');
  useWorldFrame(() => {
    if (reducedMotion) return;
    const t = age(ambient.now());
    // Scaled so the pane's own light changes by REFLECTION.luminance at the peak.
    material.opacity = t === null ? 0 : reflectionLevel(t) * 1.6;
  });
  return <mesh geometry={geometry} material={material} position={[pos[0], pos[1], pos[2]]} rotation={[0, Math.PI / 2, 0]} renderOrder={3} />;
}

/** The hand-made mobile over the repair bench in the third bay: a slow, balanced turn, now and then. */
function RepairMobile({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const group = useRef<Group>(null);
  const [paper, brass] = useGeometry(() => {
    const m = repairMobile();
    return [m.paper, m.brass];
  });
  const age = useWindow('repair-mobile');
  useWorldFrame(() => {
    if (reducedMotion || !group.current) return;
    const t = age(ambient.now());
    group.current.rotation.y = t === null ? 0 : mobileTurn(t);
  });
  return (
    <group ref={group} position={[CORRIDOR.width / 2 - 0.34, CORRIDOR.height - 0.06, bayCentreZ(3) - 1.2]}>
      {paper && <mesh geometry={paper} material={materials.byKey.paint} />}
      {brass && <mesh geometry={brass} material={materials.byKey.brass} />}
    </group>
  );
}

/** A faint shimmer over the nearest radiator: warm air, no more than a breath. Desktop only. */
function RadiatorShimmer({ materials, reducedMotion }: LifeProps) {
  const ambient = useAmbient();
  const slot = RADIATOR_SLOTS[0];
  const texture = useMemo(() => {
    const size = 64;
    const data = new Uint8Array(size * size);
    const rng = mulberry32(0x5a7e);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.floor(rng() * 255);
    const t = new DataTexture(data, size, size, RedFormat);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.needsUpdate = true;
    return materials.own(t);
  }, [materials]);
  const material = useMemo(() => {
    const m = materials.glowMaterial(texture, '#ffcf99', 0);
    return m as Material;
  }, [materials, texture]);
  const geometry = useMemo(() => new PlaneGeometry(0.9, 0.42), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const age = useWindow('radiator-shimmer');
  useWorldFrame(() => {
    if (reducedMotion) return;
    const t = age(ambient.now());
    (material as { opacity: number }).opacity = t === null ? 0 : shimmerAmount(t) * 0.06;
    if (t !== null) {
      texture.offset.y = -t * 0.35;
      texture.offset.x = Math.sin(t * 2.1) * 0.02;
    }
  });
  if (!slot) return null;
  const wall = slot.side === 'left' ? -CORRIDOR.width / 2 : CORRIDOR.width / 2;
  return <mesh geometry={geometry} material={material} position={[wall + (slot.side === 'left' ? 0.035 : -0.035), 0.93, slot.z]} rotation={[0, slot.side === 'left' ? Math.PI / 2 : -Math.PI / 2, 0]} renderOrder={3} />;
}

export function AmbientLife(props: LifeProps & { desktop: boolean }) {
  return (
    <>
      <Fan {...props} />
      <ClockHands {...props} />
      <FanTag {...props} />
      <Dust {...props} />
      <WindowReflection {...props} />
      <RepairMobile {...props} />
      {props.desktop && <RadiatorShimmer {...props} />}
    </>
  );
}

/** Starts the scheduler once the world is drawn, and stops it (and every timer) when the world goes. */
export function AmbientDirector({ reducedMotion, desktop, scheduler }: { reducedMotion: boolean; desktop: boolean; scheduler: MutableRefObject<AmbientScheduler | null> }) {
  const clock = useAmbient();
  useEffect(() => {
    const s = new AmbientScheduler(clock, { reducedMotion, desktop, random: Math.random });
    scheduler.current = s;
    s.start();
    return () => {
      s.stop();
      scheduler.current = null;
    };
  }, [clock, reducedMotion, desktop, scheduler]);
  return null;
}
