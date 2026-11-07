// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscoveryStore, DISCOVERY_STORAGE_KEY, openSealed, parseSealedFile, type DiscoveryStore } from '@tqw/engine';
import sealedExchange from '../../../../../packages/engine/src/sealed/exchange.sealed.json';
import type { ChamberProps } from '../types.ts';
import { CLERESTORY_LINE, CORD_LINE, DESK_LAMP_LINE, DRAWER_SHUT, HINTS, LEAD_SEATED, LINE_CARDS, LIP_EMPTY, NIGHT_ALREADY, PLATE_FACE, PLATE_RESULT, PLATE_SHUT, SIGN_LINE } from './copy.ts';
import { EXCHANGE_TOKENS, type ExchangeFindingId } from './state.ts';
import type { ExchangeHotspot } from './stage.ts';

interface SceneProps {
  view: string;
  followingCord: boolean;
  reducedMotion: boolean;
  tippedLine: number | null;
  focusedHotspot: ExchangeHotspot | null;
  feedback: { id: string; sequence: number } | null;
  onHotspot(id: ExchangeHotspot): void;
  onReady(): void;
}
const scene = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('./scene/ExchangeScene.tsx', () => ({ default: (props: unknown) => { scene.props = props; return null; } }));

const WIRING_CARD = 'CERTIFICATION: select the enquiry plug, then this jack.';
const PLUG_PROMPT = 'Enquiry plug selected. Select CERTIFICATION.';
const FORWARD = 'FORWARD TO: TOMORROW ENGINE';
const CARRIES = 'This connection carries enquiries only.';
const OPERATOR = 'OPERATOR TEST — circuit complete';
const TITLE = 'The socket beneath the plate';
const TEXT_MODE = { text: { reason: 'chosen' } } as const;
/** Reader bodies are compared with the sealed file, so no sealed text is written in this test. */
const sealedLine = async (id: ExchangeFindingId) => (await openSealed(parseSealedFile(sealedExchange), id, EXCHANGE_TOKENS[id]))?.body[0] ?? '';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}
let storage = memoryStorage();
let discoveries: DiscoveryStore;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  discoveries = createDiscoveryStore(storage);
  scene.props = null;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function chamberProps(overrides: Partial<ChamberProps> = {}): ChamberProps {
  return {
    settings: { muted: false, reducedMotion: false, captions: true }, text: null,
    sound: { unlock: vi.fn(), setMuted: vi.fn(), play: vi.fn(), playSpine: vi.fn(), setWalk: vi.fn(), setRoom: vi.fn(), dispose: vi.fn() },
    caption: vi.fn(), onReady: vi.fn(), onLeave: vi.fn(), onContextLost: vi.fn(), onSceneError: vi.fn(), discoveries,
    ...overrides,
  };
}
/** Each mount is a new page load: no module state may carry the room across it. */
const open = async (overrides?: Partial<ChamberProps>) => {
  vi.resetModules();
  const { default: ExchangeChamber } = await import('./ExchangeChamber.tsx');
  await act(async () => { render(<ExchangeChamber {...chamberProps(overrides)} />); });
};
const reload = async (overrides?: Partial<ChamberProps>) => { cleanup(); discoveries = createDiscoveryStore(storage); await open(overrides); };
const button = (name: string) => screen.getByRole('button', { name });
const press = (name: string) => fireEvent.click(button(name));
const room = () => document.querySelector<HTMLElement>('.tqw-exchange');
const reader = () => document.querySelector<HTMLElement>('.tqw-exchange-reader');
const result = () => document.querySelector<HTMLElement>('.tqw-exchange-result') as HTMLElement;
const ack = () => document.querySelector<HTMLElement>('.tqw-exchange-ack') as HTMLElement;
const toJacks = () => { press('Board'); press('View jacks'); };
const toDeskTop = () => { press('Board'); press('View desk top'); };
const line = (number: number) => document.querySelector<HTMLElement>(`.tqw-exchange-lines [data-line='${number}']`) as HTMLElement;
const foundIds = () => (discoveries.getState().found.exchange ?? []).map(entry => entry.id);
const sceneProps = async () => {
  await waitFor(() => { expect(scene.props).not.toBeNull(); });
  return scene.props as SceneProps;
};
const tap = async (id: ExchangeHotspot) => { const { onHotspot } = await sceneProps(); act(() => { onHotspot(id); }); };
const key = (name: string) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  act(() => { document.body.dispatchEvent(event); });
  return event;
};
const solveBoard = () => { toJacks(); press('Select enquiry plug'); press('Connect CERTIFICATION'); };
const seatTest = () => { press('Desk underside'); press('Open plate'); press('Connect operator test'); };

