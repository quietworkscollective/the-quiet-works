export const OFFICE_OBJECT_IDS = [
  'press', 'ink-pad', 'machine', 'lamp', 'drawer', 'tiny-stamp', 'register', 'window',
  'bell', 'sign', 'side-door', 'service-panel', 'chair', 'stack', 'clock', 'conduit',
  'routing-tray', 'coat-hook',
] as const;

export type OfficeObjectId = (typeof OFFICE_OBJECT_IDS)[number];
export type OfficeMemoId = 'office-01' | 'office-02' | 'office-03' | 'office-04' | 'office-05';
export type OfficeArtifactId = 'office-12' | 'office-13' | 'office-17';
export type OfficeSoundKind = 'rubber' | 'paper' | 'metal' | 'wood' | 'cloth' | 'bell' | 'whisper';

export interface OfficeObjectSpec {
  readonly id: OfficeObjectId;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly action: string;
  readonly first: string;
  readonly repeats: readonly string[];
  readonly repeatActions?: readonly string[];
  readonly caption: string;
  readonly soundKind: OfficeSoundKind;
  readonly memoId?: OfficeMemoId;
}

/** Authored draft labels and responses; editorial approval precedes publication. */
export const OFFICE_OBJECTS: readonly OfficeObjectSpec[] = [
  { id: 'press', name: 'Brass press and form', position: [-1, 0.95, 4], action: 'Inspect press',
    first: 'A brass press stands over the form. Compress and release, or choose Stamp once.',
    repeats: ['The spring takes up its travel. The form remains available.'], caption: '[Rubber meets the wooden desk]', soundKind: 'rubber' },
  { id: 'ink-pad', name: 'Ink pad', position: [-1.8, 0.85, 3.9], action: 'Open ink pad',
    first: 'The enamel lid opens. The felt can be re-inked without changing any approval.',
    repeats: ['The ink-pad lid closes.', 'The ink-pad lid opens again.'], repeatActions: ['Close ink pad', 'Open ink pad'], caption: '[Enamel lid clacks]', soundKind: 'metal' },
  { id: 'machine', name: 'Approval machine', position: [1, 0.68, 4.9], action: 'Inspect machine',
    first: 'The amber display faces the current receipt. An approval can expire on arrival.',
    repeats: ['The display and receipt remain readable. The front inspection bay has a hinged cover.'], caption: '[A small relay clicks]', soundKind: 'metal' },
  { id: 'lamp', name: 'Desk lamp', position: [-1.9, 1.2, 4.3], action: 'Turn lamp shade',
    first: 'The shade turns towards the wall. A loose sheet rests beneath its base.',
    repeats: ['The shade turns back towards the desk.', 'The shade turns towards the wall.'], caption: '[Lamp hinge scrapes softly]', soundKind: 'metal', memoId: 'office-05' },
  { id: 'drawer', name: 'Drawer', position: [-1.5, 0.62, 3.7], action: 'Open drawer',
    first: 'The lower drawer slides open. A small object and a paper sit inside.',
    repeats: ['The drawer object turns once towards the opening.', 'The drawer object gives one soft squeak. Its paper stays put.'], repeatActions: ['Turn drawer object', 'Squeak drawer object'], caption: '[Wooden drawer slides]', soundKind: 'wood', memoId: 'office-01' },
  { id: 'tiny-stamp', name: 'Tiny underside stamp', position: [-0.45, 0.75, 4], action: 'Inspect underside',
    first: 'The small fitting rotates into a readable view beneath the desk.',
    repeats: ['One sample impression appears. The specimen remains here.', 'The rubber face remains readable. No further impression is needed.'], repeatActions: ['Make sample impression', 'Inspect underside'], caption: '[A small dry rubber tick]', soundKind: 'rubber' },
  { id: 'register', name: 'Certificate register', position: [-3.5, 1, 5.9], action: 'Open register',
    first: 'The cloth cover opens at the first entry.',
    repeats: ['The first page remains open.', 'The cloth cover rests beside the pages.', 'The entry remains readable.'], repeatActions: ['Turn register page'], caption: '[Cloth cover and paper shift]', soundKind: 'paper', memoId: 'office-03' },
  { id: 'window', name: 'Employee window', position: [-2.25, 1.55, 8], action: 'Open speaking flap',
    first: 'The speaking flap opens. An empty repaired chair is visible beyond the glass.',
    repeats: ['The speaking flap closes.', 'The speaking flap opens. Listening is optional.'], repeatActions: ['Close speaking flap', 'Open speaking flap'], caption: '[Speaking flap clicks]', soundKind: 'metal' },
  { id: 'bell', name: 'Service bell', position: [0.9, 1.4, 4.9], action: 'Ring service bell',
    first: 'One damped ring. The window ticket flips.',
    repeats: ['One damped ring. The ticket stays in place.'], caption: '[Service bell rings softly]', soundKind: 'bell' },
  { id: 'sign', name: 'Office sign', position: [3.65, 1.55, 1.8], action: 'Turn office sign',
    first: 'The sign turns to its reverse.',
    repeats: ['The front reads CERTIFICATION OFFICE.', 'The sign turns to its reverse.'], caption: '[Sign bracket creaks]', soundKind: 'metal' },
  { id: 'side-door', name: 'Side door', position: [4.2, 1.12, 1.8], action: 'Inspect side door',
    first: 'The side door is unlocked. Its vestibule returns to the corridor.',
    repeats: ['An ordinary latch. The way back remains available.'], caption: '[Door latch moves; corridor air]', soundKind: 'metal' },
  { id: 'service-panel', name: 'Rear service panel', position: [3.2, 1.15, 6.7], action: 'Inspect service label',
    first: 'The service label identifies a rear route. Overload releases its handle.',
    repeats: ['The rear route rejoins the side vestibule and returns to the corridor.'], caption: '[Ribbed steel gives a dull tick]', soundKind: 'metal' },
  { id: 'chair', name: 'Clerk’s chair', position: [-2.25, 0.5, 8.8], action: 'Inspect chair through glass',
    first: 'Through the glass, a repaired vinyl seat and its repair note become readable.',
    repeats: ['A patch bridges the worn seat.', 'The repair note stays beside the chair. The chair does not move.'], caption: '[Quiet beyond the window]', soundKind: 'cloth', memoId: 'office-04' },
  { id: 'stack', name: 'Infinite stack', position: [-3.1, 1.1, 7], action: 'Lift paper sample',
    first: 'One sheet lifts from the stack. Its reverse is identically blank.',
    repeats: ['The sample front is blank.', 'The sample reverse is blank.'], repeatActions: ['Turn paper sample'], caption: '[A crisp sheet separates]', soundKind: 'paper' },
  { id: 'clock', name: 'Office clock', position: [0, 2.5, 8], action: 'Read clock hands',
    first: 'One hand advances. The other remains at its mark.',
    repeats: ['One hand advances.', 'The other hand stays at its mark.'], repeatActions: ['Read other clock hand'], caption: '[One mechanical clock tick]', soundKind: 'metal' },
  { id: 'conduit', name: 'Maintenance conduit cover', position: [3.7, 1.05, 5.4], action: 'Open conduit cover',
    first: 'The tethered cover opens over the conduit.',
    repeats: ['The cover remains tethered beside the exposed conduit.'], repeatActions: ['Inspect conduit'], caption: '[Tethered metal cover ticks]', soundKind: 'metal' },
  { id: 'routing-tray', name: 'Routing tray', position: [-2.7, 0.95, 5.8], action: 'Separate routing slips',
    first: 'Three paper slips separate in the tray.',
    repeats: ['The first slip lies on top.', 'The second slip lies on top.', 'The third slip lies on top.'], repeatActions: ['Read next routing slip'], caption: '[Three paper slips shuffle]', soundKind: 'paper', memoId: 'office-02' },
  { id: 'coat-hook', name: 'Coat hook', position: [-3.8, 1.55, 2], action: 'Lift empty hanger',
    first: 'The empty hanger lifts. A worn patch records long use of the hook.',
    repeats: ['The hanger rests against the hook.', 'The lifted hanger shows the worn patch again.'], caption: '[Wire hanger rattles modestly]', soundKind: 'metal' },
];

