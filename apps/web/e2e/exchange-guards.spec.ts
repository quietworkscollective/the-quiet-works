import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { hitVolumes } from '../src/chambers/exchange/scene/hotspots.ts';
import { fromSet, type ExchangeHotspot, type ExchangeViewId } from '../src/chambers/exchange/stage.ts';
import { createExchangeState } from '../src/chambers/exchange/state.ts';
import { decodePng, type Raster } from './png.ts';

/** Mistakes this site has shipped or nearly shipped, each held to what a visitor would actually get. */

const VIEW_ROUTE: Readonly<Record<ExchangeViewId, readonly string[]>> = {
  wide: ['Board'],
  jacks: ['Board', 'View jacks'],
  'desk-top': ['Board', 'View desk top'],
  kneehole: ['Desk underside'],
  shelf: ['Ticket shelf'],
};
const VIEWS = Object.keys(VIEW_ROUTE) as ExchangeViewId[];
const PHONE = { width: 390, height: 844 } as const;
const LINES = Array.from({ length: 12 }, (_, index) => index + 1);
const CERTIFICATION = 3;

const room = (page: Page) => page.locator('.tqw-exchange');
const canvas = (page: Page) => page.locator('.tqw-exchange-canvas canvas');
const action = (page: Page, name: string) => room(page).getByRole('button', { name, exact: true });
const usesTouch = (testInfo: TestInfo) => testInfo.project.use.hasTouch === true;

/** A press in the input the project really has. */
async function press(control: Locator, testInfo: TestInfo): Promise<void> {
  if (usesTouch(testInfo)) await control.tap();
  else await control.click();
}

async function goToView(page: Page, view: ExchangeViewId, testInfo: TestInfo): Promise<void> {
  for (const name of VIEW_ROUTE[view]) await press(action(page, name), testInfo);
  await expect(room(page)).toHaveAttribute('data-view', view);
  await settled(page);
}

/** Two frames, so the demand-driven canvas has drawn the pose the last action set. */
const settled = (page: Page) => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

async function readyRoom(page: Page): Promise<void> {
  await page.goto('/the-exchange?quality=high');
  await expect(room(page)).toHaveAttribute('data-mode', '3d');
  await expect(room(page)).toHaveAttribute('data-room-ready', 'true', { timeout: 60_000 });
  await expect(page.locator('.tqw-exchange-canvas')).toHaveAttribute('data-frame-ready', 'true', { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-baked', 'exchange', { timeout: 60_000 });
  await page.waitForFunction(() => !!window.__tqwExchange);
  await settled(page);
}

const toLinear = (value: number) => {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};
const luminance = ([red, green, blue]: readonly [number, number, number]) =>
  0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);

async function shot(page: Page): Promise<{ raster: Raster; scale: number }> {
  const raster = decodePng(await page.screenshot());
  return { raster, scale: raster.width / (page.viewportSize()?.width ?? raster.width) };
}

/**
 * Each lamp's brightest displayed pixel, as relative linear luminance, read from a real screenshot.
 * Only the middle of the lamp's dome counts: CERTIFICATION's polished collar sits just below it and
 * must not be mistaken for the lamp.
 */
async function lampLuminance(page: Page): Promise<number[]> {
  await settled(page);
  const spots = await page.evaluate(lines => lines.map(line => window.__tqwExchange?.nodeSpot(`line_lamp_${String(line).padStart(2, '0')}`) ?? null), LINES);
  const { raster, scale } = await shot(page);
  return spots.map((spot, index) => {
    if (!spot) throw new Error(`Lamp ${index + 1} is missing`);
    const reach = Math.max(1, Math.min(spot.reachX, spot.reachY) * 0.4 * scale);
    const [x, y] = [spot.x * scale, spot.y * scale];
    let peak = 0;
    for (let row = Math.floor(y - reach); row <= Math.ceil(y + reach); row += 1) {
      for (let column = Math.floor(x - reach); column <= Math.ceil(x + reach); column += 1) {
        peak = Math.max(peak, luminance(raster.at(column, row)));
      }
    }
    return Number(peak.toFixed(4));
  });
}

const othersOf = (levels: readonly number[]) => levels.filter((_, index) => index + 1 !== CERTIFICATION);

test.describe('the board reads as one bright lamp among eleven dim', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('in displayed pixels, by day and at night, at Wide and at Jacks', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (usesTouch(testInfo)) await page.setViewportSize(PHONE);
    await readyRoom(page);
    if (usesTouch(testInfo)) {
      const box = await canvas(page).boundingBox();
      expect([box?.width, box?.height], 'the phone scene the clue must survive').toEqual([390, 184]);
    }
    const day: Partial<Record<'wide' | 'jacks', number[]>> = {};
    for (const view of ['wide', 'jacks'] as const) {
      await goToView(page, view, testInfo);
      const levels = await lampLuminance(page);
      day[view] = levels;
      console.info(`[Exchange lamps] ${testInfo.project.name} ${view} day ${JSON.stringify(levels)}`);
      const bright = levels[CERTIFICATION - 1] ?? 0;
      expect(Math.max(...othersOf(levels)) / bright, `${view}: the brightest dim lamp against CERTIFICATION`).toBeLessThanOrEqual(0.4);
    }
    await press(action(page, 'Night service'), testInfo);
    await expect(room(page)).toHaveAttribute('data-service', 'night');
    for (const view of ['jacks', 'wide'] as const) {
      await goToView(page, view, testInfo);
      const levels = await lampLuminance(page);
      console.info(`[Exchange lamps] ${testInfo.project.name} ${view} night ${JSON.stringify(levels)}`);
      const bright = day[view]?.[CERTIFICATION - 1] ?? 0;
      expect(Math.max(...levels) / bright, `${view}: every lamp at night against CERTIFICATION by day`).toBeLessThanOrEqual(0.25);
      const others = [...othersOf(levels)].sort((x, y) => x - y);
      const median = others[Math.floor(others.length / 2)] ?? 0;
      expect((levels[CERTIFICATION - 1] ?? 0) / median, `${view}: CERTIFICATION no longer stands out at night`).toBeLessThanOrEqual(1.6);
    }
  });
});

