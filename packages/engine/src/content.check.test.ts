/**
 * Story-copy rules, run by `pnpm check:content` (and by `pnpm test`).
 *
 * Story, Office object and memo strings are collected by walking the
 * module exports, so a newly added export is covered without editing this file. The
 * rules encode AGENTS.md (#1 not therapy or diagnosis, #2 no first-person testimony
 * presented as real, #6 no therapy-like prompts, #10 editorial review), CLAUDE.md
 * (memo length, "Do not do") and MASTER_BLUEPRINT.md section 2 (P1, P6, P8, P11 and the
 * prohibited mechanics). The numeric limits are the reviewed ones below; changing one is
 * an editorial decision, not a test fix.
 */
import { readFileSync } from 'node:fs';
import type { SealedItem } from './sealed/types.ts';
import { describe, expect, it } from 'vitest';
import memoDialogSource from '../../ui/src/MemoDialog.tsx?raw';
import * as accessibleCopy from './accessibleCopy.ts';
import * as chambers from './chambers.ts';
import * as copy from './copy.ts';
import * as siteCopy from './siteCopy.ts';
import * as officeObjects from './office/objects.ts';
import * as officePlay from './office/play.ts';
import * as officeMemos from './office/memos.ts';
import type { MachineLine, Memo, MemoSource } from './copy.ts';

// ---------------------------------------------------------------------------------------
// Reviewed limits
// ---------------------------------------------------------------------------------------

/** CLAUDE.md: memos run 30-70 words typically; up to 90 is tolerated headroom. */
const MEMO_WORDS = { min: 30, max: 90 } as const;
const CAPTION_MAX_WORDS = 7;
const SCENE_WORDS = { min: 45, max: 80 } as const;
const SCENE_PARAGRAPHS = { min: 2, max: 3 } as const;
const DISPLAY_MAX_CHARS = 40;
const RECEIPT_MAX_CHARS = 60;
/** Notice-board clippings: a headline that reads at a glance, a one-sentence dek. */
const HEADLINE_MAX_CHARS = 48;
const DEK_MAX_CHARS = 110;
/** Site pages and the corridor's text mode: short paragraphs, read on a phone. */
const PAGE_PARAGRAPH_MAX_WORDS = 60;
const CORRIDOR_WORDS = { min: 45, max: 90 } as const;

// ---------------------------------------------------------------------------------------
// Banned framing
// ---------------------------------------------------------------------------------------

interface BannedTerm {
  readonly term: string;
  /** Whole-word, case-insensitive. Plural and tense variants are part of the same term. */
  readonly pattern: RegExp;
  /** A sentence the pattern must catch; proves the pattern itself is not broken. */
  readonly sample: string;
}

/**
 * Reviewed list of framing the story copy must never use. Sources:
 *  - Outcome and score words: AGENTS.md #1 (no diagnosis, no distress leaderboard),
 *    CLAUDE.md "No 'you're fixed' achievement or mental score", blueprint P6 (no reward
 *    for distress), P8 (an open ending, not a false cure) and the prohibited mechanics
 *    ("peer pressure streaks", "distress-based loot").
 *  - Clinical and diagnostic words: AGENTS.md #1 and #6 (no therapy-like prompts),
 *    blueprint P1 ("Show; don't diagnose") and the responsible-portrayal standard that no
 *    chatbot or scene pretends to provide clinical treatment.
 *  - Crisis words: CLAUDE.md "No AI-generated pretend suicide letters or provocative
 *    crisis storytelling" and the prohibited "suicide depictions designed for shock".
 *    Crisis support belongs in maintained content, not in scene copy.
 *  - Forced disclosure: AGENTS.md #3 and #6, blueprint P6 and P7 (no oversharing prompts,
 *    no extraction).
 */