export const OFFICE_OBJECT_COPY = {
  nearby: 'Things nearby', response: 'What happened', wait: 'Wait without stamping',
  exits: 'Office exits',
  stamp: 'Stamp once', reink: 'Re-ink the pad', listen: 'Listen', read: 'Read',
  whisperCaption: '[Quiet whisper at the employee window]',
  entrance: 'Leave through entrance', side: 'Leave through side door', service: 'Leave through service route',
  serviceUnavailable: 'The service route opens only after an overload.', close: 'Close memo',
  kept: 'Copy kept for this visit. The physical copy remains here.',
} as const;


export const OFFICE_ITEM_IDS = [
  'office-01', 'office-02', 'office-03', 'office-04', 'office-05', 'office-06', 'office-07', 'office-08', 'office-09', 'office-10', 'office-11', 'office-12', 'office-13', 'office-14', 'office-15', 'office-16', 'office-17', 'office-18'
] as const;
export type OfficeItemId = (typeof OFFICE_ITEM_IDS)[number];

const DISCOVERY_TOKENS: Record<OfficeItemId, string> = {
  'office-01': '40eb9bd72c37354364d36206dda0a7a719d7',
  'office-02': '50a125a1b1df6cfc1684169f3b270cbd3a65',
  'office-03': '55b811d4a40ddbb337bae7770d78a0241825',
  'office-04': 'f29d261a742100be0a20e327d733b8ebdbe2',
  'office-05': '005e121672578fe871f53ed3bba680b2e7f7',
  'office-06': 'e293d02f1ba751fdd4e4216d6e13236c120d',
  'office-07': '6ae5bba3c23e7b72171a71f546642648413e',
  'office-08': '563e217d2e408c7fc132873ccd709d210f30',
  'office-09': 'd97d90a080a266241ffb3fc873e7a96800ec',
  'office-10': 'c135688cb1ca343815cb80112aa55cc97d7f',
  'office-11': '8382e06b3cff0b3254aad3b891791da7a027',
  'office-12': '255eecaeaf88ae9b70b51be3092a40f4493f',
  'office-13': 'd70ed52f0206347d2afab081d0d219f8e20c',
  'office-14': '87ffc8b401ba16d9a8793d44090719f8f152',
  'office-15': 'e3f64ff7c10a15e2fea8ac90e5c8900cd4c3',
  'office-16': '4a2a69cb1b07cc48b4da648686d80f5ff29c',
  'office-17': '533ebce65e3ff5048bc88b643d9d8470f595',
  'office-18': '02a258d41ff10deeb0adb4f9058478c60828',
};