test.describe('the framed views', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('nothing beyond the back panel shows in the kneehole', async ({ page }, testInfo) => {
    if (usesTouch(testInfo)) await page.setViewportSize(PHONE);
    await readyRoom(page);
    await goToView(page, 'kneehole', testInfo);
    const box = await canvas(page).boundingBox();
    expect(box).not.toBeNull();
    const seen = await page.evaluate(({ left, top, width, height }) => {
      const found: string[] = [];
      for (let row = 0; row <= 12; row += 1) {
        for (let column = 0; column <= 24; column += 1) {
          found.push(window.__tqwExchange?.sightline(left + 1 + (width - 2) * column / 24, top + 1 + (height - 2) * row / 12) ?? '(nothing)');
        }
      }
      return [...new Set(found)];
    }, { left: box!.x, top: box!.y, width: box!.width, height: box!.height });
    console.info(`[Exchange kneehole] ${testInfo.project.name} ${JSON.stringify(seen)}`);
    expect(seen.filter(name => /^(line_|certification|switchboard|exchange_|ticket_|enquiry_|inspect_shift|rota|shelf_index)/.test(name) || name === '(nothing)')).toEqual([]);
  });

  test('the open drawer form keeps its printed lines', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (usesTouch(testInfo)) await page.setViewportSize(PHONE);
    await readyRoom(page);
    await goToView(page, 'jacks', testInfo);
    for (const name of ['Read wiring card', 'Select enquiry plug', 'Connect CERTIFICATION']) await press(action(page, name), testInfo);
    await expect(room(page)).toHaveAttribute('data-plug', 'seated');
    await press(action(page, 'Close'), testInfo);
    await goToView(page, 'shelf', testInfo);
    await settled(page);
    const spot = await page.evaluate(() => window.__tqwExchange?.nodeSpot('ticket_form'));
    expect(spot).toBeTruthy();
    const { raster, scale } = await shot(page);
    const values: number[] = [];
    for (let row = Math.ceil((spot!.y - spot!.reachY * 0.7) * scale); row <= (spot!.y + spot!.reachY * 0.7) * scale; row += 1) {
      for (let column = Math.ceil((spot!.x - spot!.reachX * 0.7) * scale); column <= (spot!.x + spot!.reachX * 0.7) * scale; column += 1) {
        values.push(luminance(raster.at(column, row)));
      }
    }
    values.sort((a, b) => a - b);
    const at = (fraction: number) => values[Math.floor((values.length - 1) * fraction)] ?? 0;
    const [ink, paper] = [at(0.05), at(0.75)];
    console.info(`[Exchange form] ${testInfo.project.name} ink ${ink.toFixed(3)} paper ${paper.toFixed(3)} ratio ${(paper / ink).toFixed(2)}`);
    expect(paper, 'the paper is not blown out').toBeLessThanOrEqual(0.62);
    expect(paper / ink, 'printed lines separate from the paper').toBeGreaterThanOrEqual(1.8);
  });
});

