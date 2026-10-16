import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { app, closeMenu, engageGameWindow, expectStamps, openMenu, roomReady, stampButton, stampWithKeyboard } from './helpers.ts';
import { toggleOfficePlaces } from './officePlaces.ts';

test('the first press leaves one HELD mark and holds approval without opening the hatch', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  const evidenceDir = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await page.locator('.tqw-office__desk').screenshot({ path: join(evidenceDir, `01-stamp-before-${info.project.name}.png`) });
  }
  await stampButton(page).click();

  await expectStamps(page, 1);
  await expect(page.getByRole('status')).toContainText('APPROVAL HELD');
  await expect(page.getByRole('status')).toContainText('RECEIVING AUTHORITY NOT VERIFIED');
  await expect(page.getByRole('status')).toContainText('INSPECTION COPY: DESK DRAWER');
  await expect(page.locator('.tqw-hatch')).toHaveAttribute('data-open', 'false');
  await expect(app(page)).toHaveAttribute('data-memo', 'hidden');
  await expect(page.locator('.tqw-imprint__word')).toHaveText('HELD');
  if (evidenceDir) await page.locator('.tqw-office__desk').screenshot({ path: join(evidenceDir, `01-stamp-after-${info.project.name}.png`) });
});

test('repeat presses answer for the current stage without adding another impression', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  await stampButton(page).click();

  await stampButton(page).click();
  await expect(page.getByRole('status')).toContainText('APPLICATION ALREADY RECEIVED');
  await expect(page.getByRole('status')).toContainText('INSPECTION COPY: DESK DRAWER');
  await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
  await expectStamps(page, 1);

  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
  await stampButton(page).click();
  await expect(page.getByRole('status')).toContainText('NOT A SUBMISSION');
  await expect(page.getByRole('status')).toContainText('INSPECTION REQUESTS USE THE SMALL STAMP');
  await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open');
  await expectStamps(page, 1);
  await expect(page.locator('.tqw-imprint__word')).toHaveCount(1);
});

test('opening the drawer reveals the inspection copy and the SEEN stamp', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  await stampButton(page).click();

  const places = page.locator('.tqw-places');
  await places.locator(':scope > summary').click();
  await page.getByText('Things nearby', { exact: true }).click();
  await page.getByRole('button', { name: 'Drawer: Open drawer' }).click();

  await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open');
  const copy = page.getByRole('article', { name: 'Inspection copy' });
  await expect(copy).toBeVisible();
  await expect(copy).toContainText('REQUEST TO INSPECT RECEIVING AUTHORITY');
  await expect(copy).toContainText('Inspection does not require approval.');
  await expect(page.getByText('SEEN', { exact: true })).toBeVisible();

  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await copy.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `02-drawer-after-${info.project.name}.png`) });
  }
});

test('the SEEN stamp marks the inspection copy and releases the hatch latch', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Captions' }).click();
  await closeMenu(page);
  await stampButton(page).click();
  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();

  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, `03-mark-before-${info.project.name}.png`) });
  }

  await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click({ timeout: 5_000 });

  await expect(app(page)).toHaveAttribute('data-play-step', 'inspection-recorded');
  await expect(page.getByRole('status')).toContainText('INSPECTION RECORDED');
  await expect(page.locator('.tqw-captions')).toContainText('[A small dry rubber tick]');
  const copy = page.getByRole('article', { name: 'Inspection copy' });
  await expect(copy).toHaveAttribute('data-marked', 'true');
  await expect(copy.locator('.tqw-seen-impression')).toHaveText('SEEN');
  if (evidence) {
    await copy.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `03-mark-after-${info.project.name}.png`) });
  }
});

