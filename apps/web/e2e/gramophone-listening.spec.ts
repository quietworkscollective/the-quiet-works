import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { bayCentreZ, WALK_LIMITS } from '../src/corridor/layout.ts';
import { mixAt } from '../src/audio/music/space.ts';
import { door, expectSpine } from './helpers.ts';

/**
 * The listening report: the music's level at the page's audio destination (a mono downmix of what
 * feeds `ctx.destination`) while walking from the lobby's hand-over point through the first, third
 * and sixth bays to the far end. A separate graph test pins the near-gramophone lobby reference.
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
    const w = window as unknown as { AudioContext: typeof AudioContext; __ctx?: { __an?: AnalyserNode; __meters?: Array<{ kind: string; analyzer: AnalyserNode }> }; __tapStats: { compressors: Array<{ threshold: number; ratio: number }>; created: DynamicsCompressorNode[]; bedTaps: number }; __rms(): { rms: number; peak: number; meters: Array<{ kind: string; rms: number }> } | null };
    const Original = w.AudioContext;
    const connect = AudioNode.prototype.connect;
    const bedTapped = new WeakSet<AudioNode>();
    w.__tapStats = { compressors: [], created: [], bedTaps: 0 };
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        const analyser = this.createAnalyser();
        analyser.fftSize = 32768;
        analyser.smoothingTimeConstant = 0;
        (this as unknown as { __an: AnalyserNode; __meters: Array<{ kind: string; analyzer: AnalyserNode }> }).__an = analyser;
        (this as unknown as { __meters: Array<{ kind: string; analyzer: AnalyserNode }> }).__meters = [];
        w.__ctx = this as unknown as { __an?: AnalyserNode; __meters?: Array<{ kind: string; analyzer: AnalyserNode }> };
      }

      override createDynamicsCompressor(): DynamicsCompressorNode {
        const node = super.createDynamicsCompressor();
        w.__tapStats.created.push(node);
        return node;
      }
    };
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, destination: AudioNode, ...rest: unknown[]) {
      const result = (connect as (...a: unknown[]) => unknown).call(this, destination, ...rest);
      const ctx = this.context as AudioContext & { __an?: AnalyserNode; __meters?: Array<{ kind: string; analyzer: AnalyserNode }> };
      if ('threshold' in this && 'ratio' in this) w.__tapStats.compressors.push({ threshold: (this as DynamicsCompressorNode).threshold.value, ratio: (this as DynamicsCompressorNode).ratio.value });
      if (
        this instanceof DynamicsCompressorNode &&
        this.threshold.value === -26 &&
        this.ratio.value === 10 &&
        !bedTapped.has(this) &&
        ctx.__meters
      ) {
        bedTapped.add(this);
        w.__tapStats.bedTaps += 1;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32768;
        analyser.smoothingTimeConstant = 0;
        ctx.__meters.push({ kind: `compressor-${this.threshold.value}-${this.ratio.value}-${w.__tapStats.bedTaps}`, analyzer: analyser });
        (connect as (this: AudioNode, to: AudioNode) => AudioNode).call(this, analyser);
      }
      if (this instanceof MediaElementAudioSourceNode && ctx.__meters) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32768;
        analyser.smoothingTimeConstant = 0;
        ctx.__meters.push({ kind: 'media-source', analyzer: analyser });
        (connect as (this: AudioNode, to: AudioNode) => AudioNode).call(this, analyser);
      }
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
    const buffer = new Float32Array(new ArrayBuffer(32768 * Float32Array.BYTES_PER_ELEMENT));
    const bedBuffer = new Float32Array(new ArrayBuffer(32768 * Float32Array.BYTES_PER_ELEMENT));
    w.__rms = () => {
      const ctx = w.__ctx;
      if (!ctx?.__an || !ctx.__meters) return null;
      const levels = (analyser: AnalyserNode, target: Float32Array<ArrayBuffer>): { rms: number; peak: number } => {
        analyser.getFloatTimeDomainData(target);
        let sum = 0;
        let peak = 0;
        for (const s of target) {
          sum += s * s;
          peak = Math.max(peak, Math.abs(s));
        }
        return { rms: Math.sqrt(sum / target.length), peak };
      };
      const main = levels(ctx.__an, buffer);
      const meters = ctx.__meters.map(({ kind, analyzer }) => ({ kind, rms: levels(analyzer, bedBuffer).rms }));
      return { ...main, meters };
    };
  });
}

async function measure(page: Page, seconds: number): Promise<{ rmsDb: number; peakDb: number; meterDb: Array<{ kind: string; db: number }> }> {
  const powers: number[] = [];
  const meterPowers = new Map<string, number[]>();
  let peak = 0;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const s = await page.evaluate(() => (window as unknown as { __rms(): { rms: number; peak: number; meters: Array<{ kind: string; rms: number }> } | null }).__rms());
    if (s) {
      powers.push(s.rms ** 2);
      for (const meter of s.meters) meterPowers.set(meter.kind, [...(meterPowers.get(meter.kind) ?? []), meter.rms ** 2]);
      peak = Math.max(peak, s.peak);
    }
    await page.waitForTimeout(250);
  }
  const mean = powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length);
  const meterDb = [...meterPowers.entries()].map(([kind, powers]) => ({ kind, db: 10 * Math.log10(powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length) + 1e-18) }));
  return { rmsDb: 10 * Math.log10(mean + 1e-18), peakDb: 20 * Math.log10(peak + 1e-12), meterDb };
}

/** Hold a key until the pose satisfies `done`, then release it. */
async function walk(page: Page, key: string, done: (p: { x: number; z: number; yaw: number }) => boolean): Promise<void> {
  await page.keyboard.down(key);
  await expect.poll(async () => done(await pose(page)), { timeout: 240_000, intervals: [250, 500] }).toBe(true);
  await page.keyboard.up(key);
  await page.waitForTimeout(700);
}

