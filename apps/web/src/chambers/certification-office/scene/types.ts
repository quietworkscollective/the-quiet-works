import type { OfficeCue } from './ContextualCue.tsx';
import type { Navigation } from './navigation.ts';
import type { OfficeStore, OfficeArchive, OfficeObjectId, CertificationStore } from '@tqw/engine';

export interface OfficeSceneProps {
  store: CertificationStore;
  navigation: Navigation;
  office: OfficeStore;
  archive: OfficeArchive;
  shadow: boolean;
  freshInk: boolean;
  onInspect(id: OfficeObjectId): void;
  onFocusObject(id: OfficeObjectId | null): void;
  onEntrance(): void;
  framedObject: OfficeObjectId | null;
  focusedObject: OfficeObjectId | null;
  onCue(cue: OfficeCue | null): void;
  reducedMotion: boolean;
  onGesture(): void;
  selectedPosition?: 'left' | 'centre' | 'right';
  onSelectPosition?(position: 'left' | 'centre' | 'right'): void;
  /** Called synchronously from the 3D stamp's pointerdown. The app unlocks sound, then dispatches PRESS. */
  onPressStart(): void;
  /** Called from pointerup / pointercancel / lostpointercapture. The app dispatches RELEASE. */
  onPressEnd(): void;
  /** The WebGL context was lost. The app switches to text mode; state is preserved in the store. */
  onContextLost(): void;
  /** Resources are prepared and two complete main-camera frames have been drawn. */
  onReady?(): void;
}
