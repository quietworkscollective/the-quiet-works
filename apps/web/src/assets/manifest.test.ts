import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allEntries } from './catalogue.ts';
import { LICENCES, type LicenceId } from './policy.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..');
const read = (file: string): string => readFileSync(file, 'utf8');
const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

interface SourceFile {
  path: string;
  url: string;
  bytes: number;
  sha256: string;
}
interface ManifestAsset {
  id: string;
  kind: 'model' | 'surface';
  title: string;
  author: string;
  source: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  retrieved: string;
  sourceFiles: SourceFile[];
  sourceMembers?: { archive: string; name: string; sha256: string }[];
  transforms: string[];
  outputs: { path: string; sha256: string; bytes: number }[];
}
interface Lock {
  entries: Record<string, { licence: string; files: SourceFile[]; members?: { zip: string; name: string; sha256: string }[] }>;
}

const manifest = JSON.parse(read(path.join(here, 'third-party.json'))) as { assets: ManifestAsset[] };
const lock = JSON.parse(read(path.join(repo, 'scripts', 'assets', 'sources.lock.json'))) as Lock;
const plan = JSON.parse(read(path.join(repo, 'scripts', 'assets', 'plan.json'))) as { models: { id: string }[]; surfaces: { id: string }[] };

function committedFiles(): string[] {
  const out: string[] = [];
  for (const file of readdirSync(path.join(here, 'models'))) out.push(`models/${file}`);
  for (const file of readdirSync(path.join(here, 'surfaces'))) out.push(`surfaces/${file}`);
  return out.sort();
}

describe('third-party manifest completeness', () => {
  it('has an entry for every committed model and surface file, and no entry for a missing one', () => {
    const listed = manifest.assets.flatMap((asset) => asset.outputs.map((output) => output.path)).sort();
    expect(listed).toEqual(committedFiles());
  });

  it('matches every committed file by sha256 and size', () => {
    for (const asset of manifest.assets) {
      for (const output of asset.outputs) {
        const file = path.join(here, output.path);
        expect(sha256(file), output.path).toBe(output.sha256);
        expect(readFileSync(file).byteLength, output.path).toBe(output.bytes);
      }
    }
  });

  it('puts every asset on the licence allow list, with the licence\'s own URL', () => {
    for (const asset of manifest.assets) {
      expect(Object.keys(LICENCES), asset.id).toContain(asset.licence);
      expect(asset.licenceUrl, asset.id).toBe(LICENCES[asset.licence as LicenceId].url);
    }
  });

  it('records author, source page, attribution and retrieval date for every asset', () => {
    for (const asset of manifest.assets) {
      expect(asset.author.trim(), asset.id).not.toBe('');
      expect(asset.source, asset.id).toMatch(/^https:\/\//);
      expect(asset.attribution.trim(), asset.id).not.toBe('');
      expect(asset.retrieved, asset.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(asset.transforms.length, asset.id).toBeGreaterThan(0);
      if (LICENCES[asset.licence as LicenceId].attributionRequired) {
        expect(asset.attribution, asset.id).toContain(asset.author);
        expect(asset.attribution, asset.id).toContain(asset.title);
      }
    }
  });

  it('records the sha256 of every downloaded source file, equal to the pinned lock', () => {
    for (const asset of manifest.assets) {
      const locked = lock.entries[asset.id];
      expect(locked, asset.id).toBeDefined();
      expect(locked?.licence, asset.id).toBe(asset.licence);
      expect(asset.sourceFiles.length, asset.id).toBeGreaterThan(0);
      expect(asset.sourceFiles.map((f) => f.path).sort(), asset.id).toEqual((locked?.files ?? []).map((f) => f.path).sort());
      for (const file of asset.sourceFiles) {
        expect(file.sha256, `${asset.id}/${file.path}`).toMatch(/^[0-9a-f]{64}$/);
        expect(file.url, `${asset.id}/${file.path}`).toMatch(/^https:\/\//);
        expect(locked?.files.find((f) => f.path === file.path)?.sha256, `${asset.id}/${file.path}`).toBe(file.sha256);
      }
      for (const member of asset.sourceMembers ?? []) {
        expect(locked?.members?.find((m) => m.name === member.name)?.sha256, member.name).toBe(member.sha256);
      }
    }
  });

  it('covers exactly the plan and the catalogue', () => {
    const ids = manifest.assets.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice().sort()).toEqual([...plan.models, ...plan.surfaces].map((p) => p.id).sort());
    const catalogued = allEntries().filter((entry) => entry.origin === 'third-party');
    expect(catalogued.map((entry) => entry.id).sort()).toEqual(ids.slice().sort());
    for (const entry of catalogued) expect(entry.licence).toBe(manifest.assets.find((a) => a.id === entry.id)?.licence);
  });

  it('keeps THIRD_PARTY.md equal to what third-party.json renders', async () => {
    const module = (await import(pathToFileURL(path.join(repo, 'scripts', 'assets', 'lib', 'notices.mjs')).href)) as {
      renderThirdPartyMarkdown: (assets: ManifestAsset[]) => string;
    };
    expect(read(path.join(here, 'THIRD_PARTY.md'))).toBe(module.renderThirdPartyMarkdown(manifest.assets));
  });

  it('gives the asset audit one unambiguous entry per surface map file, as it will be named once Vite hashes it', () => {
    const { entries } = JSON.parse(read(path.join(here, 'audit-entries.json'))) as { entries: { name: string; pattern: string; licence: string; attribution: string }[] };
    const maps = manifest.assets.flatMap((asset) => asset.outputs.map((output) => ({ asset, file: path.basename(output.path) }))).filter(({ asset }) => asset.kind === 'surface');
    expect(maps.length).toBeGreaterThan(0);
    for (const { asset, file } of maps) {
      const built = file.replace(/\.webp$/, '-Cd4E9fGh.webp'); // Vite: <name>-<hash>.<ext>
      const matching = entries.filter((entry) => new RegExp(entry.pattern).test(built));
      expect(matching.map((entry) => entry.name), built).toEqual([`Surface: ${asset.id}`]);
      expect(matching[0]?.licence).toBe(asset.licence);
      expect(matching[0]?.attribution).toBe(asset.attribution);
    }
    expect(entries.length).toBe(new Set(maps.map(({ asset }) => asset.id)).size);
  });

  const cache = path.join(repo, '.asset-cache');
  it.skipIf(!existsSync(cache))('matches the downloaded sources in .asset-cache when they are present', () => {
    for (const asset of manifest.assets) {
      for (const file of asset.sourceFiles) {
        const cached = path.join(cache, asset.id, file.path);
        if (existsSync(cached)) expect(sha256(cached), `${asset.id}/${file.path}`).toBe(file.sha256);
      }
    }
  });
});
