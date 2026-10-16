import { expect, test } from '@playwright/test';
import { app, roomReady, stampWithKeyboard } from './helpers.ts';
import { toggleOfficePlaces } from './officePlaces.ts';

const clearArchive = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office');
  await roomReady(page);
};

const heldLine = async (page: import('@playwright/test').Page) =>
  page.getByRole('status').evaluate(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim());

test.describe('the Office chain with normal motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('one action at each station completes the chain and opens Memo 001', async ({ page }) => {
    test.setTimeout(180_000);
    await clearArchive(page);
    await stampWithKeyboard(page);
    await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
    expect(await heldLine(page)).toBe(
      'The machine reads: APPROVAL HELD — RECEIVING AUTHORITY NOT VERIFIED INSPECTION COPY: DESK DRAWER',
    );

    await toggleOfficePlaces(page);
    await page.getByText('Things nearby', { exact: true }).click();
    await page.getByRole('button', { name: 'Drawer: Open drawer', exact: true }).click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open', { timeout: 45_000 });

    await page.getByRole('button', { name: 'Tiny underside stamp: Mark inspection copy', exact: true }).click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'inspection-recorded', { timeout: 45_000 });

    await page.getByRole('button', { name: 'Approval machine: Pull hatch', exact: true }).click();
    await expect(app(page)).toHaveAttribute('data-play-step', 'resolved', { timeout: 45_000 });
    await expect(app(page)).toHaveAttribute('data-memo', 'inspection');

    await page.getByRole('button', { name: 'Read Memo 001', exact: true }).first().click();
    const memo = page.getByRole('dialog', { name: 'Memo 001' });
    await expect(memo).toBeVisible();
    await expect(memo).toContainText('nobody here has ever been authorised to decide.');
  });

  test('a direct scene click on the drawer remains queued through its glide', async ({ page }, info) => {
    test.setTimeout(120_000);
    test.skip(info.project.name !== 'desktop', 'scene ray target is verified on desktop; full chain runs on both projects');
    await clearArchive(page);
    await stampWithKeyboard(page);
    await expect(app(page)).toHaveAttribute('data-play-step', 'refused');

    const canvas = page.locator('.tqw-canvas');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('w');
    await expect(app(page)).toHaveAttribute('data-station', 'machine');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await expect(canvas).toHaveAttribute('data-position', '0.20,1.62,0.25');
    await expect(canvas).toHaveAttribute('data-moving', 'false');
    const [x, z, yaw, pitch, fov] = await canvas.evaluate(element => {
      const pose = (element.getAttribute('data-pose') ?? '').split(',').map(Number);
      return [...pose, Number(element.getAttribute('data-fov'))] as const;
    });
    expect([x, z, yaw, pitch, fov].every(Number.isFinite)).toBe(true);

    const target = { x: -1.8, y: 0.70, z: 3.5 };
    const dx = target.x - x!;
    const dy = target.y - 1.62;
    const dz = target.z - z!;
    const yawRad = yaw! * Math.PI / 180;
    const pitchRad = pitch! * Math.PI / 180;
    const localX = Math.cos(yawRad) * dx + Math.sin(yawRad) * dz;
    const localZ = -Math.sin(yawRad) * dx + Math.cos(yawRad) * dz;
    const localY = Math.cos(pitchRad) * dy + Math.sin(pitchRad) * localZ;
    const depth = Math.sin(pitchRad) * dy - Math.cos(pitchRad) * localZ;
    const verticalFov = fov! * Math.PI / 180;
    const aspect = box!.width / box!.height;
    const verticalScale = Math.tan(verticalFov / 2);
    const ndcX = localX / (depth * verticalScale * aspect);
    const ndcY = localY / (depth * verticalScale);
    const point = {
      x: box!.x + (ndcX + 1) * box!.width / 2,
      y: box!.y + (1 - ndcY) * box!.height / 2,
    };
    expect(point.x).toBeGreaterThan(box!.x);
    expect(point.x).toBeLessThan(box!.x + box!.width);
    expect(point.y).toBeGreaterThan(box!.y);
    expect(point.y).toBeLessThan(box!.y + box!.height);

    await page.mouse.click(point.x, point.y);
    await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open', { timeout: 45_000 });
  });

  test('the exact held machine line has no punctuation after the dash', async ({ page }) => {
    await clearArchive(page);
    await stampWithKeyboard(page);
    await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
    expect(await heldLine(page)).toBe(
      'The machine reads: APPROVAL HELD — RECEIVING AUTHORITY NOT VERIFIED INSPECTION COPY: DESK DRAWER',
    );
  });
});