const BANNED_FRAMING: readonly BannedTerm[] = [
  { term: 'fixed', pattern: /\bfixed\b/i, sample: 'Everything is Fixed now.' },
  { term: 'cured', pattern: /\bcured\b/i, sample: 'He was cured.' },
  { term: 'healed', pattern: /\bhealed\b/i, sample: 'The office is healed.' },
  { term: 'normal', pattern: /\bnormal\b/i, sample: 'Back to NORMAL.' },
  { term: 'score', pattern: /\bscores?\b/i, sample: 'Your score is 5.' },
  { term: 'level up', pattern: /\blevel(?:s|ed|led|ing)?[\s-]+up\b/i, sample: 'You level up.' },
  { term: 'achievement', pattern: /\bachievements?\b/i, sample: 'Achievement unlocked.' },
  { term: 'streak', pattern: /\bstreaks?\b/i, sample: 'A five day streak.' },
  { term: 'diagnos*', pattern: /\bdiagnos\w*/i, sample: 'A clear diagnosis.' },
  { term: 'disorder', pattern: /\bdisorders?\b/i, sample: 'A disorder of the desk.' },
  { term: 'symptom', pattern: /\bsymptoms?\b/i, sample: 'Each symptom is filed.' },
  { term: 'therapy', pattern: /\btherap(?:y|ies)\b/i, sample: 'This is therapy.' },
  { term: 'therapist', pattern: /\btherapists?\b/i, sample: 'Ask the Therapist.' },
  { term: 'treatment', pattern: /\btreatments?\b/i, sample: 'The treatment begins.' },
  { term: 'depression', pattern: /\bdepression\b/i, sample: 'Depression, stamped.' },
  { term: 'suicide', pattern: /\bsuicid(?:e|al)\b/i, sample: 'A note about suicide.' },
  { term: 'self-harm', pattern: /\bself[\s-]?harm\b/i, sample: 'A note about self harm.' },
  { term: 'kill yourself', pattern: /\bkill\s+yourself\b/i, sample: 'Do not kill yourself.' },
  { term: 'tell us', pattern: /\btell\s+us\b/i, sample: 'Please TELL US how it feels.' },
  { term: 'share your', pattern: /\bshare\s+your\b/i, sample: 'Share your story.' },
];

/** Plain office language that must stay clean; guards against patterns turning into substring matches. */
const CLEAN_SAMPLES: readonly string[] = [
  'STATUS: FINE',
  'Filed under fine.',
  'PROVISIONALLY APPROVED',
  'The stamp still works beautifully.',
  'An abnormal quantity of paper.',
  'The rustle of a scoreboard-free room.',
];

// ---------------------------------------------------------------------------------------
// Collecting copy
// ---------------------------------------------------------------------------------------

interface CopyString {
  /** Export path such as `CAPTIONS.contact` or `ESCALATION[2].display`. */
  readonly path: string;
  readonly text: string;
}

function collectStrings(value: unknown, path: string, out: CopyString[]): CopyString[] {
  if (typeof value === 'string') {
    out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) collectStrings(item, `${path}.${key}`, out);
  }
  return out;
}

function collectModule(module: object): CopyString[] {
  return Object.entries(module).flatMap(([name, value]) => collectStrings(value, name, []));
}

/**
 * Sealed plaintext (ADR 0002): `pnpm seal` writes the items it is about to seal to a temporary JSON
 * file and names it in UNHELD_SEALED_PLAINTEXT, so every rule below also runs on them. Unset: none.
 */
function sealedItems(): readonly SealedItem[] {
  const file = process.env['UNHELD_SEALED_PLAINTEXT'];
  return file === undefined || file === '' ? [] : JSON.parse(readFileSync(file, 'utf8'));
}

const SEALED_ITEMS = sealedItems();

/**
 * A sealed memo is held to the rules of a public one: body length (MEMO_WORDS), a from line, a label
 * that starts "Fictional" when the body speaks in the first person, and the caption rules for any
 * field whose name ends in "caption". Other kinds are not memos and are left alone. The helpers used
 * here are declared further down; they are only called from tests, after the module has loaded.
 */