describe('B3, the one solve', () => {
  it('lights CERTIFICATION as line 3 and fills the other eleven lines in the script order', async () => {
    await open(TEXT_MODE);
    const lit = document.querySelector<HTMLElement>(".tqw-exchange-lines [data-lit='true']");
    expect(lit?.getAttribute('data-line')).toBe('3');
    expect(lit?.getAttribute('aria-label')).toBe('CERTIFICATION');
    expect(line(1).getAttribute('aria-label')).toBe('ROUTE ME TO WHOEVER IS IN CHARGE OF TUESDAY');
    expect(line(4).getAttribute('aria-label')).toBe('PLEASE HOLD FOR YOURSELF');
    expect(line(12).getAttribute('aria-label')).toBe('MY FATHER’S EXTENSION, IF KEPT');
  });

  it('runs the flow with its exact strings, two result lines and one Found line', async () => {
    await open();
    toJacks();
    press('Read wiring card');
    expect(within(reader() as HTMLElement).getByText(WIRING_CARD)).toBeTruthy();
    expect(foundIds()).toEqual([]);
    press('Select enquiry plug');
    expect(result().textContent).toBe(PLUG_PROMPT);
    press('Connect CERTIFICATION');
    expect([...result().querySelectorAll('p')].map(paragraph => paragraph.textContent)).toEqual([FORWARD, CARRIES]);
    expect(ack().textContent).toBe('Found: Departments connected');
    expect([...(reader() as HTMLElement).querySelectorAll('.tqw-exchange-reader-body p:not(.tqw-exchange-caption)')].map(paragraph => paragraph.textContent))
      .toEqual(['CERTIFICATION ENQUIRY', FORWARD, CARRIES]);
    expect(foundIds()).toEqual(['departments-connected', 'certification-form']);
    expect(discoveries.getState().found.exchange?.[0]?.title).toBe('Departments connected');
  });

  it('prints every caption of a many-cue action at the reader foot while Found takes the row', async () => {
    await open();
    solveBoard();
    const captions = [...(reader() as HTMLElement).querySelectorAll('.tqw-exchange-caption')].map(paragraph => paragraph.textContent);
    expect(captions).toEqual(['[A plug seats. A relay clicks.]', '[A drawer runs out]']);
    expect(ack().textContent).toBe('Found: Departments connected');
  });

  it('teaches an early Connect CERTIFICATION and records nothing', async () => {
    await open();
    toJacks();
    press('Connect CERTIFICATION');
    expect(result().textContent).toBe(WIRING_CARD);
    expect(within(reader() as HTMLElement).getByText(WIRING_CARD)).toBeTruthy();
    expect(foundIds()).toEqual([]);
  });

  it('answers another jack by plug state and never moves the plug', async () => {
    await open();
    toJacks();
    fireEvent.click(line(1));
    expect(result().textContent).toBe(WIRING_CARD);
    expect(within(reader() as HTMLElement).getByText('ROUTE ME TO WHOEVER IS IN CHARGE OF TUESDAY')).toBeTruthy();
    press('Select enquiry plug');
    fireEvent.click(line(2));
    expect(result().textContent).toBe(PLUG_PROMPT);
    expect(room()?.getAttribute('data-plug')).toBe('guide');
    press('Connect CERTIFICATION');
    fireEvent.click(line(4));
    expect(result().textContent).toBe(`${FORWARD}${CARRIES}`);
    expect(room()?.getAttribute('data-plug')).toBe('seated');
    expect(foundIds()).toEqual(['departments-connected', 'certification-form']);
  });

  it('gives the CERTIFICATION jack the same line at rest, and seats it from the guide', async () => {
    await open(TEXT_MODE);
    fireEvent.click(line(3));
    expect(room()?.getAttribute('data-view')).toBe('jacks');
    expect(result().textContent).toBe(WIRING_CARD);
    press('Select enquiry plug');
    fireEvent.click(line(3));
    expect(room()?.getAttribute('data-plug')).toBe('seated');
  });

  it('swaps the slot labels once a job is done and gives no second Found line', async () => {
    await open();
    solveBoard();
    expect(screen.queryByRole('button', { name: 'Connect CERTIFICATION' })).toBeNull();
    expect(button('Follow the cord')).toBeTruthy();
    press('Close');
    press('Read form');
    expect(ack().textContent).toBe('');
    expect(within(reader() as HTMLElement).getByText(FORWARD)).toBeTruthy();
  });

  it('rattles a shut drawer on Read form, and clears a held caption on a later silent action', async () => {
    await open();
    press('Ticket shelf');
    press('Read form');
    expect(result().textContent).toBe(DRAWER_SHUT);
    expect(ack().textContent).toBe('[A drawer rattles]');
    await tap('sign');
    expect(ack().textContent).toBe('');
  });
});

