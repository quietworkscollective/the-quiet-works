/**
 * Strict readers for the two JSON shapes that cross a trust boundary: a plaintext item written in
 * the private design repository (plus its discovery token), and a committed sealed file. Each reader
 * throws an Error that names the offending field and never echoes a value, so a failure is safe to
 * print.
 */
import type { SealedEntry, SealedFile, SealedItem } from './types.ts';
import { fromBase64, IV_BYTES, SALT_BYTES } from './webcrypto.ts';

/** Item and chamber ids: lowercase words joined by hyphens, starting with a letter (so object key order is insertion order). */
export const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** A sealed item with the discovery token that opens it, as the sealing script holds them. */
export interface SealSource {
  item: SealedItem;
  token: string;
}

/** Sanity ceiling on a file's recorded key-derivation cost, so a damaged file cannot hang a visitor's tab. */
const MAX_ITERATIONS = 10_000_000;
/** An AES-GCM tag alone is 16 bytes: any shorter ciphertext is not a sealed item. */
const TAG_BYTES = 16;
const KINDS: readonly SealedItem['kind'][] = ['memo', 'secret', 'payoff', 'line'];
const ITEM_KEYS = ['id', 'kind', 'title', 'from', 'body', 'label', 'fields'];
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

type Json = Readonly<Record<string, unknown>>;

function record(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`);
  }
  return value as Json;
}

function onlyKeys(value: Json, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${where}: unknown field "${key}"`);
  }
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${where}: expected a non-empty string`);
  return value;
}

function optionalText(value: unknown, where: string): string | undefined {
  return value === undefined ? undefined : text(value, where);
}

/** A plaintext item. Unknown fields are refused so a misspelt one cannot be dropped silently. */
export function parseItem(value: unknown, where = 'item'): SealedItem {
  const raw = record(value, where);
  onlyKeys(raw, ITEM_KEYS, where);

  const id = text(raw['id'], `${where}.id`);
  if (!ID_PATTERN.test(id)) throw new Error(`${where}.id: must be lowercase words joined by hyphens`);
  const kind = KINDS.find((candidate) => candidate === raw['kind']);
  if (kind === undefined) throw new Error(`${where}.kind: must be one of ${KINDS.join(', ')}`);

  const rawBody = raw['body'];
  if (!Array.isArray(rawBody) || rawBody.length === 0) throw new Error(`${where}.body: expected a list of paragraphs`);
  const body = rawBody.map((paragraph: unknown, index) => text(paragraph, `${where}.body[${index}]`));

  const title = optionalText(raw['title'], `${where}.title`);
  const from = optionalText(raw['from'], `${where}.from`);
  const label = optionalText(raw['label'], `${where}.label`);

  let fields: Readonly<Record<string, string>> | undefined;
  if (raw['fields'] !== undefined) {
    const rawFields = record(raw['fields'], `${where}.fields`);
    for (const name of Object.keys(rawFields)) {
      if (!FIELD_NAME.test(name)) throw new Error(`${where}.fields: "${name}" is not a plain field name`);
    }
    fields = Object.fromEntries(
      Object.entries(rawFields).map(([name, entry]) => [name, text(entry, `${where}.fields.${name}`)]),
    );
  }

  return {
    id,
    kind,
    ...(title === undefined ? {} : { title }),
    ...(from === undefined ? {} : { from }),
    body,
    ...(label === undefined ? {} : { label }),
    ...(fields === undefined ? {} : { fields }),
  };
}

/** One file of the private repository: an item plus its `token`, which is never sealed or written. */
export function parseSource(value: unknown, where: string): SealSource {
  const { token, ...rest } = record(value, where);
  return { item: parseItem(rest, where), token: text(token, `${where}.token`) };
}

/** Key-derivation parameters; returns the iteration count. */
export function parseKdf(value: unknown, where = 'kdf'): number {
  const kdf = record(value, where);
  onlyKeys(kdf, ['name', 'hash', 'iterations'], where);
  if (kdf['name'] !== 'PBKDF2' || kdf['hash'] !== 'SHA-256') throw new Error(`${where}: expected PBKDF2 with SHA-256`);
  const iterations = kdf['iterations'];
  if (typeof iterations !== 'number' || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new Error(`${where}.iterations: expected a positive integer of at most ${MAX_ITERATIONS}`);
  }
  return iterations;
}

/** One committed entry: canonical base64 of the right lengths, and a hex SHA-256 digest. */
export function parseEntry(value: unknown, where = 'entry'): SealedEntry {
  const raw = record(value, where);
  onlyKeys(raw, ['salt', 'iv', 'data', 'digest'], where);
  const salt = text(raw['salt'], `${where}.salt`);
  const iv = text(raw['iv'], `${where}.iv`);
  const data = text(raw['data'], `${where}.data`);
  const digest = text(raw['digest'], `${where}.digest`);
  if (fromBase64(salt).length !== SALT_BYTES) throw new Error(`${where}.salt: expected ${SALT_BYTES} bytes`);
  if (fromBase64(iv).length !== IV_BYTES) throw new Error(`${where}.iv: expected ${IV_BYTES} bytes`);
  if (fromBase64(data).length <= TAG_BYTES) throw new Error(`${where}.data: too short to hold a sealed item`);
  if (!SHA256_HEX.test(digest)) throw new Error(`${where}.digest: expected a hex SHA-256`);
  return { salt, iv, data, digest };
}

/** A whole committed `<chamber>.sealed.json`, for the sealing script and for chambers loading their file. */
export function parseSealedFile(value: unknown, where = 'sealed file'): SealedFile {
  const raw = record(value, where);
  onlyKeys(raw, ['format', 'chamber', 'kdf', 'items'], where);
  if (raw['format'] !== 1) throw new Error(`${where}.format: expected 1`);
  const chamber = text(raw['chamber'], `${where}.chamber`);
  const iterations = parseKdf(raw['kdf'], `${where}.kdf`);
  const entries = record(raw['items'], `${where}.items`);
  const items = Object.fromEntries(
    Object.entries(entries).map(([id, entry]) => {
      if (!ID_PATTERN.test(id)) throw new Error(`${where}.items: "${id}" is not a valid id`);
      return [id, parseEntry(entry, `${where}.items.${id}`)];
    }),
  );
  return { format: 1, chamber, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, items };
}
