#!/usr/bin/env node
// Prints the catalogue as a table and the sums the budgets are checked against.
//   node scripts/assets/summary.mjs
import { BUDGET_BYTES } from '../../apps/web/src/assets/policy.ts';
import { CATALOGUE_DATA } from '../../apps/web/src/assets/catalogue.data.ts';

const kb = (bytes) => `${(bytes / 1000).toFixed(0)} kB`;
const rows = CATALOGUE_DATA.map((e) => [
  e.id,
  e.kind === 'model' ? e.tier : 'surface',
  e.kind === 'model' ? e.triangles : `${e.texelsPerMetre} px/m`,
  e.kind === 'model' ? e.dimensions.map((d) => d.toFixed(2)).join(' x ') : `${e.tileMetres} m tile`,
  kb(e.compressedBytes),
  e.kind === 'model' ? `tex ${kb(e.textureBytes)} geo ${kb(e.compressedBytes - e.textureBytes)}` : '',
  `${(e.textureMemoryBytes / 1048576).toFixed(1)} MiB`,
  e.licence,
  e.tags.join(' '),
]);
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
for (const row of rows) console.log(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd());

const sum = (entries, field) => entries.reduce((total, e) => total + e[field], 0);
const withTag = (tag) => CATALOGUE_DATA.filter((e) => e.tags.includes(tag));
const models = CATALOGUE_DATA.filter((e) => e.kind === 'model');
const surfaces = CATALOGUE_DATA.filter((e) => e.kind === 'surface');
console.log('');
console.log(`models   ${models.length}  ${kb(sum(models, 'compressedBytes'))}  ${sum(models, 'triangles')} triangles`);
console.log(`surfaces ${surfaces.length}  ${kb(sum(surfaces, 'compressedBytes'))}`);
console.log(`library  ${kb(sum(CATALOGUE_DATA, 'compressedBytes'))} (cap 15 MiB)  texture memory ${(sum(CATALOGUE_DATA, 'textureMemoryBytes') / 1048576).toFixed(1)} MiB`);
const mib = (entries) => `${(sum(entries, 'textureMemoryBytes') / 1048576).toFixed(1)} MiB decoded`;
console.log(`initial-corridor surfaces  ${kb(sum(withTag('initial-corridor'), 'compressedBytes'))}  (allocation ${kb(BUDGET_BYTES.corridorSurfaces)})  ${mib(withTag('initial-corridor'))}`);
console.log(`lazy-office set            ${kb(sum(withTag('lazy-office'), 'compressedBytes'))}  (allocation ${kb(BUDGET_BYTES.officeLazy)})  ${mib(withTag('lazy-office'))}  ${sum(withTag('lazy-office').filter((e) => e.kind === 'model'), 'triangles')} triangles`);