export const OFFICE_FINDINGS: Partial<Record<OfficeObjectId, readonly OfficeItemId[]>> = {
  drawer: ['office-01', 'office-06'], 'routing-tray': ['office-02', 'office-12', 'office-16'],
  register: ['office-03', 'office-08'], chair: ['office-04'], lamp: ['office-05'],
  'tiny-stamp': ['office-07', 'office-17'], window: ['office-09', 'office-12'],
  'ink-pad': ['office-11'], machine: ['office-13'], sign: ['office-14'],
  bell: ['office-15'], clock: ['office-18'],
};

export interface OfficeResponse {
  readonly id: OfficeObjectId;
  readonly text: string;
  readonly caption: string;
  readonly soundKind: OfficeSoundKind;
}

export interface OfficeState {
  readonly uses: Readonly<Record<OfficeObjectId, number>>;
  readonly variants: Readonly<Record<OfficeObjectId, number>>;
  readonly toggles: Readonly<Record<OfficeObjectId, boolean>>;
  readonly freshInk: boolean;
  readonly discoveries: Readonly<Partial<Record<OfficeItemId, string>>>;
  readonly response: OfficeResponse | null;
  readonly discoveredMemos: readonly OfficeMemoId[];
  readonly kept: readonly OfficeArtifactId[];
  readonly listened: boolean;
  readonly activeMemo: OfficeMemoId | null;
}

