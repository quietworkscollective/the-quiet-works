#!/usr/bin/env node
// Downloads the pinned third-party source files into .asset-cache/ (gitignored) and verifies
// each one against the sha256 recorded in scripts/assets/sources.lock.json.
//
//   node scripts/assets/fetch.mjs                 download whatever is missing, verify everything
//   node scripts/assets/fetch.mjs --verify        verify the cache only; no network
//   node scripts/assets/fetch.mjs --pin [id ...]  resolve plan entries that are not pinned yet (or the
//                                                 named ones), check the licence on each asset's own
//                                                 page, download, hash, and write the lock file
//
// The lock file is committed; the cache is not. A hash mismatch is an error, never an update:
// re-pin an entry deliberately with --pin <id> after reading what changed upstream.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ambientMemberName, planMaps } from './lib/maps.mjs';
import { resolveSource } from './lib/providers.mjs';
import { cachePath, download, fileExists, LOCK_PATH, md5File, PLAN_PATH, readJson, sha256Buffer, sha256File, writeJson } from './lib/util.mjs';
import { openZip } from './lib/zip.mjs';

const args = process.argv.slice(2);
const pinMode = args.includes('--pin');
const verifyOnly = args.includes('--verify');
const named = args.filter((a) => !a.startsWith('--'));

const plan = readJson(PLAN_PATH);
const lock = existsSync(LOCK_PATH) ? readJson(LOCK_PATH) : { schema: 1, entries: {} };
const planned = [
  ...plan.models.map((entry) => ({ entry, kind: 'model' })),
  ...plan.surfaces.map((entry) => ({ entry, kind: 'surface' })),
];

function log(message) {
  console.log(message);
}

async function pin({ entry, kind }) {
  log(`pin ${entry.id}: resolving ${entry.provider}/${entry.slug}`);
  const resolved = await resolveSource(entry, kind);
  const files = [];
  for (const file of resolved.files) {
    const destination = cachePath(entry.id, file.path);
    let url = file.url;
    let accepted = false;
    for (const candidate of [file.url, ...(file.alternates ?? [])]) {
      rmSync(destination, { force: true });
      await download(candidate, destination);
      if (!file.md5 || (await md5File(destination)) === file.md5) {
        url = candidate;
        accepted = true;
        break;
      }
      log(`  ${file.path}: md5 differs from the provider's listing at ${candidate}`);
    }
    if (!accepted) {
      rmSync(destination, { force: true });
      throw new Error(`${entry.id}: ${file.path} does not match the md5 the provider lists at any known location`);
    }
    files.push({ path: file.path, url, bytes: file.bytes, sha256: await sha256File(destination) });
  }
  const members = [];
  if (kind === 'surface' && entry.provider === 'ambientcg') {
    const zipFile = files[0];
    const attribute = entry.sourceResolution ?? '1K-JPG';
    const archive = openZip(cachePath(entry.id, zipFile.path));
    for (const role of planMaps(entry)) {
      const name = ambientMemberName(entry.slug, attribute, role);
      const member = archive.find((m) => m.name === name);
      if (!member) throw new Error(`${entry.id}: ${zipFile.path} has no ${name}`);
      members.push({ zip: zipFile.path, name, role, sha256: sha256Buffer(member.read()) });
    }
  }
  const { files: _files, ...rest } = resolved;
  lock.entries[entry.id] = { ...rest, retrieved: new Date().toISOString().slice(0, 10), files, ...(members.length > 0 ? { members } : {}) };
}

async function ensure(id, locked) {
  let problems = 0;
  for (const file of locked.files) {
    const destination = cachePath(id, file.path);
    // A cached file that fails its hash is deleted and fetched once more (a truncated or edited cache
    // entry); a fresh download that still fails means upstream changed, and that is an error.
    let actual = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (!fileExists(destination)) {
        if (verifyOnly) break;
        log(`fetch ${id}/${file.path}`);
        await download(file.url, destination);
      }
      actual = await sha256File(destination);
      if (actual === file.sha256 || verifyOnly) break;
      rmSync(destination, { force: true });
    }
    if (!fileExists(destination) && verifyOnly) {
      console.error(`MISSING ${id}/${file.path}`);
      problems += 1;
    } else if (actual !== file.sha256) {
      problems += 1;
      console.error(`MISMATCH ${id}/${file.path}\n  pinned ${file.sha256}\n  actual ${actual}`);
    }
  }
  return problems;
}

async function main() {
  if (pinMode) {
    const todo = planned.filter(({ entry }) => (named.length > 0 ? named.includes(entry.id) : !lock.entries[entry.id]));
    for (const item of todo) {
      await pin(item);
      writeJson(LOCK_PATH, lock); // after each entry: an interrupted run keeps what it finished
    }
    log(`pinned ${todo.length} entr${todo.length === 1 ? 'y' : 'ies'}`);
  }
  const ids = new Set(planned.map(({ entry }) => entry.id));
  const stale = Object.keys(lock.entries).filter((id) => !ids.has(id));
  if (stale.length > 0) {
    console.error(`lock entries with no plan entry: ${stale.join(', ')}`);
    process.exitCode = 1;
  }
  let problems = 0;
  for (const { entry } of planned) {
    const locked = lock.entries[entry.id];
    if (!locked) {
      console.error(`NOT PINNED ${entry.id} (run with --pin ${entry.id})`);
      problems += 1;
      continue;
    }
    problems += await ensure(entry.id, locked);
  }
  if (problems > 0) {
    console.error(`${problems} problem(s)`);
    process.exitCode = 1;
  } else {
    log(`all ${planned.length} assets present and verified (${path.relative(process.cwd(), path.dirname(LOCK_PATH))})`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
