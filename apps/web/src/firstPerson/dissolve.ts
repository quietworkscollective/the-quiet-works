/**
 * A dissolve between two views, for reduced motion: the outgoing frame is copied onto an
 * overlay canvas, the view changes underneath, and the copy fades away. Replaces travel and
 * swings with the least motion that still tells the visitor they have moved.
 */
export interface Dissolve {
  /**
   * Call just before the view changes. Renders the outgoing view once more (the drawing
   * buffer of a demand-driven canvas is not kept between frames), copies it to the overlay
   * and starts the fade; the caller then changes the view.
   */
  capture(): void;
  dispose(): void;
}

export interface DissolveOptions {
  overlay: HTMLCanvasElement;
  /** The canvas whose current picture is the outgoing view. */
  source(): HTMLCanvasElement | null;
  /** Draws the current view into `source()` synchronously. */
  render(): void;
  ms: number;
}

export function createDissolve({ overlay, source, render, ms }: DissolveOptions): Dissolve {
  let timer = 0;
  let raf = 0;

  const clear = () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'none';
    // Shrinking the bitmap releases its memory between dissolves.
    overlay.width = 1;
    overlay.height = 1;
  };
  clear();

  return {
    capture() {
      const from = source();
      const context = overlay.getContext('2d');
      if (!from || !context || from.width === 0 || from.height === 0) return;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      render();
      overlay.width = from.width;
      overlay.height = from.height;
      context.drawImage(from, 0, 0);
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
      // Commit the opaque state before asking for the fade.
      void overlay.offsetWidth;
      raf = window.requestAnimationFrame(() => {
        overlay.style.transition = `opacity ${ms}ms linear`;
        overlay.style.opacity = '0';
        timer = window.setTimeout(clear, ms + 80);
      });
    },
    dispose() {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
    },
  };
}
