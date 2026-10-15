import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ARCHIVE_COPY, CHAMBERS, type DiscoveryStore, type Finding } from '@tqw/engine';
import { createMemoryDiscoveryStore } from './testHelpers.ts';
import { Unlocks } from './Unlocks.tsx';
import type { UnlocksProps } from './types.ts';

const OFFICE = 'certification-office';
const OFFICE_PAPERS = CHAMBERS.find((chamber) => chamber.id === OFFICE)?.findings.papers ?? 0;
const APARTMENT_PAPERS = CHAMBERS.find((chamber) => chamber.id === 'apartment')?.findings.papers ?? 0;
const EXCHANGE_PAPERS = CHAMBERS.find((chamber) => chamber.id === 'exchange')?.findings.papers ?? 0;
const PAPERS = CHAMBERS.filter((chamber) => chamber.status === 'open').reduce((total, chamber) => total + chamber.findings.papers, 0);

function setup(over: Partial<UnlocksProps> = {}, store: DiscoveryStore = createMemoryDiscoveryStore()) {
  const view = render(<Unlocks store={store} chambers={CHAMBERS} {...over} />);
  return { store, view, section: view.container.querySelector('.tqw-archive') as HTMLElement };
}

/** The archive's one-line message, a polite live region. */
const message = (): HTMLElement => document.querySelector('.tqw-archive__message') as HTMLElement;

const papersOf = (section: HTMLElement) => [...section.querySelectorAll<HTMLElement>('.tqw-paper')];
const sealedRowsOf = (section: HTMLElement) => [...section.querySelectorAll<HTMLElement>('.tqw-archive__sealed-row')];

