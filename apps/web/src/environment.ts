/** True when a WebGL2 context can be created. three.js r163+ requires WebGL2. */
export function detectWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `?mode=text` opens the office directly in text mode (shareable, no storage). */
export function requestedTextMode(): boolean {
  return new URLSearchParams(window.location.search).get('mode') === 'text';
}
