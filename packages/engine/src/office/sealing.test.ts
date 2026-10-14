import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

it.each(['secret', 'payoff', 'line'])('the sealing command refuses a reserved document changed to %s', kind => {
  const scratch = mkdtempSync(join(tmpdir(), 'office-seal-guard-'));
  try {
    const lore = join(scratch, 'lore');
    const content = join(lore, 'content', 'certification-office');
    const output = join(scratch, 'out');
    mkdirSync(content, { recursive: true });
    writeFileSync(join(content, 'office-01.json'), JSON.stringify({
      id: 'office-01', kind, body: ['Sample paragraph.'], token: 'sample-key',
    }));
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      !name.startsWith('VITEST') && !name.startsWith('UNHELD_')));
    const run = spawnSync(process.execPath, ['scripts/seal-content.ts', '--out', output], {
      cwd: REPO, env: { ...inherited, UNHELD_LORE_DIR: lore }, encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(run.stdout + run.stderr).toContain('Office document is not a memo');
    expect(existsSync(join(output, 'certification-office.sealed.json'))).toBe(false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60_000);
