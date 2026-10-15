import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type CanvasTexture,
  type WebGLRenderer,
} from 'three';
import { buildEnvironment } from './environment.ts';
import { PALETTE } from './palette.ts';
import {
  drawBlind,
  drawBoardMarked,
  drawConcrete,
  drawEnamelBody,
  drawGrain,
  drawGripWood,
  drawHatchEnamel,
  drawLinoleum,
  drawPaperEdges,
  drawPoolGlow,
  drawShadeInterior,
  drawWood,
} from './textures.ts';

/**
 * Every shared material and the generic textures behind them, created once per scene mount and
 * disposed together. Components receive this object and never allocate materials of their own
 * unless the material is theirs alone.
 */
export interface Materials {
  readonly linoleum: MeshStandardMaterial;
  readonly frame: MeshStandardMaterial;
  readonly steelPanel: MeshStandardMaterial;
  readonly brass: MeshStandardMaterial;
  /** Polished by use: sliding sleeves, rods, the hatch pull. */
  readonly brassWorn: MeshStandardMaterial;
  /** The stamp's turned wooden grip. */
  readonly grip: MeshStandardMaterial;
  /** Machine body paint: vertex-colour shaded so the top sits half a stop below the sides. */
  readonly enamelBody: MeshPhysicalMaterial;
  readonly enamelHatch: MeshPhysicalMaterial;
  readonly springSteel: MeshStandardMaterial;
  readonly platen: MeshStandardMaterial;
  readonly wood: MeshStandardMaterial;
  readonly lacquer: MeshPhysicalMaterial;
  readonly rubber: MeshStandardMaterial;
  readonly felt: MeshStandardMaterial;
  readonly enamel: MeshPhysicalMaterial;
  readonly enamelDark: MeshPhysicalMaterial;
  readonly iron: MeshStandardMaterial;
  readonly lampInside: MeshStandardMaterial;
  readonly bulb: MeshBasicMaterial;
  readonly floor: MeshStandardMaterial;
  readonly pillar: MeshStandardMaterial;
  readonly bezel: MeshStandardMaterial;
  readonly tin: MeshStandardMaterial;
  /** The same tin, rubbed smooth at the ink-pad lid's finger contact. */
  readonly tinWorn: MeshStandardMaterial;
  readonly pencil: MeshStandardMaterial;
  /** Engraved brass nameplate; the machine assigns its map. */
  readonly nameplate: MeshStandardMaterial;
  readonly paperStack: MeshStandardMaterial;
  readonly concreteFrame: MeshStandardMaterial;
  readonly blind: MeshBasicMaterial;
  readonly windowHalo: MeshBasicMaterial;
  readonly boneSheet: MeshStandardMaterial;
  readonly rubberFoot: MeshStandardMaterial;
  readonly anisotropy: number;
  /** Coarse (touch) pointer: smaller shadow maps and a lower pixel-ratio cap. */
  readonly coarse: boolean;
  /**
   * Build the reflection environment and hand it to the metals. Returns the cleanup. Kept
   * separate from creation because a PMREM render target cannot be reused once disposed, and
   * React may mount, unmount and remount an effect.
   */
  bindEnvironment(renderer: WebGLRenderer): () => void;
  dispose(): void;
}

/**
 * Shade the grip beyond what the lights do: a faint cool fresnel rim that lifts it off the dark
 * behind it, and a warm kicker on the lamp side (a narrow band of amber across the knob). Both
 * are emissive terms on this one material, so no light is spent and nothing else is touched.
 */