test('pulling the released hatch reveals the empty bay, memo and completion', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  await stampButton(page).click();
  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
  await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click();

  await expect(app(page)).toHaveAttribute('data-play-step', 'inspection-recorded');
  await expect(page.locator('.tqw-hatch')).toHaveAttribute('data-open', 'false');
  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.locator('.tqw-hatch').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `04-hatch-before-${info.project.name}.png`) });
  }

  await page.getByRole('button', { name: 'Pull hatch', exact: true }).click({ timeout: 5_000 });

  await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
  await expect(app(page)).toHaveAttribute('data-memo', 'inspection');
  await expect(page.locator('.tqw-hatch')).toHaveAttribute('data-open', 'true');
  await expect(page.getByRole('status')).toContainText('INSPECTION COMPLETE');
  await expect(page.getByRole('article', { name: 'Memo 001' })).toContainText('nobody here has ever been authorised to decide.');
  await expect(page.locator('.tqw-office-completion')).toContainText('Certification Office — mystery resolved');
  await expect(page.getByText('Found: The empty authority bay', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved to Archive', { exact: true })).toBeVisible();

  if (evidence) {
    await page.screenshot({ path: join(evidence, `04-hatch-after-${info.project.name}.png`) });
    await page.getByRole('article', { name: 'Memo 001' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, `04-memo-after-${info.project.name}.png`) });
  }
});

test('each optional curiosity opens its complete evidence in one action and records its findings', async ({ page }, info) => {
  await page.addInitScript(() => {
    const scope = window as Window & { __officeAudioStarts: number };
    scope.__officeAudioStarts = 0;
    for (const prototype of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
      const source = prototype as unknown as { start: (...args: number[]) => void };
      const start = source.start;
      source.start = function (this: AudioScheduledSourceNode, ...args: number[]) {
        scope.__officeAudioStarts += 1;
        return start.apply(this, args);
      };
    }
  });
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Captions' }).click();
  await closeMenu(page);

  const curiosities = [
    {
      action: 'Read routing slip — The Exchange',
      article: 'Routing slips',
      findings: [
        { id: 'office-routing-slip', kind: 'line', title: 'Routing Slip' },
        { id: 'office-witness-slip', kind: 'line', title: 'Witness Slip' },
        { id: 'office-unrequested-copy', kind: 'line', title: 'Unrequested Copy' },
      ],
      caption: '[Three paper slips shuffle]',
      copy: ['ONWARD ENQUIRIES: THE EXCHANGE', 'CONNECTION: CERTIFICATION', 'WITNESS SLIP', 'UNREQUESTED COPY'],
    },
    {
      action: 'Open register',
      article: 'Certificate register',
      findings: [
        { id: 'office-certificate-0001', kind: 'secret', title: 'Certificate 0001' },
        { id: 'office-expired-approval', kind: 'line', title: 'Expired Approval — Sample' },
        { id: 'office-chair-repair', kind: 'memo', title: 'Chair Repair Note' },
        { id: 'office-staff-induction', kind: 'line', title: 'Staff Induction' },
      ],
      caption: '[Cloth cover and paper shift]',
      copy: ['CERTIFICATE 0001', 'EXPIRED APPROVAL — SAMPLE', 'CHAIR REPAIR', 'STAFF INDUCTION'],
    },
    {
      action: 'Open conduit cover',
      article: 'Maintenance plate Q-01',
      findings: [{ id: 'office-q-01', kind: 'secret', title: 'Q-01 — Public-wall conduit' }],
      caption: '[Tethered metal cover ticks]',
      copy: ['Q-01 — PUBLIC-WALL CONDUIT', 'No approval required to leave.'],
    },
  ] as const;

  let previousStarts = await page.evaluate(() => (window as Window & { __officeAudioStarts: number }).__officeAudioStarts);
  for (const curiosity of curiosities) {
    const evidenceDir = process.env.TQW_OFFICE_EVIDENCE_DIR;
    const slug = curiosity.article === 'Routing slips' ? 'routing-slips' : curiosity.article === 'Certificate register' ? 'register' : 'conduit';
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await page.screenshot({ path: join(evidenceDir, `optional-${slug}-before-${info.project.name}.png`) });
    }
    const action = page.getByRole('button', { name: curiosity.action, exact: true });
    await expect(action).toBeVisible();
    await action.click();
    const evidence = page.getByRole('article', { name: curiosity.article });
    await expect(evidence).toBeVisible();
    for (const line of curiosity.copy) await expect(evidence).toContainText(line);
    await expect(page.locator('.tqw-captions')).toContainText(curiosity.caption);
    const starts = await page.evaluate(() => (window as Window & { __officeAudioStarts: number }).__officeAudioStarts);
    expect(starts, `${curiosity.action} should play its object sound`).toBeGreaterThan(previousStarts);
    previousStarts = starts;
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('unheld.v1');
      return raw ? JSON.parse(raw) as { found: Record<string, { id: string; kind: string; title?: string }[]> } : null;
    });
    const found = stored?.found['certification-office'] ?? [];
    for (const expected of curiosity.findings) expect(found).toContainEqual(expected);
    await expect(app(page)).toHaveAttribute('data-play-step', 'ready');
    if (evidenceDir) {
      await page.screenshot({ path: join(evidenceDir, `optional-${slug}-after-${info.project.name}.png`) });
    }
  }
});

