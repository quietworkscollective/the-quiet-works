import { render, screen } from '@testing-library/react';
import { Mark, MARK } from './Mark.tsx';
import favicon from '../../../../apps/web/public/favicon.svg?raw';
import brandAssets from '../../../../apps/web/scripts/brand-assets.mjs?raw';
import manifestRaw from '../../../../apps/web/scripts/assets.manifest.json?raw';
import ccBy from '../../../../LICENSES/CC-BY-4.0.txt?raw';

describe('Mark', () => {
  it('is decorative by default: the text beside it says UNHELD', () => {
    const { container } = render(<Mark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('can name itself when it stands alone', () => {
    render(<Mark title="UNHELD" />);
    expect(screen.getByRole('img', { name: 'UNHELD' })).toBeTruthy();
  });

  it('is square at the size asked for', () => {
    const { container } = render(<Mark size={32} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  it('draws bone-on-coal strokes in the colour of the text it sits in', () => {
    const { container } = render(<Mark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('fill')).toBe('none');
  });
});

/** Reads `M x y V y h dx M x y v dy` into the bar and the two uprights, in grid units. */
function parseMark(path: string) {
  const match = /^M(\d+) (\d+)V(\d+)h(\d+)M(\d+) (\d+)v(\d+)$/.exec(path);
  if (!match) throw new Error(`unexpected mark path: ${path}`);
  const [leftX, leftBottom, barY, barLength, rightX, rightTop, rightLength] = match.slice(1).map(Number) as [
    number, number, number, number, number, number, number,
  ];
  return { leftX, leftBottom, barY, barRight: leftX + barLength, rightX, rightTop, rightBottom: rightTop + rightLength };
}

describe('mark geometry', () => {
  const m = parseMark(MARK.path);
  const half = MARK.stroke / 2;

  it('uses 2 px strokes on a 16-unit grid, so 16 px renders them on whole pixels', () => {
    expect(MARK.stroke).toBe(2);
    expect(MARK.viewBox).toBe('0 0 16 16');
    for (const value of [m.leftX, m.leftBottom, m.barY, m.barRight, m.rightX, m.rightTop, m.rightBottom]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('leaves a 3 px gap at the upper right, between the underside of the bar and the right upright', () => {
    expect(m.rightTop - (m.barY + half)).toBe(3);
    expect(MARK.gap).toBe(3);
  });

  it('keeps the bar over both uprights: it spans the doorway but is not held by the right one', () => {
    expect(m.barRight).toBe(m.rightX + half);
    expect(m.rightTop).toBeGreaterThan(m.barY + half);
  });

  it('stays inside the grid with a pixel of margin', () => {
    expect(m.leftX - half).toBeGreaterThanOrEqual(1);
    expect(m.barY - half).toBeGreaterThanOrEqual(1);
    expect(m.barRight).toBeLessThanOrEqual(15);
    expect(m.leftBottom).toBeLessThanOrEqual(15);
    expect(m.rightBottom).toBeLessThanOrEqual(15);
  });
});

describe('one geometry for every surface', () => {
  it('the favicon draws the in-page mark path, in bone on coal, with the same stroke', () => {
    expect(favicon).toContain(`d="${MARK.path}"`);
    expect(favicon).toContain(`stroke-width="${MARK.stroke}"`);
    expect(favicon.toLowerCase()).toContain('stroke="#ddd5c8"');
    expect(favicon.toLowerCase()).toContain('fill="#151a20"');
    expect(favicon).toContain(`viewBox="${MARK.viewBox}"`);
  });

  it('the script that rasterises the touch icon and app icon draws the same path', () => {
    expect(brandAssets).toContain(`MARK_PATH = '${MARK.path}'`);
  });
});

/** Words that would make a decided licence read as a proposal again. */
const HEDGING = /provisional|placeholder|proposal|proposes|pending|not yet (?:been )?(?:decided|made)|to be decided/i;

describe('the brand files\' licence is a decision, not a proposal', () => {
  const manifest = JSON.parse(manifestRaw) as {
    $comment: string[];
    entries: Array<{ name: string; pattern: string; source: string; licence: string; licenceFile: string; attribution: string }>;
  };
  const inRepo = manifest.entries.filter((entry) => entry.source === 'in-repo');
  // In-repo files are the project's own work, CC BY 4.0: the brand files, the posters and the baked light.
  const brand = inRepo.filter((entry) => entry.licence === 'CC-BY-4.0');
  // Third-party files kept in this repository name their provider (`third-party:ambientCG`); they are
  // not the project's work, so they are never counted as in-repo.
  const thirdParty = manifest.entries.filter((entry) => entry.source.startsWith('third-party:'));

  it('lists the favicon, the touch icon, the app icon, the hero posters and the baked light as the in-repo CC BY files, and nothing else', () => {
    expect(brand.map((entry) => entry.pattern)).toEqual([
      '^favicon\\.svg$',
      '^apple-touch-icon\\.png$',
      '^icon-512\\.png$',
      '^poster-hero-(?:1440x900|412x915)\\.webp$',
      '^(?:corridor|office|codex-room)-[0-9]+-[\\w-]+\\.webp$',
    ]);
  });

  it('holds third-party files kept in the repository to CC0 1.0 or a recorded public-domain dedication, and nothing in-repo to any licence but CC BY', () => {
    // The reviewed licences for third-party files in the repository, each with its text on file.
    const reviewed: Record<string, string> = {
      'CC0-1.0': '../../LICENSES/CC0-1.0.txt',
      'LicenseRef-Public-Domain': '../../LICENSES/Public-Domain-Recordings.txt',
    };
    expect(inRepo.filter((entry) => entry.licence !== 'CC-BY-4.0').map((entry) => entry.name)).toEqual([]);
    expect(thirdParty.length).toBeGreaterThan(0);
    for (const entry of thirdParty) {
      expect(Object.keys(reviewed), entry.name).toContain(entry.licence);
      expect(entry.licenceFile, entry.name).toBe(reviewed[entry.licence]);
    }
  });

  it('licenses each as CC BY 4.0 against the licence text in the repository', () => {
    expect(ccBy).toContain('Attribution 4.0 International');
    for (const entry of brand) {
      expect(entry.licence, entry.name).toBe('CC-BY-4.0');
      expect(entry.licenceFile, entry.name).toBe('../../LICENSES/CC-BY-4.0.txt');
    }
  });

  it('credits the author and states the licence without hedging, and reserves the name and mark', () => {
    for (const entry of brand) {
      expect(entry.attribution, entry.name).toContain('CC BY 4.0');
      expect(entry.attribution, entry.name).toContain('Asiri Dalugoda');
      expect(entry.attribution, entry.name).toContain('LICENSING.md');
      expect(entry.attribution, entry.name).not.toMatch(HEDGING);
    }
  });

  it('says so in the manifest\'s own note and in the script that draws the files', () => {
    const note = manifest.$comment.find((line) => line.startsWith('In-repo brand files')) ?? '';
    expect(note).toContain('CC BY 4.0');
    expect(note).not.toMatch(HEDGING);
    const header = brandAssets.slice(0, brandAssets.indexOf('*/'));
    expect(header).toContain('Creative Commons Attribution 4.0 International');
    expect(header).toContain('LICENSING.md');
    expect(header).toContain('That is a decision');
    expect(header).not.toMatch(HEDGING);
  });
});
