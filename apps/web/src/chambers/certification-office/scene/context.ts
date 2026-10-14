import { createContext, useContext, useEffect, useState } from 'react';
import type { CertificationStore } from '@tqw/engine';
import type { Director } from './director.ts';
import type { OfficeResources } from './assets.ts';
import type { Materials } from './materials.ts';
import { areFontsLoaded, loadFonts } from './textures.ts';

/** Mutable motion preference, read each frame so toggling it never re-renders the scene. */
export interface MotionPreference {
  reduced: boolean;
}

/** Shared pointer-cursor ownership: several hit targets, one cursor. */
export interface CursorControl {
  hover(owner: string, hovering: boolean): void;
  clear(): void;
}

export function createCursorControl(element: HTMLElement): CursorControl {
  const owners = new Set<string>();
  const apply = () => {
    element.style.cursor = owners.size > 0 ? 'pointer' : '';
  };
  return {
    hover(owner, hovering) {
      if (hovering) owners.add(owner);
      else owners.delete(owner);
      apply();
    },
    clear() {
      owners.clear();
      apply();
    },
  };
}

/**
 * What the camera rig has decided, for the scenery that depends on it: how portrait or landscape
 * the framing is (0..1), which way the camera looks along the floor, and a counter that changes
 * whenever either does so consumers can re-seat themselves from a frame callback.
 */
export interface ViewState {
  version: number;
  /** 0 = portrait framing, 1 = landscape framing. */
  blend: number;
  /** Horizontal direction the camera looks (unit vector in x/z). */
  forwardX: number;
  forwardZ: number;
  /** World position of each scale cue for the current framing (see CameraRig). */
  cues: {
    tower: { x: number; z: number };
    column: { x: number; z: number };
    window: { x: number; z: number; scale: number };
  };
}

/**
 * World yaw that turns a flat sheet lying on the desk (its text reading toward -z) so the text
 * is upright to the camera, whichever side the framing looks from.
 */
export const facingYaw = (view: Pick<ViewState, 'forwardX' | 'forwardZ'>): number => Math.atan2(-view.forwardX, -view.forwardZ);

export const createView = (): ViewState => ({
  version: 0,
  blend: 1,
  forwardX: 0.04,
  forwardZ: -0.999,
  cues: {
    tower: { x: 2.95, z: -3 },
    column: { x: -2.05, z: -1.9 },
    window: { x: -0.13, z: -4, scale: 1 },
  },
});

export interface SceneContextValue {
  assets?: OfficeResources;
  store: CertificationStore;
  director: Director;
  materials: Materials;
  motion: MotionPreference;
  cursor: CursorControl;
  view: ViewState;
  onPosition(position: 'left' | 'centre' | 'right'): void;
  canPress(): boolean;
  onPressSelect(): void;
  onPressStart(): void;
  onPressEnd(): void;
}

export const SceneContext = createContext<SceneContextValue | null>(null);

export function useScene(): SceneContextValue {
  const value = useContext(SceneContext);
  if (!value) throw new Error('useScene must be used inside the office scene');
  return value;
}

/** True once the web fonts the canvas art depends on are usable. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(areFontsLoaded());
  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    void loadFonts().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}
