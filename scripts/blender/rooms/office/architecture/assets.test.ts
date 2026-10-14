/** Tests inspect shipped binary vertex data, names and transforms, not build constants. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readGlb } from '../../../../../apps/web/src/assets/original/glb.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const out = join(repo, 'apps/web/src/chambers/certification-office/scene/heroes');
const need = createRequire(join(realpathSync(join(repo, 'node_modules/@gltf-transform/cli')), 'package.json'));
const { NodeIO } = need('@gltf-transform/core');
const { ALL_EXTENSIONS } = need('@gltf-transform/extensions');
const validateBytes = need('gltf-validator').validateBytes;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const names = ['application-board', 'employee-window', 'certificate-sign', 'archive-bay'];

function near(actual: number, expected: number, tolerance = .0001): void {
  assert.ok(Math.abs(actual-expected) <= tolerance, `${actual} differs from ${expected}`);
}

function bounds(node: any): { min: number[]; max: number[]; size: number[] } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  node.traverse((child: any) => {
    const m = child.getWorldMatrix();
    for (const primitive of child.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute('POSITION').getArray();
      for (let i=0; i<positions.length; i+=3) {
        const x=positions[i], y=positions[i+1], z=positions[i+2];
        const v = [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
        for (let axis=0; axis<3; axis++) { min[axis]=Math.min(min[axis],v[axis]);max[axis]=Math.max(max[axis],v[axis]); }
      }
    }
  });
  return {min,max,size:max.map((v,i)=>v-min[i])};
}

async function asset(name: string) {
  const bytes = new Uint8Array(readFileSync(join(out, `${name}.glb`)));
  const stats = readGlb(bytes);
  const doc = await io.readBinary(bytes);
  const nodes = new Map<string, any>(doc.getRoot().listNodes().map((n: any)=>[n.getName(),n]));
  return {bytes,stats,doc,nodes};
}

test('four valid local GLBs fit the whole lane budget; finish maps are WebP and pivots remain unquantized', async () => {
  let bytes=0, triangles=0;
  for (const name of names) {
    const a = await asset(name);
    bytes+=a.stats.fileBytes;triangles+=a.stats.triangles;
    const validation = await validateBytes(a.bytes, {maxIssues:100});
    assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages));
    assert.ok(a.nodes.has(name));
    assert.deepEqual(a.nodes.get(name).getTranslation(),[0,0,0]);
    assert.ok(a.stats.imageTypes.length>0);
    assert.ok(a.stats.imageTypes.every(t=>t==='image/webp'));
    assert.ok(a.stats.extensionsRequired.includes('KHR_mesh_quantization'));
    assert.ok(!a.stats.extensionsUsed.some(e=>/draco|meshopt|basisu/i.test(e)));
    assert.ok(a.doc.getRoot().listMaterials().length<=3);
    const staticMaterials = new Set();
    for (const node of a.doc.getRoot().listNodes()) {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        assert.equal(primitive.getAttribute('POSITION').getComponentType(),5126);
        assert.equal(primitive.getAttribute('NORMAL').getComponentType(),5122);
        assert.ok(primitive.getAttribute('NORMAL').getNormalized());
        const uv = primitive.getAttribute('TEXCOORD_0');
        if (uv) { assert.equal(uv.getComponentType(),5123);assert.ok(uv.getNormalized()); }
        else assert.match(node.getName(),/^lamp-/); // Untextured lenses have no unused UV stream.
        if (!/^(catch-|lamp-|flap-)/.test(node.getName()))staticMaterials.add(primitive.getMaterial());
      }
    }
    assert.ok(staticMaterials.size<=3);
    const data = a.doc.getRoot();
    assert.equal(data.listAnimations().length,0);
    assert.equal(data.listCameras().length,0);
    console.log(`${name}: ${a.stats.fileBytes} bytes, ${a.stats.triangles} triangles, ${a.stats.meshNodes} mesh nodes, ${data.listMaterials().length} materials, bounds ${JSON.stringify(a.stats.size)}`);
  }
  assert.ok(bytes<=500_000, `${bytes} bytes exceed lane budget`);
  assert.ok(triangles<=20_000, `${triangles} triangles exceed lane budget`);
  console.log(`lane: ${bytes} bytes, ${triangles} triangles`);
});

test('board preserves its metre envelope, lamp centres, moving catches and genuinely empty fifth socket', async () => {
  const {nodes,stats} = await asset('application-board');
  near(stats.size.x,1.95);near(stats.size.y,.62);
  near(stats.min.x,-.975);near(stats.min.y,-.31);near(stats.min.z,-.0285);
  assert.equal(stats.meshNodes,10); // Two static draws, four lenses, four catches.
  const face = bounds(nodes.get('board-shell'));
  assert.ok(face.max[2]<=.0381);
  for (let i=0;i<4;i++) {
    const x = -.78+i*.39;
    const lamp = nodes.get(`lamp-${i+1}`), tab = nodes.get(`catch-${i+1}`);
    assert.ok(lamp && tab);
    [x,-.02,.057].forEach((v,j)=>near(lamp.getWorldTranslation()[j],v));
    [x,-.17,.060].forEach((v,j)=>near(tab.getWorldTranslation()[j],v));
    const b = bounds(tab);
    [.36,.13,.006].forEach((v,j)=>near(b.size[j],v));
    assert.ok(b.max[2]<.065); // Runtime canvas plane sits in front of the tab.
    tab.setTranslation([x,-.29,.060]);
    near(bounds(tab).min[1],-.355);
  }
  assert.ok(!nodes.has('lamp-5') && !nodes.has('catch-5'));
  // Read actual triangles: the socket's centre corridor has no geometry at lens depth.
  const hardware = nodes.get('board-trim');
  const p = hardware.getMesh().listPrimitives()[0].getAttribute('POSITION').getArray();
  let centreObstructions=0;
  for(let i=0;i<p.length;i+=3)if(Math.hypot(p[i]-.78,p[i+1]+.02)<.02 && p[i+2]>.042)centreObstructions++;
  assert.equal(centreObstructions,0);
});

test('window frame matches the runtime origin and the flap rotates around its top edge', async () => {
  const {nodes,stats,doc} = await asset('employee-window');
  near(stats.size.x,1.66);near(stats.size.y,1.22);
  near(stats.min.x,-.83);near(stats.min.y,-.61);near(stats.min.z,-.104);
  assert.equal(stats.meshNodes,5); // Three static surfaces plus two moving flap materials.
  const glazing = doc.getRoot().listMaterials().find((m: any)=>m.getName()==='window-glass');
  assert.equal(glazing.getAlphaMode(),'BLEND');near(glazing.getBaseColorFactor()[3],.12);
  assert.equal(glazing.getDoubleSided(),false);
  const flap = nodes.get('speaking-flap');
  [0,-.305,-.035].forEach((v,i)=>near(flap.getWorldTranslation()[i],v));
  assert.ok(flap.listChildren().includes(nodes.get('flap-panel')));
  assert.ok(flap.listChildren().includes(nodes.get('flap-hardware')));
  const b = bounds(nodes.get('flap-panel'));
  [.32,.19,.015].forEach((v,i)=>near(b.size[i],v));
  near(b.max[1],-.305);near(b.min[1],-.495);
  flap.setRotation([Math.sin(-1.1/2),0,0,Math.cos(-1.1/2)]);
  const open = bounds(flap);
  assert.ok(open.max[2]>.129 && open.max[2]<.131);
  assert.ok(open.min[1]>-.435); // The cranked handle extends below the opened panel.
  near(bounds(nodes.get('flap-panel')).min[1],-.41025,.001);
  near(flap.getWorldTranslation()[1],-.305);
  // Detect actual vertical bar vertex groups at 150 mm centres and 14 mm diameters.
  const h = nodes.get('window-hardware').getMesh().listPrimitives()[0].getAttribute('POSITION').getArray();
  for(let i=0;i<10;i++) {
    const centre = -.675+i*.15, xs:number[]=[];
    for(let k=0;k<h.length;k+=3)if(Math.abs(h[k]-centre)<.008 && h[k+2]>.052 && h[k+2]<.068 && Math.abs(h[k+1]-.525)<.0001)xs.push(h[k]);
    near(Math.max(...xs)-Math.min(...xs),.014);
  }
});

test('sign retains the 1.6 m label surface and brackets behind its original canvas plane', async () => {
  const {nodes,stats} = await asset('certificate-sign');
  near(stats.size.x,1.6);near(stats.size.y,.26);
  near(stats.min.x,-.8);near(stats.min.y,-.13);
  assert.equal(stats.meshNodes,2);
  assert.ok(stats.max.z<=-.0009); // At least 0.9 mm before the original runtime canvas at Z=0.
  assert.ok(stats.min.z<-.08);
  assert.ok(bounds(nodes.get('sign-face')).max[2]<=-.0039);
});

test('archive is a floor-centred 3 x 2.8 x .6 module with exactly three static instanceable meshes', async () => {
  const {nodes,stats,doc} = await asset('archive-bay');
  [3,2.8,.6].forEach((v,i)=>near([stats.size.x,stats.size.y,stats.size.z][i],v));
  near(stats.min.x,-1.5);near(stats.min.y,0);near(stats.min.z,-.3);
  assert.equal(stats.meshNodes,3);
  for(const name of ['bay-frame','bay-cartons','bay-labels']) {
    const n = nodes.get(name);assert.ok(n);
    assert.ok(nodes.get('archive-bay').listChildren().includes(n));
    assert.deepEqual(n.getTranslation(),[0,0,0]);
    assert.equal(n.getMesh().listPrimitives().length,1);
  }
  assert.equal(doc.getRoot().listNodes().length,4);
  const b = bounds(nodes.get('bay-labels'));
  near(b.max[2],.2435); // Overlay at .245 has 1.5 mm clearance.
  // No front upright may cross the central carton labels. Test triangle extents,
  // because the long upright has no vertex at the label's height.
  const p = nodes.get('bay-frame').getMesh().listPrimitives()[0];
  const positions = p.getAttribute('POSITION').getArray(), indices = p.getIndices().getArray();
  for (let row=0;row<4;row++) {
    const cx = row%2 ? .014 : -.014, cy=.249+row*.64;
    for(let i=0;i<indices.length;i+=3) {
      const verts = [indices[i],indices[i+1],indices[i+2]].map(k=>[positions[k*3],positions[k*3+1],positions[k*3+2]]);
      const lo = [0,1,2].map(j=>Math.min(...verts.map(v=>v[j]))), hi=[0,1,2].map(j=>Math.max(...verts.map(v=>v[j])));
      const overlaps = lo[2]>.245 && lo[0]<cx+.075 && hi[0]>cx-.075 && lo[1]<cy+.025 && hi[1]>cy-.025;
      assert.ok(!overlaps,`front support blocks centre label on row ${row}`);
    }
  }
});