describe('The operator test', () => {
  it('records Rule 14 at the plate, the title at the handset and the ticket at Read tickets', async () => {
    await open();
    press('Desk underside');
    press('Open plate');
    expect(result().textContent).toBe(PLATE_RESULT);
    expect(foundIds()).toEqual(['rule-14']);
    press('Connect operator test');
    expect(result().textContent).toBe(PLATE_RESULT);
    expect(ack().textContent).toBe('[The desk telephone rings once]');
    expect(foundIds()).toEqual(['rule-14']);
    press('Lift handset');
    expect(foundIds()).toEqual(['rule-14', 'socket-beneath-plate']);
    expect(result().textContent).toBe(OPERATOR);
    expect(ack().textContent).toBe(`Found: ${TITLE}`);
    const socketBody = await sealedLine('socket-beneath-plate');
    await waitFor(() => { expect(within(reader() as HTMLElement).getByText(socketBody)).toBeTruthy(); });
    expect(room()?.getAttribute('data-view')).toBe('desk-top');
    fireEvent.click(within(reader() as HTMLElement).getByRole('button', { name: 'Read tickets' }));
    expect(foundIds()).toEqual(['rule-14', 'socket-beneath-plate', 'operator-ticket']);
    expect(room()?.getAttribute('data-view')).toBe('kneehole');
    expect(within(reader() as HTMLElement).getByText(OPERATOR)).toBeTruthy();
    expect(result().textContent).toBe(OPERATOR);
  });

  it('offers Read docket only inside the Rule 14 reader and records it', async () => {
    await open();
    press('Desk underside');
    expect(screen.queryByRole('button', { name: 'Read docket' })).toBeNull();
    press('Open plate');
    fireEvent.click(within(reader() as HTMLElement).getByRole('button', { name: 'Read docket' }));
    expect(foundIds()).toContain('fitter-docket');
    expect(reader()?.getAttribute('aria-label')).toBe('Fitter’s docket');
  });

  it('answers a repeat Connect operator test with the seated line', async () => {
    await open();
    seatTest();
    press('Connect operator test');
    expect(result().textContent).toBe(LEAD_SEATED);
  });

  it('gives the early handset its reading and the early lead its tap, and neither blocks the test', async () => {
    await open();
    press('Desk underside');
    press('Connect operator test');
    expect(result().textContent).toBe(PLATE_SHUT);
    expect(ack().textContent).toBe('[A small tap on brass]');
    press('Lift handset');
    expect(room()?.getAttribute('data-view')).toBe('desk-top');
    expect(room()?.getAttribute('data-handset')).toBe('cradle');
    expect(foundIds()).toEqual(['handset-first']);
    const handsetBody = await sealedLine('handset-first');
    await waitFor(() => { expect(reader()?.textContent).toContain(handsetBody); });
    seatTest();
    press('Lift handset');
    expect(room()?.getAttribute('data-handset')).toBe('off-hook');
  });

  it('holds OPERATOR TEST through hints, across reload, and only at Kneehole and Desk top', async () => {
    await open();
    seatTest();
    press('Lift handset');
    press('Hint');
    expect(result().textContent).toBe(OPERATOR);
    expect(reader()?.getAttribute('aria-label')).toBe('Hint');
    await reload();
    expect(result().textContent).toBe('');
    press('Desk underside');
    expect(result().textContent).toBe(OPERATOR);
    press('Ticket shelf');
    expect(result().textContent).toBe('');
  });
});