function sealedMemoProblems(item: SealedItem): string[] {
  const office = /^office-0[1-5]$/.test(item.id);
  if (office && item.kind !== 'memo') return ['Office document is not a memo'];
  if (item.kind !== 'memo') return [];
  const problems: string[] = [];
  const words = item.body.reduce((total, paragraph) => total + wordCount(paragraph), 0);
  const maxWords = office ? 70 : MEMO_WORDS.max;
  if (words < MEMO_WORDS.min || words > maxWords) {
    problems.push(`body is ${words} words, outside ${MEMO_WORDS.min}-${maxWords}`);
  }
  if (office) {
    if (!/^Fictional\b/.test(item.label ?? '')) problems.push('Office memo has no fictional provenance');
    if (!(item.fields?.['classification'] ?? '').trim()) problems.push('Office memo has no classification');
    if (item.fields?.['editorial'] !== 'true') problems.push('Office memo is not marked for editorial review');
    if (!(item.title ?? '').trim()) problems.push('Office memo has no title');
    const classification = item.fields?.['classification'];
    const expected = ['Routine', 'Routine', 'Archive', 'Personal', 'Null'][Number(item.id.slice(-2)) - 1];
    if (classification && classification !== expected) problems.push('Office memo has the wrong classification');
    if (classification === 'Personal' && item.label !== 'Fictional personal memo') problems.push('Personal memo has no personal fiction label');
  }
  if ((item.from ?? '').trim() === '') problems.push('has an empty from line');
  const firstPerson = firstPersonSentences(item.body);
  if (firstPerson.length > 0 && !/^Fictional\b/.test(item.label ?? '')) {
    problems.push(`speaks in the first person (${JSON.stringify(firstPerson)}) but its label does not start with "Fictional"`);
  }
  for (const [name, text] of Object.entries(item.fields ?? {})) {
    if (!/caption$/i.test(name)) continue;
    if (!/^\[[^[\]]+\]$/.test(text)) problems.push(`${name} must be a single [bracketed] caption`);
    if (wordCount(text) > CAPTION_MAX_WORDS) problems.push(`${name} is ${wordCount(text)} words, over ${CAPTION_MAX_WORDS}`);
  }
  return problems;
}