/** Captures what the export hands the browser: the blob, the file name, and that a download was triggered. */
function captureDownload() {
  const blobs: Blob[] = [];
  const created = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:archive-test';
  });
  const revoked = vi.fn();
  URL.createObjectURL = created as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoked;
  const downloads: string[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  const read = (blob: Blob | undefined) =>
    new Promise<string>((resolve, reject) => {
      if (!blob) return reject(new Error('no blob'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  return { blobs, downloads, created, revoked, click, read: () => read(blobs[0]) };
}

function jsonFile(text: string): File {
  return new File([text], 'unheld-discoveries.json', { type: 'application/json' });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Unlocks: the archive section', () => {
  it('is a section named "Your archive", at #archive, with its introduction', () => {
    const { section } = setup();
    expect(section.id).toBe('archive');
    expect(screen.getByRole('region', { name: ARCHIVE_COPY.title })).toBe(section);
    expect(within(section).getByRole('heading', { level: 2, name: ARCHIVE_COPY.title })).toBeTruthy();
    expect(screen.getByText(ARCHIVE_COPY.intro)).toBeTruthy();
  });

  it('groups by room, and shows only rooms that have something to find', () => {
    const { section } = setup();
    const rooms = within(section).getAllByRole('heading', { level: 3 });
    expect(rooms.map((h) => h.textContent)).toEqual(['The Certification Office', 'The Apartment', 'The Exchange']);
    expect(within(section).getByText(`0 of ${OFFICE_PAPERS} papers found.`)).toBeTruthy();
    expect(within(section).getByText(`0 of ${APARTMENT_PAPERS} papers found.`)).toBeTruthy();
    expect(within(section).getByText(`0 of ${EXCHANGE_PAPERS} papers found.`)).toBeTruthy();
  });

  it('shows only each sealed room name and status, with no archive totals or findings', () => {
    const chambers = CHAMBERS.map((chamber) => chamber.id === 'exchange' || chamber.id === 'outline-room'
      ? { ...chamber, status: 'sealed' as const }
      : chamber);
    const { section } = setup({ chambers, production: true });
    const rooms = within(section).getAllByRole('heading', { level: 3 });
    expect(rooms.map((heading) => heading.textContent)).toEqual([
      'The Certification Office',
      'The Apartment',
      'The Tomorrow Engine',
      'The Great Atrium',
      'The Exchange',
      'The Outline Room',
    ]);
    expect(section.textContent).not.toContain(`0 of ${EXCHANGE_PAPERS} papers found.`);
    for (const room of chambers.filter((chamber) => chamber.status === 'sealed')) {
      const sectionForRoom = section.querySelector(`[data-room="${room.id}"]`);
      expect(sectionForRoom?.textContent).toBe(`${room.title}Not yet open.`);
      expect(sectionForRoom?.textContent).not.toContain(room.clipping.headline);
      expect(sectionForRoom?.textContent).not.toContain(room.doorDescription);
    }
  });

  it('keeps authored archive totals visible in development builds', () => {
    const { section } = setup({ production: false });
    expect(within(section).getByText(`0 of ${EXCHANGE_PAPERS} papers found.`)).toBeTruthy();
  });

  it('says, with nothing found, "0 of 7 papers found." in plain words', () => {
    setup();
    expect(screen.getByText(`0 of ${OFFICE_PAPERS} papers found.`).className).toContain('tqw-archive__room-count');
  });
});

describe('Unlocks: sealed papers (nothing about an unfound item is in the page)', () => {
  it('keeps sealed finds in their own compact room list, outside the documents grid', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, { id: 'memo-3', kind: 'memo' });
    const { section } = setup({}, store);
    const documents = section.querySelector('.tqw-archive__items') as HTMLElement;
    expect(documents.querySelectorAll('.tqw-paper')).toHaveLength(1);
    expect(sealedRowsOf(section)).toHaveLength(PAPERS - 1);
    expect(sealedRowsOf(section).every((row) => row.textContent === 'Sealed')).toBe(true);
    expect(sealedRowsOf(section).every((row) => row.parentElement?.classList.contains('tqw-archive__sealed'))).toBe(true);
  });

  it('shows one identical neutral row for every unfound paper, each saying only "Sealed"', () => {
    const { section } = setup();
    const rows = sealedRowsOf(section);
    expect(rows).toHaveLength(PAPERS);
    for (const row of rows) {
      expect(row.textContent).toBe('Sealed');
      expect(row.querySelectorAll('*')).toHaveLength(1);
    }
    expect(new Set(rows.map((row) => row.outerHTML)).size).toBe(1);
  });

  it('gives a sealed row no attribute but its class: no id, kind, title, label or data', () => {
    const { section } = setup();
    for (const row of sealedRowsOf(section)) {
      expect(row.getAttributeNames()).toEqual(['class']);
    }
  });

  it('asks for no title or fragment of anything unfound, and shows no secret silhouettes', () => {
    const describe = vi.fn(() => ({ title: 'SPOILER', fragment: 'SPOILER' }));
    const { section } = setup({ describe });
    expect(describe).not.toHaveBeenCalled();
    expect(section.textContent).not.toContain('SPOILER');
    // Secrets have no silhouettes: how many exist stays unspoken. (The Forget dialog, closed, names
    // them in its sentence, so only the rooms are looked at.)
    const rooms = section.querySelector('.tqw-archive__room') as HTMLElement;
    expect(rooms.textContent).not.toMatch(/secret/i);
    expect(papersOf(section)).toHaveLength(0);
    expect(sealedRowsOf(section)).toHaveLength(PAPERS);
  });

  it('one paper found leaves one fewer sealed, never changing the total', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, { id: 'memo-3', kind: 'memo' });
    const { section } = setup({}, store);
    const papers = papersOf(section);
    expect(papers).toHaveLength(1);
    expect(papers.filter((p) => p.dataset['state'] === 'found')).toHaveLength(1);
    expect(sealedRowsOf(section)).toHaveLength(PAPERS - 1);
    expect(screen.getByText(`1 of ${OFFICE_PAPERS} papers found.`)).toBeTruthy();
  });
});