describe('Night service', () => {
  it('gates nothing: the solve completes with its strings in the reader and the result returns on Resume', async () => {
    await open();
    toJacks();
    press('Night service');
    expect(room()?.getAttribute('data-service')).toBe('night');
    expect(button('Night service').getAttribute('aria-disabled')).toBe('true');
    expect(button('Night service').getAttribute('aria-describedby')).toBe('tqw-exchange-unavailable');
    expect(document.getElementById('tqw-exchange-unavailable')?.textContent).toBe(NIGHT_ALREADY);
    press('Select enquiry plug');
    expect(within(reader() as HTMLElement).getByText(PLUG_PROMPT)).toBeTruthy();
    expect(result().textContent).toBe('');
    press('Connect CERTIFICATION');
    expect(foundIds()).toEqual(['departments-connected', 'certification-form']);
    expect(room()?.getAttribute('data-service')).toBe('night');
    expect((reader() as HTMLElement).querySelector('.tqw-exchange-reader-body p')?.textContent).toBe('Found: Departments connected');
    expect(ack().textContent).toBe('');
    expect(within(reader() as HTMLElement).getByText(FORWARD)).toBeTruthy();
    expect(result().textContent).toBe('');
    press('Resume service');
    expect(room()?.getAttribute('data-service')).toBe('day');
    expect(result().textContent).toBe(`${FORWARD}${CARRIES}`);
  });

  it('does not toggle on the disabled slot, and the lever does not overwrite the last result', async () => {
    await open();
    toJacks();
    press('Select enquiry plug');
    press('Night service');
    press('Night service');
    expect(room()?.getAttribute('data-service')).toBe('night');
    await tap('lever');
    expect(within(reader() as HTMLElement).getByText(NIGHT_ALREADY)).toBeTruthy();
    press('Resume service');
    expect(result().textContent).toBe(PLUG_PROMPT);
  });

  it('moves OPERATOR TEST to the row and heads the reader with any Found line', async () => {
    await open();
    seatTest();
    press('Lift handset');
    press('Board');
    press('Night service');
    expect(ack().textContent).toBe(OPERATOR);
    expect(result().textContent).toBe('');
    press('Close');
    press('Lift the cardigan');
    expect(ack().textContent).toBe(OPERATOR);
    expect((reader() as HTMLElement).querySelector('.tqw-exchange-reader-body p')?.textContent).toBe('Found: Cardigan on the chair');
  });

  it('keeps Resume service and Leave outside every reader and action list at every station', async () => {
    await open();
    press('Night service');
    for (const [station, readers] of [['Board', ['Lift the cardigan']], ['Desk underside', ['Trace the diagram', 'Open plate']], ['Ticket shelf', ['Read rota', 'Read index']]] as const) {
      press(station);
      for (const name of readers) {
        press(name);
        expect(reader()).not.toBeNull();
        for (const held of ['Resume service', 'Leave', 'Board', 'Desk underside', 'Ticket shelf']) {
          expect(button(held).closest('.tqw-exchange-reader, .tqw-exchange-actions, details')).toBeNull();
        }
      }
    }
    press('Resume service');
    expect(screen.queryByRole('button', { name: 'Resume service' })).toBeNull();
  });
});

describe('Hotspots', () => {
  it('answers the story hotspots with one line and no record', async () => {
    await open();
    for (const [id, text] of [['sign', SIGN_LINE], ['desk-lamp', DESK_LAMP_LINE], ['clerestory', CLERESTORY_LINE], ['cord', CORD_LINE], ['ticket-lip', LIP_EMPTY], ['drawer', DRAWER_SHUT]] as const) {
      await tap(id);
      expect(result().textContent).toBe(text);
    }
    expect(foundIds()).toEqual([]);
  });

  it('prints those lines in the row while OPERATOR TEST holds the result', async () => {
    await open();
    seatTest();
    press('Lift handset');
    await tap('sign');
    expect(result().textContent).toBe(OPERATOR);
    expect(ack().textContent).toBe(SIGN_LINE);
  });

  it('lands a tap on the socket, lead or docket on the plate while it is shut', async () => {
    await open();
    await tap('docket');
    expect(room()?.getAttribute('data-plate')).toBe('open');
    expect(foundIds()).toEqual(['rule-14']);
  });

  it('routes the kneehole hotspots to their named actions by state', async () => {
    await open();
    await tap('plate');
    await tap('lead');
    expect(room()?.getAttribute('data-lead')).toBe('seated');
    await tap('socket');
    expect(result().textContent).toBe(LEAD_SEATED);
    await tap('docket');
    expect(foundIds()).toContain('fitter-docket');
    await tap('telephone');
    expect(room()?.getAttribute('data-handset')).toBe('off-hook');
    await tap('ticket-lip');
    expect(foundIds()).toContain('operator-ticket');
  });

  it('follows the seated cord, the room’s one tracking shot, and ends the flag on the next move', async () => {
    await open();
    solveBoard();
    await tap('cord');
    expect((await sceneProps()).view).toBe('kneehole');
    expect((await sceneProps()).followingCord).toBe(true);
    press('Board');
    expect((await sceneProps()).followingCord).toBe(false);
  });

  it('moves to the jacks for a line tapped from elsewhere and tips that card', async () => {
    await open();
    await tap('line-7');
    expect(room()?.getAttribute('data-view')).toBe('jacks');
    expect((await sceneProps()).tippedLine).toBe(7);
    expect(within(reader() as HTMLElement).getByText(LINE_CARDS[6]?.card ?? '')).toBeTruthy();
  });

  it('opens the readers of the desk, chair and shelf objects', async () => {
    await open();
    for (const [id, title] of [['rulebook', 'Rulebook'], ['flask', 'Flask'], ['cardigan', 'Cardigan'], ['diagram', 'Wiring diagram'], ['rota', 'Rota'], ['index', 'Index']] as const) {
      await tap(id);
      expect(reader()?.getAttribute('aria-label')).toBe(title);
    }
    expect(foundIds()).toEqual(expect.arrayContaining(['rulebook', 'rule-13', 'tea-flask', 'cardigan', 'wiring-diagram', 'shift-roster', 'shelf-index']));
  });

  it('holds a line’s tip only until the next action, and leaves a seated card to the scene', async () => {
    await open();
    await tap('line-7');
    await tap('sign');
    expect((await sceneProps()).tippedLine).toBeNull();
  });

  it('nudges the refused objects once per refusal, as a sequence the scene can see repeat', async () => {
    await open();
    press('Desk underside');
    press('Connect operator test');
    expect((await sceneProps()).feedback).toEqual({ id: 'plate', sequence: 1 });
    press('Connect operator test');
    expect((await sceneProps()).feedback).toEqual({ id: 'plate', sequence: 2 });
    press('Lift handset');
    expect((await sceneProps()).feedback).toEqual({ id: 'telephone', sequence: 3 });
    press('Ticket shelf');
    press('Read form');
    expect((await sceneProps()).feedback).toEqual({ id: 'drawer', sequence: 4 });
  });

  it('outlines the object of a control holding keyboard focus, and not of a pressed one', async () => {
    await open();
    toJacks();
    const plug = button('Select enquiry plug');
    const visible = vi.spyOn(plug, 'matches').mockReturnValue(true);
    act(() => { plug.focus(); });
    expect((await sceneProps()).focusedHotspot).toBe('plug');
    act(() => { plug.blur(); });
    expect((await sceneProps()).focusedHotspot).toBeNull();
    visible.mockReturnValue(false);
    act(() => { plug.focus(); });
    expect((await sceneProps()).focusedHotspot).toBeNull();
  });

  it('leaves by the door with its latch', async () => {
    const onLeave = vi.fn();
    const caption = vi.fn();
    await open({ onLeave, caption });
    await tap('door');
    expect(onLeave).toHaveBeenCalledOnce();
    expect(caption).toHaveBeenCalledWith('[A door latch clicks]');
  });
});

