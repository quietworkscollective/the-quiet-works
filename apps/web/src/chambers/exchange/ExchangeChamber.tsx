import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createOfficeArchive, parseSealedFile, type DiscoveryState, type SealedItem } from '@tqw/engine';
import { SceneBoundary } from '../../SceneBoundary.tsx';
import type { ChamberProps } from '../types.ts';
import {
  ARCHIVE_EMPTY,
  CLERESTORY_LINE,
  CONNECTED_RESULT,
  CONTROLS,
  CORD_LINE,
  CUES,
  DESK_LAMP_LINE,
  DRAWER_SHUT,
  HINTS,
  HUM_CAPTION,
  LEAD_SEATED,
  LINE_CARDS,
  LIP_EMPTY,
  NIGHT_ALREADY,
  NIGHT_HEADING,
  NIGHT_STATUS,
  OPERATOR_CAPTION,
  PLATE_FACE,
  PLATE_RESULT,
  PLATE_SHUT,
  PLUG_PROMPT,
  READERS,
  READER_OF_FINDING,
  ROOM_TITLE,
  SIGN_LINE,
  STATIONS,
  STATION_OF_VIEW,
  TEXT_EXAMINES,
  TEXT_INTRO,
  TEXT_INTRO_UNSUPPORTED,
  TEXT_RETRY,
  VIEW_LABELS,
  WIRING_CARD_TEXT,
  hintStage,
  type CueId,
  type ReaderId,
  type ViewId,
} from './copy.ts';
import {
  CERTIFICATION_LINE,
  EXCHANGE_FINDINGS,
  EXCHANGE_TOKENS,
  RULE_IDS,
  isExchangeFinding,
  loadExchangeState,
  saveExchangeState,
  transitionExchange,
  type ExchangeEvent,
  type ExchangeFindingId,
  type ExchangeObjectId,
  type ExchangeState,
} from './state.ts';
import type { ExchangeHotspot } from './stage.ts';
import sealedExchange from '../../../../../packages/engine/src/sealed/exchange.sealed.json';
import provenance from './provenance.json';
import './exchange.css';

const ExchangeScene = lazy(() => import('./scene/ExchangeScene.tsx'));

const EMPTY_DISCOVERIES: DiscoveryState = { version: 1, found: {}, recognitions: [] };
const noSubscription = () => () => {};
const noDiscoveries = () => EMPTY_DISCOVERIES;

/** The Office's sealed-file cache keys items by plain id at runtime; only its declared id type is narrower. */
interface ExchangeArchive {
  getState(): Readonly<Partial<Record<ExchangeFindingId, { readonly item: SealedItem }>>>;
  subscribe(listener: () => void): () => void;
  open(id: ExchangeFindingId, token: string): Promise<unknown>;
}
const createArchive = () => createOfficeArchive(parseSealedFile(sealedExchange)) as unknown as ExchangeArchive;

type ActionId = 'viewJacks' | 'viewDeskTop' | 'cardigan' | 'night' | 'wiring' | 'plug' | 'connect' | 'follow' | 'form' | 'lift' | 'tickets'
  | 'rulebook' | 'bell' | 'flask' | 'plate' | 'test' | 'diagram' | 'rota' | 'index';

/**
 * A named control. `home` is the view a primary press moves to first, `hotspot` the object outlined
 * while it holds keyboard focus, and `unavailable` its spoken reason.
 */
interface Control {
  readonly action: ActionId;
  readonly label: string;
  readonly home?: ViewId;
  readonly hotspot?: ExchangeHotspot;
  readonly unavailable?: string;
}

/** One visitor action: what the machine is told, and where its words go. */
interface Beat {
  readonly event?: ExchangeEvent;
  readonly view?: ViewId;
  readonly following?: boolean;
  readonly reader?: ReaderId;
  readonly result?: readonly string[];
  readonly cues?: readonly CueId[];
  /** The jack whose card tips. The line is also the one a card reader shows. */
  readonly touched?: number;
  /** A refused object's small movement, played once. */
  readonly nudge?: 'telephone' | 'plate' | 'drawer';
}

/** Text that belongs to the open reader for this action alone. */
interface ReaderNotes { readonly head: readonly string[]; readonly foot: readonly string[] }
const NO_NOTES: ReaderNotes = { head: [], foot: [] };

