import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { bayCentreZ } from '../src/corridor/layout.ts';
import { mixAt } from '../src/audio/music/space.ts';
import { door, expectSpine } from './helpers.ts';

/**
 * The listening report: the music's level at the page's audio destination (a mono downmix of what
 * feeds `ctx.destination`) at the places the brief names: near the gramophone, at the first bay, at
 * the third bay, and inside the Office; with the corridor's far end for reference. Walked with the
 * keyboard in the production build, so the position is the camera's, as a visitor has it.
 *
 * Opt-in (TQW_EVIDENCE=1) and written to TQW_EVIDENCE_DIR, never to the repository:
 *   TQW_EVIDENCE=1 TQW_EVIDENCE_DIR=<folder> TQW_E2E_PORT=<port> npx playwright test e2e/gramophone-listening.spec.ts --project=desktop
 */
test.skip(!process.env['TQW_EVIDENCE'] || !process.env['TQW_EVIDENCE_DIR'], 'set TQW_EVIDENCE=1 and TQW_EVIDENCE_DIR');
const DIR = process.env['TQW_EVIDENCE_DIR'] ?? '';

const canvas = (page: Page) => page.locator('.tqw-corridor-canvas');

async function pose(page: Page): Promise<{ x: number; z: number; yaw: number }> {
  const [x, z, yaw] = ((await canvas(page).getAttribute('data-pose')) ?? '0,0,0').split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw! };
}

async function tap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __ctx?: { __an?: AnalyserNode }; __rms(): { rms: number; peak: number } | null };
    const Original = w.AudioContext;
    const connect = AudioNode.prototype.connect;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        const analyser = this.createAnalyser();
        analyser.fftSize = 32768;
        analyser.smoothingTimeConstant = 0;
        (this as unknown as { __an: AnalyserNode }).__an = analyser;
        w.__ctx = this as unknown as { __an?: AnalyserNode };
      }
    };
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, destination: AudioNode, ...rest: unknown[]) {
      const result = (connect as (...a: unknown[]) => unknown).call(this, destination, ...rest);
      const ctx = this.context as AudioContext & { __an?: AnalyserNode };
      try {
        if (destination === ctx.destination && ctx.__an && this !== ctx.__an) (connect as (this: AudioNode, to: AudioNode) => AudioNode).call(this, ctx.__an);
      } catch {
        // A probe must never break the page.
      }
      return result;
    };
    // The page's own `new Audio()` elements, so a test can say whether the record is paused.
    const Element = window.Audio as unknown as { new (src?: string): HTMLAudioElement };
    const seen: HTMLAudioElement[] = [];
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios = seen;
    (window as unknown as { Audio: unknown }).Audio = class extends Element {
      constructor(src?: string) {
        super(src);
        seen.push(this as unknown as HTMLAudioElement);
      }
    };
    const buffer = new Float32Array(32768);
    w.__rms = () => {
      const analyser = w.__ctx?.__an;
      if (!analyser) return null;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      let peak = 0;
      for (const s of buffer) {
        sum += s * s;
        peak = Math.max(peak, Math.abs(s));
      }
      return { rms: Math.sqrt(sum / buffer.length), peak };
    };
  });
}

async function measure(page: Page, seconds: number): Promise<{ rmsDb: number; peakDb: number }> {
  const powers: number[] = [];
  let peak = 0;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const s = await page.evaluate(() => (window as unknown as { __rms(): { rms: number; peak: number } | null }).__rms());
    if (s) {
      powers.push(s.rms ** 2);
      peak = Math.max(peak, s.peak);
    }
    await page.waitForTimeout(250);
  }
  const mean = powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length);
  return { rmsDb: 10 * Math.log10(mean + 1e-18), peakDb: 20 * Math.log10(peak + 1e-12) };
}

/** Hold a key until the pose satisfies `done`, then release it. */
async function walk(page: Page, key: string, done: (p: { x: number; z: number; yaw: number }) => boolean): Promise<void> {
  await page.keyboard.down(key);
  await expect.poll(async () => done(await pose(page)), { timeout: 240_000, intervals: [50] }).toBe(true);
  await page.keyboard.up(key);
  await page.waitForTimeout(700);
}

