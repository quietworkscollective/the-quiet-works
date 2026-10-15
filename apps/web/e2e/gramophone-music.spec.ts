import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { audioContexts, countAudioContexts, expectSpine, openMenu, closeMenu, site } from './helpers.ts';

/**
 * The lobby gramophone under the production build's Content-Security-Policy (`connect-src 'none'`,
 * `media-src 'self' blob:`): the page makes no request for a record before the first gesture, plays
 * one through an <audio> element after it, the music reaches the page's audio destination (measured
 * there, as the sound desk's own probe is), no policy violation is reported, and muting silences it.
 *
 * The browser is Playwright's Chromium, which plays Opus in WebM and not AAC; the AAC encoding and
 * the choice between them are covered by the unit tests and by `canPlayType` in the page.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const builtHeaders = path.resolve(here, '..', 'dist', '_headers');

/** What the page measures at its audio destination: the last 0.68 s of what feeds `ctx.destination`. */
async function tapDestination(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      AudioContext: typeof AudioContext;
      __ctx?: AudioContext & { __an?: AnalyserNode };
      __violations: string[];
      __rmsDb(): number | null;
    };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    const Original = w.AudioContext;
    const connect = AudioNode.prototype.connect;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        const analyser = this.createAnalyser();
        analyser.fftSize = 32768;
        analyser.smoothingTimeConstant = 0;
        (this as unknown as { __an: AnalyserNode }).__an = analyser;
        w.__ctx = this as AudioContext & { __an?: AnalyserNode };
      }
    };
    // Whatever is connected to the destination is also sent to the analyser.
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, destination: AudioNode, ...rest: unknown[]) {
      const result = (connect as (...a: unknown[]) => unknown).call(this, destination, ...rest);
      const ctx = this.context as AudioContext & { __an?: AnalyserNode };
      try {
        if (destination === ctx.destination && ctx.__an && this !== ctx.__an) (connect as (this: AudioNode, to: AudioNode) => AudioNode).call(this, ctx.__an);
      } catch {
        // The tap is a probe: it must never break the page.
      }
      return result;
    };
    const buffer = new Float32Array(32768);
    w.__rmsDb = () => {
      const analyser = w.__ctx?.__an;
      if (!analyser) return null;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const s of buffer) sum += s * s;
      return 20 * Math.log10(Math.sqrt(sum / buffer.length) + 1e-12);
    };
  });
}

/** The mean power, as dBFS RMS, over `ms` of 250 ms samples. */
async function levelDb(page: Page, ms = 3000): Promise<number> {
  const powers: number[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const db = await page.evaluate(() => (window as unknown as { __rmsDb(): number | null }).__rmsDb());
    if (db !== null) powers.push(10 ** (db / 10));
    await page.waitForTimeout(250);
  }
  const mean = powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length);
  return 10 * Math.log10(mean + 1e-18);
}

const violations = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
const media = (urls: string[]): string[] => urls.filter((u) => /\.(webm|m4a)(\?|$)/.test(u));

/** Native scrolling to the end of the landing: the corridor, as the visitor first has it. */
async function toCorridor(page: Page): Promise<void> {
  await page.goto('/');
  await expectSpine(page, 'entrance');
  // The sticky game window rests at the end of its section; overshooting can clip Menu,
  // whose native scroll-into-view would then return the resting visitor to the entrance.
  await page.evaluate(() => {
    const game = document.getElementById('game')!;
    const window_ = game.querySelector<HTMLElement>('.tqw-game__window')!;
    window.scrollTo(0, game.offsetTop + game.offsetHeight - window_.offsetHeight);
  });
  await expectSpine(page, 'corridor');
  await expect(page.locator('canvas[data-gramophone="ready"]')).toHaveCount(1, { timeout: 60_000 });
}

/** A deliberate click in the scene: the first gesture. */
async function click(page: Page, isMobile: boolean): Promise<void> {
  const v = page.viewportSize()!;
  if (isMobile) await page.touchscreen.tap(v.width / 2, v.height * 0.6);
  else await page.mouse.click(v.width / 2, v.height * 0.6);
}

const gramophoneControl = (page: Page, verb: string) => page.locator('.tqw-gramophone__action', { hasText: verb });
const reading = (page: Page) => page.locator('.tqw-gramophone__reading');

