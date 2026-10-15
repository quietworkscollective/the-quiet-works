import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chambersForBuild, REPO_ROOT, sourceConstant } from './chamber-release.mjs';

const outputRoot = path.join(REPO_ROOT, 'apps/web/dist');
const extraRoomCopy = new Map([
  ['exchange', sourceConstant(REPO_ROOT, 'apps/web/src/discoverability.ts', 'EXCHANGE_TEXT_MODE_COPY')],
  ['outline-room', sourceConstant(REPO_ROOT, 'apps/web/src/discoverability.ts', 'OUTLINE_TEXT_MODE_COPY')],
]);

function readOutput(relativePath) {
  const text = readFileSync(path.join(outputRoot, relativePath), 'utf8');
  assert.ok(text, `Missing or empty production output: ${relativePath}`);
  return text;
}

function stringLeaves(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringLeaves);
  return [];
}

function assertRoomStatus(text, room, surface) {
  assert.ok(text.toLowerCase().includes(room.title.toLowerCase()), `${surface} must name ${room.title}`);
  assert.match(text, /not yet open/i, `${surface} must state that ${room.title} is not yet open`);
  const openDoor = new RegExp(`${room.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[, ]+open the door`, 'i');
  assert.doesNotMatch(text, openDoor, `${surface} must not invite visitors into ${room.title}`);
}

const rooms = chambersForBuild(REPO_ROOT, false);
const sealedRooms = rooms.filter((room) => room.status === 'sealed');
assert.ok(sealedRooms.length > 0, 'Expected at least one room sealed by production release flags');

const llms = readOutput('llms.txt');
const llmsFull = readOutput('llms-full.txt');
const skill = readOutput('skill.md');
const sitemap = readOutput('sitemap.xml');

for (const room of sealedRooms) {
  const html = readOutput(`${room.slug}/index.html`);
  const markdown = readOutput(`${room.slug}.md`);
  assertRoomStatus(html, room, `${room.slug} route HTML`);
  assertRoomStatus(markdown, room, `${room.slug}.md`);

  const llmsLine = llms.split(/\r?\n/).find((line) => line.includes(room.title) || line.includes(`/${room.slug}.md`));
  assert.ok(llmsLine, `llms.txt must list ${room.title}`);
  assertRoomStatus(llmsLine, room, `llms.txt entry for ${room.title}`);

  const fullTextLines = llmsFull.split(/\r?\n/).filter((line) => line.includes(room.title) || line.includes(`/${room.slug}`));
  assert.ok(fullTextLines.length > 0, `llms-full.txt must list ${room.title}`);
  assertRoomStatus(fullTextLines.join('\n'), room, `llms-full.txt entry for ${room.title}`);

  const forbiddenCopy = [
    room.doorDescription,
    room.clipping.headline,
    room.clipping.dek,
    room.clipping.dateline,
    ...stringLeaves(extraRoomCopy.get(room.id)),
  ].filter(Boolean);
  for (const copy of forbiddenCopy) {
    for (const [surface, text] of [['route HTML', html], ['Markdown', markdown], ['llms.txt', llms], ['llms-full.txt', llmsFull], ['skill.md', skill]]) {
      assert.ok(!text.toLowerCase().includes(copy.toLowerCase()), `${surface} leaks sealed copy for ${room.title}: ${copy}`);
    }
  }

  assert.ok(!sitemap.includes(`https://unheld.space/${room.slug}`), `sitemap.xml must omit sealed route /${room.slug}`);
  assert.ok(!sitemap.toLowerCase().includes(room.title.toLowerCase()), `sitemap.xml must omit the sealed room name ${room.title}`);
}

console.log(`Production sealed-room text check passed for ${sealedRooms.map((room) => room.id).join(', ')}.`);
