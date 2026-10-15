import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playableSources, RECORDS } from './catalogue.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
interface ManifestRecord {
  id: string;
  title: string;
  composer: { name: string };
  outputs: { format: string; mime: string; path: string }[];
}
const manifest = JSON.parse(readFileSync(path.join(here, 'records', 'manifest.json'), 'utf8')) as { records: ManifestRecord[] };

describe('the shelf', () => {
  it('holds exactly the records in the licence manifest, in the same order', () => {
    expect(RECORDS.map((r) => r.id)).toEqual(manifest.records.map((r) => r.id));
  });

  it('names each as its manifest does and points each source at the manifest\'s file, with its media type', () => {
    for (const record of RECORDS) {
      const entry = manifest.records.find((r) => r.id === record.id);
      expect(entry, record.id).toBeDefined();
      expect(entry?.title.startsWith(record.title), record.id).toBe(true);
      expect(record.composer).toBe(entry?.composer.name);
      expect(record.sources.map((s) => s.format)).toEqual(['opus-webm', 'aac-mp4']);
      for (const source of record.sources) {
        const output = entry?.outputs.find((o) => o.format === source.format);
        expect(source.mime, `${record.id} ${source.format}`).toBe(output?.mime);
        expect(source.url, `${record.id} ${source.format}`).toContain(output?.path.replace(/\.[a-z0-9]+$/, ''));
        expect(source.url).toMatch(/\.(webm|m4a)$/);
      }
    }
  });

  it('captions each record in the corridor captions\' voice: bracketed, a few words, the composer and the piece', () => {
    for (const record of RECORDS) {
      expect(record.caption).toMatch(/^\[gramophone: .+\]$/);
      const words = record.caption.slice(1, -1).split(/\s+/);
      expect(words.length, record.caption).toBeLessThanOrEqual(7);
      const surname = record.composer.split(' ').at(-1) ?? '';
      expect(record.caption).toContain(surname);
      expect(record.caption).toContain(record.title);
    }
  });
});

describe('choosing an encoding', () => {
  const [record] = RECORDS;
  const answers = (playable: readonly string[]) => (mime: string) => (playable.includes(mime) ? 'maybe' : '');

  it('prefers Opus in WebM, then AAC in MP4, as the browser says it can play them', () => {
    const both = playableSources(record!, answers(['audio/webm; codecs="opus"', 'audio/mp4; codecs="mp4a.40.2"']));
    expect(both.map((s) => s.format)).toEqual(['opus-webm', 'aac-mp4']);
    expect(playableSources(record!, answers(['audio/mp4; codecs="mp4a.40.2"'])).map((s) => s.format)).toEqual(['aac-mp4']);
    expect(playableSources(record!, answers(['audio/webm; codecs="opus"'])).map((s) => s.format)).toEqual(['opus-webm']);
  });

  it('offers nothing to a browser that plays neither, so the gramophone stays quiet and does not fetch', () => {
    expect(playableSources(record!, answers([]))).toEqual([]);
  });
});