describe('sealed memos (ADR 0002)', () => {
  const body = (count: number): string[] => [Array.from({ length: count }, () => 'word').join(' ')];
  const memo = (over: Partial<SealedItem> = {}): SealedItem => ({
    id: 'sample-memo',
    kind: 'memo',
    from: 'Sample sender',
    title: 'Sample title',
    body: body(40),
    ...over,
  });
  const { from: _from, ...withoutFrom } = memo();

  it('finds what the memo rules forbid, and nothing else', () => {
    expect(sealedMemoProblems(memo())).toEqual([]);
    expect(sealedMemoProblems(memo({ body: body(30) }))).toEqual([]);
    expect(sealedMemoProblems(memo({ body: body(90) }))).toEqual([]);
    expect(sealedMemoProblems(memo({ body: body(29) }))).toEqual(['body is 29 words, outside 30-90']);
    expect(sealedMemoProblems(memo({ body: body(91) }))).toEqual(['body is 91 words, outside 30-90']);
    expect(sealedMemoProblems(memo({ body: [...body(15), ...body(15)] }))).toEqual([]);
    expect(sealedMemoProblems(withoutFrom as SealedItem)).toEqual(['has an empty from line']);
  });

  it('wants a Fictional label on first-person text only', () => {
    const spoken = ['I kept the stamp.', ...body(36)];
    expect(sealedMemoProblems(memo({ body: spoken }))).toEqual([expect.stringContaining('first person')]);
    expect(sealedMemoProblems(memo({ body: spoken, label: 'Office correspondence.' }))).toHaveLength(1);
    expect(sealedMemoProblems(memo({ body: spoken, label: 'fictional office correspondence.' }))).toHaveLength(1);
    expect(sealedMemoProblems(memo({ body: spoken, label: 'Fictional office correspondence.' }))).toEqual([]);
    expect(sealedMemoProblems(memo({ label: 'Office correspondence.' }))).toEqual([]);
  });

  it('holds fields named like a caption to the caption rules, and no other field', () => {
    expect(sealedMemoProblems(memo({ fields: { caption: '[Sample sound.]' } }))).toEqual([]);
    expect(sealedMemoProblems(memo({ fields: { caption: 'Sample sound.' } }))).toEqual([
      'caption must be a single [bracketed] caption',
    ]);
    expect(sealedMemoProblems(memo({ fields: { plateCaption: '[one two three four five six seven eight]' } }))).toEqual([
      'plateCaption is 8 words, over 7',
    ]);
    expect(sealedMemoProblems(memo({ fields: { caption: '[one two three four five six seven]' } }))).toEqual([]);
    expect(sealedMemoProblems(memo({ fields: { inscription: 'Not a caption, so any text will do.' } }))).toEqual([]);
  });

  it('keeps the Office memo ceiling at 70 words after sealing', () => {
    expect(sealedMemoProblems(memo({ id: 'office-01', body: body(71), label: 'Fictional institutional document', fields: { classification: 'Routine', editorial: 'true' } })))
      .toEqual(['body is 71 words, outside 30-70']);
  });

  it('requires fictional provenance and an editorial flag for Office documents', () => {
    const item = memo({ id: 'office-04' });
    expect(sealedMemoProblems(item)).toEqual([
      'Office memo has no fictional provenance', 'Office memo has no classification', 'Office memo is not marked for editorial review',
    ]);
  });

  it('requires a readable title on an Office memo', () => {
    expect(sealedMemoProblems(memo({ id: 'office-01', title: ' ', label: 'Fictional institutional document', fields: { classification: 'Routine', editorial: 'true' } })))
      .toEqual(['Office memo has no title']);
  });

  it('retains the authored classification and explicit personal fiction label', () => {
    expect(sealedMemoProblems(memo({ id: 'office-04', label: 'Fictional institutional document', fields: { classification: 'Personal', editorial: 'true' } })))
      .toEqual(['Personal memo has no personal fiction label']);
    expect(sealedMemoProblems(memo({ id: 'office-01', label: 'Fictional institutional document', fields: { classification: 'Null', editorial: 'true' } })))
      .toEqual(['Office memo has the wrong classification']);
  });

  it('cannot bypass Office document rules by changing its kind', () => {
    expect(sealedMemoProblems(memo({ id: 'office-01', kind: 'secret', body: body(3) })))
      .toEqual(['Office document is not a memo']);
  });

  it('leaves items that are not memos alone', () => {
    const secret: SealedItem = { id: 'sample-secret', kind: 'secret', body: ['I wrote this.'], fields: { caption: 'x' } };
    expect(sealedMemoProblems(secret)).toEqual([]);
  });

  // With no sealed plaintext (the usual run) this table is empty; `pnpm seal` fills it.
  it.each(SEALED_ITEMS.map((item): [string, SealedItem] => [item.id, item]))(
    '%s follows the memo rules',
    (id, item) => {
      const problems = sealedMemoProblems(item);
      if (problems.length > 0) expect.fail(`sealed memo ${id}: ${problems.join('; ')}`);
    },
  );
});

const ALL_COPY: readonly CopyString[] = [
  ...collectStrings(SEALED_ITEMS, 'SEALED', []),
  ...collectModule(copy),
  ...collectModule(accessibleCopy),
  ...collectModule(siteCopy),
  ...collectModule(chambers),
  ...collectModule(officeObjects),
  ...collectModule(officePlay),
  ...collectModule(officeMemos),
];

function isMemo(value: unknown): value is Memo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'body' in value &&
    'provenance' in value &&
    Array.isArray(value.body)
  );
}

const MEMOS: readonly Memo[] = Object.values(copy).filter(isMemo);

/** Words are whitespace-separated tokens that contain a letter or digit (a lone dash is not a word). */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function findBanned(text: string): string[] {
  return BANNED_FRAMING.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term);
}

// ---------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------

