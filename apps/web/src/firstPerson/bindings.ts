import type { FirstPerson } from './controller.ts';

/**
 * DOM input for a first-person controller: keys, wheel, drag-to-look and the vertical swipe.
 * Nothing here knows what room it is in. `bindInput` returns the one thing a caller needs to
 * ask afterwards: whether the pointer gesture that just ended was a drag (so a click that
 * follows it is not a selection).
 *
 * Who owns the input is the caller's call, asked at every event (`mode()`):
 * - `page`: the page does. Wheel, keys and swipes pass through untouched (never `preventDefault`),
 *   key presses are not gestures, nothing is dragged.
 * - `look`: the page owns wheel and keys, but dragging still looks around. A finger that moves
 *   up or down is left to the browser to scroll the page; one that moves sideways looks.
 * - `engaged`: the window owns everything: walking, turning, looking, and no page scrolling.
 * - `held`: engaged, but a scripted move is under way (a door opening): the wheel is swallowed
 *   so the page does not move under the visitor, and nothing else is taken.
 */
export type InputMode = 'page' | 'look' | 'engaged' | 'held';

/** The parts of the controller input reaches; also what a test double must provide. */
export type InputControls = Pick<FirstPerson, 'hold' | 'turn' | 'nudge' | 'look'>;

/** The parts of an element the bindings use (a real element, or a double in tests). */
export type SurfaceLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
  setPointerCapture?(id: number): void;
  releasePointerCapture?(id: number): void;
  dataset: DOMStringMap;
};

export type HostLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface InputOptions {
  controls: InputControls;
  /** Receives pointer drags and clicks (the scene). */
  surface: SurfaceLike;
  /** Receives keys and the wheel. Defaults to `window`. */
  host?: HostLike;
  /** Who owns the input right now; see `InputMode`. */
  mode(): InputMode;
  reducedMotion(): boolean;
  /** View degrees per CSS pixel of drag, for the current viewport. */
  lookScale(): { yaw: number; pitch: number };
  /** Metres of walking per pixel of scroll or swipe. */
  metresPerPx: number;
  /**
   * How far a pointer travels before a drag is read (and, for a finger, its axis chosen), in CSS
   * pixels, by pointer type. A finger waits the longest: the choice is then final for the gesture.
   */
  dragThresholdPx?: Partial<Record<'mouse' | 'pen' | 'touch', number>>;
  /** Any click, tap or key press: the core may unlock audio. Scrolling never calls it. */
  onGesture(): void;
  /** Something changed that needs a frame. */
  onActivity(): void;
  /** Reduced motion has no walking: forward and back step between named viewpoints. */
  onStep?(dir: -1 | 1): void;
  /** A touch pointer was seen (the caller may reveal touch controls). */
  onTouch?(): void;
}

export interface InputBinding {
  /** True when the last pointer gesture was a drag. Cleared by the next pointer-down. */
  wasDrag(): boolean;
  /** Clears held keys, as when the window loses focus. */
  releaseAll(): void;
  dispose(): void;
}

export type KeyIntent = { kind: 'walk' | 'turn'; dir: -1 | 1 };

const KEYS: Record<string, KeyIntent> = {
  KeyW: { kind: 'walk', dir: 1 },
  ArrowUp: { kind: 'walk', dir: 1 },
  KeyS: { kind: 'walk', dir: -1 },
  ArrowDown: { kind: 'walk', dir: -1 },
  KeyA: { kind: 'turn', dir: -1 },
  ArrowLeft: { kind: 'turn', dir: -1 },
  KeyD: { kind: 'turn', dir: 1 },
  ArrowRight: { kind: 'turn', dir: 1 },
};

/** Physical key positions, so WASD works on any layout; the arrows are the same everywhere. */
export function keyIntent(code: string): KeyIntent | null {
  return KEYS[code] ?? null;
}

const LINE_PX = 100 / 3;
const MAX_WHEEL_PX = 300;

/** Wheel movement in CSS pixels along the page's vertical axis, whatever the delta mode. */
export function wheelPixels(event: { deltaY: number; deltaMode: number }, pageHeight = 800): number {
  const px =
    event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaMode === 2 ? event.deltaY * pageHeight : event.deltaY;
  return Math.max(-MAX_WHEEL_PX, Math.min(MAX_WHEEL_PX, px));
}