describe('Bell, readers and archive', () => {
  it('rings the bell as Line available with no record and no reader, unmuted', async () => {
    const caption = vi.fn();
    await open({ caption });
    toDeskTop();
    press('Ring the bell');
    expect(caption).toHaveBeenCalledWith('Line available');
    expect(ack().textContent).toBe('Line available');
    expect(foundIds()).toEqual([]);
    expect(reader()).toBeNull();
  });

  it('shows every sealed rule on one page, with no chrome label or repeated title', async () => {
    await open();
    toDeskTop();
    press('Read the rulebook');
    const [summary, rule13] = await Promise.all([sealedLine('rulebook'), sealedLine('rule-13')]);
    await waitFor(() => { expect(reader()?.textContent).toContain(rule13); });
    expect(reader()?.textContent).toContain(summary);
    expect(reader()?.querySelectorAll('ol li').length).toBe(13);
    expect(reader()?.textContent).not.toContain('Fictional room text');
    expect(foundIds()).toContain('rule-13');
    expect(foundIds()).not.toContain('rule-14');
    expect(ack().textContent).toBe('Found: Operator’s rulebook');
  });

  it('lists found entries as buttons that open in the same panel, with no unfound titles', async () => {
    await open();
    press('Archive');
    expect(reader()?.textContent).toContain('Found records appear here.');
    solveBoard();
    press('Close');
    press('Archive');
    const archive = reader() as HTMLElement;
    expect(within(archive).getByRole('button', { name: 'Certification form' })).toBeTruthy();
    expect(archive.textContent).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
    expect(archive.textContent).not.toContain(TITLE);
    fireEvent.click(within(archive).getByRole('button', { name: 'Departments connected' }));
    expect(within(reader() as HTMLElement).getByText(FORWARD)).toBeTruthy();
  });

  it('prints a caption when muted, with core captions off, so no clue is sound-only', async () => {
    await open({ settings: { muted: true, reducedMotion: true, captions: false } });
    seatTest();
    expect(screen.getByText('[The desk telephone rings once]')).toBeTruthy();
    expect((await sceneProps()).reducedMotion).toBe(true);
  });

  it('keeps the result and acknowledgement live regions mounted when empty', async () => {
    await open();
    const [resultRegion, ackRegion] = [result(), ack()];
    expect(resultRegion.getAttribute('aria-live')).toBe('polite');
    expect(ackRegion.getAttribute('aria-live')).toBe('polite');
    press('Night service');
    expect(result()).toBe(resultRegion);
    expect(ack()).toBe(ackRegion);
  });
});