test.describe('hover', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('sixty moves across the scene rebind nothing, resize nothing and blur nothing', async ({ page }, testInfo) => {
    test.skip(usesTouch(testInfo), 'A phone has no hovering pointer.');
    await readyRoom(page);
    const box = await canvas(page).boundingBox();
    expect(box).not.toBeNull();
    const park = async () => {
      await page.mouse.move(box!.x + box!.width + 200, 20);
      await settled(page);
      await page.waitForTimeout(200);
    };
    const sharpness = async () => {
      const { raster, scale } = await shot(page);
      let energy = 0;
      const [left, top] = [Math.ceil(box!.x * scale) + 2, Math.ceil(box!.y * scale) + 2];
      const [right, bottom] = [Math.floor((box!.x + box!.width) * scale) - 2, Math.floor((box!.y + box!.height) * scale) - 2];
      for (let y = top; y < bottom; y += 2) {
        for (let x = left; x < right; x += 2) {
          const here = luminance(raster.at(x, y));
          energy += Math.abs(4 * here - luminance(raster.at(x - 1, y)) - luminance(raster.at(x + 1, y)) - luminance(raster.at(x, y - 1)) - luminance(raster.at(x, y + 1)));
        }
      }
      return energy;
    };
    await park();
    const before = await sharpness();
    await page.evaluate(() => {
      const target = document.querySelector('.tqw-exchange-canvas canvas') as HTMLCanvasElement;
      const dev = window as unknown as {
        __tqwGl: { getPixelRatio(): number; setPixelRatio(value: number): void; setSize(...args: unknown[]): void };
        __tqwHover: { bakes: number; ratios: number; sizes: number; start: number[] };
      };
      const record = { bakes: 0, ratios: 0, sizes: 0, start: [dev.__tqwGl.getPixelRatio(), target.width, target.height] };
      dev.__tqwHover = record;
      new MutationObserver(changes => { record.bakes += changes.length; })
        .observe(target, { attributes: true, attributeFilter: ['data-baked', 'data-bake-bind-ms'] });
      const { setPixelRatio, setSize } = dev.__tqwGl;
      dev.__tqwGl.setPixelRatio = function (...args) { record.ratios += 1; return setPixelRatio.apply(this, args); };
      dev.__tqwGl.setSize = function (...args) { record.sizes += 1; return setSize.apply(this, args); };
    });

    for (let step = 0; step < 60; step += 1) {
      await page.mouse.move(box!.x + box!.width * (0.1 + 0.8 * (step / 59)), box!.y + box!.height * (0.15 + 0.7 * ((step % 8) / 8)));
      await page.waitForTimeout(25);
    }
    await park();
    await page.waitForTimeout(1000);

    const record = await page.evaluate(() => {
      const target = document.querySelector('.tqw-exchange-canvas canvas') as HTMLCanvasElement;
      const dev = window as unknown as { __tqwGl: { getPixelRatio(): number }; __tqwHover: { bakes: number; ratios: number; sizes: number; start: number[] } };
      return { ...dev.__tqwHover, end: [dev.__tqwGl.getPixelRatio(), target.width, target.height] };
    });
    expect(record.bakes, 'lightmap rebinds').toBe(0);
    expect(record.ratios, 'pixel ratio changes').toBe(0);
    expect(record.sizes, 'renderer resizes').toBe(0);
    expect(record.end).toEqual(record.start);
    const after = await sharpness();
    console.info(`[Exchange hover] sharpness before ${before.toFixed(2)} after ${after.toFixed(2)}`);
    expect(after / before, 'the frame after hover is as sharp as the frame before').toBeGreaterThan(0.97);
  });
});

for (const height of [844, 664] as const) {
  test(`the 390 by ${height} layout neither overflows nor covers a control, with touch where the project has it`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height });
    await readyRoom(page);
    const audit = async (where: string) => {
      const report = await page.evaluate(() => {
        const width = window.innerWidth;
        const widest = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const controls = [...document.querySelectorAll<HTMLElement>('.tqw-exchange button')].filter(control => {
          if (control.closest('.tqw-exchange-lines') && !control.closest('.tqw-exchange-lines')?.matches(':focus-within')) return false;
          return control.getClientRects().length > 0;
        });
        const trouble = controls.flatMap(control => {
          const box = control.getBoundingClientRect();
          const name = control.textContent ?? '';
          if (box.left < 0 || box.right > width || box.top < 0 || box.bottom > window.innerHeight) return [`${name} leaves the viewport`];
          const corners = [[box.left + 2, box.top + 2], [box.right - 2, box.top + 2], [box.left + 2, box.bottom - 2], [box.right - 2, box.bottom - 2], [box.left + box.width / 2, box.top + box.height / 2]];
          return corners.flatMap(([x, y]) => {
            const top = document.elementFromPoint(x ?? 0, y ?? 0);
            return top === control || control.contains(top) ? [] : [`${name} is covered by ${top?.className || top?.tagName}`];
          });
        });
        return { width, widest, trouble, count: controls.length };
      });
      expect(report.widest, `${where}: horizontal overflow`).toBeLessThanOrEqual(report.width);
      expect(report.trouble, where).toEqual([]);
      expect(report.count, `${where}: controls present`).toBeGreaterThan(4);
    };
    for (const view of VIEWS) {
      await goToView(page, view, testInfo);
      await audit(view);
      await press(action(page, 'Archive'), testInfo);
      await audit(`${view} with the Archive open`);
      await press(action(page, 'Close'), testInfo);
    }
    await goToView(page, 'wide', testInfo);
    await press(action(page, 'Night service'), testInfo);
    for (const view of VIEWS) {
      await goToView(page, view, testInfo);
      await audit(`${view} in night service`);
    }
    await press(action(page, 'Resume service'), testInfo);
    await expect(room(page)).toHaveAttribute('data-service', 'day');
    await press(action(page, 'Leave'), testInfo);
    await expect(room(page)).toHaveCount(0);
  });
}

