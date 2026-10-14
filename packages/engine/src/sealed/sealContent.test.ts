/**
 * `scripts/seal-content.ts` run for real, as a child process, against throw-away "private repository"
 * directories of invented items. Sealing in these runs goes through the genuine content check
 * (`pnpm --filter @tqw/engine check:content`), so a run takes a few seconds.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSealed } from './index.ts';
import { parseSealedFile } from './source.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CHAMBER = 'sample-room';

/** `count` plain words, to build bodies of an exact length. */
const words = (count: number): string => Array.from({ length: count }, () => 'word').join(' ');

// A sealed memo is held to the memo rules, so the fixture memo has a memo's length.
const ALPHA = {
  id: 'alpha-note',
  kind: 'memo',
  title: 'Sample title',
  from: 'Sample sender',
  body: [`Sample paragraph. ${words(36)}`],
  token: 'tok-alpha',
};
const BETA = { id: 'beta-line', kind: 'line', body: ['Another sample paragraph.'], token: 'tok-beta' };

const scratch = mkdtempSync(join(tmpdir(), 'seal-script-test-'));
let counter = 0;

/**
 * The seal script's own temporary directory. It writes plaintext there and must delete it; the
 * test looks for leftovers here rather than in the shared system temporary directory, where any
 * other seal run on the machine (another test file, another checkout's gates) appears and vanishes.
 */
const sealTemp = join(scratch, 'tmp');
mkdirSync(sealTemp, { recursive: true });

