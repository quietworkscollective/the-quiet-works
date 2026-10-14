import {
  Color,
  DoubleSide,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import type { Channel } from './parts.ts';

/**
 * The props' materials. The corridor lights its surfaces with a patched shader (the static lamps
 * and the corridor's own fog curve, see world/shader.ts); a prop that did not use it would be lit
 * by the faint ambient alone and would not fade into the fog. The patch is carried by the world's
 * own materials, so the props borrow it: each is created here, then given the `onBeforeCompile`
 * of the world's oak, found in the scene by its mesh name. The oak also lends the props its
 * grain. Without a world to borrow from (a test, a failed lookup) the props still draw, plain.
 */

type Lit = MeshStandardMaterial | MeshLambertMaterial;

/**
 * Albedo gains by kind of surface. The corridor is lit by a few sconces and a faint fill, and the
 * piers between them are dark; an object the visitor is meant to find has to hold its own there, so
 * the props take a little more of the light than the walls do. Paper takes the most, so that a
 * printed label stays legible where nothing is lighting it well.
 */
export const GAIN = { wood: 1.45, paint: 1.6, metal: 1.3, paper: 1.9 } as const;

export interface Donors {
  /** The world's patched oak material: lit, with the corridor's grain. */
  oak: Lit;
  /** A glossy donor whose environment map the metals share, when the world has one. */
  glossy: MeshStandardMaterial | null;
}

/** The world's materials by mesh name, or null when the scene has none yet. */
export function findDonors(scene: Object3D): Donors | null {
  const material = (name: string): Material | null => {
    const mesh = scene.getObjectByName(name) as Mesh | undefined;
    const m = mesh?.material;
    return m && !Array.isArray(m) ? m : null;
  };
  const oak = material('oak');
  if (!(oak instanceof MeshStandardMaterial) && !(oak instanceof MeshLambertMaterial)) return null;
  const brass = material('brass');
  return { oak, glossy: brass instanceof MeshStandardMaterial ? brass : null };
}

export interface PropMaterials {
  readonly byChannel: Readonly<Record<Channel, Material>>;
  /** Hand every material the world's current environment map (it is bound after the props mount). */
  syncEnvironment(): boolean;
  dispose(): void;
}

/** `atlas` belongs to the returned set: disposing the set disposes it. */
export function createPropMaterials(donors: Donors | null, atlas: Texture | null): PropMaterials {
  const lite = donors?.oak instanceof MeshLambertMaterial;
  const owned: Material[] = [];
  const glossy: MeshStandardMaterial[] = [];

  const borrow = <T extends Lit>(m: T): T => {
    if (donors) {
      m.onBeforeCompile = donors.oak.onBeforeCompile;
      m.customProgramCacheKey = donors.oak.customProgramCacheKey;
    }
    owned.push(m);
    return m;
  };
  const white = new Color('#ffffff');

  interface Spec {
    /** Albedo gain: the props catch a little more of the corridor's dim light than the walls do. */
    gain?: number;
    colour?: Color | string;
    map?: Texture | null;
    roughness: number;
    metalness: number;
    env: number;
    glass?: boolean;
  }
  const make = (s: Spec): Lit => {
    const tint = s.colour ? new Color(s.colour) : white.clone();
    tint.multiplyScalar(s.gain ?? 1);
    if (lite) {
      return borrow(
        new MeshLambertMaterial({
          color: tint,
          vertexColors: true,
          ...(s.map ? { map: s.map } : {}),
          ...(s.glass ? { transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide } : {}),
        }),
      );
    }
    const m = borrow(
      new MeshStandardMaterial({
        color: tint,
        vertexColors: true,
        roughness: s.roughness,
        metalness: s.metalness,
        envMapIntensity: s.env,
        ...(s.map ? { map: s.map } : {}),
        ...(s.glass ? { transparent: true, opacity: 0.17, depthWrite: false, side: DoubleSide } : {}),
      }),
    );
    glossy.push(m);
    return m;
  };

  // Wood is the corridor's own oak, cloned so it keeps its grain and roughness maps.
  const wood: Lit = donors
    ? (() => {
        const clone = donors.oak.clone();
        clone.vertexColors = true;
        clone.color.multiplyScalar(GAIN.wood);
        borrow(clone);
        if (clone instanceof MeshStandardMaterial) glossy.push(clone);
        return clone;
      })()
    : make({ colour: '#4a3a2c', roughness: 0.8, metalness: 0, env: 0.5 });

  const byChannel: Record<Channel, Material> = {
    wood,
    brass: make({ gain: GAIN.metal, roughness: 0.46, metalness: 1, env: 1.1 }),
    steel: make({ gain: GAIN.metal, roughness: 0.4, metalness: 0.85, env: 1.0 }),
    enamel: make({ gain: GAIN.paint, roughness: 0.34, metalness: 0.02, env: 0.8 }),
    matte: make({ gain: GAIN.paint, roughness: 0.9, metalness: 0, env: 0.3 }),
    print: make({ gain: GAIN.paper, map: atlas, roughness: 0.72, metalness: 0, env: 0.3 }),
    glass: make({ colour: '#d3e4e6', roughness: 0.05, metalness: 0, env: 1.5, glass: true }),
  };

  return {
    byChannel,
    syncEnvironment() {
      const env = donors?.glossy?.envMap ?? null;
      let changed = false;
      for (const m of glossy) {
        if (m.envMap !== env) {
          m.envMap = env;
          m.needsUpdate = true;
          changed = true;
        }
      }
      return changed;
    },
    dispose() {
      for (const m of owned) m.dispose();
      owned.length = 0;
      atlas?.dispose();
    },
  };
}
