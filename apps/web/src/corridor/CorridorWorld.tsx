import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CorridorProps } from './world/props/CorridorProps.tsx';
import { AmbientDirector, AmbientLife } from './world/ambient/AmbientLife.tsx';
import { WORLD_UPDATERS } from './world/ambient/useWorldAmbient.ts';
import type { AmbientScheduler } from './world/ambient/schedule.ts';
import { useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, Fog, PerspectiveCamera, Vector3, type BufferGeometry, type HemisphereLight } from 'three';
import { CORRIDOR } from './layout.ts';
import type { CorridorWorldProps } from './types.ts';
import { Board } from './world/Board.tsx';
import { bucketGeometries, type BucketKey } from './world/buckets.ts';
import { buildWorld } from './world/build.ts';
import { ChamberDoor, DOOR_UPDATERS } from './world/ChamberDoor.tsx';
import { kelvinToLinear } from './world/colour.ts';
import { Fixtures } from './world/Fixtures.tsx';
import { buildLamps, DEFAULT_LAMP_TUNING, type LampTuning } from './world/lighting.ts';
import { createMaterials, type WorldMaterials } from './world/materials.ts';
import { chooseQuality, LITE_PIXEL_RATIO, rendererName } from './world/quality.ts';
import { holeOf } from './world/openings.ts';
import { FILL_KELVIN, GROUND_KELVIN } from './world/palette.ts';
import { loadFonts } from './world/textures/canvas.ts';
import { FOG_COLOUR } from './world/fog.ts';
import { Beacon } from './world/Beacon.tsx';
import { makeArt } from './world/textures/index.ts';

/**
 * The lobby and corridor: Edwardian administrative architecture of about 1910, adapted for a
 * century. Everything static is built once as merged geometry (one mesh per shared material), lit
 * by static analytic lamps and one weak ambient light, and fogged by the contract's curve. See
 * `world/` for the parts; this component only assembles them and owns their lifetime.
 */

// Start fetching the canvas fonts as soon as this chunk loads, in parallel with the texture
// painting, so the lettering is ready by the time the materials are.
void loadFonts();

/**
 * The 4300 K ambient fill: the only real light in the scene, and what restores colour. Under
 * 2700 K sconces alone every paint is pulled toward amber; a cooler, weak fill lets teal, aubergine
 * and oxblood read as themselves (ADR 0004: restore colour with the fill, not with more saturated
 * paint). Judged in captured frames, not swatches: at 1.3 the doors' own colours separate while the
 * piers, upper walls and ceiling still fall into the dark (darkness.ts); at 3.5 and over it reads as
 * daylight and the value bands are lost.
 */
const AMBIENT = {
  sky: new Color(...kelvinToLinear(FILL_KELVIN)),
  ground: new Color(...kelvinToLinear(GROUND_KELVIN)).multiplyScalar(0.55),
  intensity: 1.7,
};

/** Blended layers draw after the opaque world, in this order: shadows, then panes, then glows. */
const RENDER_ORDER: Partial<Record<BucketKey, number>> = { decal: 1, marks: 1, pane: 2, glow: 3 };

/**
 * Reserved for the look lane's light haze (founder direction: layers of darkness and a little
 * smoke). A haze layer should be additive or alpha-blended, never write depth, and take this
 * render order so it draws over the glows. The world leaves it the room it needs: the fog already
 * stays a warm brown to the end (fog.ts) and the plaster, ceiling and cornice carry baked value
 * bands (darkness.ts), so a haze has something to veil. Nothing here draws it.
 */
export const HAZE_RENDER_ORDER = 4;