describe('copy collection', () => {
  it('reaches every area of the story copy', () => {
    const paths = new Set(ALL_COPY.map(({ path }) => path));
    for (const expected of [
      'INITIAL_DISPLAY',
      'ESCALATION[0].display',
      'AFTERMATH[0].receipt',
      'MEMO_001.body[0]',
      'MEMO_001.provenance.inspection',
      'CAPTIONS.contact',
      'CAPTION_REPLY_SAGGING',
      'TEXT_MODE_SCENE[0]',
      'TEXT_MODE_NOTICE.chosen',
      'LANDING.enter',
      'SPINE_CAPTIONS.door-open',
      'TEXT_MODE_CORRIDOR[0]',
      'ABOUT.body[0]',
      'PRIVACY.body[0]',
      'CHAMBERS[0].clipping.headline',
      'CHAMBERS[0].doorDescription',
      'OFFICE_OBJECT_IDS[0]',
      'OFFICE_OBJECTS[0].id',
      'OFFICE_OBJECTS[0].first',
      'OFFICE_OBJECTS[17].repeats[0]',
      'OFFICE_OBJECT_COPY.whisperCaption',
      'OFFICE_MEMOS[0].body[0]',
    ]) {
      expect(paths, `${expected} is not collected, so no rule would cover it`).toContain(expected);
    }
  });
});

describe('banned framing', () => {
  it.each(BANNED_FRAMING)('the "$term" pattern catches its own sample', ({ term, sample }) => {
    expect(findBanned(sample)).toContain(term);
  });

  it.each(CLEAN_SAMPLES)('ordinary office language is not flagged: %s', (text) => {
    expect(findBanned(text)).toEqual([]);
  });

  it('no exported copy string, caption or notice uses a banned term', () => {
    const violations = ALL_COPY.flatMap(({ path, text }) =>
      findBanned(text).map((term) => `${path} uses banned term "${term}": ${JSON.stringify(text)}`),
    );
    expect(violations).toEqual([]);
  });
});

describe('Office documents and discoveries', () => {
  it('keeps only the core memo public and five neutral document identities in objects', () => {
    expect(officeMemos.OFFICE_MEMOS.map(({ id }) => id)).toEqual(['memo-001']);
    expect(officeObjects.OFFICE_OBJECTS.flatMap(({ memoId }) => memoId ? [memoId] : []).sort())
      .toEqual(['office-01', 'office-02', 'office-03', 'office-04', 'office-05']);
  });

  it('imports Memo 001 verbatim rather than replacing its approved body', () => {
    const memo = officeMemos.OFFICE_MEMOS.find(({ id }) => id === 'memo-001');
    expect(memo?.body).toBe(copy.MEMO_001.body);
    expect(memo?.title).toBe(copy.MEMO_001.title);
    expect(memo?.from).toBe(copy.MEMO_001.from);
  });

  it.each(officeMemos.OFFICE_MEMOS)('$id has explicit fictional provenance including personal notes', (memo) => {
    expect(memo.label).toBe(memo.classification === 'Personal'
      ? 'Fictional personal memo' : 'Fictional institutional document');
  });

  it.each(officeObjects.OFFICE_OBJECT_IDS)('%s identity and its alias are included in content collection', (id) => {
    const values = ALL_COPY.filter(({ text }) => text === id);
    expect(values.some(({ path }) => /^OFFICE_OBJECT_IDS\[\d+\]$/.test(path))).toBe(true);
    expect(values.some(({ path }) => /^OFFICE_OBJECTS\[\d+\]\.id$/.test(path))).toBe(true);
  });

  it.each(officeMemos.OFFICE_MEMOS)('$id full document and label are covered by content collection', (memo) => {
    const index = officeMemos.OFFICE_MEMOS.indexOf(memo);
    for (const [field, text] of [['id', memo.id], ['label', memo.label], ['classification', memo.classification], ['from', memo.from]] as const) {
      expect(ALL_COPY).toContainEqual({ path: `OFFICE_MEMOS[${index}].${field}`, text });
    }
    memo.body.forEach((text, paragraph) => {
      expect(ALL_COPY).toContainEqual({ path: `OFFICE_MEMOS[${index}].body[${paragraph}]`, text });
    });
  });
});