function freshDir(label: string): string {
  const dir = join(scratch, `${label}-${(counter += 1)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A fake private repository: `content/<chamber>/<name>.json`, one item per file. */
function makeLore(chambers: Readonly<Record<string, Readonly<Record<string, unknown>>>>): string {
  const lore = freshDir('lore');
  for (const [chamber, files] of Object.entries(chambers)) {
    mkdirSync(join(lore, 'content', chamber), { recursive: true });
    for (const [name, item] of Object.entries(files)) {
      writeFileSync(join(lore, 'content', chamber, `${name}.json`), typeof item === 'string' ? item : JSON.stringify(item));
    }
  }
  return lore;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Everything the script printed. */
  output: string;
}

function runSeal(args: readonly string[], env: Record<string, string | undefined>): Run {
  // The child must not believe it is inside this test run: scrub vitest's own variables.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST') && !name.startsWith('UNHELD_')),
  );
  const result = spawnSync(process.execPath, ['scripts/seal-content.ts', ...args], {
    cwd: REPO,
    env: { ...inherited, TMPDIR: sealTemp, ...env },
    encoding: 'utf8',
  });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

const sealedPath = (out: string): string => join(out, `${CHAMBER}.sealed.json`);
const readSealed = (out: string) => parseSealedFile(JSON.parse(readFileSync(sealedPath(out), 'utf8')));
const tempLeftovers = (): string[] => readdirSync(sealTemp).filter((name) => name.startsWith('unheld-seal-'));

/** Every file under a directory, by relative path, for before-and-after comparison. */
function snapshot(dir: string, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(join(dir, prefix)).sort()) {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(join(dir, relative)).isDirectory()) Object.assign(files, snapshot(dir, relative));
    else files[relative] = readFileSync(join(dir, relative), 'utf8');
  }
  return files;
}

function copyDir(from: string, to: string): void {
  for (const [relative, text] of Object.entries(snapshot(from))) {
    mkdirSync(join(to, ...relative.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(to, relative), text);
  }
}

function item(source: typeof ALPHA | typeof BETA): Record<string, unknown> {
  const { token: _token, ...rest } = source;
  return rest;
}

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('scripts/seal-content.ts', { timeout: 180_000 }, () => {
  const lore = makeLore({ [CHAMBER]: { alpha: ALPHA, beta: BETA } });
  const loreBefore = snapshot(lore);
  const out = freshDir('out');
  let first: Run;
  let leftoversBefore: string[];

  beforeAll(() => {
    leftoversBefore = tempLeftovers();
    first = runSeal(['--out', out], { UNHELD_LORE_DIR: lore });
  }, 180_000);

  describe('sealing', () => {
    it('writes a file whose items open with their tokens and no others', async () => {
      expect(first.output).toContain('2 items (2 sealed, 0 unchanged)');
      expect(first.status).toBe(0);
      const file = readSealed(out);
      expect(file.chamber).toBe(CHAMBER);
      expect(Object.keys(file.items)).toEqual(['alpha-note', 'beta-line']);
      expect(await openSealed(file, 'alpha-note', 'tok-alpha')).toEqual(item(ALPHA));
      expect(await openSealed(file, 'beta-line', 'tok-beta')).toEqual(item(BETA));
      expect(await openSealed(file, 'alpha-note', 'tok-beta')).toBeNull();
      expect(await openSealed(file, 'beta-line', 'tok-alpha')).toBeNull();
    });

    it('writes only the sealed file: no plaintext and no token, in the file or in the output', () => {
      expect(readdirSync(out)).toEqual([`${CHAMBER}.sealed.json`]);
      const written = readFileSync(sealedPath(out), 'utf8');
      for (const secret of ['tok-alpha', 'tok-beta', 'Sample paragraph', 'Sample title', 'Sample sender', 'memo']) {
        expect(written).not.toContain(secret);
        expect(first.output).not.toContain(secret);
      }
    });

    it('never writes inside the lore directory, and deletes its temporary plaintext', () => {
      expect(snapshot(lore)).toEqual(loreBefore);
      expect(tempLeftovers().filter((name) => !leftoversBefore.includes(name))).toEqual([]);
    });

    it('rewrites the same bytes when nothing changed', () => {
      const before = readFileSync(sealedPath(out), 'utf8');
      const again = runSeal(['--out', out], { UNHELD_LORE_DIR: lore });
      expect(again.status).toBe(0);
      expect(again.output).toContain('2 items (0 sealed, 2 unchanged), file unchanged');
      expect(readFileSync(sealedPath(out), 'utf8')).toBe(before);
    });

    it('reseals only the item that changed', async () => {
      const outCopy = freshDir('out');
      copyDir(out, outCopy);
      const before = readSealed(outCopy);
      const edited = makeLore({ [CHAMBER]: { alpha: ALPHA, beta: { ...BETA, body: ['An edited sample paragraph.'] } } });
      const run = runSeal(['--out', outCopy], { UNHELD_LORE_DIR: edited });
      expect(run.status).toBe(0);
      expect(run.output).toContain('2 items (1 sealed, 1 unchanged), file written');
      const after = readSealed(outCopy);
      expect(after.items['alpha-note']).toEqual(before.items['alpha-note']);
      expect(after.items['beta-line']).not.toEqual(before.items['beta-line']);
      expect(await openSealed(after, 'beta-line', 'tok-beta')).toMatchObject({ body: ['An edited sample paragraph.'] });
    });

    it('seals afresh, with a warning, over a committed file it cannot read', async () => {
      const damaged = freshDir('out');
      writeFileSync(sealedPath(damaged), '{ not a sealed file');
      const run = runSeal(['--out', damaged], { UNHELD_LORE_DIR: lore });
      expect(run.status).toBe(0);
      expect(run.stderr).toContain(`${CHAMBER}.sealed.json: not valid JSON; sealing ${CHAMBER} afresh`);
      expect(await openSealed(readSealed(damaged), 'alpha-note', 'tok-alpha')).toEqual(item(ALPHA));
    });
  });

  describe('--check', () => {
    it('passes on what was sealed, and writes nothing', () => {
      const before = snapshot(out);
      const run = runSeal(['--check', '--out', out], { UNHELD_LORE_DIR: lore });
      expect(run.status).toBe(0);
      expect(run.output).toContain('2 items in 1 chambers open with their tokens and match their digests');
      expect(snapshot(out)).toEqual(before);
    });

    it('fails once one byte of a committed entry is altered, naming the item and not its content', () => {
      const tampered = freshDir('out');
      copyDir(out, tampered);
      const file = JSON.parse(readFileSync(sealedPath(tampered), 'utf8'));
      const data: string = file.items['beta-line'].data;
      // Same length, one different base64 character in the middle of the ciphertext.
      const at = Math.floor(data.length / 2);
      file.items['beta-line'].data = `${data.slice(0, at)}${data.charAt(at) === 'A' ? 'B' : 'A'}${data.slice(at + 1)}`;
      writeFileSync(sealedPath(tampered), JSON.stringify(file, null, 2));

      const run = runSeal(['--check', '--out', tampered], { UNHELD_LORE_DIR: lore });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`${CHAMBER}/beta-line: does not open with its token`);
      expect(run.stderr).not.toContain('alpha-note');
      expect(run.output).not.toContain('sample paragraph');
    });

    it('fails when the private item changed after it was sealed', () => {
      const edited = makeLore({ [CHAMBER]: { alpha: ALPHA, beta: { ...BETA, body: ['An edited sample paragraph.'] } } });
      const run = runSeal(['--check', '--out', out], { UNHELD_LORE_DIR: edited });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`${CHAMBER}/beta-line: the private item changed`);
    });

    it('fails when a chamber has no committed file, and when a committed file has no chamber', () => {
      const empty = freshDir('out');
      expect(runSeal(['--check', '--out', empty], { UNHELD_LORE_DIR: lore })).toMatchObject({ status: 1 });
      const stray = freshDir('out');
      copyDir(out, stray);
      writeFileSync(join(stray, 'unknown-room.sealed.json'), readFileSync(sealedPath(out), 'utf8'));
      const run = runSeal(['--check', '--out', stray], { UNHELD_LORE_DIR: lore });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('unknown-room.sealed.json: no such chamber');
    });
  });

  describe('refuses', () => {
    it.each([
      ['a banned word', 'The room is fixed now.', /banned term \W*fixed/],
      ['a web address', 'See https://example.com for more.', /remote reference/],
      ['an AI attribution', 'Made with Claude.', /AI attribution/],
    ])('to seal %s, naming the rule and writing nothing', (_label, paragraph, rule) => {
      const bad = makeLore({ [CHAMBER]: { alpha: ALPHA, beta: { ...BETA, body: [paragraph] } } });
      const target = freshDir('out');
      const run = runSeal(['--out', target], { UNHELD_LORE_DIR: bad });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(rule);
      expect(run.stderr).toContain('nothing sealed');
      expect(readdirSync(target)).toEqual([]);
      expect(tempLeftovers().filter((name) => !leftoversBefore.includes(name))).toEqual([]);
    });

    it('to run without UNHELD_LORE_DIR', () => {
      const run = runSeal(['--out', freshDir('out')], {});
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('UNHELD_LORE_DIR is not set');
      const blank = runSeal(['--check'], { UNHELD_LORE_DIR: '' });
      expect(blank.status).toBe(2);
    });

    it('to write inside the lore directory', () => {
      const inside = join(lore, 'content', CHAMBER, 'out');
      const run = runSeal(['--out', inside], { UNHELD_LORE_DIR: lore });
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('refusing to write inside UNHELD_LORE_DIR');
      expect(existsSync(inside)).toBe(false);
      expect(runSeal(['--out', lore], { UNHELD_LORE_DIR: lore }).status).toBe(2);
      expect(snapshot(lore)).toEqual(loreBefore);
    });

    it('a lore directory that is not the private repository', () => {
      const run = runSeal(['--out', freshDir('out')], { UNHELD_LORE_DIR: freshDir('empty') });
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('is not a directory');
    });

    it('unknown flags', () => {
      const run = runSeal(['--force'], { UNHELD_LORE_DIR: lore });
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('usage:');
    });

    it('invalid items: lists every problem by file and field, echoes no content, seals nothing', () => {
      const bad = makeLore({
        [CHAMBER]: {
          alpha: ALPHA,
          copy: ALPHA,
          extra: { ...BETA, mood: 'PRIVATE-MARKER' },
          broken: 'PRIVATE-MARKER is not json',
          notoken: item(BETA),
        },
      });
      const target = freshDir('out');
      const run = runSeal(['--out', target], { UNHELD_LORE_DIR: bad });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`content/${CHAMBER}/copy.json: id "alpha-note" is already used by alpha.json`);
      expect(run.stderr).toContain(`content/${CHAMBER}/extra.json: unknown field "mood"`);
      expect(run.stderr).toContain(`content/${CHAMBER}/broken.json: not valid JSON`);
      expect(run.stderr).toContain(`content/${CHAMBER}/notoken.json.token`);
      expect(run.output).not.toContain('PRIVATE');
      expect(readdirSync(target)).toEqual([]);
    });
  });

  // Sealed memos pass the same memo rules as public ones (word count, from line, Fictional label
  // for first-person text, captions). One refused run lists every offending memo, each named by id
  // in its own failing test; one accepted run covers memos that sit on the rules' edges.
  describe('memo rules', () => {
    const memo = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
      id,
      kind: 'memo',
      from: 'Sample sender',
      body: [words(40)],
      token: `tok-${id}`,
      ...over,
    });

    const BAD: readonly (readonly [string, Record<string, unknown>, RegExp])[] = [
      ['too-short', memo('too-short', { body: [words(29)] }), /outside 30-90/],
      ['too-long', memo('too-long', { body: [words(91)] }), /outside 30-90/],
      ['no-from', memo('no-from', { from: undefined }), /empty from line/],
      ['first-person-bare', memo('first-person-bare', { body: [`I kept the stamp. ${words(36)}`] }), /first person/],
      [
        'first-person-plain-label',
        memo('first-person-plain-label', { body: [`I kept the stamp. ${words(36)}`], label: 'Office correspondence.' }),
        /first person/,
      ],
      ['caption-bare', memo('caption-bare', { fields: { caption: 'Sample caption.' } }), /bracketed/],
      ['caption-long', memo('caption-long', { fields: { caption: `[${words(8)}]` } }), /over 7/],
      ['plate-caption', memo('plate-caption', { fields: { plateCaption: 'Sample caption.' } }), /bracketed/],
    ];

    /**
     * Why one memo failed, from the nested content check's verbose output: a failed test is a `×` line
     * naming it, followed by a `→` line with the reason. Undefined if that memo's test did not fail.
     */
    const failureOf = (output: string, id: string): string | undefined => {
      const lines = output.split('\n');
      const at = lines.findIndex((line) => line.trimStart().startsWith('×') && line.includes(`> ${id} follows the memo rules`));
      return at < 0 ? undefined : (lines[at + 1] ?? '').trim();
    };

    describe('refuses to seal a memo that', () => {
      let run: Run;
      let target: string;

      beforeAll(() => {
        target = freshDir('out');
        const lore = makeLore({ [CHAMBER]: Object.fromEntries(BAD.map(([id, source]) => [id, source])) });
        run = runSeal(['--out', target], { UNHELD_LORE_DIR: lore });
      }, 180_000);

      it('is refused as a whole, and nothing is written', () => {
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('nothing sealed');
        expect(readdirSync(target)).toEqual([]);
      });

      it.each(BAD)('%s: fails its own rule, and only that one', (id, _source, rule) => {
        const failure = failureOf(run.stderr, id);
        expect(failure, `${id} was not refused`).toBeDefined();
        expect(failure).toMatch(rule);
        const strays = BAD.map(([, , other]) => other).filter(
          (other) => other.source !== rule.source && other.test(failure ?? ''),
        );
        expect(strays, `${id} also tripped another rule`).toEqual([]);
      });
    });

    describe('seals a memo that', () => {
      const GOOD: Readonly<Record<string, Record<string, unknown>>> = {
        'min-words': memo('min-words', { body: [words(30)] }),
        'max-words': memo('max-words', { body: [words(90)] }),
        'two-paragraphs': memo('two-paragraphs', { body: [words(15), words(15)] }),
        'fictional-first-person': memo('fictional-first-person', {
          body: [`I kept the stamp. ${words(36)}`],
          label: 'Fictional office correspondence.',
          fields: { caption: '[Sample sound.]', inscription: 'Not a caption, so no caption rule applies to this text.' },
        }),
        'short-secret': { id: 'short-secret', kind: 'secret', body: ['Three short words.'], token: 'tok-secret' },
      };

      it('meets the rules, including at the edges, and does not hold other kinds to them', () => {
        const lore = makeLore({ [CHAMBER]: GOOD });
        const target = freshDir('out');
        const run = runSeal(['--out', target], { UNHELD_LORE_DIR: lore });
        expect(run.output).toContain(`${CHAMBER}: 5 items`);
        expect(run.status).toBe(0);
        expect(Object.keys(readSealed(target).items)).toEqual([
          'fictional-first-person',
          'max-words',
          'min-words',
          'short-secret',
          'two-paragraphs',
        ]);
      });
    });
  });
});
