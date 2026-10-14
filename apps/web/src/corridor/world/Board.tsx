import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CHAMBERS, type ChamberId } from '@tqw/engine';
import { Color, PlaneGeometry, SphereGeometry, type BufferAttribute, type CanvasTexture, type Group, type Mesh } from 'three';
import { useWorldAmbient as useAmbient, useWorldFrame } from './ambient/useWorldAmbient.ts';
import { paperLift, pinGlint } from './ambient/curves.ts';
import { BOARD_CUES, BOARD_DEPTH, BOARD_ORIGIN, BOARD_SWIVEL, CLIPPINGS, CLIPPING_SIZE, GLINT_PIN, HOURS_CARD, pinUV } from './board.ts';
import { clamp, nth, smoothstep } from './math.ts';
import type { LitMaterial, WorldMaterials } from './materials.ts';
import { officeHoursState, type HoursState } from './officeHours.ts';
import { BRASS_TINT } from './palette.ts';
import { CLIPPING_ATLAS, clippingCell } from './textures/clippings.ts';
import { drawHoursCard, HOURS_OFFSET } from './textures/hours.ts';

/**
 * The notice board's parts that move or answer: the clippings (separate meshes, so each can be
 * chosen), the corner of one that lifts in the fan's draught, the brass pin that catches the light
 * once, and the office-hours card that follows the visitor's own clock. Choosing a clipping calls
 * `onClipping(id)`; the keyboard equivalent is the DOM board, which opens from anywhere. A hover is
 * an instant state change (a few millimetres off the felt, a touch more light), never an animation,
 * and the cursor becomes a pointer.
 *
 * Nothing here starts a frame: the paper and the pin read the ambient clock inside `useFrame`, and
 * move only while the camera lane's scheduler has a window open for them.
 */
interface Props {
  materials: WorldMaterials;
  atlas: CanvasTexture;
  onClipping(id: ChamberId): void;
  reducedMotion: boolean;
}

/** The clipping whose top-right corner lifts in the draught: the Residential notice (the tenant who is fine). */
const PAPER_CLIPPING = 1;
const SEGMENTS = 8;

