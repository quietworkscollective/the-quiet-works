"""Build the Outline Room's custom Annex door. Usage: blender -b --python build.py -- <door.glb>."""
import bpy
import math
import os
import sys
from collections import defaultdict
from mathutils import Vector


WIDTH = 2.2
HEIGHT = 2.1
PANEL_WIDTH = WIDTH / 2
PANEL_CENTRE = WIDTH / 4
THICKNESS = 0.09
TRIANGLE_LIMIT = 15_000


def xyz(x, depth, height):
    """Convert door-local (+x across, +y up, +z toward corridor) to Blender Z-up."""
    return (x, -depth, height)


def linear_channel(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, colour, roughness=0.62, metallic=0.0, alpha=1.0):
    rgb = tuple(linear_channel(int(colour[index:index + 2], 16)) for index in (1, 3, 5))
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*rgb, alpha)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, alpha)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if alpha < 1:
        result.surface_render_method = 'DITHERED'
        shader.inputs['Alpha'].default_value = alpha
    return result


def preserve_parent(obj, parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def cube(name, dims, at, mat, bevel=0, bucket='frame'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(*at))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new('Hand softened arris', 'BEVEL')
        modifier.width = min(bevel, min(dims) * 0.3)
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        normals = obj.modifiers.new('Enamel surface normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normals.name)
    obj.data.materials.append(mat)
    obj['_door_bucket'] = bucket
    return obj


def cylinder(name, radius, depth, at, mat, vertices=20, bucket='frame'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(*at))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj['_door_bucket'] = bucket
    return obj


def carrier_wheel(name, x, depth, height, bucket, wheel_material, hub_material):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=20,
        minor_segments=8,
        major_radius=0.042,
        minor_radius=0.01,
        location=xyz(x, depth, height),
        rotation=(math.pi / 2, 0, 0),
    )
    wheel = bpy.context.object
    wheel.name = name
    wheel.data.materials.append(wheel_material)
    wheel['_door_bucket'] = bucket
    for face in wheel.data.polygons:
        face.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.017,
        depth=0.026,
        location=xyz(x, depth + 0.018, height),
        rotation=(math.pi / 2, 0, 0),
    )
    hub = bpy.context.object
    hub.name = name + ' axle cap'
    hub.data.materials.append(hub_material)
    hub['_door_bucket'] = bucket


