import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openSealed, parseSealedFile } from '@tqw/engine';
import sealedExchange from '../../../../../packages/engine/src/sealed/exchange.sealed.json';
import { FORM_LINES } from './copy.ts';
import { EXCHANGE_TOKENS, isExchangeFinding } from './state.ts';

const REPOSITORY = fileURLToPath(new URL('../../../../../', import.meta.url));
const SEALED = parseSealedFile(sealedExchange);

/** Items whose body is the machine's own public reply, which the room prints before any reader opens. */
const PUBLIC_REPLIES: readonly string[] = ['certification-form', 'departments-connected'];
const SHINGLE_WORDS = 5;

const words = (text: string) => text.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean);

function shinglesOf(run: readonly string[]): string[] {
  if (run.length <= SHINGLE_WORDS) return [` ${run.join(' ')} `];
  return Array.from({ length: run.length - SHINGLE_WORDS + 1 }, (_, start) => ` ${run.slice(start, start + SHINGLE_WORDS).join(' ')} `);
}

function textFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return /\.(tsx?|css|json|py|mjs)$/.test(path) ? [path] : [];
  return readdirSync(path).filter(name => name !== 'assets').flatMap(name => textFiles(join(path, name)));
}

const publicSources = () => [
  ...textFiles(join(REPOSITORY, 'apps/web/src/chambers/exchange')),
  ...textFiles(join(REPOSITORY, 'scripts/blender/rooms/exchange')),
  ...textFiles(join(REPOSITORY, 'apps/web/e2e')).filter(path => /exchange[^/]*$/.test(path)),
];

async function openAll() {
  return Promise.all(Object.keys(SEALED.items).map(async (id) => {
    const token = isExchangeFinding(id) ? EXCHANGE_TOKENS[id] : '';
    const item = await openSealed(SEALED, id, token);
    if (item === null) throw new Error(`${id} does not open`);
    return item;
  }));
}

describe('The Exchange sealed plaintext', () => {
  it('appears in no public source, test or Blender file', async () => {
    const shingles = (await openAll())
      .filter(item => !PUBLIC_REPLIES.includes(item.id))
      .flatMap(item => item.body.flatMap(line => shinglesOf(words(line)).map(shingle => ({ id: item.id, shingle }))));
    expect(shingles.length).toBeGreaterThan(50);

    const leaks = publicSources().flatMap((path) => {
      const source = ` ${words(readFileSync(path, 'utf8')).join(' ')} `;
      const ids = shingles.filter(({ shingle }) => source.includes(shingle)).map(({ id }) => id);
      return ids.length === 0 ? [] : [`${relative(REPOSITORY, path)}: ${[...new Set(ids)].join(', ')}`];
    });
    expect(leaks).toEqual([]);
  });

  it('exempts only items made wholly of the public form lines', async () => {
    const replies = (await openAll()).filter(item => PUBLIC_REPLIES.includes(item.id));
    expect(replies.map(item => item.id).sort()).toEqual([...PUBLIC_REPLIES].sort());
    const form: readonly string[] = FORM_LINES;
    for (const item of replies) for (const line of item.body) expect(form, item.id).toContain(line);
  });
});
