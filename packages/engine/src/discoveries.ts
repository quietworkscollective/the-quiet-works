import { CHAMBERS, isChamberId, type ChamberId } from './chambers.ts';
import { ID_PATTERN } from './sealed/source.ts';

/**
 * What a visitor has found, remembered on their device only (ADR 0003, R-1). One versioned key in
 * local storage, written only when something is discovered, never sent anywhere. "Forget
 * everything" erases it; export and import move it between devices by hand.
 *
 * Per-room counts describe what was found, never how well someone did (R-3): no points, streaks,
 * leaderboards or timers.
 */

export const DISCOVERY_STORAGE_KEY = 'unheld.v1';

/** What kind of thing was found. Matches `SealedItem.kind`, plus Memo 001, which is public. */
export type FindingKind = 'memo' | 'secret' | 'payoff' | 'line';

export interface Finding {
  /** The sealed item id (ADR 0002), or `memo-001`. */
  id: string;
  kind: FindingKind;
}

export interface DiscoveryState {
  version: 1;
  found: Partial<Record<ChamberId, readonly Finding[]>>;
  /** Named recognitions earned by how the visitor explored (ids, e.g. `listener`). */
  recognitions: readonly string[];
}

export interface RoomCount {
  chamber: ChamberId;
  /** Papers (memos) found and the room's total. */
  papers: { found: number; total: number };
  /** Secrets found and the room's total. */
  secrets: { found: number; total: number };
}

/** The slice of the Web Storage API the store needs; null when storage is unavailable. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DiscoveryStore {
  getState(): DiscoveryState;
  subscribe(listener: () => void): () => void;
  /** Records a finding. Idempotent. The first call is the first write to storage. */
  record(chamber: ChamberId, finding: Finding): void;
  has(chamber: ChamberId, id: string): boolean;
  /** One entry per open chamber, from `CHAMBERS[n].findings`. */
  counts(): readonly RoomCount[];
  /** Erases the storage key and resets to empty. */
  forget(): void;
  /** A small JSON document of the current state, for the visitor to keep. */
  exportText(): string;
  /** Validates and replaces the state; false (and nothing changes) for anything invalid. */
  importText(text: string): boolean;
}

/**
 * The most text the store reads, from storage or from an import. A real document is well under a
 * kilobyte; the limit only stops a pasted file from being parsed. Valid documents are plain ASCII,
 * so characters and bytes agree.
 */
const MAX_TEXT_LENGTH = 64 * 1024;
/** Finding and recognition ids are short slugs (`memo-001`); this keeps anything longer out of storage. */
const MAX_ID_LENGTH = 64;
const MAX_RECOGNITIONS = 64;
const KINDS: readonly FindingKind[] = ['memo', 'secret', 'payoff', 'line'];
const DOCUMENT_KEYS: readonly string[] = ['version', 'found', 'recognitions'];

type Found = Partial<Record<ChamberId, readonly Finding[]>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value);
}

function isFinding(value: unknown): value is Finding {
  return isRecord(value) && isId(value['id']) && KINDS.some((kind) => kind === value['kind']);
}

/** Chambers in corridor order and empty ones dropped, so the same findings always serialise the same way. */
function makeState(found: Found, recognitions: readonly string[]): DiscoveryState {
  const ordered: Found = {};
  for (const { id } of CHAMBERS) {
    const list = found[id];
    if (list === undefined || list.length === 0) continue;
    // Copy to just id and kind, so nothing else a caller passes along can reach storage.
    ordered[id] = Object.freeze(list.map((f) => Object.freeze({ id: f.id, kind: f.kind })));
  }
  return Object.freeze({
    version: 1,
    found: Object.freeze(ordered),
    recognitions: Object.freeze([...recognitions]),
  });
}

function isEmpty(state: DiscoveryState): boolean {
  return Object.keys(state.found).length === 0 && state.recognitions.length === 0;
}

function hasFinding(state: DiscoveryState, chamber: ChamberId, id: string): boolean {
  return state.found[chamber]?.some((f) => f.id === id) ?? false;
}

/**
 * Reads a document strictly, for both what storage holds and what a visitor imports: exactly the
 * known fields, known chambers, slug ids, no repeats. Anything else is null and nothing of it is
 * kept, so a hand-edited or damaged file cannot half-apply.
 */
