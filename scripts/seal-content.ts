/**
 * `pnpm seal`: seals the discoverable content of the private design repository (ADR 0002).
 *
 *   UNHELD_LORE_DIR=<private repo> pnpm seal            seal every chamber
 *   UNHELD_LORE_DIR=<private repo> pnpm seal --check    verify the committed files, write nothing
 *
 * Input is `$UNHELD_LORE_DIR/content/<chamber>/*.json`: one item per file, the item's fields plus a
 * `token`, the discovery token that opens it. Output is `packages/engine/src/sealed/<chamber>.sealed.json`
 * (or `--out <dir>`): ciphertext, salt, IV and digest per item, ordered by id. The token and the
 * plaintext are never written, and nothing is ever written inside the lore directory.
 *
 * Sealing refuses to start until every item has passed the same content rules as public copy: the
 * plaintext goes to a temporary file outside the repository, `pnpm --filter @tqw/engine check:content`
 * runs with `UNHELD_SEALED_PLAINTEXT` pointing at it, and the file is deleted afterwards.
 *
 * Runs as TypeScript directly under Node (type stripping); no dependency, no network.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkChamber, sealChamber, serializeSealedFile } from '../packages/engine/src/sealed/seal.ts';
import { ID_PATTERN, parseSealedFile, parseSource } from '../packages/engine/src/sealed/source.ts';
import type { SealSource } from '../packages/engine/src/sealed/source.ts';
import type { SealedFile } from '../packages/engine/src/sealed/types.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(REPO, 'packages', 'engine', 'src', 'sealed');
const SEALED_SUFFIX = '.sealed.json';

const USAGE = `usage: UNHELD_LORE_DIR=<private repository> node scripts/seal-content.ts [--check] [--out <dir>]

  (no flag)    seal every chamber under $UNHELD_LORE_DIR/content
  --check      verify that every committed item opens with its token and matches its digest; write nothing
  --out <dir>  directory for <chamber>${SEALED_SUFFIX} (default: packages/engine/src/sealed)
`;

/** Wrong invocation or environment (exit 2), as opposed to content that fails its checks (exit 1). */
class UsageError extends Error {}

interface Chamber {
  id: string;
  sources: SealSource[];
}

/** A path with every symlink resolved, even where its tail does not exist yet. */
function realish(path: string): string {
  let existing = resolve(path);
  const tail: string[] = [];
  while (!existsSync(existing) && dirname(existing) !== existing) {
    tail.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync(existing), ...tail);
}

function isInside(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** Failure text safe to print: a message that names a file or field, never a value from it. */
function explain(error: unknown, where: string): string {
  if (error instanceof SyntaxError) return `${where}: not valid JSON`;
  return error instanceof Error ? error.message : `${where}: unreadable`;
}

/** Reads and validates the private repository's items. Problems are collected, not thrown, so one run lists them all. */
function readLore(lore: string): { chambers: Chamber[]; problems: string[] } {
  const content = join(lore, 'content');
  if (!isDirectory(content)) throw new UsageError(`${content} is not a directory: UNHELD_LORE_DIR must be the private repository`);

  const chambers: Chamber[] = [];
  const problems: string[] = [];
  for (const name of readdirSync(content).sort()) {
    if (name.startsWith('.') || !isDirectory(join(content, name))) continue;
    if (!ID_PATTERN.test(name)) {
      problems.push(`content/${name}: a chamber directory is named in lowercase words joined by hyphens`);
      continue;
    }
    const files = readdirSync(join(content, name)).filter((file) => file.endsWith('.json')).sort();
    if (files.length === 0) {
      problems.push(`content/${name}: no .json items`);
      continue;
    }
    const sources: SealSource[] = [];
    const filesById = new Map<string, string>();
    for (const file of files) {
      const where = `content/${name}/${file}`;
      try {
        const source = parseSource(JSON.parse(readFileSync(join(content, name, file), 'utf8')), where);
        const first = filesById.get(source.item.id);
        if (first !== undefined) throw new Error(`${where}: id "${source.item.id}" is already used by ${first}`);
        filesById.set(source.item.id, file);
        sources.push(source);
      } catch (error) {
        problems.push(explain(error, where));
      }
    }
    chambers.push({ id: name, sources });
  }
  if (chambers.length === 0 && problems.length === 0) problems.push('content: no chamber directories');
  return { chambers, problems };
}

/** The committed file for a chamber, or undefined when there is none. Throws when it cannot be read. */
function readCommitted(path: string): SealedFile | undefined {
  if (!existsSync(path)) return undefined;
  return parseSealedFile(JSON.parse(readFileSync(path, 'utf8')), basename(path));
}

/** Runs the public content rules over the plaintext. False (after printing why) when any rule fails. */
function passesContentRules(chambers: readonly Chamber[], lore: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'unheld-seal-'));
  // Ctrl-C reaches this process and the check it runs together. With no listener the default action
  // ends this process at once and skips the cleanup below; with one, it waits for the check to stop.
  const ignore = (): void => {};
  process.on('SIGINT', ignore);
  process.on('SIGTERM', ignore);
  try {
    if (isInside(realish(dir), realish(lore))) throw new UsageError('the temporary directory is inside UNHELD_LORE_DIR');
    const plaintext = join(dir, 'sealed-plaintext.json');
    writeFileSync(plaintext, JSON.stringify(chambers.flatMap((chamber) => chamber.sources.map(({ item }) => item))), {
      mode: 0o600,
    });
    const env: Record<string, string | undefined> = { ...process.env, UNHELD_SEALED_PLAINTEXT: plaintext };
    delete env['UNHELD_LORE_DIR'];
    const run = spawnSync('pnpm', ['--filter', '@tqw/engine', 'check:content'], { cwd: REPO, env, encoding: 'utf8' });
    if (run.error !== undefined) throw new Error(`could not run pnpm: ${run.error.message}`);
    if (run.status === 0) return true;
    console.error(`${run.stdout}${run.stderr}`.trimEnd());
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    process.off('SIGINT', ignore);
    process.off('SIGTERM', ignore);
  }
}

