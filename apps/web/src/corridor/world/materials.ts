import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PointsMaterial,
  SRGBColorSpace,
  Vector2,
  type Material,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { CORRIDOR, LOBBY } from '../layout.ts';
import type { BucketKey } from './buckets.ts';
import { buildEnvironment } from './environment.ts';
import { MAX_LAMPS, packLamps, type Lamp } from './lighting.ts';
import type { Quality } from './quality.ts';
import { patchMaterial, type SharedUniforms } from './shader.ts';
import { gradedColour, loadScan, type ScanId, type ScanSet } from './scanned.ts';
import { drawCoir, drawEnamelWear, drawFelt, drawFrost, drawReeded, drawWired, ENAMEL_WEAR } from './textures/detail.ts';
import { drawRadial, drawRamp, drawSheen, drawWedge, drawWindowBars } from './textures/glow.ts';

/**
 * Every shared material, created once per mount and disposed together. Surface colours are the
 * art direction's hex values: the texture's own mean is divided out, so detail never shifts the
 * average colour. Doors and trim share a few materials and are tinted by vertex colour.
 *
 * The wall plaster, terrazzo, oak, door paint, enamel and brass take their detail from scanned CC0
 * surfaces (scanned.ts). Their maps arrive after the materials exist: `ready` resolves once every
 * scan is applied, and the world draws nothing before that, so no frame is ever drawn, and no
 * program compiled, with a scan half in place.
 */
/** The lit materials: MeshStandard in the full tier, MeshLambert in the lite tier. */
export type LitMaterial = MeshStandardMaterial | MeshLambertMaterial;

export interface WorldMaterials {
  readonly byKey: Readonly<Record<BucketKey, Material>>;
  readonly plaque: LitMaterial;
  readonly numeral: LitMaterial;
  readonly art: LitMaterial;
  readonly glow: MeshBasicMaterial;
  readonly uniforms: SharedUniforms;
  readonly textures: { readonly radial: Texture; readonly wedge: Texture; readonly windowBars: Texture };
  /** A new additive glow material (owned and patched), for pools of light that animate. */
  glowMaterial(map: Texture, colour: Color | string, opacity?: number): MeshBasicMaterial;
  /** A new cut-out paper material (owned, patched, lit) showing `map`; one per clipping so each can catch light alone. */
  paperMaterial(map: Texture): LitMaterial;
  /**
   * A new flat material for the far end's destination (owned): drawn without the fog, so it survives the
   * distance that swallows everything else. Not patched, so it carries no custom shader code.
   */
  beaconMaterial(colour: Color | string, options?: { map?: Texture; additive?: boolean }): MeshBasicMaterial;
  /** A new additive point-sprite material (owned): motes of dust drifting in a lamp's pool. */
  moteMaterial(size: number, colour: Color): PointsMaterial;
  /** A new unlit material (owned and patched): seam light, interior proxies. */
  basicMaterial(colour: Color | string, options?: { opacity?: number; vertexColors?: boolean }): MeshBasicMaterial;
  /** A copy of a lit material with its own emissive channel, for parts that catch more light. */
  litClone(material: LitMaterial): LitMaterial;
  /** Replace the static lamps (nearest the lobby first). */
  setLamps(lamps: readonly Lamp[]): void;
  /** Build the reflection environment and hand it to the glossy materials; returns the cleanup. */
  bindEnvironment(renderer: WebGLRenderer): () => void;
  /**
   * Resolves when every scanned surface is on its material, with the ids that could not be loaded
   * (those materials keep their flat art-direction colour). Never rejects.
   */
  readonly ready: Promise<readonly ScanId[]>;
  /** Give the lettered materials their canvas art. */
  setArt(art: { plaque: Texture; numeral: Texture; art: Texture; lettering: Texture; lettering_orm: Texture; marks: Texture; foliage: Texture }): void;
  /** Track a texture or material created elsewhere so `dispose` frees it with the rest. */
  own<T extends Material | Texture>(item: T): T;
  dispose(): void;
}