def tube(name, points, depth, radius, mat, bucket='leaf'):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for item, (x, y) in zip(spline.points, points):
        item.co = (x, -depth, y, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj['_door_bucket'] = bucket
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.select_set(False)
    return obj


def text(name, value, x, depth, height, size, mat, bucket='leaf'):
    bpy.ops.object.text_add(location=xyz(x, depth, height), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = value
    obj.data.size = size
    obj.data.resolution_u = 8
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.extrude = 0
    obj.data.bevel_depth = 0
    obj.data.bevel_resolution = 1
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj['_door_bucket'] = bucket
    return obj


def empty(name, at=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = xyz(*at)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = 0.04
    return obj


def join_bucket(objects, parent, label):
    if not objects:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    if len(objects) > 1:
        bpy.ops.object.join()
    result = bpy.context.object
    result.name = label
    result.data.name = label + ' mesh'
    if parent:
        preserve_parent(result, parent)
    result['_door_bucket'] = None


def join_by_material(parent, label):
    buckets = defaultdict(list)
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.get('_door_bucket') == label:
            buckets[obj.data.materials[0].name if obj.data.materials else 'unassigned'].append(obj)
    for material_name, objects in sorted(buckets.items()):
        join_bucket(objects, parent, 'OutlineDoor ' + label.title() + ' ' + material_name.replace(' ', '_'))


def build(output):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.fonts):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)

    blackened_brass = material('Blackened brass | workshop track', '#302E29', 0.52, 0.72)
    brass = material('Satin brass | roller and guide edges', '#9B794D', 0.34, 0.66)
    brass_light = material('Touched brass | fine track line', '#C1A16D', 0.34, 0.55)
    oxblood = material('Worn oxblood wood | sliding pull', '#67343B', 0.68, 0.02)
    smoked_glass = material('Smoked ground glass | warm grey', '#999185', 0.32, 0.05, alpha=0.5)
    plaque = material('Warm enamel plaque', '#C9BFAE', 0.5, 0.08)
    lettering = material('Dark engraved lettering', '#2C2924', 0.64)
    etch = material('Glass edge etch', '#B7AD98', 0.38, 0.28)

    left_leaf = empty('OutlineDoorLeafLeft', (-PANEL_CENTRE, 0, 0))
    right_leaf = empty('OutlineDoorLeafRight', (PANEL_CENTRE, 0, 0))
    left_leaf['hangerCarriers'] = 2
    right_leaf['hangerCarriers'] = 2

    def frame_cube(*args, **kwargs):
        return cube(*args, bucket='frame', **kwargs)

    def left_cube(*args, **kwargs):
        return cube(*args, bucket='left-leaf', **kwargs)

    def right_cube(*args, **kwargs):
        return cube(*args, bucket='right-leaf', **kwargs)

    def frame_tube(*args, **kwargs):
        return tube(*args, bucket='frame', **kwargs)

    def frame_text(*args, **kwargs):
        return text(*args, bucket='frame', **kwargs)

    # A broad double slider clears the full 2.2 m opening: both leaves park in wall pockets,
    # leaving the corridor route unobstructed without a swing arc.
    track_width = WIDTH * 2 + 0.1
    track_centre = 0.0
    track_height = HEIGHT + 0.18
    frame_cube('Blackened brass overhead track', (track_width, 0.15, 0.15), (track_centre, 0.055, track_height), blackened_brass, 0.045)
    frame_cube('Satin brass overhead edge', (track_width - 0.10, 0.018, 0.018), (track_centre, 0.143, track_height - 0.02), brass, 0.008)
    frame_cube('Lower blackened brass twin guide', (track_width - 0.05, 0.13, 0.075), (track_centre, 0.035, 0.045), blackened_brass, 0.022)
    frame_cube('Lower guide satin edge', (track_width - 0.14, 0.016, 0.012), (track_centre, 0.105, 0.082), brass, 0.005)
    for side in (-1, 1):
        pocket_centre = side * (WIDTH / 2 + PANEL_WIDTH / 2)
        frame_cube(('Left' if side < 0 else 'Right') + ' pocket end cheek', (0.14, 0.14, HEIGHT + 0.10), (side * (WIDTH - 0.03), 0.055, HEIGHT / 2), blackened_brass, 0.025)
        frame_cube(('Left' if side < 0 else 'Right') + ' leaf pocket casing', (PANEL_WIDTH + 0.05, 0.075, HEIGHT - 0.04), (pocket_centre, -0.045, HEIGHT / 2), blackened_brass, 0.045)
        frame_cube(('Left' if side < 0 else 'Right') + ' pocket inset face', (PANEL_WIDTH - 0.08, 0.018, HEIGHT - 0.20), (pocket_centre, 0.006, HEIGHT / 2), blackened_brass, 0.028)
        frame_cube(('Left' if side < 0 else 'Right') + ' pocket upper channel', (PANEL_WIDTH - 0.12, 0.022, 0.036), (pocket_centre, 0.025, HEIGHT - 0.12), brass, 0.009)
        frame_cube(('Left' if side < 0 else 'Right') + ' pocket lower channel', (PANEL_WIDTH - 0.12, 0.022, 0.036), (pocket_centre, 0.025, 0.18), brass, 0.009)
    for x in (-2.12, -1.57, -1.02, -0.47, 0.47, 1.02, 1.57, 2.12):
        frame_cube('Track roller saddle', (0.12, 0.09, 0.08), (x, 0.145, 2.36), blackened_brass, 0.022)
        cylinder('Brass roller cap', 0.022, 0.026, (x, 0.202, track_height), brass, 16)
    for x in (-2.1, -1.5, -0.8, 0.0, 0.8, 1.5, 2.1):
        frame_cube('Lower guide fixing', (0.035, 0.018, 0.035), (x, 0.112, 0.09), brass, 0.008)

    # Room name and the machine-made credit stay on a fixed pocket face when both leaves retract.
    plaque_x = WIDTH / 2 + PANEL_WIDTH / 2
    plaque_y = 1.78
    frame_cube('Fixed plaque shadow', (0.96, 0.032, 0.24), (plaque_x, 0.068, plaque_y), blackened_brass, 0.025)
    frame_cube('Fixed enamel plaque', (0.91, 0.018, 0.20), (plaque_x, 0.091, plaque_y), plaque, 0.018)
    frame_text('Room name on fixed plaque', 'THE OUTLINE ROOM', plaque_x, 0.102, plaque_y + 0.035, 0.047, lettering)
    frame_text('Machine-made maker credit', 'MACHINE-MADE · CODEX / OPENAI', plaque_x, 0.102, plaque_y - 0.045, 0.022, lettering)

    # Each broad pane has a dark stile, visible ground-glass edge and an oxblood pull at the join.
    for side, centre, panel_cube, bucket in ((-1, -PANEL_CENTRE, left_cube, 'left-leaf'), (1, PANEL_CENTRE, right_cube, 'right-leaf')):
        panel_cube('Smoked ground-glass sliding leaf', (PANEL_WIDTH - 0.018, 0.072, HEIGHT - 0.03), (centre, -0.045, HEIGHT / 2), smoked_glass, 0.035)
        panel_cube('Leaf top blackened-brass rail', (PANEL_WIDTH, 0.09, 0.09), (centre, 0.008, HEIGHT - 0.055), blackened_brass, 0.025)
        panel_cube('Leaf bottom blackened-brass rail', (PANEL_WIDTH, 0.09, 0.10), (centre, 0.008, 0.07), blackened_brass, 0.025)
        panel_cube('Leaf outer stile', (0.075, 0.08, HEIGHT - 0.20), (centre + side * (PANEL_WIDTH / 2 - 0.038), 0.005, HEIGHT / 2), blackened_brass, 0.018)
        panel_cube('Leaf meeting stile', (0.062, 0.08, HEIGHT - 0.20), (centre - side * (PANEL_WIDTH / 2 - 0.031), 0.005, HEIGHT / 2), blackened_brass, 0.018)
        for offset in (-0.36, 0.36):
            wheel_x = centre + offset
            panel_cube('Leaf hanger drop strap', (0.052, 0.032, 0.17), (wheel_x, 0.16, 2.145), blackened_brass, 0.008)
            panel_cube('Rail contact saddle', (0.11, 0.075, 0.028), (wheel_x, 0.105, 2.205), blackened_brass, 0.006)
            carrier_wheel('Brass hanger wheel', wheel_x, 0.155, 2.235, bucket, brass_light, blackened_brass)
        for height in (0.52, 1.05, 1.58):
            panel_cube('Horizontal glass edge etch', (PANEL_WIDTH - 0.17, 0.008, 0.009), (centre, 0.047, height), etch, 0.003)
        pull_x = centre - side * 0.11
        panel_cube('Oxblood wood pull backing', (0.38, 0.035, 0.095), (pull_x, 0.06, 1.03), blackened_brass, 0.024)
        panel_cube('Oxblood wood horizontal pull', (0.32, 0.065, 0.046), (pull_x, 0.104, 1.03), oxblood, 0.02)
        for x in (pull_x - 0.12, pull_x + 0.12):
            cylinder('Brass pull fixing', 0.012, 0.014, (x, 0.148, 1.03), brass, 12, bucket='left-leaf' if side < 0 else 'right-leaf')
        panel_cube('Reverse pull rail', (0.30, 0.05, 0.05), (pull_x, -0.142, 1.03), blackened_brass, 0.018)
        panel_cube('Reverse oxblood wood pull', (0.27, 0.035, 0.026), (pull_x, -0.177, 1.03), oxblood, 0.012)

    # Optimize by material while keeping the static surround and moving leaf as separate nodes.
    bpy.context.view_layer.update()
    join_by_material(None, 'frame')
    join_by_material(left_leaf, 'left-leaf')
    join_by_material(right_leaf, 'right-leaf')

    bpy.context.view_layer.update()
    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in bpy.context.scene.objects if obj.type == 'MESH')
    if triangles > TRIANGLE_LIMIT:
        raise RuntimeError(f'Outline Room door exceeds {TRIANGLE_LIMIT:,} triangles: {triangles:,}')
    print(f'OUTLINE_DOOR_TRIANGLES {triangles}', flush=True)

    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(output),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        use_selection=False,
    )
    print('OUTLINE_DOOR_SOURCE', os.path.abspath(output), flush=True)


args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args:
    raise RuntimeError('Usage: build.py -- <door.glb>')
os.makedirs(os.path.dirname(os.path.abspath(args[0])), exist_ok=True)
build(args[0])
