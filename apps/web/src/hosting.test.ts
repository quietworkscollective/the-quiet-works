import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** wrangler.jsonc with its whole-line comments removed. */
function wranglerConfig(): Record<string, unknown> {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const json = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(json) as Record<string, unknown>;
}

describe('Cloudflare Worker config', () => {
  // wrangler defaults workers_dev to true, so leaving the key out makes every deploy
  // publish the site at <name>.<subdomain>.workers.dev. Public URLs stay off until
  // Cloudflare Access protects them and the founder approves going live.
  it('keeps the workers.dev and Preview URLs disabled on deploy', () => {
    const config = wranglerConfig();
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });

  it('names the Worker connected to Workers Builds', () => {
    expect(wranglerConfig().name).toBe('the-quiet-works');
  });
});
