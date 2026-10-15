/**
 * Render tier. The corridor is shaded per pixel (textured, bump-mapped, lit by many static
 * lamps), which a GPU does without noticing and a software rasteriser does at about one frame a
 * second. When the renderer is a CPU one (headless browsers, virtual machines, blocklisted GPUs)
 * the world drops to a lite tier: no bump or roughness maps, no anisotropic filtering, no
 * reflection environment, and a lower pixel ratio. The geometry, lamps, fog and composition are
 * identical. In development only, `?quality=high` or `?quality=low` can override detection for
 * review captures and tier checks.
 */

export type Quality = 'full' | 'lite';

/** True for the renderer names software GL implementations report. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(renderer);
}

/** The tier for a renderer description; query overrides exist only in development. */
export function chooseQuality(renderer: string, search?: string): Quality {
  if (import.meta.env.DEV) {
    const asked = new URLSearchParams(search ?? window.location.search).get('quality');
    if (asked === 'high') return 'full';
    if (asked === 'low') return 'lite';
  }
  return isSoftwareRenderer(renderer) ? 'lite' : 'full';
}

/** Pixel ratio the lite tier renders at, as a fraction of a CSS pixel. */
export const LITE_PIXEL_RATIO = 0.6;

/** The unmasked renderer string, or '' when the browser does not expose it. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (info) return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  return String(gl.getParameter(gl.RENDERER));
}