describe('Hints and the primary', () => {
  it('reveals one rung per press into the reader, caps it, and waiting reveals none', async () => {
    vi.useFakeTimers();
    await open(TEXT_MODE);
    const before = room()?.outerHTML;
    act(() => { vi.advanceTimersByTime(600_000); });
    expect(room()?.outerHTML).toBe(before);
    const rungs = HINTS.arrival;
    for (const rung of [rungs[0], rungs[1], rungs[2], rungs[2]]) {
      press('Hint');
      expect(within(reader() as HTMLElement).getByText(rung)).toBeTruthy();
      expect(result().textContent).toBe('');
    }
    expect(foundIds()).toEqual([]);
  });

  it('keeps the rung through navigation and repeats, and resets it on a new finding in the same stage', async () => {
    await open();
    press('Hint');
    press('Hint');
    press('Ticket shelf');
    expect(reader()?.getAttribute('aria-label')).toBe('Hint');
    press('Read form');
    press('Hint');
    expect(within(reader() as HTMLElement).getByText(HINTS.arrival[2])).toBeTruthy();
    press('Read rota');
    press('Hint');
    expect(within(reader() as HTMLElement).getByText(HINTS.arrival[0])).toBeTruthy();
  });

  it('ends a hint on Close, on another reader and on a state change', async () => {
    await open();
    press('Hint');
    press('Close');
    expect(reader()).toBeNull();
    press('Hint');
    press('Archive');
    expect(reader()?.getAttribute('aria-label')).toBe('Archive');
    toJacks();
    press('Hint');
    press('Select enquiry plug');
    expect(reader()).toBeNull();
  });

  it('walks both chains from the primary alone, moving the camera first, then hides', async () => {
    await open();
    const steps = [
      ['Read wiring card', 'jacks'], ['Select enquiry plug', 'jacks'], ['Connect CERTIFICATION', 'jacks'], ['Follow the cord', 'kneehole'],
      ['Read the rulebook', 'desk-top'], ['Trace the diagram', 'kneehole'], ['Open plate', 'kneehole'], ['Connect operator test', 'kneehole'],
      ['Lift handset', 'desk-top'], ['Read tickets', 'kneehole'], ['Read rota', 'shelf'],
    ] as const;
    for (const [label, view] of steps) {
      press(`Next: ${label}`);
      expect(room()?.getAttribute('data-view'), label).toBe(view);
    }
    expect(document.querySelector('.tqw-exchange-primary')).toBeNull();
  });

  it('offers no primary, and never Follow the cord, after a reload of a finished room', async () => {
    await open();
    for (const label of ['Read wiring card', 'Select enquiry plug', 'Connect CERTIFICATION', 'Follow the cord', 'Read the rulebook', 'Trace the diagram',
      'Open plate', 'Connect operator test', 'Lift handset', 'Read tickets', 'Read rota']) press(`Next: ${label}`);
    expect(document.querySelector('.tqw-exchange-primary')).toBeNull();
    await reload();
    for (const station of ['Board', 'Desk underside', 'Ticket shelf']) {
      press(station);
      expect(document.querySelector('.tqw-exchange-primary'), station).toBeNull();
    }
    press('Board');
    press('View jacks');
    expect(document.querySelector('.tqw-exchange-primary'), 'jacks').toBeNull();
  });

  it('chooses the chain of the view, and the other when that chain is done', async () => {
    await open();
    expect(button('Next: Read wiring card')).toBeTruthy();
    press('Desk underside');
    expect(button('Next: Read the rulebook')).toBeTruthy();
    press('Next: Read the rulebook');
    expect(button('Next: Trace the diagram')).toBeTruthy();
    press('Ticket shelf');
    expect(button('Next: Read wiring card')).toBeTruthy();
  });

  it('ignores the second click of a double press on the primary', async () => {
    await open();
    fireEvent.click(button('Next: Read wiring card'), { detail: 1 });
    fireEvent.click(button('Next: Select enquiry plug'), { detail: 2 });
    expect(room()?.getAttribute('data-plug')).toBe('rest');
  });
});

