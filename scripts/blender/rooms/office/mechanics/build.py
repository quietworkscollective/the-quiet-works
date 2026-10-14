"""Metre-scale Office mechanics. Reproduce with `node .../mechanics/run.ts --work <dir>`.

Authoring is Blender Z-up; xyz() maps component-local Y-up metres before glTF export.
Only geometry and material texture are authored here. All lettering remains runtime canvas art.
"""
import argparse
import math
from pathlib import Path
import sys
from types import SimpleNamespace

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(REPO / 'scripts/blender/props'))
from propkit import geo, kit


def xyz(p):
    return (p[0], -p[2], p[1])


def box(size, at=(0, 0, 0), bevel=0.001, segs=1):
    return geo.box((size[0], size[2], size[1]), center=xyz(at), bevel=bevel, segs=segs)


def turned(profile, at=(0, 0, 0), axis=(0, 1, 0), segments=12):
    bm = geo.lathe(geo.fillet_profile(profile, step_deg=45, min_segs=1), segments=segments)
    return geo.place(bm, xyz(at), xyz(axis))


def cylinder(radius, length, at, axis=(0, 1, 0), segments=12):
    return turned([(0, 0), (radius, 0), (radius, length), (0, length)], at, axis, segments)


def tube(points, radius=0.003, sides=8):
    return geo.sweep([xyz(p) for p in points], (radius, radius), sides=sides)


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, color, metallic, roughness, work, kind='enamel'):
    """Small deterministic, unlettered tile. UVs and normals are quantised after export."""
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    image = bpy.data.images.new(name, width=128, height=128)
    pixels = []
    for y in range(128):
        for x in range(128):
            noise = math.sin(x * 127.1 + y * 311.7) * 43758.5453
            noise = noise - math.floor(noise) - 0.5
            if kind == 'wood':
                grain = math.sin(y * 1.15 + math.sin(x * 0.05) * 1.9)
                variation = 1 + 0.10 * grain + 0.045 * noise
            elif kind == 'metal':
                variation = 1 + 0.025 * math.sin(y * 2.8) + 0.014 * noise
            else:
                variation = 1 + 0.028 * noise
            tone = [0.29, 0.14, 0.035] if kind == 'display' and y >= 64 else rgb
            pixels.extend([min(1, max(0, c * variation)) for c in tone] + [1])
    image.pixels = pixels
    image.filepath_raw = str(work / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mat.diffuse_color = (*[linear(c) for c in rgb], 1)
    return mat


class Assembly:
    """One static mesh per material; motion empties retain their component-local origins."""
    def __init__(self, name, mats):
        self.root = kit.make_root(name)
        self.nodes = {name: self.root}
        self.origins = {name: Vector((0, 0, 0))}
        self.groups = {}
        self.mats = mats

    def pivot(self, name, at, parent=None):
        parent = parent or self.root.name
        obj = kit.make_root(name)
        obj.parent = self.nodes[parent]
        obj.location = Vector(xyz(at)) - self.origins[parent]
        self.nodes[name] = obj
        self.origins[name] = Vector(xyz(at))
        return obj

    def add(self, mat, bm, node=None):
        node = node or self.root.name
        geo.translate(bm, -self.origins[node])
        key = (node, mat)
        self.groups.setdefault(key, []).append(bm)

    def screw(self, at, node=None, axis=(0, 0, 1), radius=0.0035, mat='brass'):
        # Slotted domed head: the cut, rather than a painted cross, catches the light.
        bm = turned([(0, 0), (radius, 0), (radius, .001, .0004),
                     (radius * .72, .0018), (0, .002)], at, axis, 8)
        if axis == (0, 0, 1):
            cutter = box((radius * 1.45, .00065, .0015), (at[0], at[1], at[2] + .002), 0)
            bm = geo.boolean_cut(bm, [cutter])
        self.add(mat, bm, node)

    def finish(self):
        for (node, mat), meshes in self.groups.items():
            bm = geo.merge(*meshes)
            geo.clean(bm)
            obj = kit.add_part(self.nodes[node], f'{node}_{mat}', bm, self.mats[mat])
            # Surface projection in metres, stable across joined parts and reproducible.
            uv = obj.data.uv_layers.get('UVMap') or obj.data.uv_layers.new(name='UVMap')
            for face in obj.data.polygons:
                normal = face.normal
                drop = max(range(3), key=lambda i: abs(normal[i]))
                axes = [i for i in range(3) if i != drop]
                for loop in face.loop_indices:
                    p = obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    # All UVs stay in [0,1], so the shared optimiser can quantise them.
                    u, v = p[axes[0]] / 3 + .5, p[axes[1]] / 3 + .5
                    if obj.name == 'office_machine_dark':
                        centre = face.center
                        display = -.176 < centre.y < -.164 and .307 < centre.z < .447 and abs(centre.x) < .305
                        v = (.54 if display else .04) + v * .40
                    uv.data[loop].uv = (u, v)
        bpy.context.view_layer.update()


def machine(work):
    kit.reset_scene()
    mats = {
        'teal': material('machine_teal', '#3C7775', .30, .34, work),
        'dark': material('machine_dark', '#151A20', .18, .58, work, 'display'),
        'brass': material('machine_brass', '#B08A4E', .78, .30, work, 'metal'),
        'steel': material('machine_steel', '#737A79', .80, .43, work, 'metal'),
    }
    a = Assembly('office_machine', mats)
    shell = box((.7, .46, .38), (0, .245, 0), .005, 3)
    shell = geo.boolean_cut(shell, [
        box((.668, .428, .350), (0, .245, 0), 0),
        box((.6, .13, .08), (0, .377, .19), .003),
        box((.5, .19, .08), (0, .137, .19), .001),
        box((.22, .01, .08), (-.12, .272, .19), .001),
    ])
    geo.bevel_by_angle(shell, .0015, segs=1)
    a.add('teal', shell)
    # Recesses are real holes. Canvas display/interior/receipt planes remain unobstructed.
    a.add('dark', box((.608, .138, .008), (0, .377, .170), .003))
    for w, h, ow, oh, y in [(.64, .17, .6, .13, .377), (.524, .214, .5, .19, .137)]:
        frame = box((w, h, .012), (0, y, .196), .002, 2)
        frame = geo.boolean_cut(frame, [box((ow, oh, .06), (0, y, .196), .001)])
        geo.bevel_by_angle(frame, .0006, 1)
        a.add('teal', frame)
    a.add('dark', box((.498, .185, .007), (0, .137, -.155), .002))
    for x in (-.185, .185):
        a.add('steel', box((.017, .125, .022), (x, .137, -.133), .002))
        for y in (.083, .191):
            a.screw((x, y, -.12), radius=.003, mat='steel')
    a.add('dark', box((.224, .014, .009), (-.12, .272, .166), .002))
    a.add('brass', box((.24, .003, .008), (-.12, .2655, .194), .001))
    for x in (.1, .138, .176):
        a.add('dark', cylinder(.0095, .003, (x, .272, .19), (0, 0, 1), 14))
    for x in (-.335, .335):
        for y in (.441, .313, .052, .222):
            a.screw((x, y, .19))
    # Rear service plate with a narrow perimeter seam and separate slotted fasteners.
    a.add('dark', box((.284, .166, .002), (0, .22, -.1905), .004))
    a.add('steel', box((.278, .16, .003), (0, .22, -.192), .004))
    for x in (-.121, .121):
        for y in (.158, .282):
            a.screw((x, y, -.194), axis=(0, 0, -1), mat='steel')
    for y in (.33, .35, .37):
        a.add('dark', box((.18, .004, .001), (0, y, -.1902), .001))
        a.add('teal', box((.184, .003, .006), (0, y + .003, -.19), .001))
    for x in (-.29, .29):
        for z in (-.13, .13):
            a.add('dark', turned([(0, 0), (.028, 0), (.028, .004, .002),
                                   (.026, .015, .002), (0, .015)], (x, 0, z), segments=16))
    a.add('dark', tube([( .22, .14, -.185), (.24, .06, -.25),
                        (.18, .006, -.32), (.10, .006, -.42), (.18, .006, -.55)], .0045))
    a.add('brass', cylinder(.0045, .48, (-.24, .042, .196), (1, 0, 0)))
    a.pivot('hatch', (0, .042, .196))
    a.add('teal', box((.5, .19, .01), (0, .137, .196), .003, 2), 'hatch')
    # U-shaped pull; blank mounting plate leaves room for the existing canvas nameplate.
    a.add('brass', tube([(-.028, .198, .202), (-.028, .198, .206),
                         (.028, .198, .206), (.028, .198, .202)], .003, 8), 'hatch')
    a.add('brass', box((.304, .052, .0005), (.03, .104, .201), .0002), 'hatch')
    for x in (-.12, .18):
        a.screw((x, .104, .201), 'hatch', radius=.002)
    a.pivot('rear_link', (.368, .12, -.19))
    a.add('brass', box((.018, .24, .018), (.368, .24, -.19), .002), 'rear_link')
    a.add('brass', box((.018, .018, .09), (.368, .36, -.16), .002), 'rear_link')
    a.add('brass', cylinder(.056, .006, (.2, .475, -.02), segments=28))
    a.pivot('bell', (.2, .481, -.02))
    a.add('brass', turned([(0, 0), (.0525, 0), (.0525, .0035, .001),
                          (.0435, .0165, .003), (.0265, .0365, .006),
                          (.0055, .0462, .003), (0, .0468)], (.2, .481, -.02), segments=28), 'bell')
    a.add('brass', cylinder(.0035, .016, (.2, .5275, -.02)), 'bell')
    a.add('brass', turned([(0, 0), (.0072, .001, .002), (.0072, .006, .003),
                           (0, .009)], (.2, .541, -.02)), 'bell')
    a.finish()
    return a


def spring(a, name, x):
    """Wire-preserving compression morph, with an empty origin at the spring seat."""
    seat, length, turns, radius, wire = .0118, .1075, 9, .011, .0018
    pivot = a.pivot(name, (x, seat, 0))
    rings, sides = 96, 6
    vertices, compressed, faces = [], [], []
    for i in range(rings + 1):
        t, theta = i / rings, i / rings * turns * math.tau
        for j in range(sides):
            phi = j / sides * math.tau
            r = radius + wire * math.cos(phi)
            vertices.append(xyz((r * math.cos(theta), t * length + wire * math.sin(phi), r * math.sin(theta))))
            compressed.append(xyz((r * math.cos(theta), t * .0425 + wire * math.sin(phi), r * math.sin(theta))))
    for i in range(rings):
        for j in range(sides):
            n = (j + 1) % sides
            faces.append((i * sides + j, i * sides + n, (i + 1) * sides + n, (i + 1) * sides + j))
    faces += [tuple(range(sides - 1, -1, -1)), tuple(rings * sides + j for j in range(sides))]
    mesh = bpy.data.meshes.new(name + '_wire')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        ring, side = divmod(loop.vertex_index, sides)
        uv.data[loop.index].uv = (ring / rings, side / sides)
    obj = bpy.data.objects.new(name + '_wire', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = pivot
    mesh.materials.append(a.mats['steel'])
    for face in mesh.polygons:
        face.use_smooth = True
    obj.shape_key_add(name='Basis')
    contact = obj.shape_key_add(name='contact')
    contact.slider_max = 1.1
    for v, p in zip(contact.data, compressed):
        v.co = p


def press(work):
    kit.reset_scene()
    mats = {
        'brass': material('press_brass', '#B08A4E', .8, .30, work, 'metal'),
        'steel': material('press_steel', '#A2AAA8', .85, .27, work, 'metal'),
        'wood': material('press_wood', '#5A3A22', 0, .31, work, 'wood'),
        'rubber': material('press_rubber', '#2B1A17', 0, .78, work),
    }
    a = Assembly('office_press', mats)
    a.add('steel', box((.5, .01, .56), (0, .005, -.02), .002, 2))
    for x in (-.21, .21):
        a.add('brass', turned([(0, 0), (.016, 0), (.014, .008, .001),
                                (.006, .008), (.006, .342), (.0082, .345, .001),
                                (.0095, .35, .002), (.0082, .35475, .002),
                                (.00475, .35823, .001), (0, .3595)], (x, .01, 0), segments=16))
        a.screw((x, .014, .013), axis=(0, 1, 0), mat='steel')
    a.pivot('stamp', (0, .0765, 0))
    a.pivot('pad', (0, .0765, 0), 'stamp')
    a.add('rubber', box((.164, .012, .104), (0, .0825, 0), .0022, 2), 'pad')
    a.pivot('block', (0, .0765, 0), 'stamp')
    a.add('wood', box((.16, .041, .1), (0, .109, 0), .004, 2), 'block')
    a.add('brass', box((.44, .016, .026), (0, .1375, 0), .003, 2), 'stamp')
    for x in (-.21, .21):
        sleeve = turned([(.0063, 0), (.014, 0), (.016, .003, .001),
                         (.016, .037, .001), (.014, .04), (.0063, .04), (.0063, 0)],
                        (x, .1175, 0), segments=16)
        a.add('brass', sleeve, 'stamp')
    for x in (-.075, .075):
        a.add('brass', cylinder(.0075, .004, (x, .1475, 0)), 'stamp')
    a.pivot('handle', (0, .1455, 0), 'stamp')
    a.add('brass', turned([(.0105, 0), (.0172, 0), (.0178, .002, .0005),
                           (.0168, .012, .001), (.0148, .0175), (.0132, .0195)],
                          (0, .1455, 0), segments=16), 'handle')
    a.add('wood', turned([(0, 0), (.0125, 0), (.0125, .016, .002),
                         (.0112, .032, .002), (.0118, .048, .002),
                         (.0138, .061, .002), (.0188, .072, .003),
                         (.0275, .082, .004), (.0325, .096, .004),
                         (.0318, .108, .004), (.0258, .119, .004),
                         (.0152, .1255, .003), (.005, .1277), (0, .128)],
                        (0, .1455, 0), segments=24), 'handle')
    spring(a, 'spring_left', -.21)
    spring(a, 'spring_right', .21)
    a.finish()
    return a


def desk(work):
    kit.reset_scene()
    mats = {
        'linoleum': material('desk_linoleum', '#2A3130', 0, .67, work),
        'steel': material('desk_steel', '#1E2326', .55, .46, work, 'metal'),
        'brass': material('desk_brass', '#B08A4E', .78, .32, work, 'metal'),
        'edge': material('desk_edge', '#5A3A22', 0, .40, work, 'wood'),
    }
    a = Assembly('office_desk', mats)
    a.add('linoleum', box((2.2, .05, 1.1), (0, -.025, 0), .008, 2))
    # Thin hardwood nosing tucked below the surface, not across the paper plane.
    for z in (-.541, .541):
        a.add('edge', box((2.178, .025, .013), (0, -.035, z), .003, 2))
    for x in (-1.091, 1.091):
        a.add('edge', box((.013, .025, 1.074), (x, -.035, 0), .003, 2))
    for z in (-.46, .46):
        a.add('steel', box((1.1, .05, .04), (0, -.075, z), .003))
    for side in (-1, 1):
        x = side * .8
        # Folded hollow pedestal: a front opening rather than a block behind the drawers.
        shell = box((.5, .69, 1), (x, -.395, 0), .006, 2)
        shell = geo.boolean_cut(shell, [box((.472, .662, 1), (x, -.395, .025), 0)])
        geo.bevel_by_angle(shell, .0015, 1)
        a.add('steel', shell)
        a.add('steel', box((.46, .04, .92), (x, -.76, -.02), .003))
        for dx in (-.185, .185):
            for z in (-.39, .39):
                a.add('steel', turned([(0, 0), (.022, 0), (.022, .008, .002),
                                       (.016, .014), (.009, .014), (.009, .04), (0, .04)],
                                      (x + dx, -.82, z), segments=12))
        for i in range(3):
            y = -.14 - i * .23
            name = f'drawer_{"left" if side == -1 else "right"}_{i + 1}'
            a.pivot(name, (x, y, .505))
            a.add('steel', box((.46, .224, .022), (x, y, .505), .004, 2), name)
            # Open-topped tray with folded edges. It remains complete during a +Z slide.
            tray = box((.44, .17, .82), (x, y - .003, .08), .002)
            tray = geo.boolean_cut(tray, [box((.428, .17, .808), (x, y + .006, .08), 0)])
            geo.bevel_by_angle(tray, .001, 1)
            a.add('steel', tray, name)
            pull = [ (x - .069, y + .045, .518), (x - .069, y + .045, .536),
                     (x + .069, y + .045, .536), (x + .069, y + .045, .518)]
            a.add('brass', tube(pull, .006, 8), name)
            for dx in (-.069, .069):
                a.add('brass', turned([(0, 0), (.011, 0), (.011, .002, .0008),
                                      (.008, .004, .0008), (0, .004)],
                                     (x + dx, y + .045, .516), (0, 0, 1)), name)
            # Narrow fixed rails are visible when a drawer is pulled out.
            for dx in (-.225, .225):
                a.add('steel', box((.008, .014, .82), (x + dx, y - .08, .065), .001))
        # Under-top lock and socket, no decorative letters or numbers.
        a.add('brass', turned([(0, 0), (.009, 0), (.009, .002, .001), (0, .003)],
                             (x + .18, -.085, .516), (0, 0, 1)))
    a.finish()
    return a


def preview(a, work, name, opened=False):
    """Private studio evidence, with a second pose exercising each authored rig."""
    if opened:
        if name == 'machine':
            a.nodes['hatch'].rotation_mode = 'XYZ'
            a.nodes['hatch'].rotation_euler.x = math.radians(100)
        if name == 'desk':
            a.nodes['drawer_left_1'].location.y -= .28
        if name == 'press':
            a.nodes['stamp'].location.z -= .065
            for o in a.root.children_recursive:
                if o.type == 'MESH' and o.data.shape_keys:
                    o.data.shape_keys.key_blocks[1].value = 1
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.render.resolution_x, scene.render.resolution_y = 1000, 800
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.19, .22, .25, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45
    target = Vector(xyz((0, -.28 if name == 'desk' else .19, 0)))
    distance = 3.8 if name == 'desk' else 1.28 if name == 'machine' else .9
    bpy.ops.object.camera_add(location=target + Vector((.7, -1.5, .85)).normalized() * distance)
    camera = bpy.context.object
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.8 if name == 'desk' else 1.04 if name == 'machine' else .78
    scene.camera = camera
    for at, power, size in [((-.7, -1, 1.8), 100, 1.1), ((1, .1, 1), 70, .7), ((-.4, 1, .8), 100, .8)]:
        bpy.ops.object.light_add(type='AREA', location=target + Vector(at))
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = power, 'DISK', size
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.82 if name == 'desk' else -.003))
    floor = bpy.context.object
    floor_mat = bpy.data.materials.new('studio_floor')
    floor_mat.diffuse_color = (.065, .072, .08, 1)
    floor.data.materials.append(floor_mat)
    scene.render.filepath = str(work / f'{name}{"-open" if opened else ""}.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--only', choices=['machine', 'press', 'desk'])
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--review', action='store_true', help='Render imported shipping GLBs instead of rebuilding')
    opts = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    opts.work.mkdir(parents=True, exist_ok=True)
    for name, build in [('machine', machine), ('press', press), ('desk', desk)]:
        if opts.only and opts.only != name:
            continue
        if opts.review:
            for opened in (False, True):
                kit.reset_scene()
                bpy.ops.import_scene.gltf(filepath=str(REPO / 'apps/web/src/chambers/certification-office/scene/heroes' / (name + '.glb')))
                assembly = SimpleNamespace(root=bpy.data.objects['office_' + name],
                    nodes={o.name: o for o in bpy.context.scene.objects})
                preview(assembly, opts.work, name, opened)
            continue
        assembly = build(opts.work)
        bpy.ops.object.select_all(action='DESELECT')
        assembly.root.select_set(True)
        for child in assembly.root.children_recursive:
            child.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(opts.work / (name + '.raw.glb')),
            export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
            export_materials='EXPORT', export_texcoords=True, export_normals=True,
            export_vertex_color='NONE', export_cameras=False, export_lights=False,
            export_animations=False, export_extras=False, export_morph=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(opts.work / (name + '.blend')))
        if opts.preview:
            preview(assembly, opts.work, name)
            # Rebuild to avoid adding studio objects twice; shipping export already finished.
            assembly = build(opts.work)
            preview(assembly, opts.work, name, opened=True)