/** One hotspot per view at least, with what the room must answer once a real input lands on it. */
const CANVAS_PRESSES: readonly { view: ExchangeViewId; hotspot: ExchangeHotspot; reader?: string; result?: RegExp }[] = [
  { view: 'wide', hotspot: 'sign', result: /./ },
  { view: 'wide', hotspot: 'cardigan', reader: 'cardigan' },
  { view: 'jacks', hotspot: 'line-3', reader: 'wiring-card' },
  { view: 'jacks', hotspot: 'line-7', reader: 'line-card' },
  { view: 'desk-top', hotspot: 'rulebook', reader: 'rulebook' },
  { view: 'desk-top', hotspot: 'flask', reader: 'flask' },
  { view: 'kneehole', hotspot: 'diagram', reader: 'diagram' },
  { view: 'kneehole', hotspot: 'plate', reader: 'rule-14' },
  { view: 'shelf', hotspot: 'rota', reader: 'rota' },
  { view: 'shelf', hotspot: 'index', reader: 'index' },
];

test.describe('raycast hotspots', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a real press on the canvas reaches the right response in every view', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (usesTouch(testInfo)) await page.setViewportSize(PHONE);
    await readyRoom(page);
    for (const { view, hotspot, reader, result } of CANVAS_PRESSES) {
      await goToView(page, view, testInfo);
      const volume = hitVolumes(view, createExchangeState()).find(entry => entry.id === hotspot);
      expect(volume, `${hotspot} has a hit volume at ${view}`).toBeTruthy();
      const centre = fromSet((volume!.min[0] + volume!.max[0]) / 2, (volume!.min[1] + volume!.max[1]) / 2, (volume!.min[2] + volume!.max[2]) / 2);
      const [x, y] = await page.evaluate(point => window.__tqwExchange!.screenPoint(point), centre);
      const on = await page.evaluate(([px, py]) => document.elementFromPoint(px ?? 0, py ?? 0)?.tagName, [x, y]);
      expect(on, `${hotspot} lands on the canvas at ${view}`).toBe('CANVAS');
      if (usesTouch(testInfo)) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      if (reader) {
        await expect(room(page), `${hotspot} at ${view}`).toHaveAttribute('data-reader', reader);
        await press(action(page, 'Close'), testInfo);
      } else {
        await expect(room(page), `${hotspot} at ${view} opens no reader`).toHaveAttribute('data-reader', '');
        await expect(page.locator('.tqw-exchange-result'), `${hotspot} at ${view}`).toHaveText(result ?? /./);
      }
    }
  });
});

/** Text mode sits in the page under the landing; a restored night record must still be answerable at once. */
for (const height of [844, 664] as const) {
  test(`a restored night service in text mode at 390 by ${height} shows Resume service and Leave without a scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('unheld.v1', JSON.stringify({
        version: 1,
        found: { exchange: [{ id: 'cardigan', kind: 'line', title: 'Cardigan on the chair' }] },
        recognitions: [],
        roomState: { exchange: { version: 1, service: 'night', plug: 'rest', plate: 'shut', lead: 'clipped', handset: 'cradle' } },
      }));
    });
    await page.goto('/the-exchange?mode=text');
    await expect(room(page)).toHaveAttribute('data-service', 'night');
    for (const name of ['Resume service', 'Leave']) {
      await expect(action(page, name), name).toBeInViewport({ ratio: 1 });
      const covered = await action(page, name).evaluate(element => {
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !top || !(top === element || element.contains(top));
      });
      expect(covered, `${name} is covered`).toBe(false);
    }
  });
}
