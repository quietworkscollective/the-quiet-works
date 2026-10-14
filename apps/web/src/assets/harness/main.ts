// A small page for looking at the library under the site's real Content-Security-Policy. It is not
// part of the app: scripts/assets/harness builds it on its own, and the CSP proof and the contact
// sheets drive it with Playwright.
//
//   ?view=single&id=<model or surface id>     one asset, larger
//   ?view=models                              every model at standing scale, one cell each
//   ?view=surfaces                            every surface on a 2 m panel plus a sphere
//
// It records `securitypolicyviolation` events from the first script on and exposes the result on
// `window.__harness` for the tests.
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { allEntries, getEntry, loadModel, surface, tileRepeat } from '../index.ts';
import type { SurfaceHandle } from '../index.ts';
import { type HooksProbe, mountHooksProbe } from './hooks.ts';
import { collectResources } from '../dispose.ts';
import type { ModelEntry, SurfaceEntry } from '../types.ts';

interface Violation {
  readonly directive: string;
  readonly blocked: string;
}

interface HarnessState {
  violations: Violation[];
  errors: string[];
  ready: Promise<void>;
  /** Per cell, the share of pixels the asset itself covers (floor hidden): 0 means nothing drew. */
  coverage: number[];
  /** Decoded image sizes of the first model's textures: proves the embedded WebP maps loaded. */
  textures: { name: string; width: number; height: number }[];
  triangles: number;
  /** Releases every handle and returns how many there were. */
  releaseAll: () => number;
  /** Live GPU objects the renderer holds (three's own count). */
  gpu: () => { geometries: number; textures: number };
  /** What `gpu()` reported once the renderer and its environment existed, before any asset loaded. */
  baseline: { geometries: number; textures: number };
  /** The React hooks probe (view=hooks): unmount() runs the hooks' cleanups. */
  hooks?: HooksProbe;
}

declare global {
  interface Window {
    __harness: HarnessState;
  }
}

const state: HarnessState = { violations: [], errors: [], ready: Promise.resolve(), coverage: [], textures: [], triangles: 0, releaseAll: () => 0, gpu: () => ({ geometries: 0, textures: 0 }), baseline: { geometries: 0, textures: 0 } };
window.__harness = state;

document.addEventListener('securitypolicyviolation', (event) => {
  state.violations.push({ directive: event.violatedDirective, blocked: event.blockedURI });
});
window.addEventListener('error', (event) => state.errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => state.errors.push(String(event.reason)));

/** Indexing helper: a missing element is a harness bug, not something to carry as undefined. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`harness: missing ${what}`);
  return value;
}

const labels = (): HTMLElement => must(document.getElementById('labels'), '#labels');

const CLEAR = new Color(0x3a352f);
const params = new URLSearchParams(location.search);
const COLUMNS = 6;
const CELL = 320;
const LABEL = 40;

interface Grid {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly width: number;
  readonly height: number;
  /** Positions a cell: sets the viewport and scissor, and returns its top-left in CSS pixels. */
  cell(index: number): { x: number; y: number };
}

function makeGrid(count: number, columns: number, cell: number, labelHeight: number): Grid {
  const cols = Math.min(columns, count);
  const rows = Math.ceil(count / cols);
  const width = cols * cell;
  const height = rows * (cell + labelHeight);
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(CLEAR);
  renderer.setScissorTest(true);
  document.body.appendChild(renderer.domElement);
  state.gpu = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  labels().style.width = `${width}px`;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();
  room.dispose();
  // Neutral warm light: a warm key, a cooler weak fill, a dim ground bounce. No shadow maps.
  scene.add(new HemisphereLight(0xfff0dc, 0x6a5e50, 0.55));
  const key = new DirectionalLight(0xffe2b8, 2.4);
  key.position.set(-2, 3.2, 2.6);
  const fill = new DirectionalLight(0xc8d4ff, 0.5);
  fill.position.set(3, 1.5, 1);
  scene.add(key, fill, new AmbientLight(0xffffff, 0.12));
  state.baseline = state.gpu();

  return {
    renderer,
    scene,
    width,
    height,
    cell(index) {
      const x = (index % cols) * cell;
      const y = Math.floor(index / cols) * (cell + labelHeight);
      renderer.setViewport(x, height - y - cell, cell, cell);
      renderer.setScissor(x, height - y - cell, cell, cell);
      return { x, y };
    },
  };
}

