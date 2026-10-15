#!/usr/bin/env node
/**
 * Builds the gramophone's records from their verified originals and writes what it made back into
 * manifest.json and THIRD_PARTY.md.
 *
 *   node apps/web/src/audio/music/records/build-records.mjs --originals <folder>
 *   node apps/web/src/audio/music/records/build-records.mjs --originals <folder> --check
 *   node apps/web/src/audio/music/records/build-records.mjs --markdown
 *
 * `<folder>` holds the original downloads under the file names in manifest.json (`original.file`).
 * They are not committed: the manifest holds each one's URL and sha256, and the build refuses any
 * file whose bytes differ. `--check` verifies the originals and stops. `--markdown` regenerates
 * THIRD_PARTY.md from the manifest without encoding.
 *
 * Needs ffmpeg with libopus and an AAC encoder on the PATH. Plain Node, no dependencies.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, 'manifest.json');
const THIRD_PARTY = path.join(HERE, 'THIRD_PARTY.md');

const HIGHPASS_HZ = 60;
const LOWPASS_HZ = 7000;
const PEAK_LIMIT = 0.891; // -1 dBFS
const AAC_RATE = 24000;

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const round = (value, places) => Number(value.toFixed(places));

function ffmpeg(args, { capture = false } = {}) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', capture ? 'pipe' : 'inherit'], maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`ffmpeg failed (${run.status}): ${run.stderr ?? ''}`);
  return run.stderr ?? '';
}

/** The signal every encode is made from, up to the gain: trimmed, mono, band-limited. */
function front() {
  return `pan=mono|c0=0.5*c0+0.5*c1,highpass=f=${HIGHPASS_HZ}:poles=2,lowpass=f=${LOWPASS_HZ}:poles=2`;
}

/** Integrated loudness and true peak, read from the summary ffmpeg prints on stderr. */
function loudness(input, transforms) {
  const summary = ffmpeg(['-ss', String(transforms.startS), '-to', String(transforms.endS), '-i', input, '-af', `${front()},ebur128=peak=true`, '-f', 'null', '-'], { capture: true });
  const integrated = /\n\s+I:\s+(-?[\d.]+) LUFS/.exec(summary.slice(summary.lastIndexOf('Summary:')));
  const peak = /\n\s+Peak:\s+(-?[\d.]+) dBFS/.exec(summary.slice(summary.lastIndexOf('Summary:')));
  if (!integrated || !peak) throw new Error(`could not read the loudness of ${input}`);
  return { lufs: Number(integrated[1]), peakDb: Number(peak[1]) };
}

function probeSeconds(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return round(Number(out.trim()), 2);
}

