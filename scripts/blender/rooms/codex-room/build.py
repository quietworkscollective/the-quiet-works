"""Build the Outline Room source stage. Usage: blender -b --python build.py -- <source.glb>."""
import bpy
import math
import os
import random
import sys
from mathutils import Vector


def pos(x, z, y):
    return (x, -z, y)


def material(name, colour, roughness=0.65, metallic=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, alpha)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour, alpha)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if alpha < 1:
        m.surface_render_method = 'DITHERED'
        bsdf.inputs['Alpha'].default_value = alpha
    return m


def cube(name, size, at, mat, bevel=0.0, parent=None, target=None, dynamic=False, stage=False, rotation_z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(*at))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = math.radians(rotation_z)
    if bevel > 0:
        mod = obj.modifiers.new('Soft machined edge', 'BEVEL')
        mod.width = min(bevel, min(size) * 0.3)
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normal = obj.modifiers.new('Corner normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normal.name)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    if target:
        obj['actionTarget'] = target
    if dynamic:
        obj['bake'] = 'dynamic'
    if stage:
        obj['stageSurface'] = 'structure'
    return obj


def cylinder(name, radius, depth, at, mat, vertices=32, direction=None, parent=None, target=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos(*at))
    obj = bpy.context.object
    obj.name = name
    if direction:
        start = Vector(pos(*at))
        end = Vector(pos(at[0] + direction[0], at[1] + direction[1], at[2] + direction[2]))
        obj.rotation_euler = (end - start).to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    if target:
        obj['actionTarget'] = target
    return obj


def sphere(name, radius, at, mat, scale=(1, 1, 1), segments=16, rings=10, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=pos(*at))
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def empty(name, target=None, dynamic=False, stage=False):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = 0.035
    if target:
        obj['actionTarget'] = target
    if dynamic:
        obj['bake'] = 'dynamic'
    if stage:
        obj['stageSurface'] = 'structure'
    return obj


def text(name, value, at, size, mat, rotation=(math.pi / 2, 0, math.pi), align='CENTER', parent=None):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.text_add(location=pos(*at), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = value
    obj.data.size = size
    # Keep the many small etched labels crisp at room scale without exporting Blender's
    # oversized default curve tessellation into the lazy glTF.
    obj.data.resolution_u = 6
    obj.data.align_x = align
    obj.data.align_y = 'CENTER'
    obj.data.extrude = 0.0008
    obj.data.bevel_depth = 0.00025
    obj.data.bevel_resolution = 1
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    if parent:
        obj.parent = parent
    return obj


def rod(name, start, end, radius, mat, parent=None):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    # `cylinder` accepts authored room coordinates and performs the one required conversion.
    # Converting endpoints here as well placed every rod at a mirrored depth outside the stage.
    return cylinder(name, radius, delta.length, tuple((a + b) / 2), mat, 12, direction=tuple(delta.normalized()), parent=parent)


def plate_beam(name, start, end, width, thickness, centre_height, mat, parent=None, bevel=0.001):
    """A pressed linkage plate with real overlap and a one-millimetre softened edge."""
    ax, ay = start[0], start[1]
    bx, by = end[0], end[1]
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 0.0001:
        raise ValueError(f'{name} must span two distinct pivots')
    nx, ny = -dy / length * width / 2, dx / length * width / 2
    outline = ((ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny))
    low, high = centre_height - thickness / 2, centre_height + thickness / 2
    vertices = [pos(x, y, z) for z in (low, high) for x, y in outline]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(name + ' pressed plate')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    mod = obj.modifiers.new('One millimetre machined arris', 'BEVEL')
    mod.width = bevel
    mod.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    normal = obj.modifiers.new('Pressed plate normals', 'WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=normal.name)
    obj.select_set(False)
    return obj


def curve_line(name, points, mat, bevel, parent=None):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*pos(*co), 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.select_set(False)
    return obj


def texture(name, pattern):
    size = 128
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    rng = random.Random(1406)
    pixels = []
    chips = []
    if pattern == 'terrazzo':
        for _ in range(82):
            chips.append((rng.randrange(size), rng.randrange(size), rng.choice([1, 2]), rng.choice([0.43, 0.45, 0.47, 0.49])))
    for y in range(size):
        for x in range(size):
            noise = (math.sin(x * 0.64 + math.sin(y * 0.37)) + math.sin(y * 0.58 + x * 0.31)) * 0.0008
            if pattern == 'terrazzo':
                v = 0.44 + noise
                for cx, cy, radius, tint in chips:
                    if (x - cx) ** 2 + (y - cy) ** 2 < radius * radius:
                        v = tint
                pixels.extend((v * 0.94, v, v * 0.92, 1))
            else:
                v = max(0.68, min(0.9, 0.79 + noise))
                pixels.extend((v, v * 0.98, v * 0.92, 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    return image


def texture_material(mat, image):
    nodes = mat.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    coord = nodes.new('ShaderNodeTexCoord')
    mat.node_tree.links.new(coord.outputs['UV'], tex.inputs['Vector'])
    mat.node_tree.links.new(tex.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
    nodes.active = tex


def join_static():
    by_material = {}
    for obj in list(bpy.context.scene.objects):
        dynamic = False
        parent = obj
        while parent:
            if parent.get('bake') == 'dynamic':
                dynamic = True
                break
            parent = parent.parent
        if obj.type != 'MESH' or obj.get('actionTarget') or dynamic:
            continue
        role = 'StageShell' if obj.get('stageSurface') == 'structure' else 'Static'
        material_name = obj.data.materials[0].name if obj.data.materials else 'unassigned'
        key = f'{role}_{material_name.replace(" ", "_")}'
        by_material.setdefault(key, []).append(obj)
    for key, objects in by_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = key


def unwrap():
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=0.012)
    bpy.ops.object.mode_set(mode='OBJECT')


def build(output):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0

    plaster_image = texture('Lime plaster, quiet trowel', 'plaster')
    floor_image = texture('Small terrazzo chips', 'terrazzo')
    plaster = material('Lime plaster · #C6C0B0', (0.34, 0.32, 0.27), 0.91)
    bone = material('Ivory ceramic · #DDD5C8', (0.82, 0.77, 0.7), 0.42)
    paper = material('Muted warm label stock', (0.23, 0.21, 0.18), 0.82)
    red = material('Repaired oxblood enamel · #743E49', (0.16, 0.046, 0.064), 0.58, 0.05)
    red_repair = material('Hand repaired oxblood enamel', (0.18, 0.055, 0.07), 0.64, 0.025)
    coal = material('Coal wax · #151A20', (0.018, 0.024, 0.032), 0.56)
    glass = material('Ground glass · cool pale smoke with cut edges', (0.42, 0.48, 0.49), 0.78, 0.01, alpha=0.96)
    brass = material('Satin brass · #897044', (0.25, 0.16, 0.06), 0.5, 0.68)
    cast_iron = material('Blackened cast iron · warm rubbed edges', (0.035, 0.032, 0.029), 0.68, 0.42)
    dark_joint = material('Darkened pantograph joints', (0.025, 0.024, 0.022), 0.64, 0.22)
    oxblood_wood = material('Worn oxblood grip wood', (0.12, 0.028, 0.043), 0.72, 0.02)
    oak = material('Retained oak · #302B25', (0.048, 0.038, 0.029), 0.55)
    floor_mat = material('Terrazzo · #535954', (0.22, 0.25, 0.23), 0.42)
    lamp_diffuser = material('Ivory ceramic task-lamp diffuser', (0.62, 0.55, 0.42), 0.82)
    lamp_bsdf = lamp_diffuser.node_tree.nodes.get('Principled BSDF')
    lamp_bsdf.inputs['Emission Color'].default_value = (0.6, 0.36, 0.16, 1)
    lamp_bsdf.inputs['Emission Strength'].default_value = 0.22
    boat_wood = material('Boat wood · #A77D55', (0.37, 0.21, 0.095), 0.4)
    bowl_glaze = material('Bowl glaze · #667E95', (0.12, 0.21, 0.31), 0.24, 0.12)
    felt = material('Eraser felt', (0.38, 0.34, 0.28), 0.93)
    cloth = material('Cotton cloth', (0.75, 0.72, 0.65), 0.98)
    drafting_card = material('Warm drafting card', (0.5, 0.45, 0.36), 0.94)
    haze = material('Restrained white-grey workshop air', (0.71, 0.73, 0.7), 0.98, alpha=0.045)
    texture_material(plaster, plaster_image)
    texture_material(floor_mat, floor_image)

    # A closed workshop stage with a centered, framed entry; the two returns keep the side views
    # inside the room when a visitor reaches either yaw limit.
    cube('Stage floor', (6.8, 7.6, 0.12), (0, 3.8, -0.06), floor_mat, 0.02, stage=True)
    cube('Rear stage wall', (6.8, 0.16, 3.4), (0, 7.52, 1.7), plaster, 0.025, stage=True)
    cube('West stage wall', (0.16, 7.6, 3.4), (-3.32, 3.8, 1.7), plaster, 0.02, stage=True)
    cube('East stage wall', (0.16, 7.6, 3.4), (3.32, 3.8, 1.7), plaster, 0.02, stage=True)
    cube('Stage ceiling', (6.8, 7.6, 0.12), (0, 3.8, 3.4), plaster, 0.025, stage=True)
    cube('West retained oak dado', (0.045, 7.3, 0.28), (-3.2, 3.8, 0.49), oak, 0.018, stage=True)
    cube('East retained oak dado', (0.045, 7.3, 0.28), (3.2, 3.8, 0.49), oak, 0.018, stage=True)
    for x in (-2.85, 2.85):
        cube('Ceiling oak cross rail', (0.13, 7.0, 0.11), (x, 3.8, 3.31), oak, 0.025, stage=True)
    for x in (-3.22, 3.22):
        cube('Warm plaster stop', (0.12, 0.2, 3.18), (x, 6.72, 1.59), plaster, 0.035, stage=True)
    for x in (-1.985, 1.985):
        cube('Entry plaster return', (2.67, 0.16, 3.4), (x, 0.02, 1.7), plaster, 0.025, stage=True)
        cube('Entry oak dado return', (2.55, 0.045, 0.28), (x, 0.12, 0.49), oak, 0.018, stage=True)
    cube('Entry plaster head', (1.3, 0.16, 0.84), (0, 0.02, 2.98), plaster, 0.025, stage=True)
    for side in (-1, 1):
        cabinet_x = side * 2.98
        face_x = side * 2.76
        cube(('West' if side < 0 else 'East') + ' entry guide cabinet', (0.38, 0.58, 1.5), (cabinet_x, 0.55, 1.18), oak, 0.03, stage=True)
        for height in (0.72, 1.2, 1.68):
            cube('Entry cabinet oxblood drawer', (0.035, 0.5, 0.34), (face_x, 0.55, height), red, 0.016, stage=True)
            cube('Entry cabinet subdued paper label', (0.04, 0.12, 0.05), (side * 2.74, 0.55, height + 0.07), paper, 0.006, stage=True)
            cube('Entry cabinet brass pull', (0.025, 0.12, 0.022), (side * 2.72, 0.55, height - 0.1), brass, 0.008, stage=True)
        cube('Small repaired enamel area', (0.004, 0.12, 0.065), (side * 2.7405, 0.55, 1.2), red_repair, 0.008, stage=True)
        # These shallow wall fixtures frame the door when the side stations look back toward it.
        entry_x = side * 1.32
        cube(('West' if side < 0 else 'East') + ' entry parts fixture', (0.5, 0.32, 1.26), (entry_x, 0.24, 1.12), oak, 0.026, stage=True)
        for height in (0.68, 1.1, 1.52):
            cube('Entry fixture oxblood drawer', (0.44, 0.055, 0.3), (entry_x, 0.42, height), red, 0.015, stage=True)
            cube('Entry fixture subdued paper label', (0.16, 0.025, 0.05), (entry_x, 0.455, height + 0.055), paper, 0.006, stage=True)
            cube('Entry fixture brass pull', (0.055, 0.03, 0.018), (entry_x, 0.458, height - 0.085), brass, 0.007, stage=True)

    # Entrance, shown from the rear inspection station and operable from the object list.
    doorway = empty('RoomDoor', 'door', True, stage=True)
    cube('Entry oak lining', (1.3, 0.12, 2.56), (0, 0.02, 1.28), oak, 0.025, doorway)
    cube('Entry leaf oxblood', (1.28, 0.07, 2.54), (0, 0.13, 1.28), red, 0.018, doorway)
    cube('Entry ground-glass field', (0.75, 0.018, 0.72), (0, 0.083, 1.71), glass, 0.007, doorway)
    for x in (-0.4, 0, 0.4):
        cube('Entry glazing bead', (0.018, 0.025, 0.75), (x, 0.06, 1.71), brass, 0.004, doorway)
    cube('Door plaque enamel', (0.52, 0.026, 0.13), (0, 0.06, 2.22), red, 0.012, doorway)
    text('Door plaque lettering', 'THE OUTLINE ROOM', (0, 0.035, 2.22), 0.049, paper, rotation=(math.pi / 2, 0, 0), parent=doorway)
    cylinder('Brass lever rose', 0.035, 0.018, (0.38, 0.13, 1.02), brass, 20, direction=(0, 0, 1), parent=doorway)
    rod('Brass lever', (0.32, 0.12, 1.02), (0.48, 0.12, 1.02), 0.012, brass, doorway)
    for x in (-0.48, 0.48):
        for z in (0.22, 1.9, 2.28):
            cylinder('Bead repair fastener', 0.012, 0.006, (x, 0.09, z), brass, 10, direction=(0, 1, 0), parent=doorway)

    # The bench turns slightly at the threshold. Its broad top exposes the tool's side build and
    # carries the diagonal through the lower third of the arrival frame.
    # The camera is turned 13 degrees right; counter-turning the bench gives the top a clear
    # diagonal in both the desktop and portrait threshold crops.
    bench_angle = -12.0
    bench_cos = math.cos(math.radians(bench_angle))
    bench_sin = math.sin(math.radians(bench_angle))
    def bench_point(x, z):
        return (x * bench_cos - (z - 3.6) * bench_sin, 3.6 + x * bench_sin + (z - 3.6) * bench_cos)
    cube('Bench oak top', (2.6, 1.0, 0.14), (0, 3.6, 0.86), oak, 0.035, rotation_z=bench_angle)
    cube('Bench enamel apron', (2.48, 0.84, 0.24), (0, 3.6, 0.67), red, 0.024, rotation_z=bench_angle)
    text('Bench instrument label', 'PANTOGRAPH / FIXED RATIO', (0, 3.12, 0.69), 0.044, paper)
    for x in (-1.05, 1.05):
        for z in (3.2, 4.0):
            px, pz = bench_point(x, z)
            cube('Bench oak leg', (0.09, 0.09, 0.65), (px, pz, 0.32), oak, 0.018)
    for x in (-1.08, -0.54, 0, 0.54, 1.08):
        for z in (3.2, 4.0):
            px, pz = bench_point(x, z)
            cylinder('Brass bench screw', 0.012, 0.008, (px, pz, 0.79), brass, 10)

    # A low cast-iron bed gives the articulated brass work a grounded, readable base.
    cube('Pantograph cast-iron base plate', (1.58, 0.92, 0.06), (0, 3.67, 0.965), cast_iron, 0.025)

    # One shallow tray keeps the drafting tools beside the machine rather than across its leaves.
    tray_x, tray_y = 1.02, 3.66
    cube('Shallow oxblood drawing-tool tray', (0.38, 0.32, 0.028), (tray_x, tray_y, 0.969), oxblood_wood, 0.012)
    cube('Drawing-tool tray dark felt', (0.32, 0.26, 0.008), (tray_x, tray_y, 0.989), felt, 0.004)
    for x in (tray_x - 0.185, tray_x + 0.185):
        cube('Drawing-tool tray brass rim', (0.012, 0.32, 0.035), (x, tray_y, 0.997), brass, 0.004)
    for y in (tray_y - 0.155, tray_y + 0.155):
        cube('Drawing-tool tray brass rim', (0.38, 0.012, 0.035), (tray_x, y, 0.997), brass, 0.004)
    rod('Graphite pencil in tray', (tray_x - 0.13, tray_y - 0.06, 1.005), (tray_x + 0.12, tray_y - 0.06, 1.005), 0.006, coal)
    rod('Brass divider leg one', (tray_x - 0.11, tray_y + 0.04, 1.006), (tray_x + 0.01, tray_y + 0.13, 1.006), 0.007, brass)
    rod('Brass divider leg two', (tray_x - 0.11, tray_y + 0.04, 1.006), (tray_x + 0.02, tray_y - 0.07, 1.006), 0.007, brass)
    sphere('Brass divider hinge', 0.018, (tray_x - 0.11, tray_y + 0.04, 1.006), brass, segments=10, rings=6)

    # The guide selector, three broad detents and the overbuilt wing-nut clamp.
    selector = empty('SpecimenSelector', 'selector')
    cube('Selector enamel base', (0.42, 0.26, 0.045), (-1.1, 3.2, 0.96), red, 0.018, selector)
    for index, (label, x) in enumerate((('NUT', -1.24), ('TIN A', -1.1), ('TIN B', -0.96))):
        cylinder('Selector detent', 0.033, 0.028, (x, 3.2, 1.004), brass, 16, parent=selector)
        text('Selector label ' + str(index + 1), label, (x, 3.2, 0.989), 0.032, paper, rotation=(0, 0, 0), parent=selector)
    cube('SelectorPointer', (0.052, 0.035, 0.025), (-1.24, 3.2, 1.06), brass, 0.01, dynamic=True)
    wingnut = empty('WingNut', 'wingnut')
    cube('Pantograph anchor clamp foot', (0.3, 0.24, 0.08), (-0.55, 3.3, 1.0), cast_iron, 0.018, parent=wingnut)
    cube('Specimen clamp lower jaw', (0.22, 0.16, 0.035), (-0.55, 3.3, 1.075), brass, 0.012, parent=wingnut)
    cube('Specimen clamp upper jaw', (0.2, 0.14, 0.04), (-0.55, 3.3, 1.145), dark_joint, 0.012, parent=wingnut)
    cylinder('Wing nut collar', 0.065, 0.07, (-0.55, 3.3, 1.21), brass, 20, parent=wingnut)
    cylinder('Wing nut threaded stem', 0.024, 0.17, (-0.55, 3.3, 1.12), brass, 16, parent=wingnut)
    cube('Wing nut left ear', (0.22, 0.07, 0.045), (-0.66, 3.3, 1.29), brass, 0.018, wingnut)
    cube('Wing nut right ear', (0.22, 0.07, 0.045), (-0.44, 3.3, 1.29), brass, 0.018, wingnut)
    for x in (-0.74, -0.36):
        sphere('Wing nut ear cap', 0.032, (x, 3.3, 1.29), brass, (1.0, 0.8, 0.65), parent=wingnut)
    text('Wing nut dry label', 'SPECIMEN HELD AT ONE CORNER', (-0.55, 3.48, 1.02), 0.035, coal, rotation=(0, 0, 0), parent=wingnut)

    # Open pantograph: two real arms, paired pivots and an ivory follower grip.
    assembly = empty('PantographAssembly')
    follower = empty('PantographFollower', 'follower', True)
    pivot_a = (-0.55, 3.3, 1.04)
    pivot_b = (0.55, 3.3, 1.04)
    pivot_c = (-0.55, 4.04, 1.04)
    pivot_d = (0.55, 4.04, 1.04)
    linkage_plates = [
        ('Upper brass arm plate', pivot_a, pivot_d, 0.092, 1.024),
        ('Lower brass arm plate', pivot_b, pivot_c, 0.092, 1.057),
        ('Front linkage crossbar', pivot_a, pivot_b, 0.072, 1.015),
        ('Rear linkage crossbar', pivot_c, pivot_d, 0.072, 1.066),
    ]
    for name, a, b, width, height in linkage_plates:
        width *= 0.86
        plate_beam(name, a, b, width, 0.018, height, brass, assembly, 0.001)
        inlay_height = height + 0.013
        rod(name + ' brass inlay', (a[0], a[1], inlay_height), (b[0], b[1], inlay_height), 0.003, brass, assembly)
    for index, point in enumerate((pivot_a, pivot_b, pivot_c, pivot_d)):
        cylinder('Pantograph dark joint ' + str(index), 0.049, 0.066, (point[0], point[1], 1.047), dark_joint, 20, parent=assembly)
        cylinder('Pivot satin-brass bearing ' + str(index), 0.04, 0.018, (point[0], point[1], 1.086), brass, 20, parent=assembly)
        cylinder('Pivot dark thrust washer ' + str(index), 0.031, 0.009, (point[0], point[1], 1.1), cast_iron, 20, parent=assembly)
        cylinder('Pivot screw head ' + str(index), 0.018, 0.014, (point[0], point[1], 1.111), brass, 16, parent=assembly)
        cube('Pivot screw slot ' + str(index), (0.026, 0.005, 0.002), (point[0], point[1], 1.12), coal, 0.001, parent=assembly)
        for fastener_index, (dx, dy) in enumerate(((-0.052, 0), (0.052, 0), (0, -0.052), (0, 0.052))):
            cylinder(f'Bearing housing rivet {index}-{fastener_index}', 0.007, 0.006,
                     (point[0] + dx, point[1] + dy, 1.099), dark_joint, 8, parent=assembly)
    cylinder('Worn oxblood wood follower grip', 0.03, 0.13, (0.55, 4.04, 1.15), oxblood_wood, 18, direction=(0, 0, 1), parent=follower)
    cylinder('Follower dark bearing collar', 0.038, 0.03, (0.55, 4.04, 1.04), dark_joint, 20, parent=follower)
    cylinder('Black wax pencil', 0.014, 0.22, (0.55, 4.04, 0.99), coal, 12, direction=(0, 0, 1), parent=follower)
    cylinder('Brass follower nose', 0.019, 0.052, (0.55, 4.04, 0.87), brass, 16, parent=follower)
    cylinder('Pencil collet sleeve', 0.027, 0.032, (0.55, 4.04, 0.914), brass, 20, parent=follower)
    cylinder('Pencil collet shoulder', 0.026, 0.01, (0.55, 4.04, 0.937), brass, 18, parent=follower)
    for index in range(3):
        angle = math.radians(index * 120)
        x = 0.55 + math.cos(angle) * 0.027
        y = 4.04 + math.sin(angle) * 0.027
        rod('Pencil collet jaw ' + str(index), (x, y, 0.887), (x, y, 0.924), 0.0035, brass, follower)
    # The crossed arms meet at a visible bearing instead of stopping near one another.
    cylinder('Pantograph central dark joint', 0.048, 0.068, (0, 3.67, 1.08), dark_joint, 24, parent=assembly)
    cylinder('Central bearing brass race', 0.041, 0.021, (0, 3.67, 1.126), brass, 24, parent=assembly)
    cylinder('Pantograph central washer', 0.031, 0.012, (0, 3.67, 1.142), cast_iron, 20, parent=assembly)
    cylinder('Pantograph central rivet', 0.015, 0.016, (0, 3.67, 1.157), brass, 16, parent=assembly)
    for angle in range(0, 360, 60):
        a = math.radians(angle)
        sphere('Pivot knurl', 0.006, (0.55 + math.cos(a) * 0.038, 4.04 + math.sin(a) * 0.038, 1.04), brass, segments=8, rings=6, parent=assembly)

    # Captive display leaves, drawn outlines, and the shared comparison hood.
    leaves = empty('DrawingLeaves', 'leaves', True)
    cube('Left ground-glass leaf', (0.58, 0.018, 0.52), (-0.77, 4.18, 1.11), glass, 0.006, leaves)
    cube('Right ground-glass leaf', (0.58, 0.018, 0.52), (0.77, 4.18, 1.11), glass, 0.006, leaves)
    for x in (-1.07, -0.47, 0.47, 1.07):
        cube('Glass leaf brass rail', (0.018, 0.055, 0.57), (x, 4.18, 1.11), brass, 0.004, leaves)
    wax = material('Black wax line', (0.008, 0.012, 0.016), 0.74)
    guide_shapes = {
        'WaxLine_Wingnut': [(-0.98, 4.05, 1.08), (-0.96, 4.05, 1.2), (-0.8, 4.05, 1.22), (-0.76, 4.05, 1.16), (-0.72, 4.05, 1.22), (-0.56, 4.05, 1.2), (-0.54, 4.05, 1.08), (-0.98, 4.05, 1.08)],
        'WaxLine_TinA': [(-1.06, 4.05, 0.99), (-1.06, 4.05, 1.34), (-0.48, 4.05, 1.34), (-0.48, 4.05, 0.99), (-1.06, 4.05, 0.99)],
        'WaxLine_TinB': [(0.48, 4.05, 0.99), (0.48, 4.05, 1.34), (1.06, 4.05, 1.34), (1.06, 4.05, 0.99), (0.48, 4.05, 0.99)],
    }
    for name, points in guide_shapes.items():
        curve_line(name, points, wax, 0.006, leaves)

    hood = empty('ComparisonHood', 'hood', True)
    cube('Comparison ceramic hood frame', (2.4, 0.1, 0.12), (0, 5.15, 1.52), bone, 0.025, hood)
    cube('Comparison ceramic hood lintel', (0.08, 0.52, 0.62), (-1.16, 5.15, 1.2), bone, 0.018, hood)
    cube('Comparison ceramic hood lintel', (0.08, 0.52, 0.62), (1.16, 5.15, 1.2), bone, 0.018, hood)
    cube('Comparison ceramic hood face', (2.22, 0.035, 0.5), (0, 5.08, 1.28), bone, 0.01, hood)
    for x in (-1.05, -0.7, -0.35, 0, 0.35, 0.7, 1.05):
        cylinder('Hood brass stud', 0.018, 0.012, (x, 5.0, 1.52), brass, 12, parent=hood)
    text('Comparison label', 'COMPARISON HOOD', (0, 5.0, 1.29), 0.041, coal, parent=hood)

    # Two tins and deliberately ordinary, differently made contents.
    tin_a = empty('TinA', 'tin-a', True)
    tin_b = empty('TinB', 'tin-b', True)
    for root, x, title in ((tin_a, -0.4, 'TIN A'), (tin_b, 0.4, 'TIN B')):
        cube(title + ' enamel body', (0.3, 0.2, 0.12), (x, 5.15, 0.98), bone, 0.022, root)
        cube(title + ' oxblood band', (0.31, 0.205, 0.025), (x, 5.15, 1.025), red, 0.008, root)
        cube(('TinA_Lid' if title == 'TIN A' else 'TinB_Lid'), (0.31, 0.205, 0.025), (x, 5.15, 1.06), brass, 0.009, root)
        text(title + ' lid label', title, (x, 5.02, 1.058), 0.035, coal, parent=root)
    # Boat hull, folded mast and a two-screw brass hinge.
    boat = empty('WoodenBoat', dynamic=True)
    boat.parent = tin_a
    cube('Wooden boat hull', (0.18, 0.055, 0.055), (-0.4, 5.15, 1.12), boat_wood, 0.022, boat)
    cube('Boat bow', (0.055, 0.055, 0.065), (-0.49, 5.15, 1.12), boat_wood, 0.024, boat)
    mast = empty('BoatMast', dynamic=True)
    mast.parent = boat
    rod('Folded mast', (-0.4, 5.15, 1.17), (-0.4, 5.28, 1.17), 0.009, oak, mast)
    rod('Raised mast', (-0.4, 5.15, 1.17), (-0.4, 5.15, 1.3), 0.009, oak, mast)
    cylinder('Brass mast hinge', 0.014, 0.024, (-0.4, 5.15, 1.16), brass, 12, parent=mast)
    for z in (1.15, 1.17):
        sphere('Hinge screw', 0.004, (-0.4, 5.123, z), brass, segments=8, rings=6, parent=mast)
    # Bowl and folded cotton surround. The cloth edge is a separate, named moving piece.
    sphere('Blue ceramic bowl', 0.09, (0.4, 5.15, 1.13), bowl_glaze, (1.0, 0.55, 1.0), segments=20, rings=12, parent=tin_b)
    cylinder('Bowl rim', 0.086, 0.012, (0.4, 5.15, 1.18), bowl_glaze, 24, parent=tin_b)
    cube('Folded cotton cloth', (0.22, 0.17, 0.025), (0.4, 5.15, 1.12), cloth, 0.02, tin_b)
    cube('Liftable cloth edge', (0.08, 0.18, 0.035), (0.47, 5.15, 1.15), cloth, 0.018, tin_b)

    # Rest, eraser sled and an ordinary service drawer with the fourth contour.
    rest = empty('PencilRest', 'rest', True)
    cube('Ivory pencil rest', (0.15, 0.08, 0.045), (0.8, 3.2, 0.94), bone, 0.015, rest)
    cube('Ivory rest notch', (0.07, 0.04, 0.04), (0.8, 3.2, 0.985), bone, 0.014, rest)
    eraser = empty('EraserSled', 'eraser', True)
    cube('Oak eraser sled', (0.19, 0.1, 0.045), (-1.1, 3.8, 0.94), oak, 0.016, eraser)
    cube('Felt eraser face', (0.16, 0.08, 0.018), (-1.1, 3.8, 0.91), felt, 0.009, eraser)
    drawer = empty('ServiceDrawer', 'drawer', True)
    cube('Service drawer oxblood front', (0.42, 0.09, 0.31), (-1.2, 3.6, 0.66), red, 0.018, drawer)
    cube('Service drawer brass pull', (0.09, 0.035, 0.045), (-1.2, 3.54, 0.67), brass, 0.016, drawer)
    cube('Service guide track', (0.24, 0.13, 0.014), (-1.2, 3.56, 0.83), glass, 0.004, drawer)
    cube('Service drawing pane', (0.2, 0.012, 0.18), (-1.2, 3.47, 1.05), glass, 0.004, drawer)
    shoe = empty('GuideShoe', dynamic=True)
    cube('Removable brass guide shoe', (0.07, 0.11, 0.035), (-1.2, 3.56, 0.86), brass, 0.012, shoe)
    for x in (-1.22, -1.18):
        cylinder('Guide shoe screw', 0.006, 0.006, (x, 3.5, 0.86), brass, 8, parent=shoe)
    curve_line('WaxLine_Service', [(-1.28, 3.48, 1.05), (-1.28, 3.48, 1.2), (-1.12, 3.48, 1.2), (-1.12, 3.48, 1.05), (-1.28, 3.48, 1.05)], wax, 0.004, shoe)

    # A small rear display and real objects at the yaw edges; no empty black wings.
    cube('Rear oak shelf', (2.1, 0.28, 0.09), (0, 7.12, 1.1), oak, 0.025)
    cube('Rear red enamel shelf apron', (1.8, 0.04, 0.16), (0, 6.96, 1.0), red, 0.012)
    for x in (-2.85, 2.85):
        cube('Edge cabinet oak carcass', (0.62, 0.55, 2.15), (x, 6.98, 1.18), oak, 0.035)
        for z in (0.4, 0.95, 1.5, 2.05):
            cube('Edge cabinet enamel drawer', (0.54, 0.035, 0.42), (x, 6.55, z), red, 0.014)
            cube('Edge cabinet subdued paper label', (0.19, 0.018, 0.055), (x, 6.65, z), paper, 0.006)
            cube('Edge cabinet brass tab', (0.055, 0.025, 0.018), (x, 6.51, z - 0.13), brass, 0.006)
    # Two shallow parts cabinets give the wide stage views a physical edge and keep the side
    # stations inside an inhabited workshop. They stay outside the walkable strip.
    for side in (-1, 1):
        cabinet_x = side * 3.08
        face_x = side * 2.86
        for depth in (2.1, 4.15):
            cube(('West' if side < 0 else 'East') + ' side guide cabinet', (0.42, 0.78, 1.62), (cabinet_x, depth, 1.18), oak, 0.035, stage=True)
            for height in (0.7, 1.2, 1.7):
                cube('Side cabinet oxblood drawer', (0.035, 0.65, 0.36), (face_x, depth, height), red, 0.018, stage=True)
                cube('Side cabinet subdued paper label', (0.04, 0.14, 0.055), (side * 2.835, depth, height + 0.08), paper, 0.006, stage=True)
                cube('Side cabinet brass pull', (0.05, 0.12, 0.026), (side * 2.72, depth, height - 0.1), brass, 0.01, stage=True)

    # These tool studies give the stage's side yaw limits a real object to land on, without text
    # or a new control surface. Their low-contrast card keeps the pantograph as the hero.
    side_boards = ((-1, 1.65, 2.3, 1.38, 1.22), (-1, 4.65, 2.15, 0.96, 0.9),
                   (1, 1.85, 2.3, 1.38, 1.22), (1, 5.0, 2.02, 0.94, 0.9))
    for side, depth, height, width, board_height in side_boards:
        face = side * 3.115
        line_x = side * 3.09
        cube('Side wall drafting board frame', (0.075, width, board_height), (side * 3.16, depth, height), oak, 0.02)
        cube('Side wall drafting card', (0.025, width - 0.12, board_height - 0.12), (side * 3.11, depth, height), drafting_card, 0.008)
        for edge_depth in (depth - width * 0.43, depth + width * 0.43):
            cube('Drafting board brass edge', (0.014, 0.014, board_height - 0.2), (face, edge_depth, height), brass, 0.004)
        for edge_height in (height - board_height * 0.43, height + board_height * 0.43):
            cube('Drafting board brass edge', (0.014, width - 0.12, 0.014), (face, depth, edge_height), brass, 0.004)
        orbit = [(line_x, depth + width * 0.17 * math.cos(index * math.pi / 8), height + board_height * 0.18 * math.sin(index * math.pi / 8))
                 for index in range(17)]
        curve_line('Drafting board pivot study', orbit, brass, 0.006)
        curve_line('Drafting board linkage study', [
            (line_x, depth - width * 0.31, height - board_height * 0.23),
            (line_x, depth - width * 0.12, height + board_height * 0.11),
            (line_x, depth + width * 0.21, height + board_height * 0.24),
            (line_x, depth + width * 0.34, height - board_height * 0.18),
        ], red_repair, 0.009)
        for index in range(7):
            tick_depth = depth - width * 0.32 + index * width * 0.107
            curve_line('Drafting board calibration tick', [
                (line_x, tick_depth, height - board_height * 0.32),
                (line_x, tick_depth, height - board_height * (0.25 if index % 2 == 0 else 0.28)),
            ], dark_joint, 0.003)
    for x in (-2.1, -1.8, 1.8, 2.1):
        cube('Rear workshop box', (0.22, 0.18, 0.26), (x, 7.05, 0.88), oak, 0.02)
        text('Box stencilled label', 'PARTS', (x, 6.945, 0.9), 0.03, paper)

    # Visible source for the task pool, plus a quiet shadow-side fill.
    cylinder('Task lamp brass stem', 0.015, 0.34, (0.82, 4.1, 2.97), brass, 16, direction=(0, 0, 1))
    cylinder('Task lamp brass collar', 0.12, 0.03, (0.82, 4.1, 2.78), brass, 24, direction=(0, 0, 1))
    cube('Oxblood shaded task-lamp canopy', (0.58, 0.4, 0.095), (0.82, 4.1, 2.71), red, 0.035)
    cube('Ivory ceramic lamp diffuser', (0.46, 0.29, 0.025), (0.82, 4.1, 2.635), lamp_diffuser, 0.01)
    for x in (0.62, 0.82, 1.02):
        sphere('Lamp brass fastener', 0.012, (x, 4.1, 2.76), brass, segments=10, rings=6)
    cube('Wall air grille', (0.42, 0.025, 0.22), (-2.5, 6.9, 2.35), oak, 0.012)
    for z in (2.28, 2.33, 2.38, 2.43):
        cube('Air grille slot', (0.34, 0.012, 0.012), (-2.5, 6.88, z), brass, 0.004)
    # Static, soft-edged air shape: pale, open, and still; no autonomous scene motion.
    plume = empty('WarmWhiteGreySmoke')
    curve_line('Still warm white-grey air', [(-2.5, 6.8, 2.3), (-2.48, 6.79, 2.37), (-2.44, 6.78, 2.44), (-2.4, 6.77, 2.52), (-2.38, 6.76, 2.6), (-2.4, 6.75, 2.68), (-2.44, 6.74, 2.76), (-2.46, 6.73, 2.84)], haze, 0.026, plume)
    curve_line('Still warm white-grey air upper wisp', [(-2.44, 6.74, 2.5), (-2.41, 6.72, 2.58), (-2.42, 6.71, 2.66), (-2.46, 6.7, 2.73)], haze, 0.014, plume)

    # Provenance plate is the only machine-maker credit in the artwork.
    plate = empty('ProvenancePlate', 'provenance')
    cube('Provenance enamel plate', (0.3, 0.03, 0.18), (-3.18, 1.55, 1.22), red, 0.012, plate)
    text('Provenance mark', 'MACHINE-MADE', (-3.155, 1.55, 1.25), 0.024, bone, rotation=(math.pi / 2, 0, math.pi / 2), parent=plate)
    text('Provenance credit', 'CODEX / OPENAI', (-3.155, 1.55, 1.19), 0.02, bone, rotation=(math.pi / 2, 0, math.pi / 2), parent=plate)
    text('Provenance fiction line', 'A FICTIONAL MECHANICAL INSTALLATION', (-3.155, 1.55, 1.13), 0.012, bone, rotation=(math.pi / 2, 0, math.pi / 2), parent=plate)

    # Ivory action tabs, all large enough to read in the station views.
    for x, z, label in ((-0.95, 3.02, 'WING NUT'), (-0.45, 3.02, 'TIN A'), (0.45, 3.02, 'TIN B')):
        cube('Ivory action tab', (0.28 if label == 'WING NUT' else 0.19, 0.075, 0.035), (x, z, 0.97), bone, 0.01)
        text('Action tab lettering', label, (x, z, 0.948), 0.025, coal, rotation=(0, 0, 0))
    cube('Portrait caption enamel mount', (1.12, 0.055, 0.14), (0, 7.4, 2.12), red, 0.012)
    text('Wing nut portrait caption', 'PORTRAIT OF A FASTENER', (0, 7.365, 2.12), 0.044, paper)
    text('Machine inventory', 'INSTRUMENTS / 01–03', (0, 7.08, 1.4), 0.065, paper)
    text('Rear label', 'DRAWN TO A FIXED SCALE', (0, 7.08, 1.28), 0.035, paper)

    unwrap()
    join_static()
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
    print('ROOM_SOURCE', os.path.abspath(output), flush=True)
    print('ROOM_OBJECTS', len([o for o in scene.objects if o.type == 'MESH']), flush=True)


args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args:
    raise RuntimeError('Usage: build.py -- <source.glb>')
os.makedirs(os.path.dirname(os.path.abspath(args[0])), exist_ok=True)
build(args[0])
