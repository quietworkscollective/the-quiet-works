import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the cue label\'s style', () => {
  const css = readFileSync(new URL('./gramophone.css', import.meta.url), 'utf8');
  /** The declarations of the rule whose selector is exactly `selector` (at the start of a line). */
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
    if (!match) throw new Error(`no rule for ${selector}`);
    return match[1] ?? '';
  };

  it('holds the brief\'s numbers: 16 to 18 px type, a 44 px target, a 120 ms fade, a 2 px focus indicator', () => {
    expect(css).toMatch(/font:\s*400 17px/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/transition:\s*opacity 120ms/);
    expect(css).toMatch(/outline:\s*2px solid/);
  });

  it('shows the pointer cursor over the machine and the records, and nowhere else', () => {
    expect(css).toMatch(/\.tqw-corridor-canvas\[data-over='gramophone'\] \{[^}]*cursor:\s*pointer/);
  });

  it('takes the pointer only while the cue is shown, and hides the controls until one has focus', () => {
    expect(rule('.tqw-gramophone__cue')).toMatch(/pointer-events:\s*none/);
    expect(rule(".tqw-gramophone__cue[data-shown='true']")).toMatch(/pointer-events:\s*auto/);
    expect(rule('.tqw-gramophone-island')).toMatch(/pointer-events:\s*none/);
    expect(css).toMatch(/\.tqw-gramophone__action:not\(:focus-visible\)/);
  });
});
