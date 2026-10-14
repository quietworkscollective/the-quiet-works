"""Build driver shared by every prop script: scene reset, bake, export, metadata.

A prop script defines `PROPS` (a list of spec dicts) and `build(spec) -> Built`, then calls `run(...)`.
`run` is what turns the geometry and procedural materials into a glTF binary with an atlas.
"""
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

from . import bake as bakemod
from . import geo

COPYRIGHT = '© 2026 Asiri Dalugoda. CC BY 4.0'


class Built:
    """What a prop's `build` hands back: every mesh part, the parts that move, and render hints."""

    def __init__(self, root, parts, moving=(), view=None, detail=None, stage='floor', notes=None, unbaked=()):
        self.root = root
        self.parts = list(parts)
        # parts that keep their own authored material (an emissive lamp glow stays a live emissive factor,
        # not a baked texel); everything else is baked into the one atlas
        self.unbaked = list(unbaked)
        self.moving = list(moving)
        self.view = view or {}
        self.detail = detail or {}
        self.stage = stage
        self.notes = notes or {}


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = {'work': None, 'only': None, 'res': None, 'blend': False, 'samples': None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--work':
            opts['work'] = argv[i + 1]
            i += 2
        elif a == '--only':
            opts['only'] = argv[i + 1].split(',')
            i += 2
        elif a == '--res':
            opts['res'] = int(argv[i + 1])
            i += 2
        elif a == '--samples':
            opts['samples'] = int(argv[i + 1])
            i += 2
        elif a == '--blend':
            opts['blend'] = True
            i += 1
        else:
            i += 1
    if not opts['work']:
        raise SystemExit('missing --work <dir>')
    return opts


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'
    return scene


def make_root(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = 'PLAIN_AXES'
    return root


def add_part(root, name, bm, material, location=(0.0, 0.0, 0.0), sharp_deg=50.0, weighted=True):
    """Create a mesh node under `root` from a bmesh, give it its authored material and finish its normals."""
    obj = geo.to_object(name, bm, parent=root, location=location, sharp_deg=sharp_deg)
    for m in (material if isinstance(material, (list, tuple)) else [material]):
        obj.data.materials.append(m)
    if weighted:
        geo.weight_normals(obj)
    return obj


def cull_hidden_faces(parts, moving, tol=0.0012, inset=0.2):
    """Delete faces nobody can see: ones lying against another static part (a board's inner face against
    the page block) or against the floor. A face goes only if its centre and every corner it was tested
    at are pressed within `tol` metres of another surface, so a plate on a big panel never takes the panel
    with it. Moving parts neither lose faces nor hide them: a drawer's inside shows when it is open."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    static = [o for o in parts if o.name not in moving]
    verts, polys = [], []
    for o in static:
        mesh = o.data
        mesh.calc_loop_triangles()
        base = len(verts)
        verts.extend(o.matrix_world @ v.co for v in mesh.vertices)
        polys.extend((base + t.vertices[0], base + t.vertices[1], base + t.vertices[2]) for t in mesh.loop_triangles)
    if not polys:
        return 0
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=1e-6)
    removed = 0
    for o in static:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        m3 = o.matrix_world.to_3x3()
        doomed = []
        for f in bm.faces:
            n = (m3 @ f.normal).normalized()
            c = f.calc_center_median()
            samples = [c] + [c + (v.co - c) * (1.0 - inset) for v in f.verts][:6]
            hidden = True
            for sp in samples:
                w = o.matrix_world @ sp
                hit = bvh.ray_cast(w + n * 2e-5, n, tol)
                on_floor = n.z < -0.995 and w.z < tol * 0.5
                # pressed against another surface: it must face this one head-on, not merely lie near it (a dent's far wall)
                touching = hit[0] is not None and hit[1].dot(n) < -0.7
                if not touching and not on_floor:
                    hidden = False
                    break
            if hidden:
                doomed.append(f)
        if doomed:
            if os.environ.get('PROPS_DEBUG'):
                for f in doomed[:12]:
                    c = o.matrix_world @ f.calc_center_median()
                    print(f'  cull {o.name}: centre ({c.x:.4f}, {c.y:.4f}, {c.z:.4f}) normal ({f.normal.x:.2f}, {f.normal.y:.2f}, {f.normal.z:.2f})')
            bmesh.ops.delete(bm, geom=doomed, context='FACES')
            removed += len(doomed)
            bm.to_mesh(o.data)
        bm.free()
    return removed


def part_objects(root):
    return [o for o in root.children_recursive if o.type == 'MESH']


def bounds(parts):
    """World-space bounds from the vertices themselves (a rotated box's corners would overstate a sphere)."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in parts:
        m = o.matrix_world
        for v in o.data.vertices:
            w = m @ v.co
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def export_glb(root, parts, path):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='NONE',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_copyright=COPYRIGHT,
    )


def run(props, build, argv_opts=None):
    opts = argv_opts or parse_args()
    os.makedirs(opts['work'], exist_ok=True)
    for spec in props:
        if opts['only'] and spec['id'] not in opts['only']:
            continue
        t0 = time.time()
        print(f'== {spec["id"]}')
        reset_scene()
        root = make_root(spec['id'])
        built = build(spec, root)
        parts = built.parts
        for o in parts:
            if o.parent is None:
                o.parent = root
        # locations, rotations and pivots set during the build are not in matrix_world until the scene updates
        bpy.context.view_layer.update()
        culled = cull_hidden_faces(parts, built.moving) if spec.get('cull', True) else 0
        tris = sum(geo.triangle_count(o) for o in parts)
        if culled:
            print(f'  culled {culled} hidden faces')
        lo, hi = bounds(parts)
        size = opts['res'] or spec.get('texture', 512 if spec.get('tier', 'small') == 'small' else 1024)
        print(f'  parts={len(parts)} tris={tris} size=({hi.x - lo.x:.3f}, {hi.y - lo.y:.3f}, {hi.z - lo.z:.3f}) tex={size}')
        if opts['blend']:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(opts['work'], f'{spec["id"]}.procedural.blend'))
        # island gutters twice as wide as the bake's edge extension, so neighbouring islands never bleed into each other
        baked = [o for o in parts if o not in built.unbaked]
        bakemod.unwrap_and_pack(baked, margin_px=2 * max(4, size // 128) + 2, size=size)
        maps = bakemod.bake_atlas(baked, size, opts['work'], spec['id'], ao_distance=spec.get('ao_distance', 0.3),
                                  samples=opts['samples'] or spec.get('bake_samples', 96),
                                  ao_samples=spec.get('ao_samples', 256), floor=spec.get('ground_ao', True))
        paths = bakemod.save_textures(maps, opts['work'], spec['id'], ao_strength=spec.get('ao_strength', 1.0))
        mat = bakemod.build_shipping_material(spec['id'], paths)
        bakemod.assign_single_material(baked, mat)
        glb = os.path.join(opts['work'], f'{spec["id"]}.raw.glb')
        export_glb(root, parts, glb)
        meta = {
            'id': spec['id'],
            'title': spec['title'],
            'tier': spec.get('tier', 'small'),
            'texture': size,
            'moving': built.moving,
            'emissive': [o.name for o in built.unbaked],
            'trianglesBlender': tris,
            'dimensions': [round(hi.x - lo.x, 4), round(hi.z - lo.z, 4), round(hi.y - lo.y, 4)],
            'stage': built.stage,
            'view': built.view,
            'detail': built.detail,
            'notes': built.notes,
        }
        with open(os.path.join(opts['work'], f'{spec["id"]}.meta.json'), 'w') as fh:
            json.dump(meta, fh, indent=2)
        if opts['blend']:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(opts['work'], f'{spec["id"]}.baked.blend'))
        print(f'  done in {time.time() - t0:.1f}s -> {glb}')
