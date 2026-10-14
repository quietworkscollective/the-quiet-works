// n8ao ships JavaScript only. This declares the part of N8AOPostPass the look stack uses, so the
// rest of the folder stays strictly typed. If the package adds its own types, delete this file.
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import type { Pass } from 'postprocessing';

  export interface N8AOConfiguration {
    /** World-space radius of the occlusion, in the scene's units. */
    aoRadius: number;
    /** The occlusion is raised to this power. */
    intensity: number;
    /** Ratio of the radius over which the occlusion fades; lower reduces halos. */
    distanceFalloff: number;
    aoSamples: number;
    denoiseSamples: number;
    denoiseRadius: number;
    /** Compute at half resolution, then upsample against depth. */
    halfRes: boolean;
    /** Render transparent objects a second time to occlude correctly. Costly; off here. */
    transparencyAware: boolean;
    /** Apply output colour conversion. Off: the finish pass converts, once. */
    gammaCorrection: boolean;
    /** Mix the occlusion into the colour by multiplying. */
    colorMultiply: boolean;
    /** The colour the occluded light keeps (sRGB; converted to linear by the pass). */
    color: Color;
    /** Accumulate samples across frames while the camera is still. Off: no temporal state. */
    accumulate: boolean;
    screenSpaceRadius: boolean;
    renderMode: number;
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    scene: Scene;
    camera: Camera;
    readonly configuration: N8AOConfiguration;
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