function readState(text: unknown): DiscoveryState | null {
  if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) return null;
  let raw: unknown;
  try {
    // Some editors save UTF-8 with a byte-order mark, which JSON.parse refuses.
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || Object.keys(raw).some((key) => !DOCUMENT_KEYS.includes(key))) return null;
  if (raw['version'] !== 1) return null;

  const foundRaw = raw['found'];
  if (!isRecord(foundRaw)) return null;
  const found: Found = {};
  for (const [chamber, list] of Object.entries(foundRaw)) {
    if (!isChamberId(chamber) || !Array.isArray(list)) return null;
    const findings: Finding[] = [];
    for (const entry of list as unknown[]) {
      if (!isFinding(entry) || Object.keys(entry).length !== 2) return null;
      if (findings.some((f) => f.id === entry.id)) return null;
      findings.push(entry);
    }
    found[chamber] = findings;
  }

  const recognitionsRaw = raw['recognitions'];
  if (!Array.isArray(recognitionsRaw) || recognitionsRaw.length > MAX_RECOGNITIONS) return null;
  const recognitions: string[] = [];
  for (const entry of recognitionsRaw as unknown[]) {
    if (!isId(entry) || recognitions.includes(entry)) return null;
    recognitions.push(entry);
  }
  return makeState(found, recognitions);
}

function countsOf(state: DiscoveryState): readonly RoomCount[] {
  const tally = (list: readonly Finding[], kind: FindingKind, total: number) => ({
    found: Math.min(list.filter((f) => f.kind === kind).length, total),
    total,
  });
  return CHAMBERS.filter((c) => c.status === 'open').map((c) => {
    const list = state.found[c.id] ?? [];
    return {
      chamber: c.id,
      papers: tally(list, 'memo', c.findings.papers),
      secrets: tally(list, 'secret', c.findings.secrets),
    };
  });
}

/**
 * The visitor's discoveries, held in memory and mirrored to one storage key. Storage is only a
 * mirror: when it is missing, full or refusing writes, the store keeps working from memory for the
 * rest of the visit.
 *
 * The key is untouched until the first `record`, and holds nothing but the versioned document
 * (finding ids and kinds, recognition ids): no timestamps, no content, no tokens.
 */
export function createDiscoveryStore(storage: StorageLike | null): DiscoveryStore {
  const listeners = new Set<() => void>();
  let state = loadState();
  let counted: { state: DiscoveryState; counts: readonly RoomCount[] } | null = null;

  /** A value that is missing, unreadable or of another version is ignored; the next write replaces it. */
  function loadState(): DiscoveryState {
    try {
      const read = readState(storage?.getItem(DISCOVERY_STORAGE_KEY));
      if (read !== null) return read;
    } catch {
      // Storage refused the read: start empty.
    }
    return makeState({}, []);
  }

  /** An empty state removes the key rather than writing an empty document: nothing found, nothing kept. */
  function mirror(next: DiscoveryState): void {
    try {
      if (isEmpty(next)) storage?.removeItem(DISCOVERY_STORAGE_KEY);
      else storage?.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or blocked storage: this visit keeps what it found in memory; the next write retries.
    }
  }

  function change(next: DiscoveryState): void {
    state = next;
    mirror(next);
    for (const listener of [...listeners]) listener();
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    record(chamber, finding) {
      if (!isChamberId(chamber) || !isFinding(finding) || hasFinding(state, chamber, finding.id)) return;
      const found = { ...state.found, [chamber]: [...(state.found[chamber] ?? []), finding] };
      change(makeState(found, state.recognitions));
    },

    has: (chamber, id) => isChamberId(chamber) && hasFinding(state, chamber, id),

    counts() {
      if (counted?.state !== state) counted = { state, counts: countsOf(state) };
      return counted.counts;
    },

    forget() {
      // The key is removed even when the state is already empty, so a stored value that was
      // ignored on load goes too. Only a real change is announced.
      if (isEmpty(state)) {
        mirror(state);
        return;
      }
      change(makeState({}, []));
    },

    exportText: () => JSON.stringify(state, null, 2),

    importText(text) {
      const next = readState(text);
      if (next === null) return false;
      if (JSON.stringify(next) !== JSON.stringify(state)) change(next);
      return true;
    },
  };
}
