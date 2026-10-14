import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import baseRaw from '../styles.css?raw';

/**
 * spine.css is read from disk: vitest.config.ts blanks CSS that is not whitelisted for `?raw`
 * (only styles.css is), and that file belongs to another lane.
 */
const raw = readFileSync(join(import.meta.dirname, 'spine.css'), 'utf8');

/**
 * Helpers for reading spine.css as text in tests: its tokens, its rules, its contrast pairs. The
 * stylesheet is parsed with small functions rather than a CSS engine, so a malformed rule fails
 * loudly instead of being skipped.
 */

/** The stylesheet without comments, so braces and selectors inside them cannot confuse the parsing. */
export const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/** styles.css (the Office's and the shell's base layer) without comments, for checks across the two layers. */
export const baseCss = baseRaw.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The classes a stylesheet styles as the subject of a rule: the last compound of each selector, so
 * `.a .b:hover` yields `b` and `.a` is only context. Functional pseudo-class arguments are skipped.
 */
export function subjectClasses(source: string): Set<string> {
  const found = new Set<string>();
  for (const [, header = ''] of source.matchAll(/([^{}]+)\{/g)) {
    if (header.trim().startsWith('@')) continue;
    let flat = header;
    while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '');
    for (const selector of flat.split(',')) {
      const compound = selector.trim().split(/[\s>+~]+/).pop() ?? '';
      for (const [, name = ''] of compound.matchAll(/\.([\w-]+)/g)) found.add(name);
    }
  }
  return found;
}

/** Custom properties declared in a block of declarations, as `--name: value;` pairs. */
export function declaredTokens(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(name, value.trim());
  return map;
}

/** Text of the first `{ ... }` block opened by something matching `header`, nesting respected. */
export function blockAfter(source: string, header: RegExp): string | null {
  const match = header.exec(source);
  if (!match) return null;
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  for (; i < source.length && depth > 0; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
  }
  return source.slice(start, i - 1);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Declarations of the first rule whose selector list is exactly `selector`. */
export function declarationsOf(selector: string, source: string = css): string {
  const header = new RegExp(`(?:^|\\})\\s*${escapeRegExp(selector)}\\s*\\{`);
  const body = blockAfter(source, header);
  if (body === null) throw new Error(`no rule for ${selector}`);
  return body;
}

/** Every `@media` block whose query contains `query`, as text, nesting respected. */
export function mediaBodies(query: string): string[] {
  const found: string[] = [];
  const header = new RegExp(`@media[^{]*${escapeRegExp(query)}[^{]*\\{`, 'g');
  for (const match of css.matchAll(header)) {
    const rest = css.slice(match.index);
    found.push(blockAfter(rest, /^@media[^{]*\{/) ?? '');
  }
  if (found.length === 0) throw new Error(`no @media ${query}`);
  return found;
}

/** The declarations of `selector` inside whichever `@media` block with `query` holds it. */
export function inMedia(query: string, selector: string): string {
  const rule = new RegExp(`(?:^|\\})\\s*${escapeRegExp(selector)}\\s*\\{`);
  for (const block of mediaBodies(query)) {
    const body = blockAfter(block, rule);
    if (body !== null) return body;
  }
  throw new Error(`no ${selector} rule inside @media ${query}`);
}

/** Custom properties from a stylesheet's `:root` block. */
function rootTokens(source: string): Map<string, string> {
  const body = blockAfter(source.replace(/\/\*[\s\S]*?\*\//g, ''), /:root\s*\{/);
  if (body === null) throw new Error('no :root block');
  const map = new Map<string, string>();
  for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(name, value.trim());
  return map;
}

/** The tokens in force on the page: styles.css's, then spine.css's on top, as the cascade loads them. */
export function tokens(): Map<string, string> {
  return new Map([...rootTokens(baseRaw), ...rootTokens(raw)]);
}

export function color(name: string): string {
  const value = tokens().get(name);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a #rrggbb token: ${value}`);
  return value;
}

type Rgb = readonly [number, number, number];

export function rgb(hex: string): Rgb {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

/** WCAG 2.x relative luminance of an sRGB colour. */
export function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function contrastHex(a: string, b: string): number {
  return contrast(rgb(a), rgb(b));
}

/** `fg` at opacity `alpha` over the opaque `bg`, composited in sRGB as a browser does. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return [mix(fg[0], bg[0]), mix(fg[1], bg[1]), mix(fg[2], bg[2])];
}