describe('Keyboard', () => {
  it('closes the reader on Escape before the window sees it, and claims Escape with no reader open', async () => {
    // App mounts first, so its window listener runs before any window listener of the room's.
    const seen: boolean[] = [];
    const onWindow = (event: KeyboardEvent) => { seen.push(event.defaultPrevented); };
    window.addEventListener('keydown', onWindow);
    await open();
    press('Archive');
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(reader()).toBeNull();
    expect(key('Escape').defaultPrevented).toBe(true);
    window.removeEventListener('keydown', onWindow);
    expect(seen).toEqual([true, true]);
  });

  it('leaves Escape to an open dialog and to an inert host', async () => {
    await open();
    press('Archive');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    expect(key('Escape').defaultPrevented).toBe(false);
    expect(reader()).not.toBeNull();
    dialog.remove();
    room()?.parentElement?.setAttribute('inert', '');
    expect(key('Escape').defaultPrevented).toBe(false);
    expect(reader()).not.toBeNull();
  });

  it('chooses stations with keys 1 to 3 and ignores them with a modifier', async () => {
    await open();
    key('2');
    expect(room()?.getAttribute('data-view')).toBe('kneehole');
    key('3');
    expect(room()?.getAttribute('data-view')).toBe('shelf');
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true })); });
    expect(room()?.getAttribute('data-view')).toBe('shelf');
    key('1');
    expect(room()?.getAttribute('data-view')).toBe('wide');
  });

  it('holds Lines as one tab stop whose arrows wrap through the twelve jacks', async () => {
    await open();
    const stops = () => [...document.querySelectorAll('.tqw-exchange-lines button')].filter(item => item.getAttribute('tabindex') === '0');
    expect(stops()).toEqual([line(3)]);
    line(3).focus();
    expect(fireEvent.keyDown(line(3), { key: 'ArrowRight' }), 'the page must not scroll').toBe(false);
    expect(document.activeElement).toBe(line(4));
    expect(stops()).toEqual([line(4)]);
    fireEvent.keyDown(line(4), { key: 'ArrowUp' });
    fireEvent.keyDown(line(3), { key: 'ArrowLeft' });
    fireEvent.keyDown(line(2), { key: 'ArrowLeft' });
    fireEvent.keyDown(line(1), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(line(12));
  });

  it('gives arrows no job outside the Lines group', async () => {
    await open();
    const before = room()?.outerHTML;
    expect(key('ArrowLeft').defaultPrevented).toBe(false);
    expect(room()?.outerHTML).toBe(before);
  });

  it('keeps focus on a slot when its label changes', async () => {
    await open();
    toJacks();
    const second = button('Select enquiry plug');
    const third = button('Connect CERTIFICATION');
    press('Select enquiry plug');
    third.focus();
    fireEvent.click(third);
    expect(document.activeElement).toBe(third);
    expect(third.textContent).toBe('Read form');
    expect(second.textContent).toBe('Follow the cord');
  });

  it('orders the tab stops as the script does, with Close before the context action', async () => {
    await open();
    press('Desk underside');
    press('Open plate');
    const stops = [...(room() as HTMLElement).querySelectorAll<HTMLElement>('button, [tabindex="0"]')].filter(item => item.tabIndex === 0).map(item => item.textContent);
    expect(stops.slice(0, 3)).toEqual(['Leave', 'Archive', 'Hint']);
    const primary = stops.indexOf('Read the rulebook');
    const close = stops.indexOf('Close');
    expect(primary).toBe(3);
    expect(close).toBe(4);
    expect(stops[5]).toBe('Read docket');
    expect((room() as HTMLElement).querySelector('.tqw-exchange-reader-body')?.getAttribute('tabindex')).toBe('0');
    expect(stops.slice(7, 10)).toEqual(['Board', 'Desk underside', 'Ticket shelf']);
    expect(stops.slice(10, 14)).toEqual(['Read Rule 14', 'Connect operator test', 'Lift handset', 'Trace the diagram']);
    expect(stops[14]).toBe('3');
  });

  it('returns focus to the opener on Close, and to the primary when Resume service goes', async () => {
    await open();
    toJacks();
    const opener = button('Read wiring card');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(opener);
    const close = button('Close');
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(opener);
    press('Night service');
    const resume = button('Resume service');
    resume.focus();
    fireEvent.click(resume);
    expect(document.activeElement).toBe(document.querySelector('.tqw-exchange-primary'));
  });
});

