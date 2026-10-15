import { expect, test } from '@playwright/test';
import { toggleOfficePlaces } from './officePlaces.ts';

test.use({ reducedMotion: 'reduce' });
test('Office keeps the finished arrival, desk and overload frames inside its budgets and rests without frames', async ({ page }) => {
 // GitHub's runners render in software; the authored Office needs longer to reach its stations there.
 test.setTimeout(process.env['CI'] ? 360_000 : 120_000);
 await page.goto('/certification-office?quality=high');
 const canvas=page.locator('.tqw-canvas');
 await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60_000});
 const budget=async()=>{
  await expect(canvas).toHaveAttribute('data-draw-calls',/^\d+$/);
  expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThanOrEqual(150);
  expect(Number(await canvas.getAttribute('data-triangles'))).toBeLessThanOrEqual(250_000);
  expect(Number(await canvas.getAttribute('data-lights'))).toBeLessThanOrEqual(6);
 };
 await budget();await toggleOfficePlaces(page);
 await page.getByRole('button',{name:'Approach the desk',exact:true}).click();
 await expect(page.locator('.tqw-app')).toHaveAttribute('data-station','desk');
 await budget();
 for(let n=1;n<=5;n++){
  await page.getByRole('button',{name:'Stamp once',exact:true}).click();
  await expect(page.locator('.tqw-app')).toHaveAttribute('data-stamps',String(n));
 }
 await page.waitForTimeout(2500);await budget();
 await toggleOfficePlaces(page);
 await page.getByText('Places and actions',{exact:true}).evaluate(element=>element.blur());
 await page.waitForTimeout(1500);
 const frame=await canvas.getAttribute('data-frame');
 await page.waitForTimeout(1500);
 expect(await canvas.getAttribute('data-frame')).toBe(frame);
});
