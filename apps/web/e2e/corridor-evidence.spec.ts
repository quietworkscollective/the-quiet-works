import { expect, test, type Page } from '@playwright/test';
import { CHAMBER_SLOTS, CORRIDOR, HANDOVER } from '../src/corridor/layout.ts';
import { door, expectSpine } from './helpers.ts';

/**
 * Captures the camera lane's screenshots for art review: the page walk-in at the hero, 30%, 65%
 * and 100% of the run (and engaged), door framing, a door opening, the sealed rattle, the return, reduced motion and
 * the touch controls. Opt-in (TQW_EVIDENCE=1) and written to TQW_EVIDENCE_DIR, never to the repo.
 */
test.skip(!process.env['TQW_EVIDENCE'] || !process.env['TQW_EVIDENCE_DIR'], 'set TQW_EVIDENCE=1 and TQW_EVIDENCE_DIR');

const DIR = process.env['TQW_EVIDENCE_DIR'] ?? '';
const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

async function pose(page: Page): Promise<{ x: number; z: number; yaw: number }> {
  const [x, z, yaw] = ((await canvas(page).getAttribute('data-pose')) ?? '0,0,0').split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw! };
}

async function frames(page: Page): Promise<number> {
  return Number((await canvas(page).getAttribute('data-frames')) ?? 0);
}

async function settle(page: Page, quietMs = 500): Promise<void> {
  let last = await frames(page);
  let since = Date.now();
  while (Date.now() - since < quietMs) {
    await page.waitForTimeout(50);
    const now = await frames(page);
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
}

const shot = (page: Page, project: string, name: string) => page.screenshot({ path: `${DIR}/${project}-${name}.png` });

async function toHandOver(page: Page): Promise<void> {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
  await expectSpine(page, 'corridor');
  await expect.poll(async () => Math.abs((await pose(page)).z - HANDOVER.z) < 0.01, { timeout: 10_000 }).toBe(true);
  await settle(page);
  await engage(page);
}

/** Arriving by scroll captures nothing (ADR 0003); a visitor who means to walk presses Enter. */
async function engage(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  await expect(page.locator('.tqw-site')).toHaveAttribute('data-engaged', 'true');
  await settle(page);
}

async function reach(page: Page, x: number, z: number, yaw: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const p = await pose(page);
        return Math.abs(p.x - x) < 0.02 && Math.abs(p.z - z) < 0.02 && Math.abs(p.yaw - yaw) < 0.3;
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBe(true);
  await settle(page);
}

test('the page walk-in: hero, 30%, 65% (the hand-over, behind the veil), 100%, and engaged', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await expect(canvas(page)).toHaveAttribute('data-pose', /,/);
  // The hero drifts, so it never goes quiet: let it run a while and take it mid-arc.
  await page.waitForTimeout(6000);
  await shot(page, p, '01-walkin-00-hero-p0');
  let n = 1;
  for (const f of [0.12, 0.3, 0.55, 0.62, 0.65]) {
    await page.evaluate((fraction) => window.scrollTo(0, window.innerHeight * 2.5 * fraction), f);
    await settle(page);
    await shot(page, p, `01-walkin-${String(n).padStart(2, '0')}-p${Math.round(f * 100)}`);
    n += 1;
  }
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
  await expectSpine(page, 'corridor');
  await settle(page, 900);
  await shot(page, p, `01-walkin-${String(n).padStart(2, '0')}-p100-handover`);
  // Engaged: walking in the window.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2200);
  await page.keyboard.up('KeyW');
  await settle(page);
  await shot(page, p, `01-walkin-${String(n + 1).padStart(2, '0')}-engaged-walking`);
});

test('walking, door focus and the framed views', async ({ page }, info) => {
  const p = info.project.name;
  await toHandOver(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyW');
  await settle(page);
  await shot(page, p, '02-walked-3m');
  await toHandOver(page);

  const office = CHAMBER_SLOTS.find((s) => s.chamber === 'certification-office')!;
  await door(page, 'The Certification Office', 'open').focus();
  await page.waitForTimeout(3500);
  await shot(page, p, '03-glide-midway-office');
  await reach(page, CORRIDOR.width / 2 - 1.4, office.z, 90);
  await shot(page, p, '04-framed-office');

  await door(page, 'The Apartment', 'sealed').focus();
  await reach(page, -(CORRIDOR.width / 2 - 1.4), CHAMBER_SLOTS.find((s) => s.chamber === 'apartment')!.z, -90);
  await shot(page, p, '05-framed-apartment');
  await door(page, 'The Great Atrium', 'sealed').focus();
  await reach(page, CORRIDOR.width / 2 - 1.4, CHAMBER_SLOTS.find((s) => s.chamber === 'great-atrium')!.z, 90);
  await shot(page, p, '06-framed-atrium-far-end');
});

test('a door opening, frame by frame, and the sealed rattle', async ({ page }, info) => {
  const p = info.project.name;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/assets\/certification-office-[\w-]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await toHandOver(page);
  await door(page, 'The Apartment', 'sealed').focus();
  await reach(page, -(CORRIDOR.width / 2 - 1.4), CHAMBER_SLOTS.find((s) => s.chamber === 'apartment')!.z, -90);
  await door(page, 'The Apartment', 'sealed').press('Enter');
  await page.waitForTimeout(120);
  await shot(page, p, '07-sealed-rattle-a');
  await page.waitForTimeout(120);
  await shot(page, p, '07-sealed-rattle-b');
  await settle(page);

  const office = CHAMBER_SLOTS.find((s) => s.chamber === 'certification-office')!;
  await door(page, 'The Certification Office', 'open').focus();
  await reach(page, CORRIDOR.width / 2 - 1.4, office.z, 90);
  await shot(page, p, '08-open-00-before');
  await door(page, 'The Certification Office', 'open').press('Enter');
  const started = Date.now();
  for (let i = 1; i <= 10; i += 1) {
    await shot(page, p, `08-open-${String(i).padStart(2, '0')}-t${String(Date.now() - started).padStart(4, '0')}ms`);
  }
  await settle(page, 800);
  await shot(page, p, '08-open-11-doorway');
  release();
  await expectSpine(page, 'chamber');
});

test('coming back: facing the door as it closes', async ({ page }, info) => {
  const p = info.project.name;
  await toHandOver(page);
  await door(page, 'The Certification Office', 'open').focus();
  await door(page, 'The Certification Office', 'open').press('Enter');
  await expectSpine(page, 'chamber');
  await page.goBack();
  await expectSpine(page, 'corridor');
  await page.waitForTimeout(150);
  await shot(page, p, '09-return-00-door-open');
  await page.waitForTimeout(500);
  await shot(page, p, '09-return-01-closing');
  await settle(page, 900);
  await shot(page, p, '09-return-02-closed');
});

test('touch controls and reduced motion views', async ({ page, isMobile }, info) => {
  const p = info.project.name;
  await toHandOver(page);
  if (isMobile) await shot(page, p, '10-touch-controls');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await settle(page);
  await shot(page, p, '11-reduced-landing');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
  await expectSpine(page, 'corridor');
  await settle(page);
  await shot(page, p, '11-reduced-handover');
  await engage(page);
  await door(page, 'The Certification Office', 'open').focus();
  await expect.poll(async () => Math.abs((await pose(page)).yaw - 90) < 0.3, { timeout: 10_000 }).toBe(true);
  await settle(page);
  await shot(page, p, '11-reduced-office-view');
});