function addLabel(x: number, y: number, lines: string[]): void {
  const div = document.createElement('div');
  div.className = 'cell-label';
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  div.style.width = `${CELL}px`;
  div.textContent = lines.join('\n');
  labels().appendChild(div);
}

/** Share of pixels in a cell that differ from the clear colour. */
function coverageOf(grid: Grid, x: number, y: number, size: number): number {
  const gl = grid.renderer.getContext();
  const pixels = new Uint8Array(size * size * 4);
  gl.readPixels(x, grid.height - y - size, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const clear = CLEAR.clone().convertLinearToSRGB();
  const [r, g, b] = [Math.round(clear.r * 255), Math.round(clear.g * 255), Math.round(clear.b * 255)];
  let different = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.abs(must(pixels[i]) - r) + Math.abs(must(pixels[i + 1]) - g) + Math.abs(must(pixels[i + 2]) - b) > 24) different += 1;
  }
  return different / (size * size);
}

function frame(camera: PerspectiveCamera, box: Box3): void {
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const radius = Math.max(size.length() / 2, 0.02);
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
  const azimuth = 0.62;
  const elevation = 0.3;
  camera.position.set(centre.x + Math.sin(azimuth) * Math.cos(elevation) * distance, centre.y + Math.sin(elevation) * distance, centre.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
  camera.near = distance / 50;
  camera.far = distance * 12;
  camera.aspect = 1;
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
}

/** A floor and a metre-or-decimetre grid sized to the object, so a cell reads as "standing on the ground". */
function floorFor(box: Box3): Object3D[] {
  const extent = Math.max(...box.getSize(new Vector3()).toArray(), 0.05);
  const step = extent > 0.8 ? 0.5 : extent > 0.25 ? 0.1 : 0.05;
  const half = Math.ceil((extent * 1.6) / step / 2) * step;
  const floor = new Mesh(new PlaneGeometry(half * 8, half * 8).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x5a544b, roughness: 0.92 }));
  const grid = new GridHelper(half * 2, (half * 2) / step, 0x8a8174, 0x6c6459);
  // A few millimetres below the object's base, so thin sheets lying on the floor do not z-fight it.
  floor.position.y = -0.004;
  grid.position.y = -0.003;
  return [floor, grid];
}

function discard(objects: Object3D[]): void {
  for (const object of objects) {
    object.removeFromParent();
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    (mesh.material as MeshStandardMaterial | undefined)?.dispose();
  }
}

async function showModels(ids: string[], single: boolean): Promise<void> {
  const cell = single ? 640 : CELL;
  const grid = makeGrid(ids.length, COLUMNS, cell, single ? 0 : LABEL);
  const camera = new PerspectiveCamera(28, 1, 0.01, 50);
  const handles = await Promise.all(ids.map((id) => loadModel(id)));
  for (const handle of handles) {
    handle.object.visible = false;
    grid.scene.add(handle.object);
    handle.object.updateMatrixWorld(true);
  }
  state.triangles = ids.reduce((sum, id) => sum + (getEntry(id) as ModelEntry).triangles, 0);
  state.textures = [...collectResources(must(handles[0]).object).textures].map((t) => {
    const image = t.image as { width?: number; height?: number } | null;
    return { name: t.name, width: image?.width ?? 0, height: image?.height ?? 0 };
  });

  ids.forEach((id, i) => {
    const handle = must(handles[i]);
    handle.object.visible = true;
    const box = new Box3().setFromObject(handle.object);
    frame(camera, box);
    const { x, y } = grid.cell(i);
    // First the asset alone, to measure what it covers; then again on its floor, for the picture.
    grid.renderer.render(grid.scene, camera);
    state.coverage.push(coverageOf(grid, x, y, cell));
    const floor = floorFor(box);
    grid.scene.add(...floor);
    grid.renderer.render(grid.scene, camera);
    discard(floor);
    handle.object.visible = false;
    if (!single) {
      const entry = getEntry(id) as ModelEntry;
      const [w, h, d] = entry.dimensions;
      addLabel(x, y + cell, [id, `${w.toFixed(2)} x ${d.toFixed(2)} x ${h.toFixed(2)} m   ${entry.triangles} tris   ${(entry.compressedBytes / 1024).toFixed(0)} kB`]);
    }
  });
  // Leave the last one showing in single view.
  if (single) must(handles[0]).object.visible = true;
  state.releaseAll = () => {
    for (const handle of handles) handle.release();
    return handles.length;
  };
}

