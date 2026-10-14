import { createContext, useContext } from 'react';

/**
 * Ambient life (ADR 0004): small motions shown in short, bounded render windows rather than
 * continuously, so the corridor reads as alive without rendering every frame forever. The camera
 * lane owns the scheduler (it owns the render loop); the world and props lanes ask it for windows.
 */
export const AMBIENT_LIFE = {
  /** At most this many motions visibly running at once. */
  maxConcurrent: 3,
  /** No single window lasts longer than this. */
  maxWindowMs: 6000,
} as const;

export interface AmbientClock {
  /** Seconds of ambient time; advances only while some window is open. */
  now(): number;
  /**
   * Ask for frames for `ms` (capped at AMBIENT_LIFE.maxWindowMs) to run motion `id`. Returns false, and
   * opens nothing, under reduced motion, while hidden or offscreen, or at the concurrency cap.
   */
  requestWindow(id: string, ms: number): boolean;
  /** True while a window for `id` is open; read it in useFrame. */
  active(id: string): boolean;
}

/** STUB until the camera lane provides the scheduler: nothing is ever allowed to move. */
export const STILL_AMBIENT: AmbientClock = {
  now: () => 0,
  requestWindow: () => false,
  active: () => false,
};

export const AmbientContext = createContext<AmbientClock>(STILL_AMBIENT);

export function useAmbient(): AmbientClock {
  return useContext(AmbientContext);
}
