/** Inspect shipped GLB accessors and hierarchy, including the real transformed vertices. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const need = createRequire(join(realpathSync(join(repo, 'node_modules/@gltf-transform/cli')), 'package.json'));
const { NodeIO } = need('@gltf-transform/core');
const { ALL_EXTENSIONS } = need('@gltf-transform/extensions');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const directory = join(repo, 'apps/web/src/chambers/certification-office/scene/heroes');

const near = (actual, expected, eps = 0.00003) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) <= eps, `${actual} != ${expected}`));
};
const point = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
function bounds(nodes, morph = 0) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute('POSITION');
      const target = primitive.listTargets()[0]?.getAttribute('POSITION');
      for (let v = 0; v < pos.getCount(); v++) {
        const p = pos.getElement(v, []);
        if (target && morph) target.getElement(v, []).forEach((n, i) => p[i] += n * morph);
        const world = point(node.getWorldMatrix(), p);
        world.forEach((n, i) => { lo[i] = Math.min(lo[i], n); hi[i] = Math.max(hi[i], n); });
      }
    }
  }
  return { lo, hi, dimensions: hi.map((n, i) => n - lo[i]) };
}
function subtree(node) {
  return [node, ...node.listChildren().flatMap(subtree)];
}
async function load(name) {
  const bytes = readFileSync(join(directory, name + '.glb'));
  const doc = await io.readBinary(new Uint8Array(bytes));
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const find = n => { const node = nodes.find(node => node.getName() === n); assert.ok(node, `Missing ${n}`); return node; };
  const jsonSize = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const primitives = nodes.flatMap(n => n.getMesh()?.listPrimitives() || []);
  const triangles = primitives.reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  return { name, doc, root, nodes, find, primitives, triangles, bytes: bytes.length, json };
}

test('shipping budgets, compact static assembly, WebP and pivot-safe quantisation', async () => {
  let totalBytes = 0, totalTriangles = 0;
  for (const name of ['machine', 'press', 'desk']) {
    const model = await load(name);
    const { root, find, primitives, nodes, json } = model;
    const sceneRoot = find('office_' + name);
    assert.equal(root.listScenes().length, 1);
    assert.deepEqual(root.listScenes()[0].listChildren(), [sceneRoot]);
    near(sceneRoot.getTranslation(), [0, 0, 0]);
    near(sceneRoot.getScale(), [1, 1, 1]);
    assert.equal(new Set(nodes.map(n => n.getName())).size, nodes.length);
    assert.ok(root.listMaterials().length <= 4);
    const statics = sceneRoot.listChildren().filter(n => n.getMesh());
    assert.ok(statics.length <= 4);
    assert.equal(new Set(statics.map(n => n.getMesh().listPrimitives()[0].getMaterial())).size, statics.length);
    assert.ok(primitives.every(p => p.getMode() === 4));
    assert.ok(primitives.every(p => p.getAttribute('POSITION').getComponentType() === 5126));
    assert.ok(primitives.every(p => p.getAttribute('NORMAL').getComponentType() === 5122));
    assert.ok(primitives.every(p => p.getAttribute('TEXCOORD_0') && p.getAttribute('TEXCOORD_0').getComponentType() !== 5126));
    assert.ok(json.extensionsRequired.includes('KHR_mesh_quantization'));
    assert.ok(!JSON.stringify(json).match(/draco|meshopt|basisu|data:|https?:/i));
    assert.ok(root.listTextures().length > 0);
    root.listTextures().forEach(t => {
      assert.equal(t.getMimeType(), 'image/webp');
      assert.equal(Buffer.from(t.getImage()).subarray(0, 4).toString(), 'RIFF');
    });
    assert.ok((json.buffers || []).every(b => !b.uri));
    assert.ok((json.images || []).every(i => !i.uri));
    assert.deepEqual(json.asset, { version: '2.0' });
    const b = bounds(nodes);
    console.log(JSON.stringify({ name, bytes: model.bytes, triangles: model.triangles,
      materials: root.listMaterials().length, draws: primitives.length, bounds: b,
      nodes: nodes.map(n => ({ name: n.getName(), parent: n.getParentNode()?.getName(),
        translation: n.getTranslation(), primitives: n.getMesh()?.listPrimitives().length || 0 })) }));
    totalBytes += model.bytes;
    totalTriangles += model.triangles;
  }
  assert.ok(totalBytes <= 500000, `${totalBytes} bytes exceed lane budget`);
  assert.ok(totalTriangles <= 20000, `${totalTriangles} triangles exceed lane budget`);
});

test('component contracts still match the authoring datums', () => {
  const scene = join(repo, 'apps/web/src/chambers/certification-office/scene');
  const layout = readFileSync(join(scene, 'machineLayout.ts'), 'utf8');
  for (const [property, value] of Object.entries({ width: .7, height: .46, depth: .38,
    faceZ: .19, bodyBottom: .015, bodyTop: .475, hingeY: .042, hingeZ: .196 })) {
    const match = layout.match(new RegExp(`\\b${property}:\\s*([\\d.]+)`));
    assert.ok(match, property);
    assert.equal(Number(match[1]), value);
  }
  const palette = readFileSync(join(scene, 'palette.ts'), 'utf8');
  assert.match(palette, /PAPER_TOP = 0\.0115/);
  assert.match(palette, /REST_HEIGHT = 0\.065/);
  const runtime = readFileSync(join(scene, 'OfficeScene.tsx'), 'utf8');
  assert.match(runtime, /scale=\{\[1\.7, 2\.9, 1\.9\]\}/);
});

test('machine openings, bottom hinge, positive-X opening motion and deployed scale', async () => {
  const { find, nodes } = await load('machine');
  const hatch = find('hatch');
  assert.equal(hatch.getMesh(), null);
  near(hatch.getTranslation(), [0, .042, .196]);
  near(find('rear_link').getTranslation(), [.368, .12, -.19]);
  near(find('bell').getTranslation(), [.2, .481, -.02]);
  const panel = bounds([find('hatch_teal')]);
  near(panel.dimensions, [.5, .19, .01]);
  near(panel.lo, [-.25, .042, .191]);
  const shell = bounds([find('office_machine_teal')]);
  near(shell.lo, [-.35, .015, -.193]);
  near(shell.hi, [.35, .475, .202]);
  // A triangle must not bridge any opening where runtime dynamic planes sit.
  const casing = find('office_machine_teal');
  for (const primitive of casing.getMesh().listPrimitives()) {
    const pos = primitive.getAttribute('POSITION'), indices = primitive.getIndices();
    const vertex = i => point(casing.getWorldMatrix(), pos.getElement(indices.getScalar(i), []));
    for (let i = 0; i < indices.getCount(); i += 3) {
      const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
      if (!tri.every(p => p[2] > .18)) continue;
      const centre = [0, 1, 2].map(axis => tri.reduce((sum, p) => sum + p[axis], 0) / 3);
      assert.ok(!(Math.abs(centre[0]) < .294 && centre[1] > .318 && centre[1] < .436), 'Display obstructed');
      assert.ok(!(Math.abs(centre[0]) < .245 && centre[1] > .047 && centre[1] < .227), 'Hatch obstructed');
      assert.ok(!(centre[0] > -.224 && centre[0] < -.016 && centre[1] > .269 && centre[1] < .275), 'Receipt obstructed');
    }
  }
  hatch.setRotation([Math.sin(100 * Math.PI / 360), 0, 0, Math.cos(100 * Math.PI / 360)]);
  const open = bounds(subtree(hatch));
  assert.ok(open.hi[2] > .38 && open.lo[1] > 0, 'Open hatch clears support plane');
  find('office_machine').setScale([1.7, 2.9, 1.9]);
  near(bounds([find('office_machine_teal')]).dimensions, [.7 * 1.7, .46 * 2.9, .395 * 1.9]);
  assert.ok(bounds(nodes).hi.every(Number.isFinite));
});

test('press contact clearance, handle/carriage nodes and wire-preserving compression', async () => {
  const { find } = await load('press');
  const stamp = find('stamp');
  assert.equal(stamp.getMesh(), null);
  near(stamp.getTranslation(), [0, .0765, 0]);
  near(find('handle').getTranslation(), [0, .069, 0]);
  assert.equal(find('handle').getParentNode(), stamp);
  near(bounds([find('office_press_steel')]).lo, [-.25, 0, -.30]);
  near(bounds([find('office_press_steel')]).hi, [.25, .016, .26]);
  near([bounds([find('office_press_brass')]).hi[1]], [.3695]);
  const pad = find('pad_rubber');
  near(bounds([pad]).lo, [-.082, .0765, -.052]);
  stamp.setTranslation([0, .0115, 0]);
  near(bounds([pad]).lo, [-.082, .0115, -.052]);
  for (const side of ['left', 'right']) {
    const seat = find('spring_' + side);
    near(seat.getTranslation(), [side === 'left' ? -.21 : .21, .0118, 0]);
    const wire = find('spring_' + side + '_wire');
    const rest = bounds([wire]), compressed = bounds([wire], 1);
    near(rest.dimensions, [.0256, .1075 + .0018 * Math.sqrt(3), .0256]);
    near(compressed.dimensions, [.0256, .0425 + .0018 * Math.sqrt(3), .0256]);
    near(rest.lo, compressed.lo);
    assert.equal(wire.getMesh().listPrimitives()[0].listTargets().length, 1);
  }
});

test('desk top and ground datum, six functional drawers, unobstructed knee space', async () => {
  const { find, nodes } = await load('desk');
  const top = bounds([find('office_desk_linoleum')]);
  near(top.lo, [-1.1, -.05, -.55]);
  near(top.hi, [1.1, 0, .55]);
  near(bounds(nodes).lo, [-1.1, -.82, -.55]);
  near(bounds(nodes).hi, [1.1, 0, .55]);
  for (const side of ['left', 'right']) {
    for (let i = 1; i <= 3; i++) {
      const drawer = find(`drawer_${side}_${i}`);
      assert.equal(drawer.getMesh(), null);
      near(drawer.getTranslation(), [side === 'left' ? -.8 : .8, -.14 - (i - 1) * .23, .505]);
      const closed = bounds(subtree(drawer));
      drawer.setTranslation(drawer.getTranslation().map((n, axis) => n + (axis === 2 ? .28 : 0)));
      const open = bounds(subtree(drawer));
      near(open.lo, closed.lo.map((n, axis) => n + (axis === 2 ? .28 : 0)));
      near(open.hi, closed.hi.map((n, axis) => n + (axis === 2 ? .28 : 0)));
      assert.ok(closed.lo[0] >= (side === 'left' ? -1.04 : .56) - .00003);
      assert.ok(closed.hi[0] <= (side === 'left' ? -.56 : 1.04) + .00003);
    }
  }
});

test('the deployed casing bevel measures 8–15 mm after the machine host scale', async () => {
  const { find } = await load('machine');
  const casing=find('office_machine_teal');
  let topExtent=0;
  for(const primitive of casing.getMesh().listPrimitives()) {
    const positions=primitive.getAttribute('POSITION');
    for(let i=0;i<positions.getCount();i++) {
      const [x,y]=point(casing.getWorldMatrix(),positions.getElement(i,[]));
      if(Math.abs(y-.475)<.00001)topExtent=Math.max(topExtent,Math.abs(x));
    }
  }
  const localRadius=.35-topExtent;
  for(const axisScale of [1.7,2.9,1.9]) {
    const millimetres=localRadius*axisScale*1000;
    assert.ok(millimetres>=8&&millimetres<=15,`Casing bevel ${millimetres} mm`);
  }
});