async function turn(page: Page, key: string, done: (p: { x: number; z: number; yaw: number }) => boolean): Promise<void> {
  await page.keyboard.down(key);
  await expect.poll(async () => done(await pose(page)), { timeout: 60_000, intervals: [250, 500] }).toBe(true);
  await page.keyboard.up(key);
  await page.waitForTimeout(500);
}

async function startRecord(page: Page): Promise<void> {
  const site = page.locator('.tqw-site');
  if (await site.getAttribute('data-engaged') !== 'true') {
    await page.getByRole('button', { name: 'Enter The Quiet Works' }).click();
  }
  await expect(site).toHaveAttribute('data-engaged', 'true');
  await expectSpine(page, 'corridor');
  await expect(page.locator('.tqw-corridor')).not.toHaveAttribute('inert', '');
  // Enter is the deliberate gesture that unlocks the desk; its first record is the corridor bed.
  await expect(page.locator('.tqw-gramophone__reading')).toContainText('Playing:', { timeout: 30_000 });
  await walk(page, 'ArrowUp', (p) => p.z <= 3.2);
  await turn(page, 'ArrowLeft', (p) => p.yaw <= -85);
  await walk(page, 'ArrowUp', (p) => p.x <= -2);
}

test('the lobby gramophone and corridor bed stay within their level targets', async ({ page }) => {
  test.setTimeout(1_500_000);
  mkdirSync(DIR, { recursive: true });
  await tap(page);
  await page.goto('/');
  await expectSpine(page, 'entrance');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.6));
  await expectSpine(page, 'corridor');
  await expect(page.locator('canvas[data-gramophone="ready"]')).toHaveCount(1, { timeout: 60_000 });
  await startRecord(page);
  await page.waitForTimeout(6000);

  const rows: { place: string; pose: string; distanceM: number; modelDb: number; rmsDbfs: number; bedRmsDbfs: number; peakDbfs: number }[] = [];
  const record = async (place: string, seconds = 8): Promise<void> => {
    const p = await pose(page);
    const mix = mixAt({ x: p.x, z: p.z, yawDeg: p.yaw });
    const m = await measure(page, seconds);
    const bedMeter = m.meterDb.filter(({ kind }) => kind.startsWith('compressor-')).sort((a, b) => b.db - a.db)[0];
    const bedRmsDbfs = mix.bed > 0 ? (bedMeter?.db ?? Number.NEGATIVE_INFINITY) + 20 * Math.log10(mix.bed) : Number.NEGATIVE_INFINITY;
    rows.push({ place, pose: `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(0)}`, distanceM: Number(mix.distance.toFixed(2)), modelDb: Number(mix.gainDb.toFixed(1)), rmsDbfs: Number(m.rmsDb.toFixed(1)), bedRmsDbfs: Number(bedRmsDbfs.toFixed(1)), peakDbfs: Number(m.peakDb.toFixed(1)) });
    // Written as it goes: a walk this long on a loaded machine should not lose its earlier rows to a late failure.
    save();
  };
  const save = (): void => writeFileSync(`${DIR}/gramophone-levels.json`, `${JSON.stringify(rows, null, 2)}\n`);

  // The hand-over's first deliberate control unlocks audio; this is one metre from the source.
  await record('the lobby, one metre from the gramophone');
  // Face the corridor and return to its central walking line before measuring each bay.
  await turn(page, 'ArrowRight', (p) => p.yaw >= 85);
  await walk(page, 'ArrowUp', (p) => p.x >= -0.8);
  await turn(page, 'ArrowLeft', (p) => Math.abs(p.yaw) <= 5);
  // Down the corridor: the first bay's centre, the third bay's centre, the sixth bay, and the end of the walk.
  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(0));
  await record('the first bay, at its centre');
  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(2));
  await record('the third bay, at its centre');
  await walk(page, 'ArrowUp', (p) => p.z <= bayCentreZ(5));
  await record('the sixth bay, at its centre');
  await walk(page, 'ArrowUp', (p) => p.z <= WALK_LIMITS.minZ + 0.08);
  await record('the far end of the walk');

  save();
  for (const r of rows) console.log(`${r.place.padEnd(58)} ${r.pose.padEnd(14)} ${String(r.distanceM).padStart(6)} m  model ${String(r.modelDb).padStart(6)} dB   total ${r.rmsDbfs.toFixed(1).padStart(6)} dBFS  bed ${r.bedRmsDbfs.toFixed(1).padStart(6)} dBFS  peak ${r.peakDbfs.toFixed(1).padStart(6)} dBFS`);
  for (const row of rows.filter(({ place }) => !place.includes('one metre from the gramophone'))) {
    expect(row.bedRmsDbfs, `${row.place}, isolated corridor bed`).toBeGreaterThanOrEqual(-30);
    expect(row.bedRmsDbfs, `${row.place}, the bed stays under the local record`).toBeLessThanOrEqual(-24);
  }
  const near = rows.find(({ place }) => place.includes('one metre from the gramophone'));
  expect(near?.rmsDbfs ?? -Infinity).toBeGreaterThanOrEqual(-25);
  expect(near?.rmsDbfs ?? Infinity).toBeLessThanOrEqual(-19);
  expect(rows).toHaveLength(5);
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
  await startRecord(page);
  await page.waitForTimeout(6000);
  const elements = (): Promise<{ count: number; paused: boolean[]; time: number[] }> =>
    page.evaluate(() => {
      const list = (window as unknown as { __audios: HTMLAudioElement[] }).__audios;
      return { count: list.length, paused: list.map((a) => a.paused), time: list.map((a) => Number(a.currentTime.toFixed(1))) };
    });
  const needle = page.locator('.tqw-gramophone__action[data-target="needle"]');

  await turn(page, 'ArrowRight', (p) => p.yaw >= 85);
  await walk(page, 'ArrowUp', (p) => p.x >= -0.8);
  await turn(page, 'ArrowLeft', (p) => Math.abs(p.yaw) <= 5);
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
