import { describe, expect, it } from 'vitest';
import {
  bindInput,
  classifyDrag,
  keyIntent,
  wheelPixels,
  type InputControls,
  type InputMode,
  type InputOptions,
  type SurfaceLike,
} from './bindings.ts';

function fire(target: EventTarget, type: string, props: Record<string, unknown> = {}): Event {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(props)) Object.defineProperty(event, name, { value, configurable: true });
  target.dispatchEvent(event);
  return event;
}

interface Rig {
  calls: string[];
  controls: InputControls;
  surface: SurfaceLike & EventTarget & { captured: number[] };
  host: EventTarget;
  options: { mode: InputMode; reduced: boolean };
  gestures: number;
  steps: number[];
  touches: number;
  input: ReturnType<typeof bindInput>;
}

function rig(overrides: Partial<InputOptions> = {}): Rig {
  const calls: string[] = [];
  const host = (overrides.host ?? new EventTarget()) as EventTarget;
  const controls: InputControls = {
    hold: (source, dir) => calls.push(`hold:${source}:${dir}`),
    turn: (source, dir) => calls.push(`turn:${source}:${dir}`),
    nudge: (m) => calls.push(`nudge:${m.toFixed(4)}`),
    look: (y, p) => calls.push(`look:${y.toFixed(3)}:${p.toFixed(3)}`),
  };
  const surface = Object.assign(new EventTarget(), {
    dataset: {} as DOMStringMap,
    captured: [] as number[],
    setPointerCapture(id: number) {
      this.captured.push(id);
    },
    releasePointerCapture() {},
  });
  const state: { mode: InputMode; reduced: boolean } = { mode: 'engaged', reduced: false };
  const out = { gestures: 0, steps: [] as number[], touches: 0 };
  const input = bindInput({
    controls,
    surface,
    host,
    mode: () => state.mode,
    reducedMotion: () => state.reduced,
    lookScale: () => ({ yaw: 0.05, pitch: 0.05 }),
    metresPerPx: 0.0035,
    onGesture: () => (out.gestures += 1),
    onActivity: () => {},
    onStep: (dir) => out.steps.push(dir),
    onTouch: () => (out.touches += 1),
    ...overrides,
  });
  return {
    calls,
    controls,
    surface,
    host,
    options: state,
    get gestures() {
      return out.gestures;
    },
    steps: out.steps,
    get touches() {
      return out.touches;
    },
    input,
  };
}

const key = (code: string, extra: Record<string, unknown> = {}) => ({ code, key: code, repeat: false, ...extra });

describe('pure helpers', () => {
  it('maps W S A D and the arrows by physical key', () => {
    expect(keyIntent('KeyW')).toMatchObject({ kind: 'walk', dir: 1 });
    expect(keyIntent('ArrowUp')).toMatchObject({ kind: 'walk', dir: 1 });
    expect(keyIntent('KeyS')).toMatchObject({ kind: 'walk', dir: -1 });
    expect(keyIntent('ArrowDown')).toMatchObject({ kind: 'walk', dir: -1 });
    expect(keyIntent('KeyA')).toMatchObject({ kind: 'turn', dir: -1 });
    expect(keyIntent('ArrowLeft')).toMatchObject({ kind: 'turn', dir: -1 });
    expect(keyIntent('KeyD')).toMatchObject({ kind: 'turn', dir: 1 });
    expect(keyIntent('ArrowRight')).toMatchObject({ kind: 'turn', dir: 1 });
    expect(keyIntent('Space')).toBeNull();
    expect(keyIntent('Enter')).toBeNull();
  });

  it('normalises wheel pixels, lines and pages, and clamps a violent flick', () => {
    expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(100, 6);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 }, 900)).toBe(300);
    expect(wheelPixels({ deltaY: 5000, deltaMode: 0 })).toBe(300);
    expect(wheelPixels({ deltaY: -5000, deltaMode: 0 })).toBe(-300);
  });

  it('calls a mostly vertical finger a walk and everything else a look', () => {
    expect(classifyDrag(3, -40, 'touch')).toBe('walk');
    expect(classifyDrag(30, -40, 'touch')).toBe('walk');
    expect(classifyDrag(40, -30, 'touch')).toBe('look');
    expect(classifyDrag(30, 30, 'touch')).toBe('look');
    expect(classifyDrag(0, -40, 'mouse')).toBe('look');
  });
});