export interface OfficeStore {
  getState(): OfficeState;
  subscribe(listener: () => void): () => void;
  inspect(id: OfficeObjectId, stamps?: number): OfficeResponse;
  pause(): void;
  reink(): void;
  useInk(): void;
  listen(): OfficeResponse | null;
  readMemo(id: OfficeMemoId | null): void;
  keep(artifact: OfficeArtifactId): void;
}

function record<T>(value: T): Record<OfficeObjectId, T> {
  return Object.fromEntries(OFFICE_OBJECT_IDS.map((id) => [id, value])) as Record<OfficeObjectId, T>;
}

/** Visit-only discoveries are independent of certification RESET and never consume originals. */
export function createOfficeStore(): OfficeStore {
  let state: OfficeState = {
    uses: record(0), variants: record(0), toggles: record(false), freshInk: false,
    discoveries: {}, response: null, discoveredMemos: [], kept: [], listened: false, activeMemo: null,
  };
  const listeners = new Set<() => void>();
  const update = (next: OfficeState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const discoveries = (ids: readonly OfficeItemId[]) => ({
    ...state.discoveries, ...Object.fromEntries(ids.map(id => [id, DISCOVERY_TOKENS[id]])),
  });
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    inspect(id, stamps = 0) {
      const spec = OFFICE_OBJECTS.find((object) => object.id === id);
      if (!spec) throw new RangeError('Unknown office object');
      const first = state.uses[id] === 0;
      const response: OfficeResponse = {
        id, text: first ? spec.first : (spec.repeats[state.variants[id]] ?? spec.first),
        caption: spec.caption, soundKind: spec.soundKind,
      };
      update({
        ...state, response,
        discoveries: discoveries((OFFICE_FINDINGS[id] ?? []).filter(item =>
          item !== 'office-09' && item !== 'office-11' && (id !== 'window' || item !== 'office-12') && (item !== 'office-13' || stamps >= 2))),
        uses: { ...state.uses, [id]: Math.min(state.uses[id] + 1, spec.repeats.length + 1) },
        variants: { ...state.variants, [id]: first ? 0 :
          id === 'drawer' || id === 'tiny-stamp'
            ? Math.min(state.variants[id] + 1, spec.repeats.length - 1)
            : (state.variants[id] + 1) % spec.repeats.length },
        toggles: { ...state.toggles, [id]: id === 'drawer' || id === 'conduit' || id === 'tiny-stamp'
          ? true : !state.toggles[id] },
        discoveredMemos: spec.memoId && !state.discoveredMemos.includes(spec.memoId)
          ? [...state.discoveredMemos, spec.memoId] : state.discoveredMemos,
      });
      return response;
    },
    pause() {
      if (!state.discoveries['office-10']) update({ ...state, discoveries: discoveries(['office-10']) });
    },
    reink() {
      if (state.toggles['ink-pad'] && !state.freshInk) update({ ...state, freshInk: true, discoveries: discoveries(['office-11']) });
    },
    useInk() { if (state.freshInk) update({ ...state, freshInk: false }); },
    listen() {
      if (!state.toggles.window) return null;
      const response: OfficeResponse = {
        id: 'window', text: 'A quiet recording is available to read.',
        caption: OFFICE_OBJECT_COPY.whisperCaption, soundKind: 'whisper',
      };
      update({ ...state, response, listened: true, discoveries: discoveries(['office-09', 'office-12']) });
      return response;
    },
    readMemo(id) {
      if (id !== null && !state.discoveredMemos.includes(id)) return;
      if (state.activeMemo !== id) update({ ...state, activeMemo: id });
    },
    keep(artifact) {
      if (state.kept.includes(artifact)) return;
      if (!state.discoveries[artifact]) return;
      update({ ...state, kept: [...state.kept, artifact] });
    },
  };
}