describe('no remote references in copy', () => {
  it('no copy string contains a URL or web address', () => {
    const remote = /(?:https?|wss?|ftp):\/\/|\bwww\./i;
    const violations = ALL_COPY.filter(({ text }) => remote.test(text)).map(
      ({ path, text }) => `${path} contains a remote reference: ${JSON.stringify(text)}`,
    );
    expect(violations).toEqual([]);
  });
});

const MEMO_SOURCES: Record<MemoSource, true> = { inspection: true, overload: true, stillness: true };

/**
 * The memo dialog marks every memo as fictional with a footnote. Accepts either a string
 * constant starting "Fictional" that is rendered as `{NAME}`, or literal JSX text.
 */
function rendersFictionalLabel(source: string): boolean {
  const constant = /const\s+(\w+)\s*=\s*(['"`])Fictional\b[\s\S]*?\2/.exec(source);
  const name = constant?.[1];
  if (name !== undefined && source.includes(`{${name}}`)) return true;
  return />\s*Fictional\b[^<{]*</.test(source);
}

/** First-person pronouns. "I" also matches its contractions (I'm, I've, I'd, I'll). */
const FIRST_PERSON = /\bI\b|\b(?:my|me|mine|myself)\b/i;

function firstPersonSentences(paragraphs: readonly string[]): string[] {
  return paragraphs
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .filter((sentence) => FIRST_PERSON.test(sentence));
}

describe('memo', () => {
  it('copy exports at least one memo', () => {
    expect(MEMOS.length).toBeGreaterThan(0);
  });

  for (const memo of MEMOS) {
    describe(memo.id, () => {
      const words = memo.body.reduce((total, paragraph) => total + wordCount(paragraph), 0);

      // The actual count is part of the test name, so the verbose reporter prints it.
      it(`body is ${MEMO_WORDS.min}-${MEMO_WORDS.max} words (currently ${words})`, () => {
        expect(memo.body.length, `${memo.id} has no body paragraphs`).toBeGreaterThan(0);
        expect(words, `${memo.id} body is ${words} words`).toBeGreaterThanOrEqual(MEMO_WORDS.min);
        expect(words, `${memo.id} body is ${words} words`).toBeLessThanOrEqual(MEMO_WORDS.max);
      });

      it('has a from line and provenance for both discovery paths', () => {
        expect(memo.from.trim(), `${memo.id} has an empty from line`).not.toBe('');
        for (const source of Object.keys(MEMO_SOURCES) as MemoSource[]) {
          const line = memo.provenance[source] as string | undefined;
          expect(line?.trim() ?? '', `${memo.id} has no provenance for "${source}"`).not.toBe('');
        }
      });

      it('uses first-person sentences only when the memo is marked fictional', () => {
        const firstPerson = firstPersonSentences(memo.body);
        if (firstPerson.length === 0) return;
        expect(
          rendersFictionalLabel(memoDialogSource),
          `${memo.id} speaks in the first person (${JSON.stringify(firstPerson)}) but MemoDialog does not render a Fictional label`,
        ).toBe(true);
      });
    });
  }

  it('the memo dialog renders the Fictional footnote', () => {
    expect(rendersFictionalLabel(memoDialogSource)).toBe(true);
  });

  it('detects first-person testimony and the fictional label', () => {
    expect(firstPersonSentences(['I stamped it myself.', 'The office is closed.'])).toEqual(['I stamped it myself.']);
    expect(firstPersonSentences(['My desk is cold.'])).toHaveLength(1);
    expect(firstPersonSentences(['Thank you for your evidence.'])).toEqual([]);
    expect(rendersFictionalLabel("const NOTE = 'Fictional office correspondence.';\n<p>{NOTE}</p>")).toBe(true);
    expect(rendersFictionalLabel("const NOTE = 'Fictional office correspondence.';\n<p>nothing</p>")).toBe(false);
    expect(rendersFictionalLabel('<p>Fictional office correspondence.</p>')).toBe(true);
    expect(rendersFictionalLabel('<p>Office correspondence.</p>')).toBe(false);
  });
});

describe('captions', () => {
  const bracketed = /^\[[^[\]]+\]$/;
  const captions: readonly (readonly [string, string])[] = [
    ...Object.entries(accessibleCopy.CAPTIONS).flatMap(([cue, text]): [string, string][] =>
      text === null ? [] : [[`CAPTIONS.${cue}`, text]],
    ),
    ['CAPTION_REPLY_SAGGING', accessibleCopy.CAPTION_REPLY_SAGGING],
    ...Object.entries(siteCopy.SPINE_CAPTIONS).flatMap(([cue, text]): [string, string][] =>
      text === null ? [] : [[`SPINE_CAPTIONS.${cue}`, text]],
    ),
    ...Object.entries(siteCopy.PROP_CAPTIONS).map(([cue, text]): [string, string] => [`PROP_CAPTIONS.${cue}`, text]),
    ...officeObjects.OFFICE_OBJECTS.map((object): [string, string] => [`OFFICE_OBJECTS.${object.id}.caption`, object.caption]),
    ['OFFICE_OBJECT_COPY.whisperCaption', officeObjects.OFFICE_OBJECT_COPY.whisperCaption],
  ];

  it('includes sounded cues', () => {
    expect(captions.length).toBeGreaterThan(1);
  });

  it.each(captions)('%s is bracketed', (path, text) => {
    expect(text, `${path} must be a single [bracketed] caption`).toMatch(bracketed);
  });

  it.each(captions)(`%s is at most ${CAPTION_MAX_WORDS} words`, (path, text) => {
    const words = wordCount(text);
    expect(words, `${path} is ${words} words: ${text}`).toBeLessThanOrEqual(CAPTION_MAX_WORDS);
  });
});

describe('text-mode scene', () => {
  const scene = accessibleCopy.TEXT_MODE_SCENE;
  const words = scene.reduce((total, paragraph) => total + wordCount(paragraph), 0);

  it(`is ${SCENE_WORDS.min}-${SCENE_WORDS.max} words (currently ${words})`, () => {
    expect(words, `TEXT_MODE_SCENE is ${words} words`).toBeGreaterThanOrEqual(SCENE_WORDS.min);
    expect(words, `TEXT_MODE_SCENE is ${words} words`).toBeLessThanOrEqual(SCENE_WORDS.max);
  });

  it(`is ${SCENE_PARAGRAPHS.min}-${SCENE_PARAGRAPHS.max} non-empty paragraphs`, () => {
    expect(scene.length, `TEXT_MODE_SCENE has ${scene.length} paragraphs`).toBeGreaterThanOrEqual(SCENE_PARAGRAPHS.min);
    expect(scene.length, `TEXT_MODE_SCENE has ${scene.length} paragraphs`).toBeLessThanOrEqual(SCENE_PARAGRAPHS.max);
    scene.forEach((paragraph, index) => {
      expect(paragraph.trim(), `TEXT_MODE_SCENE[${index}] is empty`).not.toBe('');
    });
  });
});

describe('machine lines', () => {
  const lines: readonly (readonly [string, MachineLine])[] = [
    ...copy.ESCALATION.map((line, index): [string, MachineLine] => [`ESCALATION[${index}]`, line]),
    ...copy.AFTERMATH.map((line, index): [string, MachineLine] => [`AFTERMATH[${index}]`, line]),
  ];

  it('covers one submission and non-advancing repeat replies', () => {
    expect(copy.ESCALATION).toHaveLength(1);
    expect(copy.AFTERMATH).toHaveLength(3);
    expect(copy.ESCALATION.some(line => /APPROVED/.test(line.display))).toBe(false);
    expect(copy.AFTERMATH.some(line => /APPROVED|FINE/.test(line.display))).toBe(false);
  });

  it.each(lines)('%s display is uppercase and at most 40 characters', (path, line) => {
    expect(line.display, `${path} display is empty`).not.toBe('');
    expect(line.display, `${path} display must be uppercase`).toBe(line.display.toUpperCase());
    expect(line.display.length, `${path} display is ${line.display.length} characters`).toBeLessThanOrEqual(
      DISPLAY_MAX_CHARS,
    );
  });

  it.each(lines)('%s receipt is at most 60 characters', (path, line) => {
    expect(line.receipt, `${path} receipt is empty`).not.toBe('');
    for (const printedLine of line.receipt.split('\n')) {
      expect(printedLine.length, `${path} receipt line is ${printedLine.length} characters`).toBeLessThanOrEqual(RECEIPT_MAX_CHARS);
    }
  });

  it('the opening display follows the same display rules', () => {
    expect(copy.INITIAL_DISPLAY).toBe(copy.INITIAL_DISPLAY.toUpperCase());
    expect(copy.INITIAL_DISPLAY.length).toBeLessThanOrEqual(DISPLAY_MAX_CHARS);
  });
});

describe('notice-board clippings and plaques', () => {
  const entries = chambers.CHAMBERS.map((c): [string, chambers.ChamberEntry] => [c.id, c]);

  it.each(entries)('%s headline is uppercase and short enough to read at a glance', (id, entry) => {
    const { headline } = entry.clipping;
    expect(headline, `${id} headline must be uppercase`).toBe(headline.toUpperCase());
    expect(headline.length, `${id} headline is ${headline.length} characters`).toBeLessThanOrEqual(HEADLINE_MAX_CHARS);
  });

  it.each(entries)('%s dek is one sentence within the limit', (id, entry) => {
    const { dek } = entry.clipping;
    expect(dek.length, `${id} dek is ${dek.length} characters`).toBeLessThanOrEqual(DEK_MAX_CHARS);
    expect(dek.split(/(?<=[.!?])\s+/).length, `${id} dek must be one sentence`).toBe(1);
  });

  it.each(entries)('%s plaque is uppercase', (id, entry) => {
    expect(entry.plaque, `${id} plaque must be uppercase`).toBe(entry.plaque.toUpperCase());
  });
});

describe('site pages and corridor text mode', () => {
  const pages = [siteCopy.ABOUT, siteCopy.PRIVACY, siteCopy.CREDITS, siteCopy.NOT_FOUND];
  const paragraphs = pages.flatMap((page) =>
    page.body.map((text, index): [string, string] => [`${page.title} [${index}]`, text]),
  );

  it.each(paragraphs)(`%s is at most ${PAGE_PARAGRAPH_MAX_WORDS} words`, (path, text) => {
    expect(wordCount(text), `${path} is ${wordCount(text)} words`).toBeLessThanOrEqual(PAGE_PARAGRAPH_MAX_WORDS);
  });

  const corridorWords = siteCopy.TEXT_MODE_CORRIDOR.reduce((total, p) => total + wordCount(p), 0);
  it(`the corridor text mode is ${CORRIDOR_WORDS.min}-${CORRIDOR_WORDS.max} words (currently ${corridorWords})`, () => {
    expect(corridorWords).toBeGreaterThanOrEqual(CORRIDOR_WORDS.min);
    expect(corridorWords).toBeLessThanOrEqual(CORRIDOR_WORDS.max);
  });
});

describe('no AI attribution in copy', () => {
  // AGENTS.md #11 (founder hard rule): no copy credits or names AI tools. Labelling a text as
  // fictional stays required (AGENTS.md #2); naming the tools that helped make the work does not.
  const attribution = /\b(Claude|Anthropic|ChatGPT|OpenAI|GPT-?\d|Codex|Copilot|Gemini)\b|\bAI[- ](assisted|generated|tools?)\b/i;

  it('the pattern catches what it must', () => {
    expect(attribution.test('built with human direction and AI-assisted tools')).toBe(true);
    expect(attribution.test('Made with Claude')).toBe(true);
    expect(attribution.test('Fictional office correspondence.')).toBe(false);
  });

  it('no exported copy string credits or names an AI tool', () => {
    const violations = ALL_COPY.filter(({ text }) => attribution.test(text)).map(
      ({ path, text }) => `${path} carries AI attribution: ${JSON.stringify(text)}`,
    );
    expect(violations).toEqual([]);
  });
});
