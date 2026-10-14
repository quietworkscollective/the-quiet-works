/**
 * Sealing (ADR 0002): the maintainer side, used by `scripts/seal-content.ts` and by tests. It is
 * deliberately not re-exported from `index.ts`, so the encryption path stays out of the shipped
 * bundle; the runtime only ever opens.
 */
import { canonicalJson } from './canonical.ts';
import { digestItem, openSealed } from './index.ts';
import type { SealSource } from './source.ts';
import { SEAL_ITERATIONS, type SealedEntry, type SealedFile, type SealedItem } from './types.ts';
import { deriveKey, encryptBytes, IV_BYTES, randomBytes, SALT_BYTES, toBase64, utf8Encode } from './webcrypto.ts';

/**
 * Encrypts one item under a key derived from its discovery token. Every call draws a fresh salt and
 * IV, so sealing the same item twice gives two different entries that both open.
 */
export async function sealItem(
  item: SealedItem,
  token: string,
  iterations: number = SEAL_ITERATIONS,
): Promise<SealedEntry> {
  if (token === '') throw new Error('a discovery token cannot be empty');
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(token, salt, iterations);
  const data = await encryptBytes(key, iv, utf8Encode(canonicalJson(item)));
  return { salt: toBase64(salt), iv: toBase64(iv), data: toBase64(data), digest: await digestItem(item) };
}

export interface SealChamberOptions {
  /** The committed file as it stands; entries whose item did not change are carried over untouched. */
  previous?: SealedFile | undefined;
  iterations?: number;
}

export interface SealChamberResult {
  file: SealedFile;
  /** Ids sealed afresh (new or changed). */
  sealed: readonly string[];
  /** Ids whose committed entry was kept because the item did not change. */
  kept: readonly string[];
}

const byId = (a: SealSource, b: SealSource): number => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0);

/** The committed entry, when it still opens with this token and still describes exactly this item. */
async function reusableEntry(
  file: SealedFile | undefined,
  id: string,
  token: string,
  digest: string,
): Promise<SealedEntry | undefined> {
  if (file === undefined || !Object.hasOwn(file.items, id)) return undefined;
  const entry = file.items[id];
  if (entry?.digest !== digest) return undefined;
  const opened = await openSealed(file, id, token);
  return opened !== null && (await digestItem(opened)) === digest ? entry : undefined;
}

/**
 * Builds a chamber's sealed file, items ordered by id. Re-running over unchanged items rewrites the
 * same bytes: an entry is only resealed (new salt and IV) when its item is new or changed, so a
 * commit diff shows exactly what moved.
 */
export async function sealChamber(
  chamber: string,
  sources: readonly SealSource[],
  options: SealChamberOptions = {},
): Promise<SealChamberResult> {
  const iterations = options.iterations ?? SEAL_ITERATIONS;
  const { previous } = options;
  const base =
    previous !== undefined && previous.chamber === chamber && previous.kdf.iterations === iterations
      ? previous
      : undefined;
  const items: Record<string, SealedEntry> = {};
  const sealed: string[] = [];
  const kept: string[] = [];

  for (const { item, token } of [...sources].sort(byId)) {
    if (Object.hasOwn(items, item.id)) throw new Error(`${chamber}/${item.id}: id used twice`);
    const entry = await reusableEntry(base, item.id, token, await digestItem(item));
    if (entry === undefined) {
      items[item.id] = await sealItem(item, token, iterations);
      sealed.push(item.id);
    } else {
      items[item.id] = entry;
      kept.push(item.id);
    }
  }

  const file: SealedFile = { format: 1, chamber, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, items };
  return { file, sealed, kept };
}

/**
 * Every way a committed file can disagree with the private repository, as printable lines (ids
 * only, never content). Empty means every item opens with its token and matches its digest.
 */
export async function checkChamber(
  chamber: string,
  sources: readonly SealSource[],
  committed: SealedFile,
): Promise<string[]> {
  const problems: string[] = [];
  if (committed.chamber !== chamber) {
    problems.push(`${chamber}: the committed file belongs to chamber "${committed.chamber}"`);
  }
  const known = new Set<string>();
  for (const { item, token } of sources) {
    known.add(item.id);
    const label = `${chamber}/${item.id}`;
    const entry = Object.hasOwn(committed.items, item.id) ? committed.items[item.id] : undefined;
    if (entry === undefined) {
      problems.push(`${label}: not sealed yet`);
      continue;
    }
    const opened = await openSealed(committed, item.id, token);
    if (opened === null) {
      problems.push(`${label}: does not open with its token (altered entry or wrong token)`);
    } else if ((await digestItem(opened)) !== entry.digest) {
      problems.push(`${label}: the opened item does not match its committed digest`);
    } else if ((await digestItem(item)) !== entry.digest) {
      problems.push(`${label}: the private item changed after it was sealed`);
    }
  }
  for (const id of Object.keys(committed.items)) {
    if (!known.has(id)) problems.push(`${chamber}/${id}: sealed here but absent from the private repository`);
  }
  return problems;
}

/** The committed bytes: two-space JSON and a final newline, so diffs are line-based and stable. */
export function serializeSealedFile(file: SealedFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
