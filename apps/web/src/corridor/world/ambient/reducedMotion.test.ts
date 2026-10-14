import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Under reduced motion nothing in the lobby moves (ADR 0004). The scheduler asks for no windows at
 * all (schedule.test.ts); this is the second line: every frame callback that reads the ambient
 * clock leaves before it does, so a component added or edited later cannot animate against the
 * visitor's preference even if a clock grants it a window. Source-level because the callbacks run
 * only inside a live WebGL frame loop.
 */

const FILES = ['AmbientLife.tsx', '../Board.tsx'].map((f) => new URL(f, import.meta.url));
const MOTION_READ = /ambient\.(now|active)\(|\bage\(|windowAge\(|swayAge\(/;

function frameCallbacks(source: string): string[] {
  const out: string[] = [];
  let at = source.indexOf('useWorldFrame(() => {');
  while (at !== -1) {
    const end = source.indexOf('\n  });', at);
    out.push(source.slice(at, end === -1 ? undefined : end));
    at = source.indexOf('useWorldFrame(() => {', at + 1);
  }
  return out;
}

describe('reduced motion in the lobby components', () => {
  it('finds the frame callbacks it is meant to guard', () => {
    const counts = FILES.map((f) => frameCallbacks(readFileSync(f, 'utf8')).length);
    // Seven ambient components in AmbientLife (fan, clock, tag, dust, reflection, mobile, shimmer), and the board's paper corner.
    expect(counts[0]).toBeGreaterThanOrEqual(7);
    expect(counts[1]).toBeGreaterThanOrEqual(1);
  });

  it('every callback that reads the ambient clock returns on reducedMotion first', () => {
    for (const file of FILES) {
      for (const body of frameCallbacks(readFileSync(file, 'utf8'))) {
        const read = body.search(MOTION_READ);
        if (read === -1) continue;
        const guard = body.search(/if \((?:!?\w+(?:\.current)? \|\| )?reducedMotion|reducedMotion(?: \|\|| \)) /);
        expect(guard, `${file.pathname.split('/').pop()}: a frame callback reads the ambient clock with no reducedMotion guard:\n${body.slice(0, 160)}`).toBeGreaterThanOrEqual(0);
        expect(guard, `${file.pathname.split('/').pop()}: reducedMotion is checked only after the clock is read:\n${body.slice(0, 160)}`).toBeLessThan(read);
      }
    }
  });
});