function addGripShading(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec3 tqwView = normalize(vViewPosition);
        float tqwRim = pow(1.0 - clamp(dot(normalize(normal), tqwView), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(0.11, 0.24, 0.26) * tqwRim * 0.8;
        vec3 tqwWorldNormal = inverseTransformDirection(normalize(normal), viewMatrix);
        float tqwKick = pow(clamp(dot(tqwWorldNormal, normalize(vec3(-0.5, 0.6, -0.25))), 0.0, 1.0), 5.0);
        totalEmissiveRadiance += vec3(1.0, 0.6, 0.28) * tqwKick * 0.26;
      }`,
    );
  };
  material.customProgramCacheKey = () => 'tqw-grip-shading';
}

export function createMaterials(maxAnisotropy: number, coarse: boolean): Materials {
  const anisotropy = Math.min(8, maxAnisotropy);

  const textures: CanvasTexture[] = [];
  const track = (t: CanvasTexture): CanvasTexture => {
    textures.push(t);
    return t;
  };

  const grain = track(drawGrain(256, anisotropy));
  const grainDesk = track(grain.clone());
  grainDesk.repeat.set(7, 3.5);
  const grainEnamel = track(grain.clone());
  grainEnamel.repeat.set(3, 2);

  const desk = drawLinoleum(2048, 1024, anisotropy);
  const linoleum = new MeshStandardMaterial({
    map: track(desk.map),
    roughnessMap: track(desk.roughness),
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    bumpMap: grainDesk,
    bumpScale: 0.35,
  });

  const frame = new MeshStandardMaterial({
    color: PALETTE.steelFrame,
    roughness: 0.52,
    metalness: 0.7,
    envMapIntensity: 0.9,
    lightMapIntensity: 4,
  });
  const steelPanel = new MeshStandardMaterial({
    color: '#2a3034',
    roughness: 0.5,
    metalness: 0.65,
    envMapIntensity: 0.9,
    lightMapIntensity: 4,
  });
  const brass = new MeshStandardMaterial({
    color: PALETTE.brass,
    roughness: 0.35,
    metalness: 0.9,
    envMapIntensity: 1.2,
  });
  const brassWorn = new MeshStandardMaterial({
    color: '#c99c58',
    roughness: 0.2,
    metalness: 0.95,
    envMapIntensity: 1.15,
  });
  // A third less highlight than bright steel: the coils support the grip, they do not compete.
  const springSteel = new MeshStandardMaterial({
    color: '#868a8c',
    roughness: 0.52,
    metalness: 0.85,
    envMapIntensity: 0.62,
  });

  const platen = new MeshStandardMaterial({
    color: '#5f4b2c',
    roughness: 0.5,
    metalness: 0.8,
    envMapIntensity: 0.9,
  });

  const woodTex = track(drawWood(anisotropy, [90, 58, 34]));
  const wood = new MeshStandardMaterial({
    map: woodTex,
    color: '#ffffff',
    roughness: 0.62,
    metalness: 0,
  });
  const lacquer = new MeshPhysicalMaterial({
    color: PALETTE.lacquer,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.1,
  });
  // Satin reddish-brown wood with grain and a worn, oiled band where a hand holds it. A faint cool
  // fresnel rim separates it from the dark behind it; the sheen comes from the lamp, not a coat.
  const grip = new MeshStandardMaterial({
    map: track(drawGripWood(anisotropy)),
    color: '#ffffff',
    roughness: 0.5,
    metalness: 0,
    envMapIntensity: 0.55,
  });
  addGripShading(grip);
  const rubber = new MeshStandardMaterial({ color: '#1e1b1a', roughness: 0.8, metalness: 0 });
  const rubberFoot = new MeshStandardMaterial({ color: '#15100f', roughness: 0.95, metalness: 0 });
  const felt = new MeshStandardMaterial({ color: '#2f6a68', roughness: 1, metalness: 0 });

  // Painted steel, not moulded plastic: a quiet clearcoat, broad reflections and a little drift.
  const enamel = new MeshPhysicalMaterial({
    color: PALETTE.teal,
    roughness: 0.5,
    metalness: 0.12,
    clearcoat: 0.28,
    clearcoatRoughness: 0.5,
    bumpMap: grainEnamel,
    bumpScale: 0.12,
    envMapIntensity: 0.5,
  });
  const paint = drawEnamelBody(anisotropy);
  const enamelBody = new MeshPhysicalMaterial({
    color: PALETTE.teal,
    map: track(paint.map),
    roughnessMap: track(paint.roughness),
    roughness: 0.72,
    metalness: 0.12,
    clearcoat: 0.28,
    clearcoatRoughness: 0.5,
    bumpMap: grainEnamel,
    bumpScale: 0.12,
    vertexColors: true,
    envMapIntensity: 0.5,
  });
  const enamelHatch = new MeshPhysicalMaterial({
    color: '#ffffff',
    map: track(drawHatchEnamel(anisotropy)),
    roughness: 0.5,
    metalness: 0.12,
    clearcoat: 0.28,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.5,
  });
  const enamelDark = new MeshPhysicalMaterial({
    color: '#1d403f',
    roughness: 0.4,
    metalness: 0.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    side: DoubleSide,
    envMapIntensity: 0.9,
    lightMapIntensity: 4,
  });
  const iron = new MeshStandardMaterial({
    color: '#262b2e',
    roughness: 0.5,
    metalness: 0.75,
    envMapIntensity: 1,
  });
  const shadeGradient = track(drawShadeInterior());
  const lampInside = new MeshStandardMaterial({
    map: shadeGradient,
    color: '#ffffff',
    emissive: new Color('#ffffff'),
    emissiveMap: shadeGradient,
    emissiveIntensity: 0.5,
    roughness: 0.7,
    side: DoubleSide,
  });
  const bulb = new MeshBasicMaterial({ color: new Color('#fff1d6').multiplyScalar(2.6), toneMapped: false });

  const floorColor = new Color(PALETTE.floor).multiplyScalar(4.6);
  const floorTex = track(drawConcrete(512, anisotropy));
  floorTex.repeat.set(14, 14);
  const floor = new MeshStandardMaterial({ map: floorTex, color: floorColor, roughness: 0.95, metalness: 0, lightMapIntensity: 64 });

  const pillarTex = track(drawBoardMarked(512, 1024, anisotropy));
  // Dark concrete that still reads: a trace of cool bounce light, patterned by the formwork, so
  // the far office sits a few stops below the working paper instead of vanishing.
  const pillar = new MeshStandardMaterial({
    map: pillarTex,
    color: new Color('#363e45').multiplyScalar(4.4),
    emissive: new Color('#a3acae'),
    emissiveMap: pillarTex,
    emissiveIntensity: 0.56,
    roughness: 0.92,
    metalness: 0,
    lightMapIntensity: 64,
  });
  const concreteFrame = new MeshStandardMaterial({
    map: floorTex,
    color: new Color('#2a3036').multiplyScalar(4.4),
    roughness: 0.9,
    metalness: 0,
  });

  const bezel = new MeshStandardMaterial({ color: '#07090a', roughness: 0.35, metalness: 0.3, envMapIntensity: 0.6 });
  const tin = new MeshStandardMaterial({ color: '#33393c', roughness: 0.42, metalness: 0.85, envMapIntensity: 1 });
  const tinWorn = new MeshStandardMaterial({ color: tin.color, roughness: 0.2, metalness: 0.85, envMapIntensity: 1 });
  const pencil = new MeshStandardMaterial({ color: '#8c6a2f', roughness: 0.55, metalness: 0 });
  const nameplate = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.8, envMapIntensity: 1 });

  const edges = track(drawPaperEdges(anisotropy));
  edges.repeat.set(1, 36);
  const paperStack = new MeshStandardMaterial({
    map: edges,
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    emissive: new Color('#c99a5c'),
    emissiveMap: edges,
    emissiveIntensity: 0.25,
  });
  const boneSheet = new MeshStandardMaterial({ color: PALETTE.bone, roughness: 0.92, metalness: 0, side: DoubleSide });

  const halo = new MeshBasicMaterial({
    map: track(drawPoolGlow()),
    color: new Color(1.0, 0.62, 0.28),
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const blindTex = track(drawBlind());
  const blind = new MeshBasicMaterial({ map: blindTex, color: new Color(1.1, 0.78, 0.46) });

  const materials = [
    linoleum, frame, steelPanel, brass, brassWorn, springSteel, platen, wood, lacquer, grip, rubber, rubberFoot, felt,
    enamel, enamelBody, enamelHatch, enamelDark, iron, lampInside, bulb, floor, pillar, concreteFrame, bezel, tin, pencil, paperStack,
    boneSheet, blind, halo, nameplate, tinWorn,
  ];

  const metals = [
    frame, steelPanel, brass, brassWorn, springSteel, platen, lacquer, grip, enamel, enamelBody, enamelHatch, enamelDark,
    iron, bezel, tin, tinWorn, nameplate,
  ];

  return {
    linoleum, frame, steelPanel, brass, brassWorn, springSteel, platen, wood, lacquer, grip, rubber, felt, enamel,
    enamelBody, enamelHatch, enamelDark,
    iron, lampInside, bulb, floor, pillar, bezel, tin, tinWorn, pencil, nameplate, paperStack, concreteFrame, blind,
    windowHalo: halo, boneSheet, rubberFoot, anisotropy, coarse,
    bindEnvironment(renderer) {
      const environment = buildEnvironment(renderer);
      for (const m of metals) {
        m.envMap = environment.texture;
        m.needsUpdate = true;
      }
      return () => {
        for (const m of metals) {
          m.envMap = null;
          m.needsUpdate = true;
        }
        environment.dispose();
      };
    },
    dispose() {
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
