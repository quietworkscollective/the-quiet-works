import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The records the gramophone plays, held to the founder's licence rules: the composition is public
 * domain worldwide, the recording is CC0, public domain or CC BY 4.0 with its attribution recorded,
 * every shipped file is the one the manifest describes, and nothing ships that the asset audit
 * would not accept.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..', '..', '..');
const read = (file: string): string => readFileSync(file, 'utf8');
const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

interface Output {
  format: string;
  codec: string;
  mime: string;
  path: string;
  bytes: number;
  sha256: string;
  durationS: number;
}
interface RecordEntry {
  id: string;
  title: string;
  composer: { name: string; born: number; died: number };
  composition: { year: number; firstPublished: number; evidence: string };
  performer: string;
  source: { provider: string; page: string; revision: number; origin: string };
  licence: { id: string; name: string; url: string; statement: string; covers: string };
  attribution: string;
  original: { file: string; url: string; bytes: number; sha256: string; sha1: string };
  transforms: { startS: number; endS: number };
  outputs: Output[];
}
interface Manifest {
  retrieved: string;
  budgetBytes: number;
  records: RecordEntry[];
}

const manifest = JSON.parse(read(path.join(here, 'manifest.json'))) as Manifest;
const assetManifest = JSON.parse(read(path.join(repo, 'apps', 'web', 'scripts', 'assets.manifest.json'))) as {
  entries: { name: string; pattern: string; source: string; licence: string; licenceFile: string; attribution: string }[];
};

/** Licences a recording may be under. ShareAlike, NonCommercial and NoDerivatives are not on it. */
const ALLOWED_LICENCES = ['CC0-1.0', 'LicenseRef-Public-Domain', 'CC-BY-4.0'] as const;
/** A composer who died in or after this year, or a work published in or after the next, is not safely public domain worldwide. */
const LAST_DEATH_YEAR = 1954;
const LAST_PUBLICATION_YEAR = 1930;

describe('the records manifest', () => {
  it('lists two or three records, each with every field the licence record needs', () => {
    expect(manifest.records.length).toBeGreaterThanOrEqual(2);
    expect(manifest.records.length).toBeLessThanOrEqual(3);
    for (const r of manifest.records) {
      for (const field of [r.title, r.composer.name, r.performer, r.attribution, r.licence.name, r.licence.statement, r.source.origin]) {
        expect(field.trim(), r.id).not.toBe('');
      }
      expect(r.source.page, r.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(Number.isInteger(r.source.revision) && r.source.revision > 0, `${r.id} page revision`).toBe(true);
      expect(r.licence.url, r.id).toMatch(/^https:\/\//);
      expect(r.original.url, r.id).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
      expect(manifest.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('puts every recording under an allowed licence', () => {
    for (const r of manifest.records) {
      expect(ALLOWED_LICENCES as readonly string[], `${r.id} licence ${r.licence.id}`).toContain(r.licence.id);
      expect(r.licence.id, r.id).not.toMatch(/-(SA|NC|ND)\b|ShareAlike|NonCommercial|NoDerivatives/i);
      // CC BY needs its attribution recorded: the title, the composer and the performer.
      if (r.licence.id === 'CC-BY-4.0') {
        expect(r.attribution, r.id).toContain(r.title);
        expect(r.attribution, r.id).toContain(r.performer);
      }
    }
  });

  it('holds every composition to public domain worldwide: composer died before 1955, work published before 1931', () => {
    for (const r of manifest.records) {
      expect(r.composer.died, `${r.composer.name} died ${r.composer.died}`).toBeLessThanOrEqual(LAST_DEATH_YEAR);
      expect(r.composition.firstPublished, `${r.title} first published ${r.composition.firstPublished}`).toBeLessThanOrEqual(LAST_PUBLICATION_YEAR);
      expect(r.composer.born, r.id).toBeLessThan(r.composer.died);
      expect(r.composition.evidence.trim(), r.id).not.toBe('');
    }
  });

  it('records the sha256 of the original and of every shipped file, and each matches the file on disk', () => {
    for (const r of manifest.records) {
      expect(r.original.sha256, r.id).toMatch(/^[0-9a-f]{64}$/);
      expect(r.original.sha1, r.id).toMatch(/^[0-9a-f]{40}$/);
      expect(r.outputs.map((o) => o.format).sort(), r.id).toEqual(['aac-mp4', 'opus-webm']);
      for (const o of r.outputs) {
        const file = path.join(here, o.path);
        expect(existsSync(file), `${o.path} exists`).toBe(true);
        expect(o.sha256, o.path).toMatch(/^[0-9a-f]{64}$/);
        expect(sha256(file), `${o.path} sha256`).toBe(o.sha256);
        expect(statSync(file).size, `${o.path} bytes`).toBe(o.bytes);
        expect(o.durationS, o.path).toBeGreaterThan(30);
      }
    }
  });

  it('ships no music file the manifest does not describe', () => {
    const listed = new Set(manifest.records.flatMap((r) => r.outputs.map((o) => o.path)));
    const onDisk = readdirSync(here).filter((name) => /\.(webm|m4a|mp4|ogg|opus|mp3|wav|flac|aac)$/i.test(name));
    expect(onDisk.sort()).toEqual([...listed].sort());
  });

  it('keeps every shipped file together under the 3 MB budget', () => {
    const total = manifest.records.flatMap((r) => r.outputs).reduce((n, o) => n + o.bytes, 0);
    expect(manifest.budgetBytes).toBeLessThanOrEqual(3_000_000);
    expect(total).toBeLessThanOrEqual(manifest.budgetBytes);
  });

  it('has an entry in the asset audit manifest for every shipped file, under the same licence', () => {
    for (const r of manifest.records) {
      for (const o of r.outputs) {
        // The bundler adds a content hash to the name: the audit matches by pattern.
        const built = o.path.replace(/(\.[a-z0-9]+)$/, '-AbC123_x$1');
        const matches = assetManifest.entries.filter((e) => new RegExp(e.pattern).test(built));
        expect(matches, `${o.path} audit entries`).toHaveLength(1);
        const [entry] = matches;
        expect(entry?.licence, o.path).toBe(r.licence.id);
        expect(entry?.source, o.path).toMatch(/^third-party:/);
        expect(entry?.attribution, o.path).toBe(r.attribution);
        expect(existsSync(path.resolve(repo, 'apps', 'web', entry?.licenceFile ?? 'missing')), `${o.path} licence file`).toBe(true);
      }
    }
  });

  it('puts every record, source, licence, attribution and hash in THIRD_PARTY.md', () => {
    const text = read(path.join(here, 'THIRD_PARTY.md'));
    for (const r of manifest.records) {
      for (const part of [r.id, r.title, r.composer.name, r.source.page, r.licence.url, r.attribution, r.original.sha256, manifest.retrieved, ...r.outputs.map((o) => o.sha256)]) {
        expect(text, `${r.id}: ${part}`).toContain(part);
      }
    }
  });
});
