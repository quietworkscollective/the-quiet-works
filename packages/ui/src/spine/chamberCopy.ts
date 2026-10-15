import type { ChamberEntry, Clipping } from '@tqw/engine';

const SEALED_COPY = 'Not yet open.';

/** Keep authored room copy behind the release state used to render its door. */
export function publicChambers(chambers: readonly ChamberEntry[], production: boolean): readonly ChamberEntry[] {
  if (!production) return chambers;
  return chambers.map((chamber) => chamber.status === 'open' ? chamber : {
    ...chamber,
    clipping: publicClipping(chamber, production),
    doorDescription: publicDoorDescription({ status: chamber.status, description: chamber.doorDescription }, production),
    findings: { papers: 0, secrets: 0 },
  });
}

export function publicClipping(chamber: ChamberEntry, production: boolean): Clipping {
  if (!production || chamber.status === 'open') return chamber.clipping;
  return { headline: chamber.title.toUpperCase(), dek: SEALED_COPY, dateline: '' };
}

export function publicDoorDescription(
  door: { status: ChamberEntry['status']; description: string },
  production: boolean,
): string {
  return production && door.status === 'sealed' ? SEALED_COPY : door.description;
}