/** The Lambert equivalent of a Standard material: colour, map (or the shared white pixel), emissive and blending. */
function lambertFrom(m: MeshStandardMaterial, white: Texture, own: <T extends Material | Texture>(item: T) => T): MeshLambertMaterial {
  const l = own(
    new MeshLambertMaterial({
      color: m.color.clone(),
      map: m.map ?? white,
      vertexColors: m.vertexColors,
      emissive: m.emissive.clone(),
      emissiveMap: m.emissiveMap,
      alphaTest: m.alphaTest,
      alphaToCoverage: m.alphaToCoverage,
      transparent: m.transparent,
      depthWrite: m.depthWrite,
      opacity: m.opacity,
      side: m.side,
      polygonOffset: m.polygonOffset,
      polygonOffsetFactor: m.polygonOffsetFactor,
      polygonOffsetUnits: m.polygonOffsetUnits,
    }),
  );
  m.dispose();
  return l;
}

/** A scan, the material that takes it, the colour its average is graded to, and its relief (normal scale). */
interface ScanTarget {
  readonly id: ScanId;
  readonly materials: readonly LitMaterial[];
  readonly colour: string;
  readonly relief?: number;
}

/** Normal-map strength: plaster is seen raking in the sconce light, where a little relief reads as hand-finished. */
const PLASTER_RELIEF = 0.55;
const PAINT_RELIEF = 1;
/** Multiplier on the terrazzo scan's polished roughness (0.25): the corridor floor is honed, so the pools stay soft. */
export const TERRAZZO_ROUGHNESS = 1.2;
export const WALKED_TERRAZZO_ROUGHNESS = 0.68;

function applyScan(target: ScanTarget, set: ScanSet, own: <T extends Material | Texture>(item: T) => T): void {
  for (const t of [set.albedo, set.normal, set.orm]) if (t) own(t);
  for (const m of target.materials) {
    m.color.copy(gradedColour(target.colour, set.mean));
    m.map = set.albedo;
    if (m instanceof MeshStandardMaterial) {
      if (set.normal) {
        m.normalMap = set.normal;
        m.normalScale.set(target.relief ?? 1, target.relief ?? 1);
      }
      if (set.orm) m.roughnessMap = set.orm;
    }
    m.needsUpdate = true;
  }
}

