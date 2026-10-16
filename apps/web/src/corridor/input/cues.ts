import type { CueTarget, ReaderContent } from '../camera/cueText.ts';

/**
 * The cue overlay's state (ADR 0004, "Interactive cues"): the DOM verb label near an object, the
 * steady focus ring, the first-encounter hint, the "Things nearby" list and the reader. The camera
 * rig writes it and the overlay (CueLayer) reads it, through a store so a frame never re-renders
 * React. Where the label and the ring sit on screen changes every frame during a glide, so that
 * goes straight to the elements as CSS custom properties and never through React state.
 */

export interface CueView {
  /** Identifies the object: the label does not re-mount when only its position changes. */
  key: string;
  text: string;
  /** The verb is an action the visitor presses (the label is a button for a mouse or a finger, plain text for the keyboard). */
  asButton: boolean;
  /** False while the label fades out after the thing was lost. */
  visible: boolean;
}

/** A place or an action in the "Places and actions" list. */
export interface PlaceItem {
  key: string;
  text: string;
  target: CueTarget;
}

export interface CueSnapshot {
  cue: CueView | null;
  /** A steady 2 px ring is drawn around the cue's object (keyboard focus). */
  ring: boolean;
  /** The first-encounter hint, or null when it is not showing. */
  hint: string | null;
  /** The "Places and actions" list: reached by Tab, visually hidden until it has focus. */
  places: readonly PlaceItem[];
  reader: ReaderContent | null;
  /** What assistive technology is told after an action: the verb, and the label it revealed. */
  live: string;
  /** The overlay is showing: in the corridor, with the scene on screen. */
  shown: boolean;
  /** The last input was the keyboard: labels are plain text beside the focus ring, not buttons. */
  keyboard: boolean;
}

export const emptySnapshot: CueSnapshot = {
  cue: null,
  ring: false,
  hint: null,
  places: [],
  reader: null,
  live: '',
  shown: false,
  keyboard: false,
};

export interface CueActions {
  /** The label's verb was pressed. */
  activateCue(): void;
  /** A place or action in the "Places and actions" list was chosen. */
  activatePlace(target: CueTarget): void;
  dismissHint(): void;
  closeReader(): void;
}

/** Where the label (its top-centre) and the ring (its box) go, in CSS pixels from the scene's top-left. */
export interface Placement {
  /** Where the label goes and which side of that point it sits on (beside the object, never over it). */
  label: { x: number; y: number; side: 'right' | 'left' | 'above' } | null;
  ring: { x: number; y: number; w: number; h: number } | null;
}

export interface CueElements {
  label: HTMLElement | null;
  ring: HTMLElement | null;
}

export interface CueStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): CueSnapshot;
  /** Changes some of the state; listeners are told only if something differs. */
  set(patch: Partial<CueSnapshot>): void;
  /** The actions the overlay's controls call, delegating to whoever bound them. */
  readonly actions: CueActions;
  bind(actions: CueActions): () => void;
  /** The overlay registers the elements it draws the label and ring with (or null when they go). */
  attach(elements: CueElements): void;
  /** Moves the label and ring; cheap enough to call every frame. */
  place(placement: Placement): void;
  /** The label's size in CSS pixels as drawn (measured once per label), or null when none is drawn. */
  labelSize(): { width: number; height: number } | null;
}

const samePlaces = (a: readonly PlaceItem[], b: readonly PlaceItem[]): boolean =>
  a.length === b.length && a.every((item, i) => item.key === b[i]?.key && item.text === b[i]?.text);

const same = <K extends keyof CueSnapshot>(key: K, a: CueSnapshot[K], b: CueSnapshot[K]): boolean => {
  if (key === 'cue') {
    const x = a as CueSnapshot['cue'];
    const y = b as CueSnapshot['cue'];
    return (
      x === y ||
      (x !== null && y !== null && x.key === y.key && x.text === y.text && x.asButton === y.asButton && x.visible === y.visible)
    );
  }
  if (key === 'places') return samePlaces(a as readonly PlaceItem[], b as readonly PlaceItem[]);
  if (key === 'reader') {
    const x = a as CueSnapshot['reader'];
    const y = b as CueSnapshot['reader'];
    return x === y || (x !== null && y !== null && x.id === y.id);
  }
  return a === b;
};

/** The last value written to each element's custom properties, so an unmoved label costs nothing. */
const written = new WeakMap<HTMLElement, Map<string, number>>();

/** Writes a CSS custom property (in px, to half a pixel) only when it changed. */
function setPx(el: HTMLElement, name: string, value: number): void {
  const rounded = Math.round(value * 2) / 2;
  let seen = written.get(el);
  if (!seen) {
    seen = new Map();
    written.set(el, seen);
  }
  if (seen.get(name) === rounded) return;
  seen.set(name, rounded);
  el.style.setProperty(`--tqw-${name}`, `${rounded}px`);
}

export function createCueStore(): CueStore {
  let snapshot: CueSnapshot = emptySnapshot;
  const listeners = new Set<() => void>();
  let bound: CueActions | null = null;
  let elements: CueElements = { label: null, ring: null };
  let last: Placement = { label: null, ring: null };
  let measured: { el: HTMLElement; text: string; width: number; height: number } | null = null;

  function apply(): void {
    const { label, ring } = elements;
    if (label) {
      if (last.label) {
        setPx(label, 'cue-x', last.label.x);
        setPx(label, 'cue-y', last.label.y);
        label.dataset['side'] = last.label.side;
        label.dataset['placed'] = 'true';
      } else {
        label.dataset['placed'] = 'false';
      }
    }
    if (ring) {
      if (last.ring) {
        setPx(ring, 'ring-x', last.ring.x);
        setPx(ring, 'ring-y', last.ring.y);
        setPx(ring, 'ring-w', last.ring.w);
        setPx(ring, 'ring-h', last.ring.h);
        ring.dataset['placed'] = 'true';
      } else {
        ring.dataset['placed'] = 'false';
      }
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    set(patch) {
      let changed = false;
      const next: CueSnapshot = { ...snapshot };
      for (const key of Object.keys(patch) as (keyof CueSnapshot)[]) {
        const value = patch[key];
        if (value === undefined) continue;
        if (!same(key, snapshot[key], value as never)) {
          (next as unknown as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
      if (!changed) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    actions: {
      activateCue: () => bound?.activateCue(),
      activatePlace: (target) => bound?.activatePlace(target),
      dismissHint: () => bound?.dismissHint(),
      closeReader: () => bound?.closeReader(),
    },
    bind(actions) {
      bound = actions;
      return () => {
        if (bound === actions) bound = null;
      };
    },
    attach(next) {
      elements = next;
      apply();
    },
    place(placement) {
      last = placement;
      apply();
    },
    labelSize() {
      const el = elements.label;
      if (!el) return null;
      const text = el.textContent ?? '';
      if (!measured || measured.el !== el || measured.text !== text) {
        measured = { el, text, width: el.offsetWidth, height: el.offsetHeight };
      }
      return { width: measured.width || 160, height: measured.height || 30 };
    },
  };
}
