import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROPS = join(ROOT, 'scripts/blender/props');
const read = (name) => readFileSync(join(PROPS, name), 'utf8');

test('tall trophy cup keeps its close-up turning smooth', () => {
  const source = read('trophy_cup_tall.py');
  assert.match(source, /SEGMENTS\s*=\s*56/);
  assert.match(source, /SEG_TOL\s*=\s*0\.00028/);
  assert.match(source, /geo\.wobble\(body,\s*0\.00035/);
});

test('service bell keeps its curved dome and spun brass finish', () => {
  const source = read('service_bell.py');
  assert.match(source, /geo\.catmull2\(\[\(0\.0400, 0\.0180\)/);
  assert.match(source, /dome_m\s*=\s*mats\.brass\([^\n]*spin=0\.6/);
});

test('radiators use distinct cream and bottle-green enamel', () => {
  const source = read('column_radiator.py');
  assert.match(source, /finish='cream'/);
  assert.match(source, /finish='dark'/);
  assert.match(source, /mats\.enamel\('cream enamel', color='#ABA38C'/);
  assert.match(source, /mats\.enamel\('dark enamel', color='#2A3A30'/);
  assert.doesNotMatch(source, /color='#2F6A63'/);
});

test('cricket bat reads as worn willow, not pale unfinished wood', () => {
  const source = read('cricket_bat.py');
  assert.match(source, /light='#B38E60', dark='#70492A'/);
  assert.match(source, /color='#9B6F3E', strength=0\.32/);
});

test('books keep softened edges and the warmer page palette', () => {
  const source = read('book_rows.py');
  assert.match(source, /def page_curl\(bm, rng\):/);
  assert.match(source, /v\.co\.z \+= lift/);
  const materials = read('propkit/mats.py');
  assert.match(materials, /hex_rgb\('#CDBB93'\)/);
  assert.match(materials, /hex_rgb\('#D8C9A4'\)/);
});

test('squat trophy gilt uses the quieter, less saturated metal palette', () => {
  const materials = read('propkit/mats.py');
  assert.match(materials, /def gilt\([^\n]+[\s\S]*?kw\.setdefault\('bright', '#CDB784'\)/);
  assert.match(materials, /kw\.setdefault\('mid', '#A28D5C'\)/);
  assert.match(materials, /kw\.setdefault\('dull', '#74653F'\)/);
  assert.match(materials, /kw\.setdefault\('deep', '#37301F'\)/);
});

test('shared finishes retain fine scratches and restrained lived-in variation', () => {
  const materials = read('propkit/mats.py');
  assert.match(materials, /def scratch_lines\(/);
  assert.match(materials, /def lived_in\(/);
  assert.match(materials, /col, rough, hx = lived_in\(ng, pos, col, rough, seed=seed, amount=life/);
  assert.match(materials, /lines = scratch_lines\(ng, pos, seed \+ 1\)/);
});

test('box-file cloth stays dark without broad mottling', () => {
  const source = read('box_files.py');
  assert.match(source, /mottle=0\.0 if v\['marble'\] else 0\.06/);
  assert.match(source, /life=0\.0 if v\['marble'\] else 1\.0/);
  assert.match(source, /spine_spots = \(\[dict\(at=\(0\.0, -D \/ 2, 0\.05\), radius=\(0\.013, 0\.006, 0\.016\)/);
});

test('box-file front cloth has no nearly coplanar marbled backing', { timeout: 30_000 }, () => {
  const blender = process.env['BLENDER'] ?? '/Applications/Blender.app/Contents/MacOS/Blender';
  assert.ok(existsSync(blender), `Blender executable not found: ${blender}`);
  const scriptPath = mkdtempSync(join(tmpdir(), 'tqw-box-file-guard-'));
  const script = join(scriptPath, 'inspect.py');
  const python = `
import sys
sys.path.insert(0, ${JSON.stringify(PROPS)})
import box_files
from propkit.kit import make_root, reset_scene
reset_scene()
root = make_root('box-file-guard')
spec = next(p for p in box_files.PROPS if p['id'] == 'box-file-a')
obj = box_files.build(spec, root).parts[0]
D = box_files.VARIANTS['box-file-a']['D']
backing = [p for p in obj.data.polygons
           if p.normal.y < -0.99 and abs(p.center.y + D / 2) < 1e-5]
cloth = [p for p in obj.data.polygons
         if p.normal.y < -0.99 and p.center.y < -D / 2 - 2e-4]
if backing:
    print(f'BOX_BACKING_FACE_COUNT={len(backing)}', flush=True)
    sys.exit(17)
if not cloth:
    print('BOX_FRONT_CLOTH_MISSING', flush=True)
    sys.exit(18)
print('BOX_FRONT_CLOTH_ONLY')
`;
  try {
    writeFileSync(script, python);
    const result = spawnSync(blender, ['-b', '--factory-startup', '--python', script], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 25_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /BOX_FRONT_CLOTH_ONLY/);
  } finally {
    rmSync(scriptPath, { recursive: true, force: true });
  }
});
