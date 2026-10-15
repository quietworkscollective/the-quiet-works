import { createContext, useContext } from 'react';

/**
 * The notice board's idle highlight (ADR 0004: one soft 800 ms glint on the board's brass pin at
 * hand-over). The board is not a prop, so it has no `PropMotion`; this is the one number it needs.
 * The camera lane writes `glint` (0 to 1, a smooth swell) and the world reads it in `useFrame`:
 * `useBoardMotion().glint`. Outside a scene it is a static zero, so nothing needs a provider to
 * render.
 */
export interface BoardMotion {
  /** 0 at rest; a smooth swell to 1 and back over the glint. */
  glint: number;
}

export const createBoardMotion = (): BoardMotion => ({ glint: 0 });

export const BoardMotionContext = createContext<BoardMotion>(createBoardMotion());

export function useBoardMotion(): BoardMotion {
  return useContext(BoardMotionContext);
}
