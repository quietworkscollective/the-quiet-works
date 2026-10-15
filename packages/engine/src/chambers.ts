/**
 * The chambers along the corridor: identity, URL, status and the words on their doors and
 * notice-board clippings. Narrative data only. How each door looks lives with its chamber in
 * apps/web (`chambers/<id>/door.ts`), because every chamber introduces its own door.
 *
 * Order is corridor order from the entrance. IDs are immutable (MASTER_BLUEPRINT §8): saved
 * state and deep links depend on them.
 */

export type ChamberId = 'certification-office' | 'apartment' | 'tomorrow-engine' | 'great-atrium' | 'exchange' | 'outline-room';

/** `open`: the door opens into a playable chamber. `sealed`: the door exists, locked, not yet built. */
export type ChamberStatus = 'open' | 'sealed';

export interface Clipping {
  /** Newspaper-style headline, uppercase, at most 48 characters. */
  headline: string;
  /** One sentence under the headline, at most 110 characters. */
  dek: string;
  /** Small print: notice number and issuing department. */
  dateline: string;
}

export interface ChamberEntry {
  id: ChamberId;
  /** URL path segment: `https://unheld.space/<slug>`. */
  slug: string;
  title: string;
  /** Lettering on the door plaque, uppercase. */
  plaque: string;
  /** The year the department was "installed" into the building; its door comes from that era. */
  era: string;
  status: ChamberStatus;
  side: 'left' | 'right';
  clipping: Clipping;
  /** Read by assistive tech on the door's DOM equivalent and in text mode. */
  doorDescription: string;
  /** How many papers (memos) and secrets the room holds, for the per-room counts (ADR 0003). */
  findings: { papers: number; secrets: number };
}

export const CHAMBERS: readonly ChamberEntry[] = [
  {
    id: 'certification-office',
    slug: 'certification-office',
    title: 'The Certification Office',
    plaque: 'CERTIFICATION OFFICE',
    era: '1971',
    status: 'open',
    side: 'right',
    clipping: {
      headline: 'OFFICE SEEKS EVIDENCE OF COMPETENCE',
      dek: 'Applicants report that the stamp works beautifully, though nobody has yet been approved.',
      dateline: 'Notice No. 001 · Department of Certification',
    },
    doorDescription:
      'A steel-framed door from 1971 with a wired-glass panel and a service hatch. Light leaks around its edges.',
    findings: { papers: 7, secrets: 5 },
  },
  {
    id: 'apartment',
    slug: 'apartment',
    title: 'The Apartment',
    plaque: 'FLAT 4',
    era: 'present day',
    status: 'open',
    side: 'left',
    clipping: {
      headline: 'RESIDENTIAL ROOM NOW OPEN',
      dek: 'A furnished apartment is available to inspect; the corridor remains a corridor.',
      dateline: 'Notice No. 000 · Residential Wing',
    },
    doorDescription: 'A painted apartment door with a brass number 4 and a doormat. It opens into a furnished room.',
    findings: { papers: 5, secrets: 1 },
  },
  {
    id: 'tomorrow-engine',
    slug: 'tomorrow-engine',
    title: 'The Tomorrow Engine',
    plaque: 'TOMORROW ENGINE · PLANT ROOM',
    era: '1928',
    status: 'sealed',
    side: 'left',
    clipping: {
      headline: 'ENGINE WILL FINISH EVERYTHING BY TOMORROW',
      dek: 'Engineers confirm that tomorrow remains on schedule, as it has every day since 1928.',
      dateline: 'Notice No. 002 · Plant and Machinery',
    },
    doorDescription: 'A riveted iron door with a wheel handle and a pressure gauge. It is sealed.',
    findings: { papers: 0, secrets: 0 },
  },
  {
    id: 'great-atrium',
    slug: 'great-atrium',
    title: 'The Great Atrium',
    plaque: 'THE GREAT ATRIUM',
    era: 'unfinished',
    status: 'sealed',
    side: 'right',
    clipping: {
      headline: 'MONUMENT REMAINS UNFINISHED, AS PLANNED',
      dek: 'Contributions will be accepted when the atrium opens, on a date not yet set.',
      dateline: 'Notice No. 003 · Office of Works',
    },
    doorDescription: 'Tall double doors in bronze and glass, chained shut. Cold air moves behind them.',
    findings: { papers: 0, secrets: 0 },
  },
  {
    id: 'exchange',
    slug: 'the-exchange',
    title: 'The Exchange',
    plaque: 'THE EXCHANGE',
    era: 'night shift',
    status: 'open',
    side: 'right',
    clipping: {
      headline: 'ANNEX ROOM NOW OPEN',
      dek: 'The Exchange is available from bay six.',
      dateline: 'Notice No. 004 · Annex Records',
    },
    doorDescription: 'A tall black lacquer door with cream enamel bands, a small engaged lamp, and a brass push plate.',
    findings: { papers: 23, secrets: 3 },
  },
  {
    id: 'outline-room',
    slug: 'outline-room',
    title: 'The Outline Room',
    plaque: 'THE OUTLINE ROOM',
    era: 'undated',
    status: 'open',
    side: 'left',
    clipping: {
      headline: 'A SMALL ROOM FOR A VERY EXACT LINE',
      dek: 'A brass tracing arm is ready for inspection in the Annex.',
      dateline: 'Annex · Bay 6 · Instrument Works',
    },
    doorDescription: 'A repaired oxblood enamel door with ground-glass panes, a brass lever, and the plaque THE OUTLINE ROOM.',
    findings: { papers: 0, secrets: 2 },
  },
];

export function chamberById(id: ChamberId): ChamberEntry {
  const entry = CHAMBERS.find((c) => c.id === id);
  if (!entry) throw new Error(`Unknown chamber: ${id}`);
  return entry;
}

export function chamberBySlug(slug: string): ChamberEntry | undefined {
  return CHAMBERS.find((c) => c.slug === slug);
}

export function isChamberId(value: string): value is ChamberId {
  return CHAMBERS.some((c) => c.id === value);
}
