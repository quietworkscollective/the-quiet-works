import { createRoot } from 'react-dom/client';
import './gramophone.css';
import { GramophoneActions } from './GramophoneActions.tsx';

/**
 * The gramophone's DOM equivalent, mounted on its own: the text reading and the verbs' real buttons
 * (hidden until one has focus), and the cue labels, in a root of their own on the page. The scene
 * mounts it with the gramophone, and the page can mount it itself where there is no scene (text
 * mode, a failed WebGL context), so that the machine can always be heard about and worked.
 *
 * Returns the element (the scene writes the fittings' screen positions onto it as CSS variables) and
 * the way out.
 */
export interface GramophoneIsland {
  readonly host: HTMLElement;
  unmount(): void;
}

export function mountGramophoneIsland(parent: HTMLElement = document.body): GramophoneIsland {
  const host = document.createElement('div');
  host.className = 'tqw-gramophone-island';
  parent.appendChild(host);
  const root = createRoot(host);
  root.render(<GramophoneActions />);
  let gone = false;
  return {
    host,
    unmount() {
      if (gone) return;
      gone = true;
      // Unmounting a root while React is committing is refused: let that commit finish first.
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
    },
  };
}
