"""Cycles stills of a shipped glTF binary: a three-quarter view from standing eye level (1.62 m) and a
close detail view, under a warm 3000 K key and a dim 4300 K fill.

Run: blender -b --factory-startup --python render.py -- --glb <file.glb> --meta <file.meta.json> --out <prefix>
         [--samples 128] [--size 1600x1200] [--only view|detail]
"""
import json
import math
import sys

import bpy
from mathutils import Vector

EYE = 1.62


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'glb': None, 'meta': None, 'out': None, 'samples': 128, 'size': (1600, 1200), 'only': None, 'exposure': -0.4,
         'balance': 'warm'}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == '--glb':
            o['glb'] = argv[i + 1]; i += 2
        elif k == '--meta':
            o['meta'] = argv[i + 1]; i += 2
        elif k == '--out':
            o['out'] = argv[i + 1]; i += 2
        elif k == '--samples':
            o['samples'] = int(argv[i + 1]); i += 2
        elif k == '--size':
            w, h = argv[i + 1].split('x'); o['size'] = (int(w), int(h)); i += 2
        elif k == '--only':
            o['only'] = argv[i + 1]; i += 2
        elif k == '--balance':
            o['balance'] = argv[i + 1]; i += 2
        elif k == '--exposure':
            o['exposure'] = float(argv[i + 1]); i += 2
        else:
            i += 1
    return o