test('required findings and the furthest play step survive reload in the archive', async ({ page }, info) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('office-v3-archive-reset')) {
      localStorage.removeItem('unheld.v1');
      sessionStorage.setItem('office-v3-archive-reset', 'true');
    }
  });
  await page.goto('/certification-office?mode=text');
  const evidenceDir = process.env.TQW_OFFICE_EVIDENCE_DIR;
  const archive = page.locator('.tqw-archive');
  await expect(archive.locator('[data-room="certification-office"]')).toHaveCount(0);
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await archive.screenshot({ path: join(evidenceDir, `archive-before-find-${info.project.name}.png`) });
  }
  expect(await page.evaluate(() => localStorage.getItem('unheld.v1'))).toBeNull();

  const officeFindings = async () => page.evaluate(() => {
    const raw = localStorage.getItem('unheld.v1');
    return raw ? (JSON.parse(raw) as { found?: Record<string, { id: string; kind: string; title?: string }[]> }).found?.['certification-office'] ?? [] : [];
  });

  await stampButton(page).click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
  expect(await officeFindings()).toContainEqual({ id: 'office-application-receipt', kind: 'line', title: 'Application receipt' });
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
  await expect(page.getByRole('status')).toContainText('APPROVAL HELD');
  await expect(page.getByRole('button', { name: 'Open drawer', exact: true })).toBeVisible();
  let room = page.locator('.tqw-archive [data-room="certification-office"]');
  await expect(room).toContainText('Application receipt');
  await expect(room.locator('.tqw-archive__room-count, .tqw-archive__sealed')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
  expect(await officeFindings()).toContainEqual({ id: 'office-inspection-copy', kind: 'memo', title: 'Inspection copy' });
  expect(await officeFindings()).toContainEqual({ id: 'office-duck-requisition', kind: 'secret', title: 'Duck Requisition' });
  expect(await officeFindings()).toContainEqual({ id: 'office-duck-ticket', kind: 'line', title: 'Duck and queue ticket' });
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open');
  await expect(page.getByRole('status')).toContainText('APPROVAL HELD');
  await expect(page.getByRole('status')).not.toContainText('NOT A SUBMISSION');
  await expect(page.getByRole('article', { name: 'Inspection copy' })).toBeVisible();

  await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click();
  expect(await officeFindings()).toContainEqual({ id: 'office-inspection-stamp', kind: 'secret', title: 'Inspection stamp' });
  expect(await officeFindings()).toContainEqual({ id: 'office-marked-copy', kind: 'line', title: 'Marked inspection copy' });
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-play-step', 'inspection-recorded');
  await expect(page.getByRole('status')).toContainText('FRONT HATCH RELEASED — PULL TO OPEN');
  await expect(page.locator('.tqw-hatch')).toHaveAttribute('data-open', 'false');

  await page.getByRole('button', { name: 'Pull hatch', exact: true }).click();
  expect(await officeFindings()).toContainEqual({ id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' });
  expect(await officeFindings()).toContainEqual({ id: 'memo-001', kind: 'memo', title: 'Memo 001' });
  expect(await officeFindings()).toContainEqual({ id: 'office-mystery-resolved', kind: 'payoff', title: 'Certification Office — mystery resolved' });
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
  await expect(page.locator('.tqw-hatch')).toHaveAttribute('data-open', 'true');
  await expect(page.getByRole('article', { name: 'Memo 001' })).toBeVisible();
  room = page.locator('.tqw-archive [data-room="certification-office"]');
  await expect(room).toContainText('The empty authority bay');
  await expect(room).toContainText('Certification Office — mystery resolved');
  await expect(room.locator('.tqw-archive__room-count, .tqw-archive__sealed')).toHaveCount(0);
  if (evidenceDir) await archive.screenshot({ path: join(evidenceDir, `archive-after-reload-${info.project.name}.png`) });

  await page.getByRole('button', { name: 'Read Memo 001', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Memo 001' })).toBeVisible();
  await expect(page.locator('.tqw-office-completion')).toContainText('Found: Memo 001');
});

test('idle taps reveal the four authored hint ladders and progress resets each one', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office?mode=text');
  const evidenceDir = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await page.locator('.tqw-office__desk').screenshot({ path: join(evidenceDir, `05-hints-before-${info.project.name}.png`) });
  }
  const hint = page.locator('.tqw-office__hint');
  const idleScene = page.locator('.tqw-office__scene');
  const ladders = [
    ['The application is ready.', 'The large press submits it.', 'Tap Stamp.'],
    ['The receipt names an inspection copy.', 'It is in the desk drawer.', 'Tap Open drawer.'],
    ['The inspection box asks for a different mark.', 'SEEN is on the small stamp beneath the desk edge.', 'Tap Mark inspection copy.'],
    ['The latch is released. The panel is still shut.', 'The brass pull opens the front hatch.', 'Tap Pull hatch.'],
  ] as const;
  const stages = ['ready', 'refused', 'drawer-open', 'inspection-recorded'] as const;
  const tapStampAndWait = async () => {
    await stampButton(page).click();
    await expect(app(page)).toHaveAttribute('data-processing', 'false');
  };

  await page.getByRole('button', { name: 'Read routing slip — The Exchange', exact: true }).click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'ready');
  await idleScene.click();
  await idleScene.click();
  await expect(hint).toHaveCount(0);
  await idleScene.click();
  await expect(hint).toHaveText(ladders[0]![0]);
  const places = page.locator('.tqw-places');
  await places.locator(':scope > summary').click();
  await page.getByRole('button', { name: 'Previous station', exact: true }).click();
  await expect(hint).toHaveText(ladders[0]![0]);

  for (let rung = 1; rung < 3; rung += 1) {
    for (let tap = 0; tap < 3; tap += 1) await idleScene.click();
    await expect(hint).toHaveText(ladders[0]![rung]!);
    await expect(app(page)).toHaveAttribute('data-play-step', 'ready');
  }
  if (evidenceDir) await page.locator('.tqw-office__desk').screenshot({ path: join(evidenceDir, `05-hints-after-${info.project.name}.png`) });

  await tapStampAndWait();
  await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
  await expect(hint).toHaveCount(0);
  for (let stage = 1; stage < ladders.length; stage += 1) {
    for (let rung = 0; rung < 3; rung += 1) {
      for (let tap = 0; tap < 3; tap += 1) await tapStampAndWait();
      await expect(hint).toHaveText(ladders[stage]![rung]!);
      await expect(app(page)).toHaveAttribute('data-play-step', stages[stage]!);
    }
    if (stage === 1) await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
    if (stage === 2) await page.getByRole('button', { name: 'Mark inspection copy', exact: true }).click();
    if (stage === 3) {
      await expect(page.locator('.tqw-hatch')).toHaveAttribute('data-open', 'false');
      await page.getByRole('button', { name: 'Pull hatch', exact: true }).click();
    }
    await expect(hint).toHaveCount(0);
  }
  await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
});