test.describe('the gramophone under the built policy', () => {
  test('the page is built with the policy the audio needs: same-origin media, no connections', async ({ page }) => {
    await page.goto('/');
    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const header = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(readFileSync(builtHeaders, 'utf8'))?.[1]?.trim();
    expect(meta).toBeTruthy();
    // The header adds only frame-ancestors, which a meta policy cannot carry.
    expect(`${meta}; frame-ancestors 'none'`).toBe(header);
    expect(meta).toContain("connect-src 'none'");
    expect(meta).toContain("media-src 'self'");
    expect(meta).not.toContain('unsafe');
  });

  test('before any gesture: no AudioContext, no request for a record, and the verbs are there to read', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await countAudioContexts(page);
    await tapDestination(page);
    await toCorridor(page);
    await page.waitForTimeout(4000);
    expect(await audioContexts(page)).toBe(0);
    expect(media(requested)).toEqual([]);
    expect(await violations(page)).toEqual([]);
    await expect(reading(page)).toHaveText('A gramophone. The needle is up. On the platter: Gymnopédie No. 1, Erik Satie.');
  });

  test('after a click the first record plays through the audio element, reaches the output, makes no violation, and mute silences it', async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    const requested: { url: string; status: number }[] = [];
    page.on('response', (r) => requested.push({ url: r.url(), status: r.status() }));
    await countAudioContexts(page);
    await tapDestination(page);
    await toCorridor(page);

    await click(page, isMobile);
    await expect.poll(() => audioContexts(page), { timeout: 10_000 }).toBe(1);
    // The lead-in, then the record: the file is requested (same origin) and played.
    await expect.poll(() => media(requested.map((r) => r.url)).length, { timeout: 20_000 }).toBeGreaterThan(0);
    const files = requested.filter((r) => /\.(webm|m4a)(\?|$)/.test(r.url));
    for (const file of files) {
      expect(new URL(file.url).origin).toBe(new URL(page.url()).origin);
      expect([200, 206]).toContain(file.status);
    }
    await expect(reading(page)).toContainText('Playing: Gymnopédie No. 1, Erik Satie.', { timeout: 20_000 });

    // The music reaches the destination: well over the corridor's room tone (about -44 dBFS), and gone when the needle lifts.
    await page.waitForTimeout(4000);
    const playing = await levelDb(page, 4000);
    expect(playing).toBeGreaterThan(-50);
    await gramophoneControl(page, 'Lift the needle').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(reading(page)).toContainText('The needle is up');
    await page.waitForTimeout(1500);
    const lifted = await levelDb(page, 3000);
    expect(playing - lifted).toBeGreaterThan(5);
    await gramophoneControl(page, 'Play').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(reading(page)).toContainText('Playing:', { timeout: 20_000 });
    await page.waitForTimeout(3500);
    const again = await levelDb(page, 3000);
    expect(again).toBeGreaterThan(lifted + 5);

    // The Sound setting off silences everything, music included; on brings it back.
    await page.getByRole('button', { name: /sound/i }).first().click();
    await page.waitForTimeout(1200);
    expect(await levelDb(page, 1500)).toBeLessThan(-80);
    await expect(reading(page)).toContainText('The sound is off.');
    await page.getByRole('button', { name: /sound/i }).first().click();
    await page.waitForTimeout(2500);
    expect(await levelDb(page, 3000)).toBeGreaterThan(lifted + 5);

    // The policy is live: a connection of any kind is reported, and nothing else was.
    expect(await violations(page)).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.evaluate(() => fetch('/index.html').then(() => 'allowed', () => 'blocked'));
    expect((await violations(page)).map((v) => v.split(' ')[0])).toEqual(['connect-src']);
  });

  test('the controls work from the keyboard: a focused control is drawn beside the fitting and stays while it has focus', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await tapDestination(page);
    await toCorridor(page);
    const needle = page.locator('.tqw-gramophone__action[data-target="needle"]');
    await expect(needle).toHaveText('Play');
    // Hidden until focused.
    const hidden = await needle.boundingBox();
    expect(hidden!.width).toBeLessThanOrEqual(2);
    await needle.focus();
    const shown = await needle.boundingBox();
    expect(shown!.height).toBeGreaterThanOrEqual(44);
    expect(shown!.width).toBeGreaterThan(60);
    expect(await needle.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
    await page.waitForTimeout(3000);
    // Not removed by a timer.
    await expect(needle).toBeFocused();
    expect((await needle.boundingBox())!.width).toBeGreaterThan(60);
    // Enter acts, and the same button is now the other verb.
    await page.keyboard.press('Enter');
    await expect(reading(page)).toContainText('The needle has come down on Gymnopédie No. 1, Erik Satie.');
    await expect(page.locator('.tqw-gramophone__action[data-target="needle"]')).toHaveText('Lift the needle');
    await page.locator('.tqw-gramophone__action[data-target="records"]').focus();
    await page.keyboard.press('Space');
    await expect(reading(page)).toContainText('Changing the record. Next: Waltz in A minor, Frédéric Chopin.');
    // A press from the keyboard was a deliberate gesture: the desk unlocked.
    expect(await page.evaluate(() => (window as unknown as { __ctx?: unknown }).__ctx !== undefined)).toBe(true);
    expect(await violations(page)).toEqual([]);
  });

  test('text mode and the page\'s own settings leave the gramophone in step: the reading follows the Sound setting', async ({ page }) => {
    await tapDestination(page);
    await toCorridor(page);
    await expect(reading(page)).not.toContainText('The sound is off.');
    const sound = (await openMenu(page)).getByRole('button', { name: 'Sound', exact: true });
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await closeMenu(page);
    await expect(reading(page)).toContainText('The sound is off.');
    // Opening Settings and muting do not unlock audio before a deliberate play gesture.
    expect(await page.evaluate(() => (window as unknown as { __ctx?: unknown }).__ctx)).toBeUndefined();
    // Muted first: no desk is built by a press, and the verbs still move the needle.
    await gramophoneControl(page, 'Play').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(reading(page)).toContainText('The needle has come down');
    await page.waitForTimeout(3500);
    await expect(reading(page)).toContainText('Playing:');
    expect(await page.evaluate(() => (window as unknown as { __ctx?: unknown }).__ctx)).toBeUndefined();
    expect(await violations(page)).toEqual([]);
    // Entering the corridor's chambers is covered below; here the page is still the corridor.
    await expect(site(page)).toHaveAttribute('data-spine', 'corridor');
  });
});