describe('Unlocks: found papers', () => {
  const found = (id = 'memo-3', kind: Finding['kind'] = 'memo'): Finding => ({ id, kind });

  it('names a found paper with its approved title and fragment when the shell supplies them', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found());
    const describe = vi.fn((_room: string, finding: Finding) => ({ title: `Title for ${finding.id}`, fragment: 'A modest fragment.' }));
    setup({ describe }, store);
    expect(describe).toHaveBeenCalledWith(OFFICE, found());
    const paper = screen.getByRole('heading', { level: 4, name: 'Title for memo-3' }).closest('.tqw-paper') as HTMLElement;
    expect(paper.dataset['state']).toBe('found');
    expect(within(paper).getByText('A modest fragment.').className).toContain('tqw-paper__fragment');
  });

  it('falls back to the kind of thing it is, never to its id, when there is no approved title', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found('memo-3'));
    const { section } = setup({}, store);
    expect(within(section).getByRole('heading', { level: 4, name: ARCHIVE_COPY.kinds.memo })).toBeTruthy();
    expect(section.textContent).not.toContain('memo-3');
  });

  it.each([
    ['memo', 'A paper'],
    ['secret', 'A secret'],
    ['payoff', 'A find'],
    ['line', 'A note'],
  ] as const)('calls an untitled %s "%s"', (kind, label) => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found('x-1', kind));
    setup({}, store);
    expect(screen.getByRole('heading', { level: 4, name: label })).toBeTruthy();
  });

  it('shows a paper\'s fragment only when there is one', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found());
    const { section } = setup({ describe: () => ({ title: 'Form 27-B' }) }, store);
    expect(section.querySelector('.tqw-paper__fragment')).toBeNull();
  });

  it('counts secrets only once found, in words, with no total', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found('secret-1', 'secret'));
    const { view, section } = setup({}, store);
    expect(screen.getByText(`0 of ${OFFICE_PAPERS} papers found. 1 secret found.`)).toBeTruthy();
    expect(section.querySelector('.tqw-archive__room-count')?.textContent).toBe(`0 of ${OFFICE_PAPERS} papers found. 1 secret found.`);
    expect(section.textContent).not.toMatch(/\b\d+ of \d+ secrets?\b|\b\d+\/\s*\d+\b/);
    act(() => store.record(OFFICE, found('secret-2', 'secret')));
    expect(screen.getByText(`0 of ${OFFICE_PAPERS} papers found. 2 secrets found.`)).toBeTruthy();
    expect(section.querySelector('.tqw-archive__room-count')?.textContent).toBe(`0 of ${OFFICE_PAPERS} papers found. 2 secrets found.`);
    expect(view.container.textContent).not.toMatch(/\b\d+ of \d+ secrets?\b|\b\d+\/\s*\d+\b/);
  });

  it('lists a found secret among the papers, but never draws a sealed one', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found('secret-1', 'secret'));
    const { section } = setup({}, store);
    const papers = papersOf(section);
    expect(papers.filter((p) => p.dataset['state'] === 'found')).toHaveLength(1);
    expect(sealedRowsOf(section)).toHaveLength(PAPERS);
  });

  it('gives a found item a "Read again" action only when the shell can open it', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found());
    const { section } = setup({}, store);
    expect(within(section).queryByRole('button', { name: /Read again/ })).toBeNull();
    cleanup();
    const onReread = vi.fn();
    setup({ onReread, describe: () => ({ title: 'Form 27-B' }) }, store);
    fireEvent.click(screen.getByRole('button', { name: 'Read again: Form 27-B' }));
    expect(onReread).toHaveBeenCalledWith(OFFICE, found());
  });

  it('fades a newly found paper in, and does not animate what was already there', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, found('memo-1'));
    const { section } = setup({}, store);
    expect(papersOf(section).find((p) => p.dataset['state'] === 'found')?.hasAttribute('data-new')).toBe(false);
    act(() => store.record(OFFICE, found('memo-2')));
    const fresh = papersOf(section).filter((p) => p.dataset['state'] === 'found');
    expect(fresh).toHaveLength(2);
    expect(fresh.filter((p) => p.dataset['new'] === 'true')).toHaveLength(1);
  });
});

describe('Unlocks: no scores, no progress', () => {
  it('draws no progress bar, meter, ring or percentage, and no total across rooms', () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, { id: 'memo-1', kind: 'memo' });
    const { section } = setup({}, store);
    expect(section.querySelector('progress, meter, [role="progressbar"], [role="meter"], svg, canvas')).toBeNull();
    expect(section.textContent).not.toMatch(/%/);
    expect(section.textContent).not.toMatch(/complete(?!\.)|score|achievement|level|rank|best|streak/i);
  });

  it('says there is nothing to complete', () => {
    setup();
    expect(screen.getByText(/There is nothing to complete\./)).toBeTruthy();
  });
});