/**
 * A finger that travels more up or down than sideways is walking (or, at rest, scrolling the
 * page); anything else is looking. A mouse always looks.
 */
export function classifyDrag(dx: number, dy: number, pointerType: string): 'look' | 'walk' {
  return pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) ? 'walk' : 'look';
}

const DRAG_THRESHOLD_PX: Record<string, number> = { mouse: 5, pen: 6, touch: 12 };
/** A finger is clumsier than a mouse: its look gain is higher so a swipe turns the view usefully. */
const LOOK_GAIN: Record<string, number> = { mouse: 1, pen: 1, touch: 1.5 };
/** A swipe maps a little more travel than a wheel pixel: the finger is on the floor it moves. */
const SWIPE_GAIN = 1;

const isEditable = (target: EventTarget | null): boolean => {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable === true;
};

/** A key used to operate the page is not a gesture in the 3D world. */
const isKeyboardControl = (target: EventTarget | null): boolean =>
  typeof (target as { closest?: unknown } | null)?.closest === 'function' &&
  (target as Element).closest(
    'button, a[href], input, textarea, select, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="dialog"], dialog, [contenteditable="true"], [data-fp-ignore]',
  ) !== null;

/** Controls drawn over the surface mark themselves with `data-fp-ignore`; a drag never starts on them. */
export const IGNORE_ATTRIBUTE = 'data-fp-ignore';

export const isIgnored = (target: EventTarget | null): boolean =>
  typeof (target as { closest?: unknown } | null)?.closest === 'function' &&
  (target as Element).closest(`[${IGNORE_ATTRIBUTE}]`) !== null;

const inDialog = (target: EventTarget | null): boolean =>
  typeof (target as { closest?: unknown } | null)?.closest === 'function' &&
  (target as Element).closest('[role="dialog"], dialog') !== null;