describe('keys', () => {
  it('holds forward while W is down and lets go on release', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'keyup', key('KeyW'));
    expect(r.calls).toEqual(['hold:key:1', 'turn:key:0', 'hold:key:0', 'turn:key:0']);
  });

  it('keeps walking when W and the up arrow overlap and one is released', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'keydown', key('ArrowUp'));
    r.calls.length = 0;
    fire(r.host, 'keyup', key('KeyW'));
    expect(r.calls).toContain('hold:key:1');
    expect(r.calls).not.toContain('hold:key:0');
  });

  it('cancels out opposite keys', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'keydown', key('KeyS'));
    expect(r.calls.at(-2)).toBe('hold:key:0');
  });

  it('turns on A and D, the arrows left and right', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyA'));
    expect(r.calls).toContain('turn:key:-1');
    fire(r.host, 'keyup', key('KeyA'));
    fire(r.host, 'keydown', key('ArrowRight'));
    expect(r.calls).toContain('turn:key:1');
  });

  it('ignores auto-repeat after the first press', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    const n = r.calls.length;
    fire(r.host, 'keydown', key('KeyW', { repeat: true }));
    expect(r.calls.length).toBe(n);
  });

  it('prevents the default of a movement key so the page does not scroll', () => {
    const r = rig();
    expect(fire(r.host, 'keydown', key('ArrowDown')).defaultPrevented).toBe(true);
    expect(fire(r.host, 'keydown', key('Tab')).defaultPrevented).toBe(false);
  });

  it('leaves browser shortcuts alone', () => {
    const r = rig();
    const e = fire(r.host, 'keydown', key('KeyW', { ctrlKey: true }));
    expect(e.defaultPrevented).toBe(false);
    expect(r.calls).toEqual([]);
  });

  it('ignores keys typed into a field and keys inside a dialog', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW', { target: { tagName: 'INPUT' } }));
    fire(r.host, 'keydown', key('KeyW', { target: { closest: () => ({}) } }));
    expect(r.calls).toEqual([]);
  });

  it('leaves keys to the page at rest: no walking, no preventDefault, and not a gesture', () => {
    for (const mode of ['page', 'look'] as const) {
      const r = rig();
      r.options.mode = mode;
      for (const code of ['KeyW', 'ArrowDown', 'Space', 'PageDown', 'Tab']) {
        expect(fire(r.host, 'keydown', key(code)).defaultPrevented).toBe(false);
      }
      expect(r.calls).toEqual([]);
      expect(r.gestures).toBe(0);
    }
  });

  it('takes no movement while held but still counts a key as a gesture', () => {
    const r = rig();
    r.options.mode = 'held';
    expect(fire(r.host, 'keydown', key('KeyW')).defaultPrevented).toBe(false);
    expect(r.calls).toEqual([]);
    expect(r.gestures).toBe(1);
  });

  it('lets go of every key when the window loses focus', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'keydown', key('KeyD'));
    r.calls.length = 0;
    fire(r.host, 'blur');
    expect(r.calls).toEqual(['hold:key:0', 'turn:key:0']);
  });

  it('counts a press as a gesture once, not its repeats, and not a bare modifier', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'keydown', key('KeyW', { repeat: true }));
    fire(r.host, 'keydown', key('ShiftLeft', { key: 'Shift' }));
    expect(r.gestures).toBe(1);
  });

  it('does not unlock sound for control-owned keys, while movement keys still reach the scene', () => {
    const r = rig();
    const control = {
      closest: (selector: string) => selector.includes('[data-fp-ignore]') ? {} : null,
    };
    fire(r.host, 'keydown', key('Enter', { target: control }));
    fire(r.host, 'keydown', key('KeyW', { target: control }));
    fire(r.host, 'keyup', key('KeyW', { target: control }));
    expect(r.gestures).toBe(0);
    expect(r.calls).toEqual(['hold:key:1', 'turn:key:0', 'hold:key:0', 'turn:key:0']);
  });

  it('does not treat keyboard actions on interface controls as world gestures', () => {
    for (const tagName of ['BUTTON', 'SUMMARY']) {
      const control = Object.assign(new EventTarget(), {
        tagName,
        closest: (selector: string) => (selector.includes(tagName.toLowerCase()) ? control : null),
      });
      const r = rig({ host: control });
      fire(control, 'keydown', key('Enter'));
      expect(r.gestures).toBe(0);
    }
  });

  it('steps between viewpoints instead of walking under reduced motion', () => {
    const r = rig();
    r.options.reduced = true;
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'keydown', key('KeyW', { repeat: true }));
    fire(r.host, 'keydown', key('ArrowDown'));
    fire(r.host, 'keydown', key('KeyD'));
    expect(r.steps).toEqual([1, -1]);
    expect(r.calls).toEqual([]);
  });
});