function encode(input, record, gainDb, outDir) {
  const { startS, endS, fadeInS, fadeOutS } = record.transforms;
  const length = endS - startS;
  const chain = [
    front(),
    `volume=${gainDb}dB`,
    `alimiter=limit=${PEAK_LIMIT}:attack=5:release=60:level=disabled`,
    `afade=t=in:st=0:d=${fadeInS}`,
    `afade=t=out:st=${round(length - fadeOutS, 3)}:d=${fadeOutS}`,
  ].join(',');
  const common = ['-y', '-ss', String(startS), '-to', String(endS), '-i', input, '-af', chain, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact'];
  const opus = path.join(outDir, `${record.id}.webm`);
  const aac = path.join(outDir, `${record.id}.m4a`);
  ffmpeg([...common, '-c:a', 'libopus', '-b:a', '24k', '-vbr', 'on', '-application', 'audio', '-compression_level', '10', '-frame_duration', '60', '-f', 'webm', opus]);
  ffmpeg([...common, '-c:a', 'aac', '-ar', String(AAC_RATE), '-b:a', '32k', '-movflags', '+faststart', '-f', 'mp4', aac]);
  return [
    { format: 'opus-webm', codec: 'opus', mime: 'audio/webm; codecs="opus"', path: path.basename(opus) },
    { format: 'aac-mp4', codec: 'mp4a.40.2', mime: 'audio/mp4; codecs="mp4a.40.2"', path: path.basename(aac) },
  ];
}

function describeOutputs(outputs, outDir) {
  return outputs.map((output) => {
    const file = path.join(outDir, output.path);
    return { ...output, bytes: statSync(file).size, sha256: sha256(file), durationS: probeSeconds(file) };
  });
}

function markdown(manifest) {
  const rows = manifest.records.map((r) => {
    const shipped = r.outputs.map((o) => `\`${o.path}\``).join(', ');
    return `| \`${r.id}\` | ${r.title} | ${r.composer.name} (${r.composer.born}–${r.composer.died}), ${r.composition.year} | ${r.performer} | [${r.licence.id}](${r.licence.url}) | <${r.source.page}> | ${manifest.retrieved} | ${shipped} |`;
  });
  const sections = manifest.records.map((r) => {
    const outputs = r.outputs.map((o) => `  - \`${o.path}\`: ${o.format}, ${o.bytes} bytes, ${o.durationS} s, sha256 \`${o.sha256}\``).join('\n');
    const t = r.transforms;
    const m = r.measured;
    return [
      `### ${r.title}, ${r.composer.name}`,
      '',
      `- **Composition:** first published ${r.composition.firstPublished}; ${r.composer.name} died ${r.composer.died}. ${r.composition.evidence}`,
      `- **Performer:** ${r.performer}.`,
      `- **Recording page:** <${r.source.page}> (revision ${r.source.revision}), from ${r.source.origin}.`,
      `- **Licence:** ${r.licence.name}, ${r.licence.url}. The page says: ${r.licence.statement}`,
      `- **Attribution:** ${r.attribution}`,
      `- **Retrieved:** ${manifest.retrieved}. Original: \`${r.original.file}\`, ${r.original.bytes} bytes, sha256 \`${r.original.sha256}\` (Commons SHA-1 \`${r.original.sha1}\`), downloaded from <${r.original.url}>.`,
      `- **Transforms:** trimmed to ${t.startS}–${t.endS} s; mixed to mono; high-pass ${HIGHPASS_HZ} Hz, low-pass ${LOWPASS_HZ / 1000} kHz; ${m ? `${m.gainDb} dB gain to ${manifest.loudnessTargetLufs} LUFS integrated (measured ${m.sourceLufs} LUFS, true peak ${m.sourcePeakDb} dBFS)` : 'gain to the loudness target'}; limiter at -1 dBFS; ${t.fadeInS} s fade in, ${t.fadeOutS} s fade out. Encoded as ${manifest.encoders.opus}, and as ${manifest.encoders.aac} (ffmpeg ${manifest.encoders.ffmpeg}).`,
      '- **Shipped:**',
      outputs,
      '',
    ].join('\n');
  });
  const total = manifest.records.flatMap((r) => r.outputs).reduce((n, o) => n + o.bytes, 0);
  return [
    '# Gramophone records',
    '',
    'Every record the lobby gramophone plays comes from a third party, under the licence named for it. This file is generated from `manifest.json` by `build-records.mjs`; edit the manifest and rebuild instead of editing it.',
    '',
    'Each recording was checked on its own Wikimedia Commons file page on the retrieval date, and the composition is public domain worldwide (composer died before 1955, work first published before 1931). The sha256 of every original is below; the originals are not committed, and the build refuses a file whose bytes differ.',
    '',
    `Shipped together: ${total} bytes of ${manifest.budgetBytes} allowed. A visitor loads one format, after the first sound unlock.`,
    '',
    '| Id | Title | Composer, year | Performer | Licence of the recording | Source page | Retrieved | Shipped files |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Attribution',
    '',
    ...manifest.records.map((r) => `- \`${r.id}\`: ${r.attribution}`),
    '',
    '## Detail',
    '',
    ...sections,
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

  if (flag('--markdown')) {
    writeFileSync(THIRD_PARTY, `${markdown(manifest)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), THIRD_PARTY)}`);
    return;
  }

  const at = args.indexOf('--originals');
  const originals = at >= 0 ? args[at + 1] : undefined;
  if (!originals || !existsSync(originals)) {
    console.error('usage: build-records.mjs --originals <folder> [--check] | --markdown');
    process.exit(2);
  }

  for (const record of manifest.records) {
    const input = path.join(originals, record.original.file);
    if (!existsSync(input)) throw new Error(`${record.id}: ${record.original.file} is not in ${originals}`);
    const actual = sha256(input);
    if (actual !== record.original.sha256) throw new Error(`${record.id}: ${record.original.file} has sha256 ${actual}, the manifest says ${record.original.sha256}`);
    console.log(`${record.id}: original verified (${record.original.sha256.slice(0, 12)})`);
  }
  if (flag('--check')) return;

  for (const record of manifest.records) {
    const input = path.join(originals, record.original.file);
    const before = loudness(input, record.transforms);
    const gainDb = round(manifest.loudnessTargetLufs - before.lufs, 2);
    const outputs = encode(input, record, gainDb, HERE);
    record.outputs = describeOutputs(outputs, HERE);
    record.measured = { sourceLufs: before.lufs, sourcePeakDb: before.peakDb, gainDb };
    console.log(`${record.id}: ${before.lufs} LUFS, gain ${gainDb} dB, ${record.outputs.map((o) => `${o.path} ${o.bytes} B`).join(', ')}`);
  }

  const total = manifest.records.flatMap((r) => r.outputs).reduce((n, o) => n + o.bytes, 0);
  console.log(`total ${total} bytes of ${manifest.budgetBytes}`);
  if (total > manifest.budgetBytes) throw new Error(`the records total ${total} bytes, over the ${manifest.budgetBytes} budget`);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(THIRD_PARTY, `${markdown(manifest)}\n`);
}

main();