export function bindInput(options: InputOptions): InputBinding {
  const { controls, surface } = options;
  const host: HostLike = options.host ?? window;
  const down = new Set<string>();
  let dragged = false;

  const on = <E extends Event>(
    target: SurfaceLike | HostLike,
    type: string,
    handler: (event: E) => void,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, handler as EventListener, opts);
    return () => target.removeEventListener(type, handler as EventListener, opts);
  };

  const heldSum = (kind: KeyIntent['kind']): number => {
    let sum = 0;
    for (const code of down) {
      const intent = keyIntent(code);
      if (intent?.kind === kind) sum += intent.dir;
    }
    return Math.max(-1, Math.min(1, sum));
  };

  const sync = () => {
    const walk = heldSum('walk');
    const turn = heldSum('turn');
    controls.hold('key', walk as -1 | 0 | 1);
    controls.turn('key', turn as -1 | 0 | 1);
    options.onActivity();
  };

  const releaseAll = () => {
    if (down.size === 0) return;
    down.clear();
    sync();
  };

  const offs: (() => void)[] = [];

  offs.push(
    on<KeyboardEvent>(host, 'keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const mode = options.mode();
      // A key pressed while the window is engaged is a deliberate gesture. One pressed while the
      // page owns the keyboard (it may be scrolling the page) is not.
      if (
        (mode === 'engaged' || mode === 'held') &&
        !event.repeat &&
        !isKeyboardControl(event.target) &&
        event.key !== 'Shift' &&
        event.key !== 'Control' &&
        event.key !== 'Alt' &&
        event.key !== 'Meta'
      ) {
        options.onGesture();
      }
      const intent = keyIntent(event.code);
      if (!intent || mode !== 'engaged' || isEditable(event.target) || inDialog(event.target)) return;
      event.preventDefault();
      if (options.reducedMotion()) {
        // No travel: forward and back step between viewpoints, once per press. Turning is a no-op.
        if (!event.repeat && intent.kind === 'walk') options.onStep?.(intent.dir);
        return;
      }
      if (down.has(event.code)) return;
      down.add(event.code);
      sync();
    }),
    on<KeyboardEvent>(host, 'keyup', (event) => {
      if (!down.delete(event.code)) return;
      sync();
    }),
    on<Event>(host, 'blur', releaseAll),
    on<Event>(
      host,
      'wheel',
      (event) => {
        const wheel = event as unknown as WheelEvent;
        const mode = options.mode();
        // At rest the wheel belongs to the page: leave it alone so the page scrolls over the scene.
        if (wheel.ctrlKey || (mode !== 'engaged' && mode !== 'held') || inDialog(wheel.target)) return;
        // Engaged, the wheel is the scroll verb continuing: it walks, and the page does not move.
        // Never a gesture.
        wheel.preventDefault();
        if (mode === 'held' || options.reducedMotion()) return;
        controls.nudge(wheelPixels(wheel) * options.metresPerPx);
        options.onActivity();
      },
      { passive: false },
    ),
  );

  interface Drag {
    id: number;
    type: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    /** Chosen once, after the threshold, and never changed for the rest of the gesture. */
    mode: 'pending' | 'look' | 'walk' | 'page';
    /** Whether the window was engaged when the gesture began; engaging mid-gesture changes nothing. */
    engaged: boolean;
    stepped: boolean;
  }
  let drag: Drag | null = null;
  const dragOffs: (() => void)[] = [];

  const endDrag = () => {
    if (!drag) return;
    surface.releasePointerCapture?.(drag.id);
    delete surface.dataset['dragging'];
    drag = null;
    for (const off of dragOffs.splice(0)) off();
  };

  offs.push(
    on<PointerEvent>(surface, 'pointerdown', (event) => {
      if (event.pointerType === 'touch') options.onTouch?.();
      const startMode = options.mode();
      if ((startMode !== 'look' && startMode !== 'engaged') || isIgnored(event.target)) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (drag) {
        // A second finger: this is a pinch or a mistake, not a look.
        endDrag();
        return;
      }
      dragged = false;
      drag = {
        id: event.pointerId,
        type: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        mode: 'pending',
        engaged: startMode === 'engaged',
        stepped: false,
      };
      dragOffs.push(
        on<PointerEvent>(host, 'pointermove', (move) => {
          const d = drag;
          if (!d || move.pointerId !== d.id || d.mode === 'page') return;
          if (d.mode === 'pending') {
            const threshold =
              options.dragThresholdPx?.[d.type as 'mouse' | 'pen' | 'touch'] ?? DRAG_THRESHOLD_PX[d.type] ?? 6;
            if (Math.hypot(move.clientX - d.startX, move.clientY - d.startY) < threshold) return;
            const axis = classifyDrag(move.clientX - d.startX, move.clientY - d.startY, d.type);
            // At rest a finger that goes up or down is the page's to scroll: leave it entirely.
            d.mode = axis === 'walk' && !d.engaged ? 'page' : axis;
            if (d.mode === 'page') return;
            dragged = true;
            // Capture only now: a plain click must still reach whatever was under the pointer.
            surface.setPointerCapture?.(d.id);
            surface.dataset['dragging'] = 'true';
            // The movement before the threshold counts, so the view does not stick on pick-up.
            d.x = d.startX;
            d.y = d.startY;
          }
          const dx = move.clientX - d.x;
          const dy = move.clientY - d.y;
          d.x = move.clientX;
          d.y = move.clientY;
          if (d.mode === 'look') {
            const scale = options.lookScale();
            const gain = LOOK_GAIN[d.type] ?? 1;
            // Grab the world: it follows the pointer, so dragging right turns the view left.
            controls.look(-dx * scale.yaw * gain, dy * scale.pitch * gain);
          } else if (options.reducedMotion()) {
            if (!d.stepped && Math.abs(d.y - d.startY) > 40) {
              d.stepped = true;
              options.onStep?.(d.y < d.startY ? 1 : -1);
            }
          } else {
            // Dragging the floor under your feet: finger up walks forward, like scrolling down.
            controls.nudge(-dy * options.metresPerPx * SWIPE_GAIN);
          }
          options.onActivity();
        }),
        on<PointerEvent>(host, 'pointerup', (up) => {
          if (drag && up.pointerId === drag.id) endDrag();
        }),
        on<PointerEvent>(host, 'pointercancel', (cancel) => {
          if (drag && cancel.pointerId === drag.id) endDrag();
        }),
      );
    }),
    on<Event>(surface, 'click', () => options.onGesture()),
  );

  return {
    wasDrag: () => dragged,
    releaseAll,
    dispose() {
      endDrag();
      releaseAll();
      for (const off of offs.splice(0)) off();
    },
  };
}