async function showSurfaces(ids: string[], single: boolean): Promise<void> {
  const cell = single ? 640 : CELL;
  const grid = makeGrid(ids.length, COLUMNS, cell, single ? 0 : LABEL);
  // A raking key from the side makes the normal maps read.
  const rake = new DirectionalLight(0xfff0dc, 2.8);
  rake.position.set(-3, 0.6, 1.2);
  grid.scene.add(rake);
  const camera = new PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0.9, 0.5, 5.2);
  camera.lookAt(0, 0, 0);
  const handles: SurfaceHandle[] = [];
  const items = ids.map((id) => {
    const panel = surface(id, { repeat: tileRepeat(id, 2, 2) });
    const ball = surface(id, { repeat: tileRepeat(id, 1.88, 0.94) });
    handles.push(panel, ball);
    return { id, entry: getEntry(id) as SurfaceEntry, panel, ball };
  });
  await Promise.all(items.flatMap((item) => [item.panel.ready, item.ball.ready]));
  const panelGeometry = new PlaneGeometry(2, 2);
  const panelMesh = new Mesh(panelGeometry);
  const ballGeometry = new SphereGeometry(0.3, 48, 32);
  const ballMesh = new Mesh(ballGeometry);
  ballMesh.position.set(0.55, -0.45, 0.35);
  grid.scene.add(panelMesh, ballMesh);
  items.forEach((item, i) => {
    panelMesh.material = item.panel.material;
    ballMesh.material = item.ball.material;
    const { x, y } = grid.cell(i);
    grid.renderer.render(grid.scene, camera);
    state.coverage.push(coverageOf(grid, x, y, cell));
    if (!single) addLabel(x, y + cell, [item.id, `${item.entry.texelsPerMetre} px/m   tile ${item.entry.tileMetres} m   ${(item.entry.compressedBytes / 1024).toFixed(0)} kB`]);
  });
  state.releaseAll = () => {
    for (const handle of handles) handle.release();
    panelGeometry.dispose();
    ballGeometry.dispose();
    return handles.length;
  };
}

async function showHooks(): Promise<void> {
  const grid = makeGrid(1, 1, 480, 0);
  const camera = new PerspectiveCamera(35, 1, 0.05, 30);
  camera.position.set(1.6, 1.6, 3.4);
  camera.lookAt(0, 0.8, -0.4);
  grid.cell(0);
  const probe = mountHooksProbe(grid.scene, () => grid.renderer.render(grid.scene, camera));
  state.hooks = probe;
  await probe.ready;
  state.releaseAll = () => {
    probe.unmount();
    return 1;
  };
}

function start(): Promise<void> {
  const view = params.get('view') ?? 'single';
  if (view === 'hooks') return showHooks();
  const id = params.get('id');
  if (view === 'single' && id) {
    const entry = getEntry(id);
    if (!entry) throw new Error(`no asset "${id}"`);
    return entry.kind === 'model' ? showModels([id], true) : showSurfaces([id], true);
  }
  const wanted = view === 'surfaces' ? 'surface' : 'model';
  const ids = allEntries().filter((entry) => entry.kind === wanted).map((entry) => entry.id);
  return wanted === 'surface' ? showSurfaces(ids, false) : showModels(ids, false);
}

state.ready = start().catch((error: unknown) => {
  state.errors.push(String(error instanceof Error ? (error.stack ?? error.message) : error));
});