const typeset = (title: string) => title.replace("'", '’');

/** OPERATOR TEST owns the result region only where the circuit can be seen. */
const operatorHolds = (state: ExchangeState, view: ViewId) =>
  state.handset === 'off-hook' && state.service === 'day' && (view === 'kneehole' || view === 'desk-top');

function SealedBody({ item }: { readonly item: SealedItem | undefined }) {
  return item ? <>{item.body.map((line, index) => <p key={index}>{line}</p>)}</> : null;
}

/**
 * The room's fixed regions and every rule that routes its words. The machine lives in state.ts; this
 * file decides which view, reader and region answer. Nothing here reads a clock.
 */
export default function ExchangeChamber(props: ChamberProps) {
  const { settings, text, sound, caption, onReady, onContextLost, onSceneError, onLeave, discoveries, reread, onRereadOpened } = props;
  const subscribe = useCallback((listener: () => void) => discoveries?.subscribe(listener) ?? noSubscription(), [discoveries]);
  const snapshot = useCallback(() => discoveries?.getState() ?? noDiscoveries(), [discoveries]);
  const discoveryState = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [archive] = useState(createArchive);
  const opened = useSyncExternalStore(archive.subscribe, archive.getState, archive.getState);

  const [state, setState] = useState(() => loadExchangeState(discoveries));
  const [view, setView] = useState<ViewId>('wide');
  const [followingCord, setFollowingCord] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [touchedLine, setTouchedLine] = useState<number | null>(null);
  const [focusedHotspot, setFocusedHotspot] = useState<ExchangeHotspot | null>(null);
  const [feedback, setFeedback] = useState<{ id: 'telephone' | 'plate' | 'drawer'; sequence: number } | null>(null);
  const [reader, setReader] = useState<ReaderId | null>(null);
  const [cardLine, setCardLine] = useState<number | null>(null);
  const [notes, setNotes] = useState<ReaderNotes>(NO_NOTES);
  const [result, setResult] = useState<readonly string[]>([]);
  const [row, setRow] = useState<string | null>(null);
  const [assist, setAssist] = useState('');
  const [hintRung, setHintRung] = useState(0);
  const [hintLine, setHintLine] = useState('');
  const [lineFocus, setLineFocus] = useState(CERTIFICATION_LINE - 1);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLost, setSceneLost] = useState(false);

  const root = useRef<HTMLDivElement | null>(null);
  const primaryButton = useRef<HTMLButtonElement | null>(null);
  const firstSlot = useRef<HTMLButtonElement | null>(null);
  const stateRef = useRef(state);
  /** The store as this room last left it. Any other snapshot came from Forget everything or an import. */
  const ownSnapshot = useRef<DiscoveryState | null>(discoveries?.getState() ?? null);
  const viewRef = useRef(view);
  const readerRef = useRef(reader);
  const readyRef = useRef(onReady);
  const humCaptioned = useRef(false);
  const pressed = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const textMode = text !== null || sceneLost;
  const night = state.service === 'night';
  const seated = state.plug === 'seated';
  const lifted = state.handset === 'off-hook';
  const plateOpen = state.plate === 'open';
  const found = (id: ExchangeFindingId) => state.discoveries.includes(id);

  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => { if (textMode) readyRef.current(); }, [textMode]);

  /** Text mode sits in the page's flow under the landing, where a direct arrival would otherwise stay. */
  useLayoutEffect(() => { if (textMode) root.current?.scrollIntoView?.({ block: 'start' }); }, [textMode]);

  /** A pressed control that left the page hands focus on: a closed reader to its opener, the rest to the primary. */
  useLayoutEffect(() => {
    const control = pressed.current;
    pressed.current = null;
    if (control === null || control.isConnected) return;
    const inReader = control.closest('.tqw-exchange-reader') !== null;
    const targets = inReader ? [opener.current, primaryButton.current, firstSlot.current] : [primaryButton.current, firstSlot.current];
    targets.find(target => target?.isConnected)?.focus();
  });

  const showReader = useCallback((next: ReaderId | null) => {
    readerRef.current = next;
    setReader(next);
  }, []);

  /** Remembers where a reader was opened from, unless it was opened from inside another reader. */
  const noteOpener = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.closest('.tqw-exchange-reader') === null) opener.current = active;
  }, []);

  const closeReader = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) pressed.current = document.activeElement;
    showReader(null);
    setNotes(NO_NOTES);
  }, [showReader]);

  const goTo = useCallback((next: ViewId, following = false) => {
    viewRef.current = next;
    setView(next);
    setFollowingCord(following);
  }, []);

  /** Listens on document, as the Tomorrow Engine does: App's window listener sees the Escape already handled. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') !== null || root.current?.closest('[inert]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeReader();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const station = STATIONS[Number(event.key) - 1];
      if (station) goTo(station.view);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeReader, goTo]);

  /**
   * Forget everything or an import replaces the store under the room, whether or not it touches the
   * Exchange's findings or record, so the room is derived again from what is stored now.
   */
  useEffect(() => {
    if (discoveries === undefined || discoveryState === ownSnapshot.current) return;
    ownSnapshot.current = discoveryState;
    const next = loadExchangeState(discoveries);
    stateRef.current = next;
    setState(next);
    setFollowed(false);
    setTouchedLine(null);
    setResult([]);
    setRow(null);
    setAssist('');
    setHintRung(0);
    setNotes(NO_NOTES);
    showReader(null);
  }, [discoveries, discoveryState, showReader]);

  useEffect(() => {
    for (const id of reader ? READERS[reader].sealed ?? [] : []) void archive.open(id, EXCHANGE_TOKENS[id]);
  }, [archive, reader]);

  const unlockSound = () => {
    sound.unlock();
    if (humCaptioned.current || settings.muted) return;
    humCaptioned.current = true;
    caption(HUM_CAPTION);
  };

  const sounded = (ids: readonly CueId[]) => ids.map((id) => {
    sound.play({ type: 'object', kind: CUES[id].kind });
    caption(CUES[id].caption);
    return CUES[id].caption;
  });

  /**
   * Runs one action. The result goes to the region unless the night block has replaced it (reader) or
   * OPERATOR TEST holds it (acknowledgement row). A Found line owns the row, or heads the reader at
   * night. One caption takes a free row; several, or a taken row, go to the foot of the open reader.
   */
  const apply = (beat: Beat) => {
    unlockSound();
    const before = stateRef.current;
    const transition = beat.event ? transitionExchange(before, beat.event) : { state: before, cues: [], found: [] };
    const after = transition.state;
    stateRef.current = after;
    setState(after);
    for (const finding of transition.found) discoveries?.record('exchange', finding);
    if (after !== before) saveExchangeState(discoveries, after);
    if (discoveries !== undefined) ownSnapshot.current = discoveries.getState();
    if (beat.view !== undefined) goTo(beat.view, beat.following);

    const reset = transition.found.length > 0 || hintStage(before) !== hintStage(after);
    if (reset) setHintRung(0);

    const captions = sounded([...transition.cues, ...(beat.cues ?? [])]);
    const inNight = after.service === 'night';
    const rowTaken = inNight && after.handset === 'off-hook';
    const lines = beat.result ?? [];
    const foundLine = transition.found[0] ? `Found: ${typeset(transition.found[0].title)}` : null;

    let nextRow: string | null = null;
    if (lines.length > 0) {
      if (operatorHolds(after, viewRef.current) && lines[0] !== OPERATOR_CAPTION) nextRow = lines.join(' ');
      else setResult(lines);
    }
    if (foundLine !== null && !inNight) nextRow = foundLine;
    const lone = captions.length === 1 && foundLine === null && nextRow === null && !rowTaken;
    if (lone) nextRow = captions[0] ?? null;
    const foot = lone ? [] : captions;

    const stray = rowTaken && foot.length > 0 && beat.event?.type !== 'night-service';
    const nextReader = beat.reader ?? ((inNight && lines.length > 0) || stray ? 'result' : undefined);
    const shown: readonly string[] = nextReader ? READERS[nextReader].lines ?? [] : [];
    const head = inNight ? [...(foundLine === null ? [] : [foundLine]), ...lines.filter(line => line !== OPERATOR_CAPTION && !shown.includes(line))] : [];

    setRow(nextRow);
    setNotes({ head, foot });
    setAssist([...head, ...foot].join(' '));
    setTouchedLine(beat.touched ?? null);
    if (beat.touched !== undefined) setCardLine(beat.touched);
    if (beat.nudge !== undefined) { const id = beat.nudge; setFeedback(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })); }
    if (nextReader !== undefined) {
      noteOpener();
      showReader(nextReader);
    } else if ((reset && readerRef.current === 'hint') || (!inNight && readerRef.current === 'result')) {
      showReader(null);
    }
  };

  const openFromPanel = (next: ReaderId) => {
    unlockSound();
    noteOpener();
    setNotes(NO_NOTES);
    showReader(next);
  };

  // Read again from the site's archive: open the chosen record once the room can be seen.
  const rereadDone = useRef(0);
  useEffect(() => {
    if (!reread || !(textMode || sceneReady) || rereadDone.current === reread.seq) return;
    const { finding, seq } = reread;
    const frame = requestAnimationFrame(() => {
      rereadDone.current = seq;
      if (finding in READER_OF_FINDING) openFromPanel(READER_OF_FINDING[finding as keyof typeof READER_OF_FINDING]);
      onRereadOpened?.();
    });
    return () => cancelAnimationFrame(frame);
    // openFromPanel is recreated each render; the guard above keeps this to one opening per choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRereadOpened, reread, sceneReady, textMode]);

  const askHint = () => {
    const rungs = HINTS[hintStage(stateRef.current)];
    setHintLine(rungs[hintRung] ?? rungs[2]);
    setHintRung(Math.min(hintRung + 1, rungs.length - 1));
    openFromPanel('hint');
  };

  const leave = () => {
    unlockSound();
    sounded(['door']);
    onLeave();
  };

  const inspect = (object: ExchangeObjectId, opens: ReaderId) => apply({ event: { type: 'inspect', object }, reader: opens });
  const note = (line: string) => apply({ result: [line] });
  const readWiringCard = () => apply({ event: { type: 'read-wiring-card' }, reader: 'wiring-card', touched: CERTIFICATION_LINE });
  const selectPlug = () => apply({ event: { type: 'select-enquiry-plug' }, result: [PLUG_PROMPT] });
  const connectCertification = () => {
    if (stateRef.current.plug === 'rest') apply({ event: { type: 'read-wiring-card' }, reader: 'wiring-card', result: [WIRING_CARD_TEXT], touched: CERTIFICATION_LINE });
    else apply({ event: { type: 'connect', target: CERTIFICATION_LINE }, reader: 'form', result: CONNECTED_RESULT, touched: CERTIFICATION_LINE });
  };
  const touchLine = (line: number) => {
    if (viewRef.current !== 'jacks') goTo('jacks');
    if (line === CERTIFICATION_LINE) { connectCertification(); return; }
    const { plug } = stateRef.current;
    const answer = plug === 'rest' ? [WIRING_CARD_TEXT] : plug === 'guide' ? [PLUG_PROMPT] : CONNECTED_RESULT;
    apply({ event: { type: 'connect', target: line }, reader: 'line-card', result: answer, touched: line });
  };
  const followCord = () => { setFollowed(true); apply({ view: 'kneehole', following: true }); };
  const readForm = () => {
    if (stateRef.current.plug === 'seated') apply({ reader: 'form' });
    else apply({ result: [DRAWER_SHUT], cues: ['rattle'], nudge: 'drawer' });
  };
  const openPlate = () => {
    if (stateRef.current.plate === 'open') apply({ reader: 'rule-14' });
    else apply({ event: { type: 'open-plate' }, reader: 'rule-14', result: [PLATE_RESULT] });
  };
  const connectTest = () => {
    const { plate, lead } = stateRef.current;
    if (plate === 'shut') apply({ event: { type: 'connect-operator-test' }, result: [PLATE_SHUT], nudge: 'plate' });
    else if (lead === 'seated') note(LEAD_SEATED);
    else apply({ event: { type: 'connect-operator-test' } });
  };
  const liftHandset = () => {
    const { lead, handset } = stateRef.current;
    if (lead === 'clipped') apply({ event: { type: 'lift-handset' }, view: 'desk-top', reader: 'handset', nudge: 'telephone' });
    else if (handset === 'off-hook') apply({ view: 'desk-top', reader: 'socket' });
    else apply({ event: { type: 'lift-handset' }, view: 'desk-top', reader: 'socket', result: [OPERATOR_CAPTION] });
  };
  const readTickets = () => apply({ event: { type: 'read-tickets' }, view: 'kneehole', reader: 'tickets' });
  const readDocket = () => inspect('docket', 'docket');
  const nightService = () => {
    if (stateRef.current.service === 'day') { apply({ event: { type: 'night-service', enabled: true } }); return; }
    // Printed without touching the result, so Resume service still returns the last one.
    openFromPanel('result');
    setNotes({ head: [NIGHT_ALREADY], foot: [] });
    setAssist(NIGHT_ALREADY);
  };
  const resumeService = () => apply({ event: { type: 'night-service', enabled: false } });

  const run = {
    viewJacks: () => goTo('jacks'),
    viewDeskTop: () => goTo('desk-top'),
    cardigan: () => inspect('cardigan', 'cardigan'),
    night: nightService,
    wiring: readWiringCard,
    plug: selectPlug,
    connect: connectCertification,
    follow: followCord,
    form: readForm,
    lift: liftHandset,
    tickets: readTickets,
    rulebook: () => inspect('rulebook', 'rulebook'),
    bell: () => apply({ cues: ['bell'] }),
    flask: () => inspect('tea-flask', 'flask'),
    plate: openPlate,
    test: connectTest,
    diagram: () => inspect('wiring-diagram', 'diagram'),
    rota: () => inspect('shift-roster', 'rota'),
    index: () => inspect('index', 'index'),
  } satisfies Record<ActionId, () => void>;

  const control: Readonly<Record<ActionId, Control>> = {
    viewJacks: { action: 'viewJacks', label: CONTROLS.viewJacks },
    viewDeskTop: { action: 'viewDeskTop', label: CONTROLS.viewDeskTop },
    cardigan: { action: 'cardigan', label: CONTROLS.liftCardigan, hotspot: 'cardigan' },
    night: { action: 'night', label: CONTROLS.nightService, hotspot: 'lever', ...(night ? { unavailable: NIGHT_ALREADY } : {}) },
    wiring: { action: 'wiring', label: CONTROLS.readWiringCard, home: 'jacks', hotspot: `line-${CERTIFICATION_LINE}` },
    plug: { action: 'plug', label: CONTROLS.selectPlug, home: 'jacks', hotspot: 'plug' },
    connect: { action: 'connect', label: CONTROLS.connectCertification, home: 'jacks', hotspot: `line-${CERTIFICATION_LINE}` },
    follow: { action: 'follow', label: CONTROLS.followCord, hotspot: 'cord' },
    form: { action: 'form', label: CONTROLS.readForm, hotspot: 'form' },
    lift: { action: 'lift', label: CONTROLS.liftHandset, home: 'desk-top', hotspot: 'telephone' },
    tickets: { action: 'tickets', label: CONTROLS.readTickets, home: 'kneehole', hotspot: 'ticket-lip' },
    rulebook: { action: 'rulebook', label: CONTROLS.readRulebook, home: 'desk-top', hotspot: 'rulebook' },
    bell: { action: 'bell', label: CONTROLS.ringBell, hotspot: 'bell' },
    flask: { action: 'flask', label: CONTROLS.turnCap, hotspot: 'flask' },
    plate: { action: 'plate', label: plateOpen ? CONTROLS.readRule14 : CONTROLS.openPlate, home: 'kneehole', hotspot: 'plate' },
    test: { action: 'test', label: CONTROLS.connectOperatorTest, home: 'kneehole', hotspot: 'socket' },
    diagram: { action: 'diagram', label: CONTROLS.traceDiagram, home: 'kneehole', hotspot: 'diagram' },
    rota: { action: 'rota', label: CONTROLS.readRota, home: 'shelf', hotspot: 'rota' },
    index: { action: 'index', label: CONTROLS.readIndex, hotspot: 'index' },
  };

  /** Slots never reorder. A slot changes its label only once its job is done, and keeps its element. */
  const slots: Readonly<Record<ViewId, readonly (Control | null)[]>> = {
    wide: [control.viewJacks, control.viewDeskTop, control.cardigan, control.night],
    jacks: [control.wiring, seated ? control.follow : control.plug, seated ? control.form : control.connect, control.night],
    'desk-top': [lifted ? control.tickets : control.lift, control.rulebook, control.bell, control.flask],
    kneehole: [control.plate, lifted ? control.tickets : control.test, control.lift, control.diagram],
    shelf: [control.form, control.rota, control.index, null],
  };

  const nextOfChainA = (): Control | null => {
    if (state.plug === 'guide') return control.connect;
    if (state.plug === 'seated') return null;
    return state.cardRead ? control.plug : control.wiring;
  };
  /** Following the cord leaves no record, so any later Chain B progress, as after a reload, counts as having followed it. */
  const cordFollowed = followed || view === 'kneehole' || found('rulebook') || found('wiring-diagram') || plateOpen;
  const nextOfChainB = (): Control | null => {
    if (seated && !cordFollowed) return control.follow;
    if (!found('rulebook')) return control.rulebook;
    if (!found('wiring-diagram')) return control.diagram;
    if (!plateOpen) return control.plate;
    if (state.lead === 'clipped') return control.test;
    if (!lifted) return control.lift;
    return found('operator-ticket') ? null : control.tickets;
  };
  const boardFirst = view === 'wide' || view === 'jacks' || view === 'shelf';
  const primary = (boardFirst ? nextOfChainA() ?? nextOfChainB() : nextOfChainB() ?? nextOfChainA())
    ?? (found('shift-roster') ? null : control.rota);

  const runPrimary = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // A double press must not fall through to the next step, which takes this button's place.
    if (primary === null || event.detail > 1) return;
    if (primary.home !== undefined) goTo(primary.home);
    run[primary.action]();
  };

  const hotspot = (id: ExchangeHotspot) => {
    const line = /^line-(\d+)$/.exec(id)?.[1];
    if (line !== undefined) { touchLine(Number(line)); return; }
    const { plate, plug, handset } = stateRef.current;
    switch (id) {
      case 'sign': note(SIGN_LINE); return;
      case 'desk-lamp': note(DESK_LAMP_LINE); return;
      case 'clerestory': note(CLERESTORY_LINE); return;
      case 'cord': if (plug === 'seated') followCord(); else note(CORD_LINE); return;
      case 'plug': if (plug === 'seated') followCord(); else selectPlug(); return;
      case 'plate': openPlate(); return;
      case 'socket':
      case 'lead':
        if (plate === 'shut') openPlate();
        else connectTest();
        return;
      case 'docket': if (plate === 'shut') openPlate(); else readDocket(); return;
      case 'ticket-lip': if (handset === 'off-hook') readTickets(); else note(LIP_EMPTY); return;
      case 'drawer':
      case 'form': readForm(); return;
      case 'rota': run.rota(); return;
      case 'index': run.index(); return;
      case 'telephone': liftHandset(); return;
      case 'rulebook': run.rulebook(); return;
      case 'bell': run.bell(); return;
      case 'flask': run.flask(); return;
      case 'cardigan': run.cardigan(); return;
      case 'diagram': run.diagram(); return;
      case 'lever': nightService(); return;
      case 'door': leave(); return;
      default:
    }
  };
  const hotspotRef = useRef(hotspot);
  useEffect(() => { hotspotRef.current = hotspot; });
  const sceneHotspot = useCallback((id: ExchangeHotspot) => hotspotRef.current(id), []);

  const sceneDone = useCallback(() => { setSceneReady(true); readyRef.current(); }, []);
  const sceneContextLost = useCallback(() => { setSceneLost(true); onContextLost(); }, [onContextLost]);
  const sceneFailed = useCallback(() => { setSceneLost(true); onSceneError(); }, [onSceneError]);

  /** The keyboard's counterpart of pointer hover. A press focuses a control too, and outlines nothing. */
  const outlineFocused = (event: ReactFocusEvent<HTMLElement>) => {
    const id = event.target.matches(':focus-visible') ? event.target.dataset['hotspot'] : undefined;
    setFocusedHotspot(id === undefined ? null : id as ExchangeHotspot);
  };

  const moveLineFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (lineFocus + step + LINE_CARDS.length) % LINE_CARDS.length;
    setLineFocus(next);
    event.currentTarget.querySelectorAll('button')[next]?.focus();
  };

  const operatorRow = night && lifted;
  const rowText = operatorRow ? OPERATOR_CAPTION : row;
  const shownResult = night ? [] : operatorHolds(state, view) ? [OPERATOR_CAPTION] : result;
  const copy = reader ? READERS[reader] : null;
  const context = reader === 'rule-14' ? CONTROLS.readDocket : reader === 'socket' ? CONTROLS.readTickets : null;
  const archiveIds = state.discoveries.filter(isExchangeFinding);

  const readerBody = () => {
    if (reader === 'archive') {
      return archiveIds.length === 0 ? <p>{ARCHIVE_EMPTY}</p> : <ul className="tqw-exchange-archive">
        {archiveIds.map(id => <li key={id}>
          <button type="button" data-archive-entry={id} onClick={() => openFromPanel(READER_OF_FINDING[id])}>{typeset(EXCHANGE_FINDINGS[id].title)}</button>
        </li>)}
      </ul>;
    }
    if (reader === 'hint') return <p>{hintLine}</p>;
    if (reader === 'line-card') return <p className="tqw-exchange-card">{LINE_CARDS.find(item => item.line === cardLine)?.card}</p>;
    if (reader === 'rulebook') {
      return <>
        <SealedBody item={opened.rulebook?.item} />
        <ol className="tqw-exchange-rules">
          {RULE_IDS.map((id, index) => <li key={id} value={index + 1}>{opened[id]?.item.body.join(' ')}</li>)}
        </ol>
      </>;
    }
    return <>
      {copy?.sealed?.map(id => <SealedBody key={id} item={opened[id]?.item} />)}
      {copy?.lines?.map(line => <p key={line}>{line}</p>)}
    </>;
  };

  /** Text mode lifts this above the page's long flow, so Resume service never waits below the fold. */
  const nightBlock = <section className="tqw-exchange-night" aria-label={NIGHT_HEADING}>
    <h2>{NIGHT_HEADING}</h2>
    <p>{NIGHT_STATUS}</p>
    <button type="button" onClick={resumeService}>{CONTROLS.resumeService}</button>
  </section>;

  return <div ref={root} className="tqw-app tqw-exchange" data-mode={textMode ? 'text' : '3d'} data-room-ready={textMode || sceneReady}
    data-service={state.service} data-plug={state.plug} data-plate={state.plate} data-lead={state.lead} data-handset={state.handset}
    data-view={view} data-station={STATION_OF_VIEW[view]} data-reader={reader ?? ''} data-findings={state.discoveries.join(',')}
    data-reduced-motion={settings.reducedMotion} data-muted={settings.muted}
    onClickCapture={() => { if (document.activeElement instanceof HTMLElement) pressed.current = document.activeElement; }}>
    <header className="tqw-exchange-strip" data-fp-ignore>
      <button type="button" className="tqw-exchange-leave" onClick={leave}>{CONTROLS.leave}</button>
      <button type="button" onClick={() => openFromPanel('archive')}>{CONTROLS.archive}</button>
      <button type="button" onClick={askHint}>{CONTROLS.hint}</button>
    </header>

    {night && textMode ? nightBlock : null}

    <section className="tqw-exchange-stage" aria-label={`View: ${VIEW_LABELS[view]}`}>
      <h1 className={textMode ? undefined : 'tqw-visually-hidden'}>{ROOM_TITLE}</h1>
      {view === 'kneehole' && !plateOpen ? <p className={textMode ? 'tqw-exchange-plate' : 'tqw-visually-hidden'}>{PLATE_FACE}</p> : null}
      {textMode ? <div className="tqw-exchange-text">
        <p>{text?.reason === 'unsupported' ? TEXT_INTRO_UNSUPPORTED : TEXT_INTRO}</p>
        {text?.retry ? <button type="button" onClick={text.retry}>{TEXT_RETRY}</button> : null}
        <h2>{VIEW_LABELS[view]}</h2>
        <ul aria-label="Things in view">
          {TEXT_EXAMINES[view].map(([id, label]) => <li key={id}><button type="button" onClick={() => hotspot(id)}>{label}</button></li>)}
        </ul>
      </div> : <SceneBoundary fallback={null} onError={sceneFailed}>
        <Suspense fallback={<div className="tqw-exchange-loading" aria-hidden="true" />}>
          <ExchangeScene state={state} view={view} followingCord={followingCord} reducedMotion={settings.reducedMotion}
            tippedLine={touchedLine} focusedHotspot={focusedHotspot} feedback={feedback} onHotspot={sceneHotspot}
            onReady={sceneDone} onContextLost={sceneContextLost} onSceneError={sceneFailed} />
        </Suspense>
      </SceneBoundary>}
    </section>

    <main className="tqw-exchange-rail" aria-label={ROOM_TITLE} data-fp-ignore onFocus={outlineFocused} onBlur={() => setFocusedHotspot(null)}>
      <div className="tqw-exchange-frame">
        {night ? (textMode ? null : nightBlock) : primary ? <button ref={primaryButton} type="button" className="tqw-exchange-primary" aria-label={`Next: ${primary.label}`} data-hotspot={primary.hotspot} onClick={runPrimary}>{primary.label}</button> : null}

        <div className="tqw-exchange-result" role="status" aria-live="polite">
          {shownResult.map(line => <p key={line}>{line}</p>)}
        </div>
        <p className="tqw-exchange-ack" aria-live="polite" data-long={rowText !== null && rowText.length > 44}>{rowText}</p>

        {copy ? <section className="tqw-exchange-reader" aria-label={copy.title}>
          <header>
            <h2>{copy.title}</h2>
            <button type="button" className="tqw-exchange-close" onClick={closeReader}>{CONTROLS.close}</button>
            {context ? <button type="button" className="tqw-exchange-context" onClick={reader === 'rule-14' ? readDocket : readTickets}>{context}</button> : null}
          </header>
          <div className="tqw-exchange-reader-body" tabIndex={0}>
            {notes.head.map(line => <p key={line} className="tqw-exchange-note">{line}</p>)}
            {copy.subheading ? <p className="tqw-exchange-subheading">{copy.subheading}</p> : null}
            {readerBody()}
            {notes.foot.map(line => <p key={line} className="tqw-exchange-caption">{line}</p>)}
          </div>
        </section> : null}

        <nav className="tqw-exchange-stations" aria-label="Room stations">
          {STATIONS.map(item => <button key={item.id} type="button" data-station-target={item.id}
            aria-current={STATION_OF_VIEW[view] === item.id ? 'true' : undefined} onClick={() => goTo(item.view)}>{item.label}</button>)}
        </nav>

        <div className="tqw-exchange-actions" role="group" aria-label="Actions">
          {slots[view].map((slot, index) => slot === null ? <span key={index} aria-hidden="true" /> : <button key={index} ref={index === 0 ? firstSlot : undefined}
            type="button" data-slot={index + 1} data-hotspot={slot.hotspot} aria-disabled={slot.unavailable ? true : undefined}
            aria-describedby={slot.unavailable ? 'tqw-exchange-unavailable' : undefined}
            onClick={() => { if (!slot.unavailable) run[slot.action](); }}>{slot.label}</button>)}
          {night ? <span id="tqw-exchange-unavailable" className="tqw-visually-hidden">{NIGHT_ALREADY}</span> : null}
        </div>

        <div className="tqw-exchange-lines" role="group" aria-label="Lines" onKeyDown={moveLineFocus}>
          {LINE_CARDS.map((item, index) => <button key={item.line} type="button" tabIndex={index === lineFocus ? 0 : -1} aria-label={item.card}
            data-line={item.line} data-hotspot={`line-${item.line}`} data-lit={item.line === CERTIFICATION_LINE} onFocus={() => setLineFocus(index)} onClick={() => touchLine(item.line)}>{item.line}</button>)}
        </div>

        <p className="tqw-exchange-credit">{provenance.credit}</p>
      </div>
    </main>
    <p className="tqw-visually-hidden" aria-live="polite">{assist}</p>
  </div>;
}