describe('Unlocks: recognitions', () => {
  it('shows a recognition only by a name the shell gives it, never by its id', () => {
    const store = createMemoryDiscoveryStore({ version: 1, found: {}, recognitions: ['r-1', 'r-2'] });
    const { section } = setup({ recognitionName: (id) => (id === 'r-1' ? 'Noticed the lamp' : null) }, store);
    expect(within(section).getByText('Noticed the lamp')).toBeTruthy();
    expect(section.textContent).not.toContain('r-1');
    expect(section.textContent).not.toContain('r-2');
    expect(section.querySelectorAll('.tqw-archive__recognitions li')).toHaveLength(1);
  });

  it('shows no recognition list when none has a name', () => {
    const store = createMemoryDiscoveryStore({ version: 1, found: {}, recognitions: ['r-1'] });
    const { section } = setup({}, store);
    expect(section.querySelector('.tqw-archive__recognitions')).toBeNull();
  });
});

describe('Unlocks: nothing sealed can be read from this code', () => {
  it('imports and mentions no sealed-content opener, token or plaintext', () => {
    // Code only: the component's own comments say what it must never do, in those very words.
    const source = readFileSync(join(import.meta.dirname, 'Unlocks.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source.length).toBeGreaterThan(1000);
    expect(source).not.toMatch(/openSealed|sealed\//i);
    expect(source).not.toMatch(/token/i);
    expect(source).not.toMatch(/plaintext/i);
  });
});

describe('Unlocks: this device only', () => {
  it('says the archive is kept on this device and never sent', () => {
    setup();
    expect(screen.getByText(ARCHIVE_COPY.deviceOnly).className).toContain('tqw-archive__device');
  });

  it('offers exactly export, import and forget, and nothing else', () => {
    const { section } = setup();
    const actions = within(section.querySelector('.tqw-archive__actions') as HTMLElement).getAllByRole('button');
    expect(actions.map((b) => b.textContent)).toEqual([ARCHIVE_COPY.export, ARCHIVE_COPY.import]);
    const apart = section.querySelector('.tqw-archive__forget button');
    expect(apart?.textContent).toBe(ARCHIVE_COPY.forget);
    expect(apart?.closest('.tqw-archive__actions')).toBeNull();
  });
});

describe('Unlocks: its messages', () => {
  it('are announced politely, in a live region that is always there, without taking the status role', () => {
    setup();
    expect(message().getAttribute('aria-live')).toBe('polite');
    expect(message().hasAttribute('role')).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Unlocks: export', () => {
  it('saves the archive as unheld-discoveries.json, from this device, and says so', async () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, { id: 'memo-1', kind: 'memo' });
    const capture = captureDownload();
    setup({}, store);
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.export }));
    expect(capture.downloads).toEqual(['unheld-discoveries.json']);
    expect(capture.blobs[0]?.type).toBe('application/json');
    expect(await capture.read()).toBe(store.exportText());
    expect(message().textContent).toBe(ARCHIVE_COPY.exported);
  });

  it('releases the object URL it made', () => {
    vi.useFakeTimers();
    const capture = captureDownload();
    setup();
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.export }));
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(capture.revoked).toHaveBeenCalledWith('blob:archive-test');
  });
});

describe('Unlocks: import', () => {
  const fileInput = (section: HTMLElement) => section.querySelector('input[type="file"]') as HTMLInputElement;

  it('keeps the file input out of the way: hidden, outside the tab order, JSON only', () => {
    const { section } = setup();
    const input = fileInput(section);
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.accept).toContain('.json');
  });

  it('opens the file picker from the visible Import button', () => {
    const { section } = setup();
    const click = vi.spyOn(fileInput(section), 'click');
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.import }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('replaces the archive with a valid file, says so, and tells the shell it was replaced', async () => {
    const onReplaced = vi.fn();
    const { section, store } = setup({ onReplaced });
    const text = JSON.stringify({ version: 1, found: { [OFFICE]: [{ id: 'memo-1', kind: 'memo' }] }, recognitions: [] });
    fireEvent.change(fileInput(section), { target: { files: [jsonFile(text)] } });
    await waitFor(() => expect(message().textContent).toBe(ARCHIVE_COPY.imported));
    expect(store.has(OFFICE, 'memo-1')).toBe(true);
    expect(onReplaced).toHaveBeenCalledTimes(1);
    expect(screen.getByText(`1 of ${OFFICE_PAPERS} papers found.`)).toBeTruthy();
  });

  it('changes nothing for a file it cannot read, and says so', async () => {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, { id: 'memo-1', kind: 'memo' });
    const onReplaced = vi.fn();
    const { section } = setup({ onReplaced }, store);
    fireEvent.change(fileInput(section), { target: { files: [jsonFile('this is not an archive')] } });
    await waitFor(() => expect(message().textContent).toBe(ARCHIVE_COPY.importFailed));
    expect(store.getState().found[OFFICE]).toEqual([{ id: 'memo-1', kind: 'memo' }]);
    expect(onReplaced).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled', () => {
    const { section } = setup();
    fireEvent.change(fileInput(section), { target: { files: [] } });
    expect(message().textContent).toBe('');
  });
});

