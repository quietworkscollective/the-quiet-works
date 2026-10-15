import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, type Camera, type Scene, type WebGLRenderer } from 'three';
import { applyPose } from '../../firstPerson/three.ts';
import { CORRIDOR, LOBBY } from '../layout.ts';
import { CORRIDOR_START_Z } from '../world/architecture/corridor.ts';
import { ENTRANCE_DOORS, INNER_DOORS } from '../world/doorKit/lobbyDoors.ts';
import { FRAME, WALL_OVERLAP } from '../world/doorKit/frame.ts';
import { holeFor } from '../world/doorKit/plan.ts';
import type { View } from './framing.ts';

/**
 * The hole probe (ADR 0007): a test-only way to ask whether anything is drawn everywhere the visitor
 * can look. Rooms may use a bounded stage, while the corridor and lobby are built around a free-look
 * visitor; an empty patch of the screen is a hole.
 *
 * It is off unless the page is opened with `?tqw-debug=holes`. Then `window.__tqwProbe` can place
 * the camera at any view, draw one frame off the usual loop with the scene's background magenta
 * (the fog stays the corridor's colour, so a distant wall fogs to its own tint, not to magenta),
 * and count the pixels nothing drew. The background is set for that one frame and put back, so the
 * world is free to paint its own; the probe reads and writes nothing else, and never changes the
 * director's pose. It draws the scene itself, not through the finishing stack, which does not
 * change what is covered.
 */

export const PROBE_PARAM = 'tqw-debug';
export const PROBE_VALUE = 'holes';
/** The clear colour while probing: no art in the corridor is this colour. */
export const PROBE_CLEAR = '#ff00ff';
const CLEAR = new Color(PROBE_CLEAR);
/** Baked corridor positions can move by up to 13 mm; keep expected-face masks beyond that. */
const MASK_DEPTH = 0.03;

export const probeRequested = (search: string = typeof window === 'undefined' ? '' : window.location.search): boolean =>
  new URLSearchParams(search).get(PROBE_PARAM) === PROBE_VALUE;

/** What one probed frame found. */
export interface ProbeFrame {
  /** Pixels that are the magenta clear colour: nothing drew there. */
  magenta: number;
  pixels: number;
  /** The first magenta pixel (x from the left, y from the top), for finding it in a screenshot. */
  first: [number, number] | null;
  /** The renderer's draw calls and triangles for this frame. */
  calls: number;
  triangles: number;
}

export interface ProbeApi {
  /** How far either side of forward the director lets the view turn now, in degrees. */
  limit(): number;
  /** The picture's size in device pixels. */
  size(): { width: number; height: number };
  /** Draws one frame from `view` and counts the magenta pixels. */
  frame(view: View): ProbeFrame;
  /** Draws one frame from `view` and returns it as a PNG data URL, for finding a hole by eye. */
  image(view: View): string;
  /** Draws every view, and reports the frames with holes (and the totals). */
  sweep(views: readonly View[]): ProbeSweep;
  /** What the renderer holds: geometries and textures. */
  memory(): { geometries: number; textures: number };
  /** Releases the probe-only coverage surfaces when the owning camera unmounts. */
  dispose(): void;
}

export interface ProbeSweep {
  drawn: number;
  /** The reduced drawing-buffer size used for the sweep. */
  size: { width: number; height: number };
  holes: { index: number; magenta: number; first: [number, number] | null }[];
  maxCalls: number;
  maxTriangles: number;
}

declare global {
  interface Window {
    __tqwProbe?: ProbeApi;
  }
}

/** True for the magenta clear colour (exact, with a little slack for the output's rounding). */
const isClear = (r: number, g: number, b: number): boolean => r >= 250 && g <= 6 && b >= 250;