export function createMaterials(maxAnisotropy: number, coarse: boolean, quality: Quality = 'full'): WorldMaterials {
  const lite = quality === 'lite';
  const anisotropy = lite ? 1 : Math.min(4, maxAnisotropy);
  const owned = new Set<Material | Texture>();
  const own = <T extends Material | Texture>(item: T): T => {
    owned.add(item);
    return item;
  };

  const uniforms: SharedUniforms = {
    tqwLampPos: { value: new Float32Array(MAX_LAMPS * 4) },
    tqwLampCol: { value: new Float32Array(MAX_LAMPS * 4) },
    tqwTail: { value: 0.08 },
    tqwLampCount: { value: 0 },
  };

  const wiredTex = drawWired(anisotropy);
  wiredTex.map.repeat.set(1 / 0.0508, 1 / 0.0508);
  const frostTex = drawFrost(anisotropy);
  frostTex.map.repeat.set(1 / 0.12, 1 / 0.12);
  const coirTex = drawCoir(anisotropy);
  coirTex.map.repeat.set(1 / 0.3, 1 / 0.3);
  const feltTex = drawFelt(anisotropy);
  feltTex.map.repeat.set(1 / 0.3, 1 / 0.3);
  // The Office door's history is its own: where a hand has pushed the lever for fifty years the enamel
  // is polished, at the foot it is scuffed. Only its gloss survives the move to the scan (the scan
  // carries the colour), as a roughness map placed once over the leaf, in door-local metres.
  const wear = lite ? null : drawEnamelWear(anisotropy).rough;
  if (wear) {
    wear.repeat.set(1 / ENAMEL_WEAR.width, 1 / ENAMEL_WEAR.height);
    wear.offset.set(-ENAMEL_WEAR.x0 / ENAMEL_WEAR.width, 0);
    own(wear);
  }
  const reededNormal = drawReeded(anisotropy);
  reededNormal.repeat.set(1 / 0.12, 1);
  const ramp = drawRamp(0.5);
  const radial = drawRadial();
  const sheen = drawSheen();
  const wedge = drawWedge();
  const windowBars = drawWindowBars();
  for (const s of [wiredTex, frostTex, coirTex, feltTex]) {
    own(s.map);
    if (s.rough) own(s.rough);
  }
  for (const t of [reededNormal, ramp, radial, sheen, wedge, windowBars]) own(t);

  const standard = (p: ConstructorParameters<typeof MeshStandardMaterial>[0]) => own(new MeshStandardMaterial({ vertexColors: true, ...p }));

  // The scanned surfaces start as flat colour and take their maps in `applyScans` below; the numbers
  // here are the scans' own: the mean roughness of a scan whose roughness is flat (plaster 0.70,
  // painted timber 0.58, enamel 0.50), a multiplier on the ORM map's green channel otherwise.
  const plaster = standard({ color: CORRIDOR.colours.plaster, roughness: 0.7, metalness: 0 });
  const oak = standard({ color: CORRIDOR.colours.oak, roughness: 1, metalness: 0, envMapIntensity: 0.8 });
  // The scan is polished terrazzo (roughness 0.25); the corridor's floor is honed, which keeps the
  // lamp pools soft. The walked strip is the polished one.
  const terrazzo = standard({ color: CORRIDOR.colours.terrazzo, roughness: TERRAZZO_ROUGHNESS, metalness: 0, envMapIntensity: 0.9 });
  const terrazzoWalk = standard({ color: CORRIDOR.colours.terrazzo, roughness: WALKED_TERRAZZO_ROUGHNESS, metalness: 0, envMapIntensity: 1.05 });
  // The scan's colour is divided out: every brass part carries its own tint in vertex colour (a door's metal is its own).
  const brass = standard({
    color: '#ffffff',
    roughness: 0.34,
    metalness: 1,
    envMapIntensity: 1.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const paint = standard({ color: '#ffffff', roughness: 0.58, metalness: 0, envMapIntensity: 0.6 });
  const enamel = own(
    new MeshPhysicalMaterial({
      vertexColors: true,
      color: '#ffffff',
      // The scan's roughness is flat (0.50); the wear map's own values (about 0.4, polished at the lever) stand in the full tier.
      ...(wear ? { roughnessMap: wear, roughness: 1 } : { roughness: 0.5 }),
      metalness: 0.05,
      // The Office's teal must read as teal under 2700 K light, which starves the blue: the
      // enamel carries a faint glow of its own colour, so the first chromatic event stays teal.
      emissive: new Color('#3C7775').multiplyScalar(0.14),
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.85,
    }),
  );
  const iron = standard({ color: '#3b4042', roughness: 0.55, metalness: 0.75, envMapIntensity: 0.9 });
  // Clear glass over a dark room: near-black, with a trace of cold air in it so the panes read as glass, not holes.
  const glass = standard({ color: '#080b0c', emissive: new Color('#0b1619'), roughness: 0.07, metalness: 0, envMapIntensity: 0.9 });
  // Wired glass is translucent over the mesh: whatever is lit behind it (an open chamber's seam sheet) glows through.
  const wired = standard({ color: '#ffffff', map: wiredTex.map, roughness: 0.2, metalness: 0.15, envMapIntensity: 1.1, transparent: true });
  const frosted = standard({ color: new Color('#9aa5a1'), map: frostTex.map, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
  const reeded = standard({ color: '#0a0e0f', roughness: 0.2, metalness: 0, normalMap: reededNormal, normalScale: new Vector2(1, 1), envMapIntensity: 1.2 });
  const rubber = standard({ color: gradedColour('#5a4430', coirTex.mean), map: coirTex.map, roughness: 1, metalness: 0 });
  const plaque = standard({ color: '#ffffff', roughness: 0.32, metalness: 0, envMapIntensity: 0.7 });
  // Less metal than the brass fittings: the glyph's own colour must read where the lamps barely reach it.
  const numeral = standard({ color: '#ffffff', roughness: 0.38, metalness: 0.35, envMapIntensity: 1.1, alphaTest: 0.5 });
  const art = standard({ color: '#ffffff', roughness: 0.8, metalness: 0, envMapIntensity: 0.2 });
  const lettering = standard({ color: '#ffffff', roughness: 1, metalness: 1, envMapIntensity: 1.5 });
  // Door marks: lit, alpha-blended masks tinted by vertex colour, drawn over the surface they mark.
  const marks = standard({ color: '#ffffff', roughness: 0.88, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  // Foliage: cut-out leaf cards seen from both sides.
  const foliage = standard({ color: '#ffffff', roughness: 0.62, metalness: 0, alphaTest: 0.5, side: DoubleSide });
  const felt = standard({ color: gradedColour(LOBBY.board.felt, feltTex.mean), map: feltTex.map, bumpMap: feltTex.map, bumpScale: 0.6, roughness: 1, metalness: 0 });

  const flatBasic = (p: ConstructorParameters<typeof MeshBasicMaterial>[0]) => own(new MeshBasicMaterial({ vertexColors: true, ...p }));
  const pane = flatBasic({ map: sheen, color: new Color(1.0, 0.72, 0.42).multiplyScalar(0.1), transparent: true, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const glow = flatBasic({ map: radial, color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false });
  // Lamp glass and other self-lit surfaces: unlit, brightness carried in the vertex colour.
  const lamp = flatBasic({ color: '#ffffff' });
  const decal = flatBasic({ map: ramp, color: '#000000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  // The lite tier (software rasterisers): every lit material becomes a MeshLambert with one
  // colour map (a shared white pixel where it has none) and the same vertex colours, lamps and
  // fog. A software GL compiles and runs a Standard program some four times slower than a Lambert
  // one, and the lite tier is about keeping the page responsive, not about reflections. Because
  // they now share a few programs instead of fifteen, first-frame compile time drops with them.
  const white = own(new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
  white.colorSpace = SRGBColorSpace;
  white.needsUpdate = true;
  const finish = (m: MeshStandardMaterial): LitMaterial => (lite ? lambertFrom(m, white, own) : m);
  const L = {
    plaster: finish(plaster),
    oak: finish(oak),
    terrazzo: finish(terrazzo),
    terrazzoWalk: finish(terrazzoWalk),
    brass: finish(brass),
    paint: finish(paint),
    enamel: finish(enamel),
    iron: finish(iron),
    glass: finish(glass),
    wired: finish(wired),
    frosted: finish(frosted),
    reeded: finish(reeded),
    rubber: finish(rubber),
    plaque: finish(plaque),
    numeral: finish(numeral),
    art: finish(art),
    lettering: finish(lettering),
    felt: finish(felt),
    marks: finish(marks),
    foliage: finish(foliage),
  };
  const mode = lite ? 'lambert' : 'lit';
  for (const m of Object.values(L)) patchMaterial(m, uniforms, mode);
  patchMaterial(decal, uniforms, 'flat');
  patchMaterial(lamp, uniforms, 'flat');
  patchMaterial(pane, uniforms, 'additive');
  patchMaterial(glow, uniforms, 'additive');

  const glossy: MeshStandardMaterial[] = [oak, terrazzo, terrazzoWalk, brass, paint, enamel, iron, glass, wired, frosted, reeded, plaque, numeral, lettering];

  // Which material takes which scan, graded to which colour, with how much relief. The lite tier's
  // Lambert materials take the albedo only (scanned.ts asks the lite tier for nothing else).
  const targets: readonly ScanTarget[] = [
    { id: 'plaster-worn', materials: [L.plaster], colour: CORRIDOR.colours.plaster, relief: PLASTER_RELIEF },
    { id: 'oak-panelling', materials: [L.oak], colour: CORRIDOR.colours.oak },
    { id: 'terrazzo', materials: [L.terrazzo, L.terrazzoWalk], colour: CORRIDOR.colours.terrazzo },
    { id: 'painted-timber', materials: [L.paint], colour: '#ffffff', relief: PAINT_RELIEF },
    { id: 'enamel-steel', materials: [L.enamel], colour: '#ffffff' },
    { id: 'brass', materials: [L.brass], colour: '#ffffff' },
  ];
  let disposed = false;
  const ready: Promise<readonly ScanId[]> = Promise.all(
    targets.map(async (target): Promise<ScanId | null> => {
      try {
        const set = await loadScan(target.id, { lite, coarse, anisotropy });
        if (disposed) {
          for (const t of [set.albedo, set.normal, set.orm]) t?.dispose();
          return null;
        }
        applyScan(target, set, own);
        return null;
      } catch {
        // The material keeps its flat art-direction colour; `ready` names it so the page can say so.
        return target.id;
      }
    }),
  ).then((failed) => failed.filter((id): id is ScanId => id !== null));

  const byKey: Record<BucketKey, Material> = {
    ...L,
    pane,
    glow,
    lamp,
    decal,
  };

  const glowMaterial = (map: Texture, colour: Color | string, opacity = 1): MeshBasicMaterial => {
    const m = own(new MeshBasicMaterial({ map, color: colour, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    patchMaterial(m, uniforms, 'additive');
    return m;
  };
  const beaconMaterial = (colour: Color | string, options: { map?: Texture; additive?: boolean } = {}): MeshBasicMaterial =>
    own(
      new MeshBasicMaterial({
        color: colour,
        fog: false,
        ...(options.map ? { map: options.map } : {}),
        ...(options.additive ? { transparent: true, blending: AdditiveBlending, depthWrite: false } : {}),
      }),
    );
  const moteMaterial = (size: number, colour: Color): PointsMaterial =>
    own(new PointsMaterial({ size, sizeAttenuation: true, map: radial, color: colour, transparent: true, opacity: 1, depthWrite: false, blending: AdditiveBlending }));
  const basicMaterial = (colour: Color | string, options: { opacity?: number; vertexColors?: boolean } = {}): MeshBasicMaterial => {
    const m = own(new MeshBasicMaterial({ color: colour, transparent: options.opacity !== undefined, opacity: options.opacity ?? 1, vertexColors: options.vertexColors ?? false }));
    patchMaterial(m, uniforms, 'flat');
    return m;
  };
  const paperMaterial = (map: Texture): LitMaterial => {
    const m: LitMaterial = own(
      lite
        ? new MeshLambertMaterial({ map, color: '#ffffff', alphaTest: 0.5, alphaToCoverage: true, emissive: new Color(0, 0, 0), emissiveMap: map })
        : new MeshStandardMaterial({ map, color: '#ffffff', roughness: 0.92, metalness: 0, alphaTest: 0.5, alphaToCoverage: true, emissive: new Color(0, 0, 0), emissiveMap: map }),
    );
    patchMaterial(m, uniforms, mode);
    return m;
  };
  const litClone = (material: LitMaterial): LitMaterial => {
    const m = own(material.clone());
    patchMaterial(m, uniforms, mode);
    if (m instanceof MeshStandardMaterial && material instanceof MeshStandardMaterial) {
      if (material.envMap) m.envMap = material.envMap;
      glossy.push(m);
    }
    return m;
  };

  return {
    byKey,
    textures: { radial, wedge, windowBars },
    moteMaterial,
    beaconMaterial,
    glowMaterial,
    basicMaterial,
    paperMaterial,
    litClone,
    plaque: L.plaque,
    numeral: L.numeral,
    art: L.art,
    glow,
    uniforms,
    setLamps(lamps) {
      const packed = packLamps(lamps);
      uniforms.tqwLampPos.value.set(packed.position);
      uniforms.tqwLampCol.value.set(packed.colour);
      uniforms.tqwLampCount.value = Math.min(lamps.length, MAX_LAMPS);
    },
    bindEnvironment(renderer) {
      // No reflection environment in the lite tier: PMREM filtering is itself a GPU cost.
      if (lite) return () => undefined;
      const environment = buildEnvironment(renderer);
      for (const m of glossy) {
        m.envMap = environment.texture;
        m.needsUpdate = true;
      }
      return () => {
        for (const m of glossy) {
          m.envMap = null;
          m.needsUpdate = true;
        }
        environment.dispose();
      };
    },
    setArt(textures) {
      L.plaque.map = own(textures.plaque);
      L.numeral.map = own(textures.numeral);
      L.art.map = own(textures.art);
      L.lettering.map = own(textures.lettering);
      // Gold leaf is metal; only the full tier has a metalness map to say so.
      if (L.lettering instanceof MeshStandardMaterial) {
        L.lettering.metalnessMap = own(textures.lettering_orm);
        L.lettering.roughnessMap = textures.lettering_orm;
      } else own(textures.lettering_orm);
      L.marks.map = own(textures.marks);
      L.foliage.map = own(textures.foliage);
      for (const m of [L.plaque, L.numeral, L.art, L.lettering, L.marks, L.foliage]) m.needsUpdate = true;
    },
    ready,
    own,
    dispose() {
      disposed = true;
      for (const item of owned) item.dispose();
      owned.clear();
    },
  };
}