describe('wheel', () => {
  it('walks a notch of 100 px about 0.35 m, forward for scrolling down', () => {
    const r = rig();
    fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false });
    fire(r.host, 'wheel', { deltaY: -100, deltaMode: 0, ctrlKey: false });
    expect(r.calls).toEqual(['nudge:0.3500', 'nudge:-0.3500']);
  });

  it('is never a gesture', () => {
    const r = rig();
    fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false });
    expect(r.gestures).toBe(0);
  });

  it('never prevents the page scrolling when the page owns the wheel: at rest the wheel scrolls over the scene', () => {
    for (const mode of ['page', 'look'] as const) {
      const r = rig();
      r.options.mode = mode;
      for (const deltaY of [100, -100, 1000]) {
        expect(fire(r.host, 'wheel', { deltaY, deltaMode: 0, ctrlKey: false }).defaultPrevented).toBe(false);
      }
      expect(r.calls).toEqual([]);
    }
  });

  it('holds the page still under the wheel once engaged, and walks only when nothing is scripted', () => {
    const r = rig();
    expect(fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false }).defaultPrevented).toBe(true);
    expect(r.calls).toEqual(['nudge:0.3500']);
    r.calls.length = 0;
    r.options.mode = 'held';
    expect(fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false }).defaultPrevented).toBe(true);
    expect(r.calls).toEqual([]);
  });

  it('leaves a pinch-zoom alone and a wheel inside a dialog', () => {
    const r = rig();
    expect(fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(
      fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false, target: { closest: () => ({}) } })
        .defaultPrevented,
    ).toBe(false);
    expect(r.calls).toEqual([]);
  });

  it('does not travel under reduced motion', () => {
    const r = rig();
    r.options.reduced = true;
    fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false });
    expect(r.calls).toEqual([]);
  });
});

