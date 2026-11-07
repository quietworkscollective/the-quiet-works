import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const WEB_SOURCE = fileURLToPath(new URL('../../', import.meta.url));

function shippedSources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return shippedSources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

it('keeps store.counts() out of every shipped source file', () => {
  const sources = shippedSources(WEB_SOURCE);
  expect(sources.length).toBeGreaterThan(50);
  expect(sources.filter((path) => /\.counts\s*\(/.test(readFileSync(path, 'utf8')))).toEqual([]);
});
