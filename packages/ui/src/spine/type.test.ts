import mainSource from '../../../../apps/web/src/main.tsx?raw';
import manifestSource from '../../../../apps/web/scripts/assets.manifest.json?raw';
import { css, declarationsOf, tokens } from './cssTestUtils.ts';

describe('the public type system', () => {
  it('self-hosts only IBM Plex Sans Latin 400, 500 and 700', () => {
    const weights = [...mainSource.matchAll(/@fontsource\/ibm-plex-sans\/latin-(\d+)\.css/g)].map(([, weight]) => weight);
    expect(weights).toEqual(['400', '500', '700']);
  });

  it('audits the self-hosted font files against the package licence', () => {
    const manifest = JSON.parse(manifestSource) as { entries: Array<Record<string, string>> };
    const font = manifest.entries.find((entry) => entry.name === 'IBM Plex Sans');
    expect(font).toMatchObject({
      pattern: '^ibm-plex-sans-latin-(?:400|500|700)-normal-[\\w-]+\\.woff2?$',
      source: '@fontsource/ibm-plex-sans',
      licence: 'OFL-1.1',
      licenceFile: 'node_modules/@fontsource/ibm-plex-sans/LICENSE',
    });
  });

  it('uses normal width Plex on the public page and keeps condensed Plex in the world', () => {
    expect(tokens().get('--font-public')).toContain('IBM Plex Sans');
    expect(tokens().get('--font-ui')).toContain('IBM Plex Sans Condensed');
    expect(declarationsOf('.tqw-site')).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(declarationsOf('.tqw-app')).toMatch(/font-family:\s*var\(--font-ui\)/);
  });

  it('sets the wordmark and controls in Plex Sans, with Newsreader for the tagline and titles', () => {
    expect(declarationsOf('.tqw-hero__name')).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(declarationsOf('.tqw-menu__item')).toMatch(/font-family:\s*var\(--font-public\)/);
    expect(declarationsOf('.tqw-hero__tagline')).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(declarationsOf('.tqw-archive__title,\n.tqw-details__title')).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(css).toContain('var(--font-public)');
  });
});