describe('drag', () => {
  const down = (r: Rig, x: number, y: number, type = 'mouse', id = 1) =>
    fire(r.surface, 'pointerdown', { pointerId: id, pointerType: type, button: 0, clientX: x, clientY: y });
  const move = (r: Rig, x: number, y: number, id = 1) =>
    fire(r.host, 'pointermove', { pointerId: id, clientX: x, clientY: y });
  const up = (r: Rig, id = 1) => fire(r.host, 'pointerup', { pointerId: id });

  it('does not look until the pointer has travelled past the threshold, so a click is a click', () => {
    const r = rig();
    down(r, 100, 100);
    move(r, 103, 101);
    up(r);
    expect(r.calls).toEqual([]);
    expect(r.input.wasDrag()).toBe(false);
    expect(r.surface.captured).toEqual([]);
  });

  it('grabs the world: dragging right turns the view left, dragging down looks up', () => {
    const r = rig();
    down(r, 100, 100);
    move(r, 120, 110);
    up(r);
    // The 20 px and 10 px since pick-up all count: no dead zone swallowed by the threshold.
    expect(r.calls).toEqual(['look:-1.000:0.500']);
    expect(r.input.wasDrag()).toBe(true);
    expect(r.surface.captured).toEqual([1]);
  });

  it('forgets the drag at the next pointer-down', () => {
    const r = rig();
    down(r, 100, 100);
    move(r, 140, 100);
    up(r);
    expect(r.input.wasDrag()).toBe(true);
    down(r, 10, 10);
    expect(r.input.wasDrag()).toBe(false);
  });

  it('turns a mostly vertical touch swipe into walking: finger up goes forward', () => {
    const r = rig();
    down(r, 200, 600, 'touch');
    move(r, 202, 540, 1);
    up(r);
    expect(r.calls).toEqual(['nudge:0.2100']);
    expect(r.touches).toBe(1);
  });

  it('gives a horizontal touch drag a higher look gain than a mouse', () => {
    const r = rig();
    down(r, 200, 600, 'touch');
    move(r, 240, 600, 1);
    up(r);
    expect(r.calls).toEqual(['look:-3.000:0.000']);
  });

  it('abandons a drag when a second finger lands', () => {
    const r = rig();
    down(r, 200, 600, 'touch', 1);
    move(r, 240, 600, 1);
    r.calls.length = 0;
    down(r, 50, 50, 'touch', 2);
    move(r, 260, 600, 1);
    expect(r.calls).toEqual([]);
  });

  it('does not start a drag on a control drawn over the surface', () => {
    const r = rig();
    fire(r.surface, 'pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 0,
      clientY: 0,
      target: { closest: (selector: string) => (selector === '[data-fp-ignore]' ? {} : null) },
    });
    move(r, 100, 0);
    expect(r.calls).toEqual([]);
    expect(r.touches).toBe(1);
  });

  it('ignores the right button, and every drag while the page owns the input or a move is scripted', () => {
    const r = rig();
    fire(r.surface, 'pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2, clientX: 0, clientY: 0 });
    move(r, 100, 100);
    for (const mode of ['page', 'held'] as const) {
      r.options.mode = mode;
      down(r, 0, 0);
      move(r, 100, 100);
      up(r);
    }
    expect(r.calls).toEqual([]);
  });

  it('at rest a mouse drag still looks, in both axes, and a finger drag sideways looks', () => {
    const r = rig();
    r.options.mode = 'look';
    down(r, 100, 100);
    move(r, 120, 110);
    up(r);
    expect(r.calls).toEqual(['look:-1.000:0.500']);
    r.calls.length = 0;
    down(r, 200, 600, 'touch', 2);
    move(r, 240, 610, 2);
    up(r, 2);
    expect(r.calls).toEqual(['look:-3.000:0.750']);
  });

  it('at rest a finger that goes up or down is left to scroll the page: not a look, not a walk, not a drag', () => {
    const r = rig();
    r.options.mode = 'look';
    down(r, 200, 600, 'touch');
    move(r, 202, 560, 1);
    move(r, 202, 500, 1);
    up(r);
    expect(r.calls).toEqual([]);
    expect(r.input.wasDrag()).toBe(false);
    expect(r.surface.captured).toEqual([]);
  });

  it('waits 12 px before choosing an axis for a finger, 5 px for a mouse', () => {
    const r = rig();
    down(r, 200, 600, 'touch');
    move(r, 200, 589, 1); // 11 px
    expect(r.calls).toEqual([]);
    expect(r.input.wasDrag()).toBe(false);
    move(r, 200, 587, 1); // 13 px
    expect(r.calls).not.toEqual([]);
    expect(r.input.wasDrag()).toBe(true);
    up(r);
    r.calls.length = 0;
    down(r, 100, 100, 'mouse', 2);
    move(r, 104, 100, 2);
    expect(r.calls).toEqual([]);
    move(r, 106, 100, 2);
    expect(r.calls).not.toEqual([]);
  });

  it('takes the threshold from its options', () => {
    const r = rig({ dragThresholdPx: { touch: 30 } });
    down(r, 200, 600, 'touch');
    move(r, 200, 575, 1);
    expect(r.calls).toEqual([]);
    move(r, 200, 560, 1);
    expect(r.calls).not.toEqual([]);
  });

  it('never changes its mind in the middle of a gesture: the axis chosen at the threshold holds', () => {
    // Starts sideways (look), then travels far more up than across: still a look, no walking.
    const a = rig();
    down(a, 200, 600, 'touch');
    move(a, 216, 600, 1);
    move(a, 216, 400, 1);
    up(a);
    expect(a.calls.every((c) => c.startsWith('look:'))).toBe(true);
    // Starts up (walk), then travels far more across than up: still a walk, no looking.
    const b = rig();
    down(b, 200, 600, 'touch');
    move(b, 200, 580, 1);
    move(b, 40, 580, 1);
    up(b);
    expect(b.calls.length).toBeGreaterThan(0);
    expect(b.calls.every((c) => c.startsWith('nudge:'))).toBe(true);
  });

  it('does not change a gesture when the window is engaged or released part-way through it', () => {
    // Begun at rest (a finger going up is the page's), engaged part-way: it stays the page's.
    const a = rig();
    a.options.mode = 'look';
    down(a, 200, 600, 'touch');
    move(a, 200, 570, 1);
    a.options.mode = 'engaged';
    move(a, 200, 500, 1);
    up(a);
    expect(a.calls).toEqual([]);
    // Begun at rest, under the threshold, engaged before it is crossed: still the page's gesture.
    const c = rig();
    c.options.mode = 'look';
    down(c, 200, 600, 'touch');
    move(c, 200, 595, 1);
    c.options.mode = 'engaged';
    move(c, 200, 540, 1);
    up(c);
    expect(c.calls).toEqual([]);
    // Begun engaged (a walk), released part-way: it carries on as that walk until the finger lifts.
    const b = rig();
    down(b, 200, 600, 'touch');
    move(b, 200, 570, 1);
    b.options.mode = 'look';
    move(b, 200, 500, 1);
    up(b);
    expect(b.calls.length).toBe(2);
    expect(b.calls.every((c) => c.startsWith('nudge:'))).toBe(true);
  });

  it('counts a click on the surface as a gesture, and nothing else about pointers', () => {
    const r = rig();
    down(r, 0, 0);
    expect(r.gestures).toBe(0);
    up(r);
    fire(r.surface, 'click');
    expect(r.gestures).toBe(1);
  });

  for (const pointer of ['mouse', 'touch'] as const) {
    for (const mode of ['engaged', 'look'] as const) {
      it(`does not unlock audio for the trailing click after a ${pointer} drag in ${mode} mode`, () => {
        const r = rig();
        r.options.mode = mode;
        down(r, 100, 100, pointer);
        move(r, 160, 100, 1);
        up(r);
        fire(r.surface, 'click');
        expect(r.gestures).toBe(0);
        // A subsequent deliberate click still works.
        down(r, 100, 100, pointer);
        up(r);
        fire(r.surface, 'click');
        expect(r.gestures).toBe(1);
      });
    }
  }

  it('swipes under reduced motion step between viewpoints, once per swipe', () => {
    const r = rig();
    r.options.reduced = true;
    down(r, 200, 600, 'touch');
    move(r, 200, 540, 1);
    move(r, 200, 480, 1);
    up(r);
    expect(r.steps).toEqual([1]);
    expect(r.calls).toEqual([]);
  });
});

describe('dispose', () => {
  it('removes every listener and releases held keys', () => {
    const r = rig();
    fire(r.host, 'keydown', key('KeyW'));
    r.calls.length = 0;
    r.input.dispose();
    expect(r.calls).toEqual(['hold:key:0', 'turn:key:0']);
    r.calls.length = 0;
    fire(r.host, 'keydown', key('KeyW'));
    fire(r.host, 'wheel', { deltaY: 100, deltaMode: 0, ctrlKey: false });
    fire(r.surface, 'click');
    expect(r.calls).toEqual([]);
    expect(r.gestures).toBe(1);
  });
});