export function createProbe(options: {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  limit: () => number;
  /** Puts the camera back to where the director has it, once a probe has moved it. */
  restore: () => void;
}): ProbeApi {
  const { gl, scene, camera } = options;
  const buffer = { data: new Uint8Array(0) };
  const maskGeometry = new BufferGeometry();
  const vertices: number[] = [];
  const addMask = (x0: number, x1: number, y0: number, y1: number, z: number): void => {
    if (x1 <= x0 || y1 <= y0) return;
    vertices.push(
      x0, y0, z, x1, y0, z, x1, y1, z,
      x0, y0, z, x1, y1, z, x0, y1, z,
    );
  };

  // These test-only planes sit just behind the two wall faces and opaque door panels. A magenta
  // pixel then marks a missing face even when the lobby's more distant geometry would fill it.
  const innerGap = INNER_DOORS.width / 2 + FRAME.architrave - WALL_OVERLAP;
  const innerHead = INNER_DOORS.height + FRAME.architrave;
  // Put the marker between the two partition faces. Each side's real face must occlude it, even
  // when an allowed camera pose is standing in the doorway's reveal.
  const innerMaskZ = CORRIDOR.innerDoorZ - MASK_DEPTH;
  const lobbyHalf = LOBBY.width / 2;
  addMask(-lobbyHalf, -innerGap, 0, LOBBY.height, innerMaskZ);
  addMask(innerGap, lobbyHalf, 0, LOBBY.height, innerMaskZ);
  addMask(-innerGap, innerGap, innerHead, LOBBY.height, innerMaskZ);
  const innerVertexCount = vertices.length / 3;

  const entranceHole = holeFor(ENTRANCE_DOORS);
  const entranceGap = entranceHole.width / 2 + FRAME.architrave - WALL_OVERLAP;
  const entranceHead = entranceHole.height + FRAME.architrave;
  const rearMaskZ = LOBBY.startZ + MASK_DEPTH;
  addMask(-lobbyHalf, -entranceGap, 0, LOBBY.height, rearMaskZ);
  addMask(entranceGap, lobbyHalf, 0, LOBBY.height, rearMaskZ);
  addMask(-entranceGap, entranceGap, entranceHead, LOBBY.height, rearMaskZ);

  // The fanlight is meant to transmit its dark backing; audit the two lower, opaque door panels.
  const leafHalf = ENTRANCE_DOORS.width / 2 - 0.03;
  const seamHalf = 0.025;
  const leafMaskZ = LOBBY.startZ + 0.22;
  addMask(-leafHalf, -seamHalf, 0.32, 1.1, leafMaskZ);
  addMask(seamHalf, leafHalf, 0.32, 1.1, leafMaskZ);
  maskGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  maskGeometry.computeVertexNormals();
  const maskMaterial = new MeshBasicMaterial({ color: CLEAR, depthTest: true, depthWrite: true, side: DoubleSide, toneMapped: false, fog: false });
  const mask = new Mesh(maskGeometry, maskMaterial);
  mask.name = 'hole-probe-expected-wall-faces';
  mask.renderOrder = 1000;
  mask.frustumCulled = false;

  /** Draws the scene from `view` with the background magenta, then puts the background back. */
  const draw = (view: View): void => {
    applyPose(camera, { x: view.x, z: view.z, yawDeg: view.yawDeg, pitchDeg: view.pitchDeg }, CORRIDOR.eyeHeight);
    const background = scene.background;
    scene.background = CLEAR;
    const vertexCount = maskGeometry.getAttribute('position').count;
    const inInnerReveal = view.z > CORRIDOR_START_Z && view.z < CORRIDOR.innerDoorZ;
    // The camera may stand in the open doorway's reveal. From there the two end-wall masks are
    // edge-on and can leak through the aperture; raw magenta clear pixels still catch real holes.
    maskGeometry.setDrawRange(inInnerReveal ? innerVertexCount : 0, vertexCount - (inInnerReveal ? innerVertexCount : 0));
    scene.add(mask);
    try {
      gl.render(scene, camera);
    } finally {
      scene.remove(mask);
      maskGeometry.setDrawRange(0, vertexCount);
      scene.background = background;
    }
  };

  const frame = (view: View): ProbeFrame => {
    draw(view);
    const context = gl.getContext();
    const width = context.drawingBufferWidth;
    const height = context.drawingBufferHeight;
    if (buffer.data.length !== width * height * 4) buffer.data = new Uint8Array(width * height * 4);
    context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, buffer.data);
    let magenta = 0;
    let first: [number, number] | null = null;
    const data = buffer.data;
    for (let i = 0; i < data.length; i += 4) {
      if (isClear(data[i] as number, data[i + 1] as number, data[i + 2] as number)) {
        magenta += 1;
        if (!first) {
          const p = i / 4;
          // readPixels counts rows from the bottom.
          first = [p % width, height - 1 - Math.floor(p / width)];
        }
      }
    }
    return { magenta, pixels: width * height, first, calls: gl.info.render.calls, triangles: gl.info.render.triangles };
  };

  return {
    limit: options.limit,
    size() {
      const context = gl.getContext();
      return { width: context.drawingBufferWidth, height: context.drawingBufferHeight };
    },
    frame(view) {
      try {
        return frame(view);
      } finally {
        options.restore();
      }
    },
    image(view) {
      try {
        draw(view);
        // Read in the same task as the draw: the drawing buffer is cleared once it is shown.
        return gl.domElement.toDataURL('image/png');
      } finally {
        options.restore();
      }
    },
    sweep(views) {
      const pixelRatio = gl.getPixelRatio();
      const surveyRatio = Math.min(pixelRatio, 0.4);
      if (surveyRatio < pixelRatio) gl.setPixelRatio(surveyRatio);
      const out: ProbeSweep = { drawn: 0, size: { width: 0, height: 0 }, holes: [], maxCalls: 0, maxTriangles: 0 };
      try {
        out.size = { width: gl.getContext().drawingBufferWidth, height: gl.getContext().drawingBufferHeight };
        views.forEach((view, index) => {
          const f = frame(view);
          out.drawn += 1;
          out.maxCalls = Math.max(out.maxCalls, f.calls);
          out.maxTriangles = Math.max(out.maxTriangles, f.triangles);
          if (f.magenta > 0) out.holes.push({ index, magenta: f.magenta, first: f.first });
        });
      } finally {
        if (surveyRatio < pixelRatio) gl.setPixelRatio(pixelRatio);
        options.restore();
      }
      return out;
    },
    memory() {
      return { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
    },
    dispose() {
      scene.remove(mask);
      maskGeometry.dispose();
      maskMaterial.dispose();
    },
  };
}