test('the music at the near, first-bay, third-bay and far positions, and inside the Office', async ({ page }) => {
  test.setTimeout(1_500_000);
  mkdirSync(DIR, { recursive: true });
  await tap(page);
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
  await expectSpine(page, 'corridor');
  await expect(page.locator('canvas[data-gramophone="ready"]')).toHaveCount(1, { timeout: 60_000 });
  const v = page.viewportSize()!;
  await page.mouse.click(v.width / 2, v.height * 0.6);
  await expect(page.locator('.tqw-gramophone__reading')).toContainText('Playing:', { timeout: 30_000 });
  await page.waitForTimeout(6000);

  const rows: { place: string; pose: string; distanceM: number; modelDb: number; rmsDbfs: number; peakDbfs: number }[] = [];
  const record = async (place: string, seconds = 12): Promise<void> => {
    const p = await pose(page);
    const mix = mixAt({ x: p.x, z: p.z, yawDeg: p.yaw });
    const m = await measure(page, seconds);
    rows.push({ place, pose: `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(0)}`, distanceM: Number(mix.distance.toFixed(2)), modelDb: Number(mix.gainDb.toFixed(1)), rmsDbfs: Number(m.rmsDb.toFixed(1)), peakDbfs: Number(m.peakDb.toFixed(1)) });
    // Written as it goes: a walk this long on a loaded machine should not lose its earlier rows to a late failure.
    save();
  };
  const save = (): void => writeFileSync(`${DIR}/gramophone-levels.json`, `${JSON.stringify(rows, null, 2)}\n`);

  // The hand-over, at the head of the first bay.
  await record('the hand-over (the first bay\'s near end)');
  // Down the corridor: the first bay's centre, the third bay's centre, and the far end of the walk.
  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(0));
  await record('the first bay, at its centre');
  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(2));
  await record('the third bay, at its centre');
  await walk(page, 'ArrowUp', (p) => p.z <= -17.5);
  await record('the far end of the walk');
  // Back into the lobby, along the middle, as near as the middle line allows.
  await walk(page, 'ArrowDown', (p) => p.z >= 2.2);
  await record('the lobby, beside the gramophone, on the middle line');
  // The room tone alone: the needle lifted.
  await page.locator('.tqw-gramophone__action[data-target="needle"]').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForTimeout(2500);
  await record('the lobby with the needle up (the corridor\'s room tone)', 8);
  await page.locator('.tqw-gramophone__action[data-target="needle"]').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.locator('.tqw-gramophone__reading')).toContainText('Playing:', { timeout: 30_000 });
  await page.waitForTimeout(4000);

  // Inside the Office: the music is gone.
  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(0));
  // The way a keyboard visitor enters: the door's DOM equivalent takes focus, then Enter.
  await door(page, 'The Certification Office', 'open').focus();
  await door(page, 'The Certification Office', 'open').press('Enter');
  await expectSpine(page, 'chamber');
  await page.waitForTimeout(6000);
  const office = await measure(page, 12);
  rows.push({ place: 'inside the Office', pose: 'chamber', distanceM: Number.NaN, modelDb: Number.NaN, rmsDbfs: Number(office.rmsDb.toFixed(1)), peakDbfs: Number(office.peakDb.toFixed(1)) });

  save();
  for (const r of rows) console.log(`${r.place.padEnd(58)} ${r.pose.padEnd(14)} ${String(r.distanceM).padStart(6)} m  model ${String(r.modelDb).padStart(6)} dB   RMS ${r.rmsDbfs.toFixed(1).padStart(6)} dBFS  peak ${r.peakDbfs.toFixed(1).padStart(6)} dBFS`);
  expect(rows.length).toBeGreaterThan(5);
});

/** Power subtraction: what is left of a total once a known floor is taken away. */
const without = (totalDb: number, floorDb: number): number => 10 * Math.log10(Math.max(1e-12, 10 ** (totalDb / 10) - 10 ** (floorDb / 10)));

test('the third bay against its own room tone, and the music\'s element inside the Office', async ({ page }) => {
  test.setTimeout(1_500_000);
  mkdirSync(DIR, { recursive: true });
  await tap(page);
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
  await expectSpine(page, 'corridor');
  await expect(page.locator('canvas[data-gramophone="ready"]')).toHaveCount(1, { timeout: 60_000 });
  const v = page.viewportSize()!;
  await page.mouse.click(v.width / 2, v.height * 0.6);
  await expect(page.locator('.tqw-gramophone__reading')).toContainText('Playing:', { timeout: 30_000 });
  await page.waitForTimeout(6000);
  const elements = (): Promise<{ count: number; paused: boolean[]; time: number[] }> =>
    page.evaluate(() => {
      const list = (window as unknown as { __audios: HTMLAudioElement[] }).__audios;
      return { count: list.length, paused: list.map((a) => a.paused), time: list.map((a) => Number(a.currentTime.toFixed(1))) };
    });
  const needle = page.locator('.tqw-gramophone__action[data-target="needle"]');

  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(2));
  const playing = await measure(page, 12);
  const playingElements = await elements();
  await needle.evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForTimeout(2500);
  const tone = await measure(page, 12);
  const musicAlone = without(playing.rmsDb, tone.rmsDb);

  await needle.evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.locator('.tqw-gramophone__reading')).toContainText('Playing:', { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await walk(page, 'ArrowDown', (p) => p.z >= bayCentreZ(0));
  await door(page, 'The Certification Office', 'open').focus();
  await door(page, 'The Certification Office', 'open').press('Enter');
  await expectSpine(page, 'chamber');
  await page.waitForTimeout(6000);
  const office = await measure(page, 12);
  const officeElements = await elements();

  const result = {
    thirdBay: { playingRmsDbfs: Number(playing.rmsDb.toFixed(1)), roomToneRmsDbfs: Number(tone.rmsDb.toFixed(1)), musicAloneRmsDbfs: Number(musicAlone.toFixed(1)), elements: playingElements },
    office: { rmsDbfs: Number(office.rmsDb.toFixed(1)), peakDbfs: Number(office.peakDb.toFixed(1)), elements: officeElements },
  };
  writeFileSync(`${DIR}/gramophone-third-bay-and-office.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  // One element, playing in the corridor, and paused once the visitor is in the chamber.
  expect(playingElements.count).toBe(1);
  expect(playingElements.paused).toEqual([false]);
  expect(officeElements.paused).toEqual([true]);
});