test('3D arrival and object prompts open all optional finds with one action', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office');
  await roomReady(page);
  await engageGameWindow(page);

  const route = page.getByRole('button', { name: 'Read routing slip — The Exchange', exact: true });
  await expect(route).toBeVisible();
  await route.click();
  await expect(page.getByRole('dialog', { name: 'Routing slips' })).toContainText('CONNECTION: CERTIFICATION');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await toggleOfficePlaces(page);
  await page.getByText('Things nearby', { exact: true }).click();
  for (const [action, article, line] of [
    ['Certificate register: Open register', 'Certificate register', 'CERTIFICATE 0001'],
    ['Maintenance conduit cover: Open conduit cover', 'Maintenance plate Q-01', 'Q-01 — PUBLIC-WALL CONDUIT'],
  ] as const) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog', { name: article })).toContainText(line);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }

  const archive = await page.evaluate(() => JSON.parse(localStorage.getItem('unheld.v1') ?? '{}') as {
    found?: Record<string, { id: string; kind: string; title?: string }[]>;
  });
  const findings = archive.found?.['certification-office'] ?? [];
  for (const id of ['office-routing-slip', 'office-witness-slip', 'office-unrequested-copy', 'office-certificate-0001', 'office-q-01']) {
    expect(findings.some(item => item.id === id), `${id} should be archived from 3D`).toBe(true);
  }
});