def mat(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def box(name, size, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(material)
    return o


def build_stage(kind, lo, hi):
    """Returns the height of the surface the prop stands on."""
    wall = mat('wall', srgb('#46505A'), 0.92)
    floor = mat('floor', srgb('#30343A'), 0.5)
    oak = mat('oak', srgb('#3C4148'), 0.5)
    z0 = 0.0
    if kind == 'desk':
        z0 = 0.74
        box('desk', (1.6, 0.9, 0.04), (0, 0.05, z0 - 0.02), oak)
        box('desk_leg', (0.06, 0.06, z0 - 0.04), (0.7, 0.4, (z0 - 0.04) / 2), oak)
        box('desk_leg2', (0.06, 0.06, z0 - 0.04), (-0.7, 0.4, (z0 - 0.04) / 2), oak)
    elif kind == 'shelf':
        z0 = 0.9
        width = max(1.0, hi.x - lo.x + 0.16)
        depth = max(0.4, hi.y - lo.y + 0.08)
        box('shelf', (width, depth, 0.03), (0, (lo.y + hi.y) / 2, z0 - 0.015), oak)
    elif kind == 'wall':
        z0 = 1.05
    box('floor', (8, 8, 0.05), (0, 0, -0.025), floor)
    wall_y = hi.y + 0.026 if kind in ('wall', 'shelf') and (kind == 'wall' or hi.y - lo.y > 0.3) else 0.9
    box('wall', (8, 0.05, 4), (0, wall_y, 2.0), wall)
    return z0


def add_light(name, kind, loc, target, energy, kelvin, size):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    if kind == 'AREA':
        data.shape = 'RECTANGLE'
        data.size = size[0]
        data.size_y = size[1]
    data.use_nodes = True
    nt = data.node_tree
    bb = nt.nodes.new('ShaderNodeBlackbody')
    bb.inputs['Temperature'].default_value = kelvin
    em = nt.nodes.get('Emission')
    nt.links.new(bb.outputs['Color'], em.inputs['Color'])
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return obj


def camera(loc, target, lens):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    cam.sensor_width = 36
    obj = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    d = Vector(target) - Vector(loc)
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = obj
    return obj


def setup_render(o):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != 'CPU'
    s.cycles.device = 'GPU'
    s.cycles.samples = o['samples']
    s.cycles.use_denoising = True
    s.cycles.denoiser = 'OPENIMAGEDENOISE'
    s.cycles.max_bounces = 8
    s.render.resolution_x, s.render.resolution_y = o['size']
    s.render.resolution_percentage = 100
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'None'
    s.view_settings.exposure = o['exposure']
    s.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new('w')
    s.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    # an indoor environment: dim walls, brighter ceiling, dark floor, so glossy metal has something to reflect
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.010, 0.010, 0.011, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.16, 0.155, 0.15, 1)
    mid = ramp.color_ramp.elements.new(0.62)
    mid.color = (0.05, 0.048, 0.046, 1)
    nt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def main():
    o = parse()
    meta = json.load(open(o['meta']))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=o['glb'])
    imported = [x for x in bpy.context.scene.objects]
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for x in imported:
        if x.type == 'MESH':
            for c in x.bound_box:
                w = x.matrix_world @ Vector(c)
                lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
                hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    stage = meta.get('stage', 'floor')
    z0 = build_stage(stage, lo, hi)
    # lift the whole imported hierarchy onto the surface
    for x in imported:
        if x.parent is None:
            x.location.z += z0
    setup_render(o)

    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, z0 + (hi.z - lo.z) / 2))
    key_t = centre
    # key: warm, up and to the left-front, fill: cool-warm, low, right. Scaled to the prop.
    span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    k = max(0.5, span)
    kk, kf, kr = (3000, 4300, 3300) if o['balance'] == 'warm' else (5200, 5800, 5400)
    add_light('key', 'AREA', (centre.x - 1.4 * k - 0.3, centre.y - 1.8 * k - 0.4, centre.z + 1.6 * k + 0.5), key_t,
              energy=meta.get('key_energy', 150 * (k + 0.6) ** 2), kelvin=kk, size=(0.9 * k + 0.4, 0.9 * k + 0.4))
    add_light('fill', 'AREA', (centre.x + 1.6 * k + 0.5, centre.y - 1.2 * k - 0.5, centre.z + 0.4 * k + 0.2), key_t,
              energy=meta.get('fill_energy', 60 * (k + 0.6) ** 2), kelvin=kf, size=(1.4 * k + 0.5, 1.4 * k + 0.5))
    add_light('rim', 'AREA', (centre.x + 0.5 * k + 0.2, centre.y + 0.8, centre.z + 1.2 * k + 0.4), key_t,
              energy=meta.get('rim_energy', 30 * (k + 0.6) ** 2), kelvin=kr, size=(0.6, 0.6))

    add_light('strip', 'AREA', (centre.x - 1.1 * k - 0.5, centre.y + 0.55, centre.z + 0.35 * k + 0.1), key_t,
              energy=meta.get('strip_energy', 45 * (k + 0.6) ** 2), kelvin=kr, size=(0.18, 1.1 * k + 0.4))
    jobs = []
    v = meta.get('view', {})
    d = meta.get('detail', {})
    if o['only'] in (None, 'view'):
        jobs.append(('view', v, 55, True))
    if o['only'] in (None, 'detail'):
        jobs.append(('detail', d, 90, False))
    for tag, spec, lens, eye in jobs:
        tgt = Vector(spec.get('target', (centre.x, centre.y, hi.z - lo.z / 2)))
        tgt.z += z0
        dist = spec.get('distance', 1.4)
        az = math.radians(spec.get('azimuth', 35))
        if eye:
            cz = EYE
            horiz = math.sqrt(max(dist * dist - (cz - tgt.z) ** 2, 0.05))
        else:
            el = math.radians(spec.get('elevation', 10))
            cz = tgt.z + dist * math.sin(el)
            horiz = dist * math.cos(el)
        loc = (tgt.x + horiz * math.sin(az), tgt.y - horiz * math.cos(az), cz)
        if eye:
            # frame the prop: its bounding sphere fills about 70% of the frame height, whatever its size
            radius = 0.5 * (hi - lo).length
            d3 = (Vector(loc) - tgt).length
            vfov = 2.0 * math.asin(min(radius / max(d3, radius * 1.05), 0.95)) / 0.70
            sensor_h = 36.0 * o['size'][1] / o['size'][0]
            lens = max(35.0, min(220.0, (sensor_h / 2.0) / math.tan(vfov / 2.0)))
        camera(loc, tgt, lens if eye else spec.get('lens', lens))
        bpy.context.scene.render.filepath = f'{o["out"]}-{tag}.png'
        bpy.ops.render.render(write_still=True)
        print('rendered', bpy.context.scene.render.filepath)


main()