/** True once the web fonts the canvas lettering needs have loaded. Never rejects. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadFonts().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

export function CorridorWorld({ animation, reducedMotion, onDoorPointer, onClipping, propAnimation, onPropPointer }: CorridorWorldProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const fontsReady = useFontsReady();

  const world = useMemo(() => buildWorld(), []);
  const geometries = useMemo(() => bucketGeometries(world.buckets), [world]);
  const quality = useMemo(() => chooseQuality(rendererName(gl.getContext()), window.location.search), [gl]);
  const materials = useMemo(() => createMaterials(gl.capabilities.getMaxAnisotropy(), window.matchMedia('(pointer: coarse)').matches, quality), [gl, quality]);
  // A software rasteriser draws a frame in about a second: render fewer pixels of it.
  const setDpr = useThree((s) => s.setDpr);
  useLayoutEffect(() => {
    if (quality === 'lite') setDpr(LITE_PIXEL_RATIO);
  }, [quality, setDpr]);
  // Lettered art waits for the fonts; the canvases are drawn once and owned by the materials.
  const art = useMemo(() => {
    if (!fontsReady) return null;
    const set = makeArt(world.plaques, world.marks, Math.min(8, gl.capabilities.getMaxAnisotropy()));
    materials.setArt({ plaque: set.plaque, numeral: set.numeral, art: set.art, lettering: set.lettering, lettering_orm: set.lettering_orm, marks: set.marks, foliage: set.foliage });
    materials.own(set.clippings);
    return set;
  }, [fontsReady, world, materials, gl]);

  // Locked exposure: ACES at 1, as in the Office. No automatic exposure, no flicker.
  useLayoutEffect(() => {
    const previous = { mapping: gl.toneMapping, exposure: gl.toneMappingExposure };
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    // The scene may already carry the contract's fog (CorridorScene attaches it). The world paints
    // its own warm one over it (fog.ts) and puts the previous colour back on the way out.
    const hadFog = scene.fog !== null;
    const hadBackground = scene.background !== null;
    const previousFog = scene.fog instanceof Fog ? scene.fog.color.clone() : null;
    const previousBackground = scene.background instanceof Color ? scene.background.clone() : null;
    if (scene.fog instanceof Fog) scene.fog.color.set(FOG_COLOUR);
    else if (!hadFog) scene.fog = new Fog(FOG_COLOUR, CORRIDOR.fog.near, CORRIDOR.fog.far);
    if (scene.background instanceof Color) scene.background.set(FOG_COLOUR);
    else if (!hadBackground) scene.background = new Color(FOG_COLOUR);
    invalidate();
    return () => {
      gl.toneMapping = previous.mapping;
      gl.toneMappingExposure = previous.exposure;
      if (!hadFog) scene.fog = null;
      else if (previousFog && scene.fog instanceof Fog) scene.fog.color.copy(previousFog);
      if (!hadBackground) scene.background = null;
      else if (previousBackground && scene.background instanceof Color) scene.background.copy(previousBackground);
    };
  }, [gl, scene, invalidate]);

  useLayoutEffect(() => {
    materials.setLamps(world.lamps);
    const unbind = materials.bindEnvironment(gl);
    invalidate();
    return unbind;
  }, [materials, world, gl, invalidate]);

  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g.dispose();
    },
    [geometries],
  );
  useEffect(() => () => materials.dispose(), [materials]);

  const hemisphere = useRef<HemisphereLight>(null);
  const scheduler = useRef<AmbientScheduler | null>(null);
  // A phone spends its frames on the lobby; a heat shimmer is for pointer devices.
  const desktop = useMemo(() => !window.matchMedia('(pointer: coarse)').matches, []);
  useDevHook(world.triangles, animation, materials, (t) => {
    if (t.fog && scene.fog) {
      scene.fog.color.set(t.fog);
      if (scene.background) (scene.background as Color).set(t.fog);
    }
    const doorLamps = world.places.flatMap((p) => {
      const lamp = p.spec.character?.lamp;
      return lamp && !p.far ? [{ key: p.key, side: p.side, z: p.z, top: holeOf(p.spec).height, kelvin: lamp.kelvin, strength: lamp.strength }] : [];
    });
    materials.setLamps(buildLamps(doorLamps, { ...DEFAULT_LAMP_TUNING, ...t }));
    if (t.tail !== undefined) materials.uniforms.tqwTail.value = t.tail;
    const h = hemisphere.current;
    if (!h) return;
    if (t.ambient !== undefined) h.intensity = t.ambient;
    if (t.sky) h.color.set(t.sky);
    if (t.ground) h.groundColor.set(t.ground);
  });

  // Tell the page (and tests) the world is drawn: the canvas is marked once the lettering exists.
  useEffect(() => {
    if (!art) return;
    const canvas = gl.domElement;
    canvas.dataset['world'] = 'ready';
    invalidate();
    return () => {
      delete canvas.dataset['world'];
    };
  }, [art, gl, invalidate]);

  // Nothing is drawn until the lettering can be: the DOM landing covers the short wait.
  if (!art) return null;

  const entries = Object.entries(geometries) as [BucketKey, BufferGeometry][];
  return (
    <group dispose={null}>
      <hemisphereLight ref={hemisphere} args={[AMBIENT.sky, AMBIENT.ground, AMBIENT.intensity]} />
      {entries.map(([key, geometry]) => (
        <mesh key={key} name={key} geometry={geometry} material={materials.byKey[key]} renderOrder={RENDER_ORDER[key] ?? 0} />
      ))}
      <Fixtures materials={materials} />
      <Beacon materials={materials} />
      {world.chamberDoors.map((door) => (
        <ChamberDoor key={door.placement.key} door={door} materials={materials} animation={animation} reducedMotion={reducedMotion} onPointer={onDoorPointer} />
      ))}
      <Board materials={materials} atlas={art.clippings} onClipping={onClipping} reducedMotion={reducedMotion} />
      <CorridorProps animation={propAnimation} reducedMotion={reducedMotion} onPointer={onPropPointer} />
      <AmbientLife materials={materials} reducedMotion={reducedMotion} scheduler={scheduler} desktop={desktop} />
      <AmbientDirector reducedMotion={reducedMotion} desktop={desktop} scheduler={scheduler} />
    </group>
  );
}

type DevTune = Partial<LampTuning> & { ambient?: number; sky?: string; ground?: string; tail?: number; fog?: string };

/**
 * Development only: expose the renderer, scene and camera on `window.__tqwA1` so a screenshot
 * script can place the camera and read the render counters. Stripped from production builds.
 */