describe('Unlocks: forget everything', () => {
  const confirmation = () => screen.getByRole('dialog', { name: ARCHIVE_COPY.forgetTitle });

  function withFound() {
    const store = createMemoryDiscoveryStore();
    store.record(OFFICE, { id: 'memo-1', kind: 'memo' });
    store.record(OFFICE, { id: 'secret-1', kind: 'secret' });
    return store;
  }

  it('asks first, and changes nothing by being asked', () => {
    const store = withFound();
    setup({}, store);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    expect(confirmation()).toBeTruthy();
    expect(store.getState().found[OFFICE]).toHaveLength(2);
  });

  it('names the consequence: every paper and secret, no copy elsewhere, cannot be undone', () => {
    setup({}, withFound());
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    const body = within(confirmation()).getByText(ARCHIVE_COPY.forgetBody);
    expect(body.textContent).toMatch(/every paper and secret/);
    expect(body.textContent).toMatch(/cannot be undone/);
  });

  it('offers to export first, and puts focus on Cancel, the safe choice', async () => {
    setup({}, withFound());
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    const dialog = confirmation();
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([
      ARCHIVE_COPY.forgetExport,
      ARCHIVE_COPY.forgetCancel,
      ARCHIVE_COPY.forgetConfirm,
    ]);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: ARCHIVE_COPY.forgetCancel })));
  });

  it('keeps everything when cancelled', () => {
    const store = withFound();
    const onReplaced = vi.fn();
    setup({ onReplaced }, store);
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    fireEvent.click(within(confirmation()).getByRole('button', { name: ARCHIVE_COPY.forgetCancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().found[OFFICE]).toHaveLength(2);
    expect(onReplaced).not.toHaveBeenCalled();
  });

  it('keeps everything when the dialog is dismissed with Escape', () => {
    const store = withFound();
    setup({}, store);
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    (confirmation() as HTMLDialogElement).close();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().found[OFFICE]).toHaveLength(2);
  });

  it('forgets everything only on the explicit confirmation, then says so and tells the shell', () => {
    const store = withFound();
    const onReplaced = vi.fn();
    const { section } = setup({ onReplaced }, store);
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    fireEvent.click(within(confirmation()).getByRole('button', { name: ARCHIVE_COPY.forgetConfirm }));
    expect(store.getState()).toEqual({ version: 1, found: {}, recognitions: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(message().textContent).toBe(ARCHIVE_COPY.forgotten);
    expect(onReplaced).toHaveBeenCalledTimes(1);
    expect(screen.getByText(`0 of ${OFFICE_PAPERS} papers found.`)).toBeTruthy();
    expect(papersOf(section)).toHaveLength(0);
    expect(sealedRowsOf(section)).toHaveLength(PAPERS);
  });

  it('can export from inside the confirmation without forgetting', async () => {
    const store = withFound();
    const capture = captureDownload();
    setup({}, store);
    fireEvent.click(screen.getByRole('button', { name: ARCHIVE_COPY.forget }));
    fireEvent.click(within(confirmation()).getByRole('button', { name: ARCHIVE_COPY.forgetExport }));
    expect(capture.downloads).toEqual(['unheld-discoveries.json']);
    expect(await capture.read()).toBe(store.exportText());
    expect(store.getState().found[OFFICE]).toHaveLength(2);
    expect(confirmation()).toBeTruthy();
  });
});