test('desktop and Pixel 7 solve the full chain through authored views', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.removeItem('unheld.v1'));
  await page.goto('/certification-office');
  await roomReady(page);
  const evidence = process.env.TQW_OFFICE_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const frame = async (name: string) => {
    if (evidence) await page.screenshot({ path: join(evidence, name) });
  };

  await stampWithKeyboard(page);
  await expect(app(page)).toHaveAttribute('data-play-step', 'refused');
  await frame('05-chain-01-refusal-pixel-7.png');

  await toggleOfficePlaces(page);
  await page.getByText('Things nearby', { exact: true }).click();
  const canvas = page.locator('.tqw-canvas');
  const drawer = page.getByRole('button', { name: 'Drawer: Open drawer' });
  await expect(app(page)).toHaveAttribute('data-station', 'desk');
  await drawer.click();
  await expect(app(page)).toHaveAttribute('data-station', 'drawer');
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await drawer.click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'drawer-open');
  await toggleOfficePlaces(page);
  await frame('05-chain-02-drawer-pixel-7.png');

  await toggleOfficePlaces(page);
  const mark = page.getByRole('button', { name: 'Tiny underside stamp: Mark inspection copy' });
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(app(page)).toHaveAttribute('data-station', 'underside');
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await mark.click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'inspection-recorded');
  await toggleOfficePlaces(page);
  await frame('05-chain-03-seen-pixel-7.png');

  await toggleOfficePlaces(page);
  const pull = page.getByRole('button', { name: 'Approval machine: Pull hatch' });
  await expect(pull).toBeVisible();
  await pull.click();
  await expect(app(page)).toHaveAttribute('data-station', 'machine-detail');
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await pull.click();
  await expect(app(page)).toHaveAttribute('data-play-step', 'resolved');
  await expect(app(page)).toHaveAttribute('data-memo', 'inspection');
  const archive = await page.evaluate(() => JSON.parse(localStorage.getItem('unheld.v1') ?? '{}') as {
    found?: Record<string, { id: string; kind: string; title?: string }[]>;
  });
  const officeFindings = archive.found?.['certification-office'] ?? [];
  expect(officeFindings).toContainEqual({ id: 'office-empty-authority-bay', kind: 'payoff', title: 'The empty authority bay' });
  expect(officeFindings).toContainEqual({ id: 'memo-001', kind: 'memo', title: 'Memo 001' });
  expect(officeFindings).toContainEqual({ id: 'office-mystery-resolved', kind: 'payoff', title: 'Certification Office — mystery resolved' });
  await toggleOfficePlaces(page);
  await frame('05-chain-04-empty-bay-pixel-7.png');
});
