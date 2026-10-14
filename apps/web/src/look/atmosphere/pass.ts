import { Pass } from 'postprocessing';
import { Mesh, Vector3, type Camera, type PerspectiveCamera, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import type { AtmosphereProfile } from './data.ts';
import { createCones, type Cones, type VisibleCone } from './cones.ts';
import { createDust, type DustCloud } from './dust.ts';
import { chooseCones, type AtmosphereLamp } from './lamps.ts';

/**
 * The atmosphere pass: the lamp cones and the dust, drawn over the frame after the contact shadow
 * and before the finish, and faded against the scene's depth. Two draw calls at most (one
 * instanced cone draw, one points draw), additive, with no depth test of their own: the depth is
 * read as a texture, so a cone meeting a wall fades out instead of cutting a line across it.
 *
 * It owns the geometry and materials it makes and releases them in `dispose`. Everything here is
 * WebGL-specific by design and lives in this folder so a later renderer has one place to change.
 */
export class AtmospherePass extends Pass {
  private readonly cones: Cones | null;
  private readonly dust: DustCloud | null;
  private profile: AtmosphereProfile;
  private lamps: readonly AtmosphereLamp[] = [];
  private camera_: Camera | null = null;
  // Held in an object, not as a Texture property: the composer owns this texture, and the base
  // pass's dispose would otherwise free it out from under the passes that still read it.
  private readonly depth: { texture: Texture | null } = { texture: null };
  private readonly eye = new Vector3();
  private pixelRatio = 1;
  private readonly builtFor: { readonly maxVisible: number; readonly dustCount: number };

  /** The shafts this frame drew, nearest first; the light-patch effect reads them. */
  lastChosen: readonly VisibleCone[] = [];

  /** Draw calls and triangles of the last render, for the measurements. */
  lastDraws = { calls: 0, triangles: 0 };

  constructor(profile: AtmosphereProfile, parts: { readonly cones: boolean; readonly dust: boolean }) {
    super('AtmospherePass');
    this.profile = profile;
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.builtFor = { maxVisible: profile.cones.maxVisible, dustCount: profile.dust.count };
    this.cones = parts.cones ? createCones(profile.cones.maxVisible) : null;
    this.dust = parts.dust ? createDust(profile.dust) : null;
    this.scene.name = 'look-atmosphere';
    if (this.cones) {
      const shells = new Mesh(this.cones.geometry, this.cones.material);
      shells.frustumCulled = false;
      shells.name = 'look-cones';
      this.scene.add(shells);
    }
    if (this.dust) this.scene.add(this.dust.points);
  }

  override set mainCamera(camera: Camera) {
    this.camera_ = camera;
  }

  override setDepthTexture(depthTexture: Texture): void {
    this.depth.texture = depthTexture;
    const camera = this.camera_ as PerspectiveCamera | null;
    this.cones?.setDepth(depthTexture, camera?.near ?? 0.1, camera?.far ?? 100);
    this.dust?.setDepth(depthTexture, camera?.near ?? 0.1, camera?.far ?? 100);
  }

  override setSize(width: number, height: number): void {
    this.cones?.setResolution(width, height);
    this.dust?.setResolution(width, height, this.pixelRatio);
  }

  /** CSS pixels to device pixels, so a mote is a pixel or two on every screen. */
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }

  setLamps(lamps: readonly AtmosphereLamp[]): void {
    this.lamps = lamps;
  }

  /**
   * Apply a changed atmosphere in place: the cone specs, and the dust's brightness, size and box.
   * A different cone cap or dust count is a different pass and is built new by the driver.
   */
  setProfile(profile: AtmosphereProfile): void {
    this.profile = profile;
    this.dust?.setLook(profile.dust);
  }

  /** The counts this pass was built for; the driver rebuilds it when a profile asks for others. */
  get built(): { readonly maxVisible: number; readonly dustCount: number } {
    return this.builtFor;
  }

  /** `distance` is metres the air has drifted; 0 holds everything still. */
  setDrift(distance: number): void {
    const { dust } = this.profile;
    this.dust?.setOffset(dust.drift * distance, dust.rise * distance, dust.drift * distance * 0.6);
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget): void {
    const camera = this.camera_;
    if (!camera) return;
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    const chosen = chooseCones(this.lamps, this.profile.cones.specs, [this.eye.x, this.eye.y, this.eye.z], this.profile.cones.maxVisible);
    this.lastChosen = chosen;
    this.cones?.set(chosen);
    this.dust?.lightBy(chosen);
    const perspective = camera as PerspectiveCamera;
    if (this.depth.texture) {
      this.cones?.setDepth(this.depth.texture, perspective.near, perspective.far);
      this.dust?.setDepth(this.depth.texture, perspective.near, perspective.far);
    }
    const info = renderer.info.render;
    const before = { calls: info.calls, triangles: info.triangles };
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    this.camera = camera;
    renderer.render(this.scene, camera);
    this.lastDraws = { calls: info.calls - before.calls, triangles: info.triangles - before.triangles };
  }

  override dispose(): void {
    this.cones?.dispose();
    this.dust?.dispose();
    super.dispose();
  }
}