async function seal(chambers: readonly Chamber[], out: string): Promise<number> {
  const results: { path: string; text: string; changed: boolean; summary: string }[] = [];
  const problems: string[] = [];
  for (const { id, sources } of chambers) {
    const path = join(out, `${id}${SEALED_SUFFIX}`);
    let previous: SealedFile | undefined;
    try {
      previous = readCommitted(path);
    } catch (error) {
      console.warn(`${explain(error, basename(path))}; sealing ${id} afresh`);
    }
    const { file, sealed, kept } = await sealChamber(id, sources, { previous });
    // The output is verified before anything is written: every item must open with its token.
    problems.push(...(await checkChamber(id, sources, file)));
    const text = serializeSealedFile(file);
    results.push({
      path,
      text,
      changed: !existsSync(path) || readFileSync(path, 'utf8') !== text,
      summary: `${id}: ${sources.length} items (${sealed.length} sealed, ${kept.length} unchanged)`,
    });
  }
  if (problems.length > 0) {
    console.error(`sealed output failed its own check; nothing written:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    return 1;
  }
  mkdirSync(out, { recursive: true });
  for (const { path, text, changed, summary } of results) {
    if (changed) writeFileSync(path, text);
    console.log(`${summary}, file ${changed ? 'written' : 'unchanged'}`);
  }
  return 0;
}

async function check(chambers: readonly Chamber[], out: string): Promise<number> {
  const problems: string[] = [];
  let items = 0;
  for (const { id, sources } of chambers) {
    const path = join(out, `${id}${SEALED_SUFFIX}`);
    try {
      const committed = readCommitted(path);
      if (committed === undefined) problems.push(`${id}: no committed file ${basename(path)}`);
      else problems.push(...(await checkChamber(id, sources, committed)));
    } catch (error) {
      problems.push(explain(error, basename(path)));
    }
    items += sources.length;
  }
  const known = new Set(chambers.map(({ id }) => `${id}${SEALED_SUFFIX}`));
  for (const name of existsSync(out) ? readdirSync(out).sort() : []) {
    if (name.endsWith(SEALED_SUFFIX) && !known.has(name)) problems.push(`${name}: no such chamber in the private repository`);
  }
  if (problems.length > 0) {
    console.error(`sealed content does not match the private repository:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    return 1;
  }
  console.log(`${items} items in ${chambers.length} chambers open with their tokens and match their digests`);
  return 0;
}

function readFlags(): { check: boolean; out: string | undefined; help: boolean } {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: { check: { type: 'boolean' }, out: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
      allowPositionals: false,
    });
    return { check: values.check === true, out: values.out, help: values.help === true };
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : 'unreadable arguments');
  }
}

async function main(): Promise<number> {
  try {
    const flags = readFlags();
    if (flags.help) {
      console.log(USAGE);
      return 0;
    }
    const lore = process.env['UNHELD_LORE_DIR'];
    if (lore === undefined || lore === '') {
      throw new UsageError('UNHELD_LORE_DIR is not set: point it at the private design repository');
    }
    const out = resolve(flags.out ?? DEFAULT_OUT);
    if (isInside(realish(out), realish(lore))) {
      throw new UsageError('refusing to write inside UNHELD_LORE_DIR: choose an --out directory outside it');
    }

    const { chambers, problems } = readLore(lore);
    if (problems.length > 0) {
      console.error(`the private repository's content is not valid; nothing done:\n${problems.map((p) => `  ${p}`).join('\n')}`);
      return 1;
    }
    if (flags.check) return await check(chambers, out);
    if (!passesContentRules(chambers, lore)) {
      console.error('\nthe content rules failed; nothing sealed');
      return 1;
    }
    return await seal(chambers, out);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
}

process.exitCode = await main();