describe('Records', () => {
  it('stores nothing before a discovery, and only the one key after', async () => {
    await open();
    press('Night service');
    toJacks();
    press('Read wiring card');
    press('Select enquiry plug');
    expect([...storage.data.keys()]).toEqual([]);
    press('Connect CERTIFICATION');
    expect([...storage.data.keys()]).toEqual([DISCOVERY_STORAGE_KEY]);
    expect(storage.data.get(DISCOVERY_STORAGE_KEY)).not.toMatch(/token|[0-9a-f]{32}/);
  });

  it('re-derives the mounted room after Forget everything, and can record again', async () => {
    await open();
    solveBoard();
    act(() => { discoveries.forget(); });
    expect([...storage.data.keys()]).toEqual([]);
    expect(room()?.getAttribute('data-plug')).toBe('rest');
    expect(reader()).toBeNull();
    expect(result().textContent).toBe('');
    press('Select enquiry plug');
    press('Connect CERTIFICATION');
    expect(foundIds()).toEqual(['departments-connected', 'certification-form']);
    expect(ack().textContent).toBe('Found: Departments connected');
  });

  it('returns to the initial room on Forget everything when the Exchange has no finding', async () => {
    discoveries.record('certification-office', { id: 'memo-001', kind: 'line' });
    await open();
    press('Night service');
    toJacks();
    press('Select enquiry plug');
    expect(room()?.getAttribute('data-service')).toBe('night');
    expect(room()?.getAttribute('data-plug')).toBe('guide');
    act(() => { discoveries.forget(); });
    expect(room()?.getAttribute('data-service')).toBe('day');
    expect(room()?.getAttribute('data-plug')).toBe('rest');
  });

  it('re-derives the room from an import that changes only its room record', async () => {
    await open();
    solveBoard();
    expect(room()?.getAttribute('data-service')).toBe('day');
    const imported = JSON.parse(discoveries.exportText()) as { roomState: { exchange: Record<string, unknown> } };
    imported.roomState.exchange = { ...imported.roomState.exchange, service: 'night' };
    act(() => { expect(discoveries.importText(JSON.stringify(imported))).toBe(true); });
    expect(room()?.getAttribute('data-service')).toBe('night');
    press('Resume service');
    expect(discoveries.getRoomState('exchange')?.['service']).toBe('day');
  });

  it('restores the room record across a reload, night service and all', async () => {
    await open();
    press('Desk underside');
    press('Open plate');
    toJacks();
    press('Select enquiry plug');
    press('Night service');
    await reload();
    expect(room()?.getAttribute('data-service')).toBe('night');
    expect(room()?.getAttribute('data-plug')).toBe('guide');
    expect(room()?.getAttribute('data-plate')).toBe('open');
    expect(screen.getByText('Connections retained.')).toBeTruthy();
  });

  it('derives the room from findings when the record is refused', async () => {
    discoveries.record('exchange', { id: 'departments-connected', kind: 'payoff' });
    discoveries.record('exchange', { id: 'rule-14', kind: 'secret' });
    discoveries.record('exchange', { id: 'socket-beneath-plate', kind: 'secret' });
    discoveries.setRoomState('exchange', { version: 99, service: 'lunch' });
    await open();
    expect(room()?.getAttribute('data-service')).toBe('day');
    expect(room()?.getAttribute('data-plug')).toBe('seated');
    expect(room()?.getAttribute('data-plate')).toBe('open');
    expect(room()?.getAttribute('data-lead')).toBe('seated');
    expect(room()?.getAttribute('data-handset')).toBe('off-hook');
  });

  it('maps a restored legacy night-service value to the same presentation', async () => {
    discoveries.record('exchange', { id: 'cardigan', kind: 'line' });
    discoveries.setRoomState('exchange', { phase: 'night-service' });
    await open();
    expect(room()?.getAttribute('data-service')).toBe('night');
    expect(screen.getByRole('heading', { name: 'NIGHT SERVICE' })).toBeTruthy();
    press('Resume service');
    expect(room()?.getAttribute('data-service')).toBe('day');
  });

  it('runs without a discovery store', async () => {
    await open({ discoveries: undefined });
    solveBoard();
    expect(room()?.getAttribute('data-plug')).toBe('seated');
    press('Close');
    press('Archive');
    expect(within(reader() as HTMLElement).getByRole('button', { name: 'Departments connected' })).toBeTruthy();
  });
});

describe('Modes', () => {
  it('offers the same stations, slots and Lines group in text mode, with no scene', async () => {
    const onReady = vi.fn();
    await open({ ...TEXT_MODE, onReady });
    expect(onReady).toHaveBeenCalled();
    expect(scene.props).toBeNull();
    expect(room()?.getAttribute('data-room-ready')).toBe('true');
    expect(button('View jacks')).toBeTruthy();
    press('Sign');
    expect(result().textContent).toBe(SIGN_LINE);
    press('View jacks');
    expect(button('Read wiring card')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Lines' })).toBeTruthy();
  });

  it('prints the plate face at the kneehole while it is shut, where no 3D lettering exists', async () => {
    await open(TEXT_MODE);
    press('Desk underside');
    expect(screen.getByText(PLATE_FACE)).toBeTruthy();
    press('Open plate');
    expect(screen.queryByText(PLATE_FACE)).toBeNull();
  });

  it('becomes ready when the scene says so, and falls to text mode when its context is lost', async () => {
    const onReady = vi.fn();
    const onContextLost = vi.fn();
    await open({ onReady, onContextLost });
    expect(room()?.getAttribute('data-room-ready')).toBe('false');
    const props = await sceneProps() as SceneProps & { onContextLost(): void };
    act(() => { props.onReady(); });
    expect(room()?.getAttribute('data-room-ready')).toBe('true');
    expect(onReady).toHaveBeenCalledOnce();
    act(() => { props.onContextLost(); });
    expect(room()?.getAttribute('data-mode')).toBe('text');
    expect(onContextLost).toHaveBeenCalledOnce();
  });

  it('hides the shared walking prompt and second Leave for this room', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'exchange.css'), 'utf8');
    expect(css).toMatch(/\.tqw-game__window:has\(\.tqw-exchange\) \.tqw-game__mode,\s*\.tqw-game__window:has\(\.tqw-exchange\) \.tqw-game__leave \{ display: none; \}/);
  });

  it('renders one Leave, one Hint and one Archive', async () => {
    await open();
    for (const name of ['Leave', 'Hint', 'Archive']) expect(screen.getAllByRole('button', { name })).toHaveLength(1);
  });
});