/** A plane whose UVs cover one atlas cell, subdivided so a corner can bend. */
function clippingGeometry(index: number): PlaneGeometry {
  const g = new PlaneGeometry(CLIPPING_SIZE, CLIPPING_SIZE, SEGMENTS, SEGMENTS);
  const cell = clippingCell(index);
  const { width, height } = CLIPPING_ATLAS;
  const u0 = cell.x / width;
  const u1 = (cell.x + cell.w) / width;
  const v0 = 1 - (cell.y + cell.h) / height;
  const v1 = 1 - cell.y / height;
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** How far a vertex of the plane rises when the top-right corner lifts by `lift`: a curl from the corner. */
function curl(x: number, y: number, lift: number): number {
  const half = CLIPPING_SIZE / 2;
  const along = (x + y) / (2 * half);
  return lift * smoothstep(0.1, 1, along) ** 2;
}

export function Board({ materials, atlas, onClipping, reducedMotion }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const domElement = useThree((s) => s.gl.domElement);
  const ambient = useAmbient();
  const geometries = useMemo(() => CLIPPINGS.map((c) => clippingGeometry(c.chamberIndex)), []);
  const paper = useMemo(() => CLIPPINGS.map(() => materials.paperMaterial(atlas)), [materials, atlas]);

  // The pin that catches the light: a brass hemisphere with its own emissive channel.
  const pin = useMemo(() => {
    const geometry = new SphereGeometry(0.0058, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const material = materials.litClone(materials.byKey.brass as LitMaterial);
    // The brass bucket is tinted by vertex colour; this pin has none, so it carries the tint itself.
    material.vertexColors = false;
    material.color.setRGB(BRASS_TINT[0], BRASS_TINT[1], BRASS_TINT[2]);
    material.emissive = new Color(0, 0, 0);
    return { geometry, material };
  }, [materials]);

  // The office-hours card: one texture, two lettered states, one shown at a time.
  const hours = useMemo(() => {
    const texture = materials.own(drawHoursCard(4));
    const material = materials.paperMaterial(texture);
    texture.offset.set(0, HOURS_OFFSET[officeHoursState(new Date())]);
    return { texture, material, geometry: new PlaneGeometry(HOURS_CARD.w, HOURS_CARD.h) };
  }, [materials]);

  useEffect(
    () => () => {
      for (const g of geometries) g.dispose();
      pin.geometry.dispose();
      hours.geometry.dispose();
    },
    [geometries, pin, hours],
  );
  const refs = useRef<(Group | null)[]>([]);
  const paperMesh = useRef<Mesh | null>(null);
  const state = useRef({ paperT0: -1, pinT0: -1, hours: officeHoursState(new Date()) as HoursState, lift: 0 });

  // The card's state is also written on the canvas (`data-office-hours`), so a test, or a text
  // alternative, can read what the card says without reading pixels.
  useEffect(() => {
    domElement.dataset['officeHours'] = state.current.hours;
    return () => {
      delete domElement.dataset['officeHours'];
    };
  }, [domElement]);

  const set = (i: number, over: boolean): void => {
    const group = refs.current[i];
    const material = paper[i];
    if (!group || !material) return;
    group.position.z = BOARD_DEPTH.clipping + (over ? 0.004 : 0);
    material.emissive.setRGB(over ? 0.1 : 0, over ? 0.085 : 0, over ? 0.06 : 0);
    domElement.style.cursor = over ? 'pointer' : '';
    invalidate();
  };

  // The paper corner and the pin: read the ambient clock; touch nothing when no window is open.
  useWorldFrame(() => {
    const s = state.current;
    // The card follows the visitor's clock whenever a frame is drawn (cheap: one Date read).
    const now = officeHoursState(new Date());
    if (now !== s.hours) {
      s.hours = now;
      hours.texture.offset.set(0, HOURS_OFFSET[now]);
      domElement.dataset['officeHours'] = now;
    }
    if (reducedMotion) return;
    const t = ambient.now();
    const mesh = paperMesh.current;
    if (mesh) {
      const live = ambient.active('board-paper');
      if (live && s.paperT0 < 0) s.paperT0 = t;
      if (!live) s.paperT0 = -1;
      const lift = live ? paperLift(t - s.paperT0) : 0;
      if (lift !== s.lift) {
        s.lift = lift;
        const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
        for (let i = 0; i < pos.count; i += 1) pos.setZ(i, curl(pos.getX(i), pos.getY(i), lift));
        pos.needsUpdate = true;
      }
    }
    const pinLive = ambient.active('board-pin');
    if (pinLive && s.pinT0 < 0) s.pinT0 = t;
    if (!pinLive) s.pinT0 = -1;
    const glint = clamp(Math.max(BOARD_CUES.glint, pinLive ? pinGlint(t - s.pinT0) : 0), 0, 1);
    pin.material.emissive.setRGB(0.55 * glint, 0.42 * glint, 0.22 * glint);
  });

  const [pu, pv, pd] = pinUV(GLINT_PIN.clipping);
  // The board's group: its local z is the board's normal, x to the visitor's right, y up. It is
  // turned from the wall by the swivel, about the board's own back plane.
  return (
    <group position={[BOARD_ORIGIN[0], BOARD_ORIGIN[1], BOARD_ORIGIN[2]]} rotation={[0, Math.PI / 2 - BOARD_SWIVEL, 0]} dispose={null}>
      {CLIPPINGS.map((c, i) => {
        const entry = nth(CHAMBERS, c.chamberIndex);
        return (
          <group
            key={entry.id}
            ref={(g) => {
              refs.current[i] = g;
            }}
            position={[c.u, c.v, BOARD_DEPTH.clipping]}
            rotation={[0, 0, (c.tiltDeg * Math.PI) / 180]}
          >
            <mesh
              ref={(m) => {
                if (i === PAPER_CLIPPING) paperMesh.current = m;
              }}
              geometry={nth(geometries, i)}
              material={nth(paper, i)}
              onPointerOver={(e) => {
                e.stopPropagation();
                set(i, true);
              }}
              onPointerOut={() => set(i, false)}
              onClick={(e) => {
                e.stopPropagation();
                onClipping(entry.id);
              }}
            />
          </group>
        );
      })}
      <mesh geometry={hours.geometry} material={hours.material} position={[HOURS_CARD.u, HOURS_CARD.v, BOARD_DEPTH.clipping + 0.0004]} rotation={[0, 0, 0.012]} />
      <mesh geometry={pin.geometry} material={pin.material} position={[pu, pv, pd]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}