function useDevHook(triangles: number, animation: CorridorWorldProps['animation'], materials: WorldMaterials, tune: (t: DevTune) => void): void {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setFrameloop = useThree((s) => s.setFrameloop);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const render = () => {
      for (const update of DOOR_UPDATERS) update();
      for (const update of WORLD_UPDATERS) update();
      gl.info.reset();
      gl.render(scene, camera);
      const lights: string[] = [];
      scene.traverse((o) => {
        if ((o as { isLight?: boolean }).isLight) lights.push(o.type);
      });
      return {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        lights,
        programs: gl.info.programs?.length ?? 0,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        worldTriangles: triangles,
      };
    };
    const hook = {
      /** The live door animation, so a script can pose a door (open, handle, rattle, attention). */
      animation,
      /** Stop the render loop so a scripted camera pose stays put (the camera rig would otherwise re-apply its own). */
      freeze() {
        setFrameloop('never');
      },
      /** The scene and the shared materials, for look-development and disposal checks. */
      scene,
      materials,
      /** Draw one frame now, applying the posed door animation first, and return the counters. */
      render,
      /** Place the camera (yaw and pitch in degrees) and draw: the stub camera is bypassed. */
      setCam(x: number, y: number, z: number, yawDeg = 0, pitchDeg = 0, fov?: number) {
        const cam = camera as PerspectiveCamera;
        cam.position.set(x, y, z);
        cam.rotation.order = 'YXZ';
        cam.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0);
        if (fov) cam.fov = fov;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);
        return render();
      },
      /** Screen pixels (CSS) of a world point under the current camera, for scripted clicks. */
      project(x: number, y: number, z: number) {
        const v = new Vector3(x, y, z).project(camera);
        const size = gl.domElement.getBoundingClientRect();
        return { x: size.left + ((v.x + 1) / 2) * size.width, y: size.top + ((1 - v.y) / 2) * size.height, depth: v.z };
      },
      /** Try lamp and ambient settings without a rebuild. */
      tune(t: DevTune) {
        tune(t);
        return render();
      },
      /** Show or hide every mesh that uses one shared material (baked or on a door), to isolate what a pixel belongs to. */
      setMaterialVisible(key: BucketKey, visible: boolean) {
        scene.traverse((o) => {
          if ((o as { isMesh?: boolean }).isMesh && (o as { material?: unknown }).material === materials.byKey[key]) o.visible = visible;
        });
        return render();
      },
      /** Show or hide one material's merged mesh, to isolate what a pixel belongs to. */
      setVisible(name: string, visible: boolean) {
        scene.traverse((o) => {
          if (o.name === name) o.visible = visible;
        });
        return render();
      },
    };
    (window as unknown as { __tqwA1?: typeof hook }).__tqwA1 = hook;
    return () => {
      delete (window as unknown as { __tqwA1?: typeof hook }).__tqwA1;
    };
  }, [gl, scene, camera, setFrameloop, triangles, animation, materials, tune]);
}
