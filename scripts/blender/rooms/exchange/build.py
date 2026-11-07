"""The Exchange stage set: the Blender source of the room's glTF.

Coordinates are metres in Blender world: x to the visitor's right, y toward the board, z up. Desk
fittings are written desk-local and pass through `desk()`, which adds DESK_OFFSET.

Three kinds of surface leave this file:
- atlas parts: procedural materials baked by propkit into one shared texture set;
- plain parts: large near-black surfaces with a flat material, kept out of the atlas so its texels
  go to the fittings seen close up;
- paper parts: sheets, cards and the four lettered faces, mapped onto one printed atlas drawn here.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../props')))
from propkit import Built, geo, kit, mats  # noqa: E402

ROOM = [dict(id='exchange', title='The Exchange', tier='hero', texture=1024, ao_distance=0.22, ao_strength=0.40,
             bake_samples=64, ao_samples=192, uv_shape='AABB', cull=False, ground_ao=False)]

DESK_OFFSET = (0.24, 3.75)
BOARD_FACE = 8.645
PANEL_FACE = 5.75
LEDGE_TOP = 0.98

LINE_COLUMNS = (-1.375, -0.46, 0.455, 1.37)
LINE_ROWS = (1.52, 2.44, 3.36)
CERTIFICATION_LINE = 3
LAMP_RISE = 0.125
CARD_DROP = 0.09
CARD_SIZE = (0.42, 0.18)

# The cord leaves the top of the sheave and keeps one length in all three poses.
SHEAVE_TOP = (-0.60, 5.76, 1.55)
CORD_LENGTH = 3.00
PLUG_BODY = 0.16
PLUG_REST = (0.455, 8.46, 1.02)
PLUG_GUIDE = (0.455, 8.46, 1.14)
PLUG_SEATED = (0.455, 8.495, 1.52)

HINGE = (0.50, 5.70, 0.36)
SOCKET = (0.68, 0.38)

# Printed atlas, in pixels from the top left. Blender UV v runs upward, so `paper_uv` flips it.
ATLAS = (2048, 1024)
PRINT = dict(
    sign=(0, 0, 1536, 235),
    plate_outer=(0, 240, 480, 347),
    plate_inner=(488, 240, 480, 347),
    card_certification=(976, 240, 420, 180),
    card_a=(1404, 240, 420, 180),
    card_b=(976, 428, 420, 180),
    card_c=(1404, 428, 420, 180),
    rota=(0, 600, 300, 315),
    form=(308, 600, 440, 170),
    index=(756, 600, 270, 110),
    docket=(1034, 620, 160, 240),
    ticket_new=(1202, 620, 200, 110),
    ticket_old=(1410, 620, 200, 110),
    diagram=(1620, 620, 360, 240),
    stock=(1560, 8, 64, 64),
)
PAPER = '#DCD1B8'
CARD_STOCK = '#CFC3A6'
YELLOWED = '#C9A85C'
BRASS_FACE = '#A98C55'
BRASS_DARK = '#6B5634'
INK = '#201A14'
PENCIL = '#5B5549'


def desk(x, y, z=0.0):
    return (x + DESK_OFFSET[0], y + DESK_OFFSET[1], z)


def line_position(line):
    return LINE_COLUMNS[(line - 1) % 4], LINE_ROWS[(line - 1) // 4]


def srgb(hex_colour):
    return tuple(int(hex_colour[index:index + 2], 16) / 255 for index in (1, 3, 5))


# --- Solid pieces ------------------------------------------------------------------------------

def block(size, centre, material=0, edge=0.0, segs=2):
    bm = geo.box(size, center=centre, bevel=edge, segs=segs if edge else 1)
    geo.set_material(bm, material)
    return bm


def spun(profile, material=0, segments=20, at=None, axis=(0.0, 0.0, 1.0)):
    bm = geo.lathe(profile, segments=segments, seg_tol=0.0005)
    geo.set_material(bm, material)
    if at is not None:
        geo.place(bm, at, z_axis=axis)
    return bm


def rod(radius, length, material=0, at=(0.0, 0.0, 0.0), axis=(0.0, 0.0, 1.0), segments=14):
    profile = [(0.0, 0.0), (radius, 0.0), (radius, length), (0.0, length)]
    return spun(profile, material, segments, at, axis)


def tube(points, radius, material=0, sides=8, up=(0.0, 0.0, 1.0)):
    bm = geo.sweep(points, (radius, radius), sides=sides, up=up)
    geo.set_material(bm, material)
    return bm


def slotted_screw(at, material, slot_material, axis=(0.0, -1.0, 0.0), radius=0.008, slot_roll=0.0):
    head = spun([(0.0, 0.0), (radius, 0.0), (radius * 0.84, 0.0032), (0.0, 0.0036)], material, 10, at, axis)
    direction = Vector(axis).normalized()
    tip = Vector(at) + direction * 0.0036
    roll = math.radians(slot_roll)
    slot = block((radius * 1.7 * math.cos(roll) + 0.0012, 0.0008, radius * 1.7 * math.sin(roll) + 0.0012), tuple(tip), slot_material)
    return [head, slot]


def catenary(start, end, length, count):
    """Points along a hanging cord of fixed length between two world points."""
    a, b = Vector(start), Vector(end)
    flat = Vector((b.x - a.x, b.y - a.y, 0.0))
    span, rise = flat.length, b.z - a.z
    if length <= math.hypot(span, rise):
        raise ValueError('The cord is shorter than the distance it has to cross')
    chord = math.sqrt(length * length - rise * rise)
    low, high = 1e-3, 1e3
    for _ in range(80):
        mid = math.sqrt(low * high)
        if 2.0 * mid * math.sinh(span / (2.0 * mid)) > chord:
            low = mid
        else:
            high = mid
    tension = math.sqrt(low * high)
    centre = span / 2.0 - tension * math.asinh(rise / (2.0 * tension * math.sinh(span / (2.0 * tension))))
    offset = a.z - tension * math.cosh((0.0 - centre) / tension)
    direction = flat.normalized()
    points = []
    for step in range(count + 1):
        along = span * step / count
        height = tension * math.cosh((along - centre) / tension) + offset
        points.append((a.x + direction.x * along, a.y + direction.y * along, height))
    return points


def polyline_length(points):
    return sum((Vector(q) - Vector(p)).length for p, q in zip(points, points[1:]))


def helix(path, radius, turns_per_metre):
    """A coiled lead: a tight helix wound along a smoothed path."""
    smooth = geo.catmull3([Vector(point) for point in path], per_seg=10)
    length = polyline_length(smooth)
    count = int(length * turns_per_metre * 8)
    resampled = []
    walked = 0.0
    index = 0
    for step in range(count + 1):
        wanted = length * step / count
        while index < len(smooth) - 2 and walked + (Vector(smooth[index + 1]) - Vector(smooth[index])).length < wanted:
            walked += (Vector(smooth[index + 1]) - Vector(smooth[index])).length
            index += 1
        a, b = Vector(smooth[index]), Vector(smooth[index + 1])
        t = (wanted - walked) / max((b - a).length, 1e-6)
        resampled.append((a.lerp(b, min(t, 1.0)), (b - a).normalized()))
    wound = []
    for step, (centre, tangent) in enumerate(resampled):
        side = tangent.cross(Vector((0.0, 0.0, 1.0)))
        side = side.normalized() if side.length > 1e-4 else Vector((1.0, 0.0, 0.0))
        lift = side.cross(tangent).normalized()
        angle = step / 8 * 2.0 * math.pi
        wound.append(tuple(centre + side * (radius * math.cos(angle)) + lift * (radius * math.sin(angle))))
    return wound


def drape(width, path, material=0, columns=9, seed=4):
    """A sheet hung over a path, gently rumpled, as one quad grid."""
    import bmesh
    rng = random.Random(seed)
    bm = bmesh.new()
    rows = []
    for index, (y, z) in enumerate(path):
        row = []
        for column in range(columns + 1):
            t = column / columns - 0.5
            sag = 0.012 * math.sin(index * 1.7 + column * 0.9) + rng.uniform(-0.004, 0.004)
            row.append(bm.verts.new((t * width * (1.0 + 0.012 * math.sin(index)), y + sag, z + rng.uniform(-0.003, 0.003))))
        rows.append(row)
    for upper, lower in zip(rows, rows[1:]):
        for column in range(columns):
            face = bm.faces.new((upper[column], upper[column + 1], lower[column + 1], lower[column]))
            face.smooth = True
            face.material_index = material
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.008)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    geo.mark_auto(bm)
    return bm


# --- Materials ---------------------------------------------------------------------------------

def flat_material(name, colour, roughness=0.8, metallic=0.0, glow=None, strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*colour, 1.0)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if glow is not None:
        shader.inputs['Emission Color'].default_value = (*glow, 1.0)
        shader.inputs['Emission Strength'].default_value = strength
    return material


def printed_material(name, image, glow=0.0, roughness=0.86):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    shader = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    picture = tree.nodes.new('ShaderNodeTexImage')
    picture.image = image
    tree.links.new(picture.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    if glow:
        tree.links.new(picture.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = glow
    return material


# --- The printed atlas -------------------------------------------------------------------------

class Printer:
    """Draws the atlas as a flat scene and renders it once, so lettering stays crisp at any size."""

    def __init__(self):
        self.scene = bpy.data.scenes.new('printed atlas')
        self.layers = {}
        self.order = 0

    def rect(self, x, y, w, h, colour, layer=0):
        self.layers.setdefault((layer, colour), []).append((x, y, w, h))

    def text(self, body, size, box, colour, offset=0.0, spacing=1.0):
        x, y, w, h = box
        curve = bpy.data.curves.new('printed text', 'FONT')
        curve.body = body
        curve.size = size
        curve.align_x = 'CENTER'
        curve.align_y = 'CENTER'
        curve.offset = offset
        curve.space_character = spacing
        shape = bpy.data.objects.new('printed text', curve)
        self.scene.collection.objects.link(shape)
        shape.location = (x + w / 2, ATLAS[1] - (y + h / 2), 3.0)
        shape.data.materials.append(self.ink(colour))

    def ink(self, colour):
        name = 'printed ' + colour
        existing = bpy.data.materials.get(name)
        if existing:
            return existing
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        tree = material.node_tree
        tree.nodes.clear()
        out = tree.nodes.new('ShaderNodeOutputMaterial')
        glow = tree.nodes.new('ShaderNodeEmission')
        glow.inputs['Color'].default_value = (*srgb(colour), 1.0)
        tree.links.new(glow.outputs[0], out.inputs['Surface'])
        return material

    def render(self, path):
        for (layer, colour), rects in self.layers.items():
            verts, faces = [], []
            for x, y, w, h in rects:
                top = ATLAS[1] - y
                base = len(verts)
                verts += [(x, top - h, layer), (x + w, top - h, layer), (x + w, top, layer), (x, top, layer)]
                faces.append((base, base + 1, base + 2, base + 3))
            mesh = bpy.data.meshes.new('printed marks')
            mesh.from_pydata(verts, [], faces)
            mesh.materials.append(self.ink(colour))
            shape = bpy.data.objects.new('printed marks', mesh)
            self.scene.collection.objects.link(shape)
        lens = bpy.data.cameras.new('printed atlas')
        lens.type = 'ORTHO'
        lens.ortho_scale = ATLAS[0]
        camera = bpy.data.objects.new('printed atlas', lens)
        camera.location = (ATLAS[0] / 2, ATLAS[1] / 2, 50.0)
        self.scene.collection.objects.link(camera)
        scene = self.scene
        scene.camera = camera
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 16
        scene.cycles.use_denoising = False
        scene.cycles.max_bounces = 0
        scene.cycles.filter_width = 1.0
        scene.render.resolution_x, scene.render.resolution_y = ATLAS
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGB'
        scene.view_settings.view_transform = 'Raw'
        scene.view_settings.look = 'None'
        scene.display_settings.display_device = 'sRGB'
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True, scene=scene.name)
        for shape in list(scene.collection.objects):
            bpy.data.objects.remove(shape)
        bpy.data.scenes.remove(scene)


def pencil_hatching(printer, box, seed):
    x, y, w, h = box
    rng = random.Random(seed)
    for row in range(5):
        top = y + 34 + row * 25
        left = x + 30 + rng.randint(0, 14)
        span = w - 66 - rng.randint(0, 150)
        for stroke in range(left, left + span, 9):
            printer.rect(stroke, top + rng.randint(-1, 1), 5, 11 + rng.randint(-2, 3), PENCIL, 1)


def typed_lines(printer, box, rows, colour=INK, seed=1, pitch=13, width=0.8, margin=0.08, stroke=4):
    x, y, w, h = box
    rng = random.Random(seed)
    for row in range(rows):
        cursor = x + w * margin
        end = x + w * (margin + width * rng.uniform(0.72, 1.0))
        while cursor < end:
            word = rng.randint(3, 8) * 5
            printer.rect(cursor, y + h * 0.16 + row * pitch, min(word, end - cursor), stroke, colour, 1)
            cursor += word + 6


def make_print_atlas(path):
    printer = Printer()
    printer.rect(0, 0, ATLAS[0], ATLAS[1], '#2A241C', -1)
    for name, box in PRINT.items():
        ground = {'sign': '#CFC4A8', 'plate_outer': BRASS_FACE, 'plate_inner': BRASS_FACE, 'ticket_old': YELLOWED,
                  'stock': CARD_STOCK, 'card_certification': CARD_STOCK, 'card_a': CARD_STOCK, 'card_b': CARD_STOCK,
                  'card_c': CARD_STOCK}.get(name, PAPER)
        printer.rect(*box, ground)

    sign = PRINT['sign']
    printer.rect(sign[0] + 14, sign[1] + 14, sign[2] - 28, 4, INK, 1)
    printer.rect(sign[0] + 14, sign[1] + sign[3] - 18, sign[2] - 28, 4, INK, 1)
    printer.text('TELEPHONE EXCHANGE', 118, sign, INK, offset=1.4, spacing=1.08)

    outer = PRINT['plate_outer']
    printer.text('OPERATOR', 78, (outer[0], outer[1] + 48, outer[2], 120), '#17120C', offset=0.9, spacing=1.06)
    printer.text('RULE 14', 62, (outer[0], outer[1] + 176, outer[2], 110), '#17120C', offset=0.6, spacing=1.06)

    # The inner leaf is left as engraved rules. Its words are sealed and read only in the reader.
    inner = PRINT['plate_inner']
    for row, span in enumerate((0.72, 0.60, 0.0, 0.76, 0.58)):
        if span:
            printer.rect(inner[0] + 56, inner[1] + 82 + row * 42, (inner[2] - 112) * span, 9, BRASS_DARK, 1)

    card = PRINT['card_certification']
    printer.rect(card[0] + 12, card[1] + 12, card[2] - 24, 3, INK, 1)
    printer.rect(card[0] + 12, card[1] + card[3] - 15, card[2] - 24, 3, INK, 1)
    printer.text('CERTIFICATION', 52, card, INK, offset=0.7)
    for seed, name in enumerate(('card_a', 'card_b', 'card_c')):
        pencil_hatching(printer, PRINT[name], seed + 3)

    # Rota: seven pencilled rows that shrink after the second, then a typed foot.
    rota = PRINT['rota']
    for row in range(8):
        printer.rect(rota[0] + 20, rota[1] + 26 + row * 28, rota[2] - 40, 2, '#8C8373', 1)
    rng = random.Random(14)
    for row in range(7):
        scale = 1.0 if row < 2 else max(0.34, 1.0 - (row - 1) * 0.15)
        cursor = rota[0] + 26
        while cursor < rota[0] + 26 + (rota[2] - 60) * scale:
            stroke = rng.randint(14, 30) * scale
            printer.rect(cursor, rota[1] + 34 + row * 28, stroke, max(3, 12 * scale), PENCIL, 2)
            cursor += stroke + 9 * scale
    typed_lines(printer, (rota[0], rota[1] + 208, rota[2], 100), 4, seed=6, pitch=16, width=0.84)

    # The form is read from the shelf view, a metre off, so its type is set heavier than the rest.
    typed_lines(printer, PRINT['form'], 4, seed=8, pitch=30, width=0.78, margin=0.11, stroke=9)
    typed_lines(printer, PRINT['index'], 2, seed=9, pitch=30, width=0.78, margin=0.1)
    typed_lines(printer, PRINT['docket'], 11, seed=10, pitch=17, width=0.8, margin=0.1)
    typed_lines(printer, PRINT['ticket_new'], 3, seed=11, pitch=22, width=0.76, margin=0.1)
    typed_lines(printer, PRINT['ticket_old'], 3, seed=11, pitch=22, width=0.76, margin=0.1)

    # The diagram sheet: a ruled frame and its drawn marks.
    sheet = PRINT['diagram']
    printer.rect(sheet[0] + 12, sheet[1] + 12, sheet[2] - 24, 2, '#4C3D28', 1)
    printer.rect(sheet[0] + 12, sheet[1] + 12, 2, sheet[3] - 24, '#4C3D28', 1)
    printer.rect(sheet[0] + sheet[2] - 14, sheet[1] + 12, 2, sheet[3] - 24, '#4C3D28', 1)
    printer.rect(sheet[0] + 12, sheet[1] + sheet[3] - 62, sheet[2] - 24, 2, '#4C3D28', 1)
    printer.rect(sheet[0] + 12, sheet[1] + sheet[3] - 14, sheet[2] - 24, 2, '#4C3D28', 1)
    for index, (start, turn_x, end) in enumerate(((46, 130, 88), (76, 212, 120), (108, 92, 62))):
        printer.rect(sheet[0] + 30, sheet[1] + start, turn_x, 3, '#7A5A24', 2)
        printer.rect(sheet[0] + 30 + turn_x, sheet[1] + min(start, end), 3, abs(end - start) + 3, '#7A5A24', 2)
        printer.rect(sheet[0] + 30 + turn_x, sheet[1] + end, sheet[2] - 60 - turn_x, 3, '#7A5A24', 2)
    jack = (sheet[0] + 176, sheet[1] + sheet[3] - 46, 16, 16)
    printer.rect(*jack, '#7A5A24', 2)
    printer.rect(jack[0] + 5, jack[1] + 5, 6, 6, PAPER, 3)
    printer.rect(jack[0] + 7, sheet[1] + sheet[3] - 62, 2, 16, '#7A5A24', 2)

    printer.render(path)
    image = bpy.data.images.load(path)
    image.colorspace_settings.name = 'sRGB'
    image.pack()
    return image


def paper_uv(name):
    x, y, w, h = PRINT[name]
    return x / ATLAS[0], (x + w) / ATLAS[0], 1.0 - (y + h) / ATLAS[1], 1.0 - y / ATLAS[1]


class Stage:
    """Collects every node of the set and how each one is to be baked and exported."""

    def __init__(self, root):
        self.root = root
        self.parts = []
        self.unbaked = []
        self.moving = []

    def atlas(self, name, pieces, materials, at=(0.0, 0.0, 0.0), parent=None, moving=False):
        obj = kit.add_part(self.root, name, geo.merge(*pieces), materials, location=at, sharp_deg=44)
        return self.keep(obj, parent, moving)

    def plain(self, name, pieces, material, at=(0.0, 0.0, 0.0), parent=None, moving=False):
        obj = kit.add_part(self.root, name, geo.merge(*pieces), material, location=at, sharp_deg=44, weighted=False)
        self.unbaked.append(obj)
        return self.keep(obj, parent, moving)

    def keep(self, obj, parent, moving):
        if parent is not None:
            obj.parent = parent
        self.parts.append(obj)
        if moving:
            self.moving.append(obj.name)
        return obj

    def pivot(self, name, at):
        """A node with no geometry: it survives export as the parent that carries a hinge."""
        obj = bpy.data.objects.new(name, bpy.data.meshes.new(name))
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = self.root
        obj.location = at
        self.unbaked.append(obj)
        self.parts.append(obj)
        return obj

    def sheet(self, name, centre, half_u, half_v, depth, face, material, at=(0.0, 0.0, 0.0), parent=None, moving=True):
        """A thin printed board. +u runs along the print's left-to-right, so `half_u` x `half_v` is the
        outward normal; the lettering gate reads exactly this mapping back from the exported file."""
        c, u, v = Vector(centre), Vector(half_u), Vector(half_v)
        normal = u.cross(v).normalized()
        front = [c - u - v, c + u - v, c + u + v, c - u + v]
        back = [corner - normal * depth for corner in front]
        verts = [tuple(p) for p in front + back]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        layer = mesh.uv_layers.new(name='UVMap')
        u0, u1, v0, v1 = paper_uv(face)
        s0, s1, t0, t1 = paper_uv('stock')
        plain_uv = ((s0 + s1) / 2, (t0 + t1) / 2)
        printed = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
        for polygon in mesh.polygons:
            for slot, loop in enumerate(polygon.loop_indices):
                layer.data[loop].uv = printed[slot] if polygon.index == 0 else plain_uv
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = self.root
        obj.location = at
        self.unbaked.append(obj)
        return self.keep(obj, parent, moving)


# --- The room ----------------------------------------------------------------------------------

def build_shell(stage, m):
    wall, floor, steel_dark = m['wall'], m['floor'], m['steel_dark']
    stage.plain('exchange_walls', [
        block((0.18, 9.0, 12.6), (-2.01, 4.5, 6.3)),
        block((0.18, 9.0, 12.6), (2.01, 4.5, 6.3)),
        block((4.2, 9.0, 0.16), (0.0, 4.5, 12.52)),
        block((4.2, 0.16, 12.6), (0.0, 8.92, 6.3)),
        block((4.2, 0.14, 12.6), (0.0, -0.03, 6.3)),
    ], wall)
    stage.plain('exchange_floor', [block((4.2, 9.0, 0.20), (0.0, 4.5, -0.10))], floor)
    stage.plain('exchange_door', [
        block((0.95, 0.05, 2.7), (0.0, 0.065, 1.35)),
        block((1.12, 0.06, 0.09), (0.0, 0.07, 2.745)),
    ], steel_dark)
    # Above the sign the steel carries on unlit, so the height of the board is felt and not shown.
    stage.plain('switchboard_upper', [
        block((3.92, 0.11, 8.30), (0.0, 8.70, 8.05)),
        block((0.12, 0.12, 8.30), (-1.94, 8.68, 8.05)),
        block((0.12, 0.12, 8.30), (1.94, 8.68, 8.05)),
    ], steel_dark)

    glass = block((0.025, 2.48, 0.76), (1.83, 5.18, 11.17))
    stage.atlas('clerestory_frame', [
        block((0.04, 2.8, 1.05), (1.90, 5.18, 11.17), 0, 0.003),
        block((0.08, 0.055, 0.86), (1.82, 4.36, 11.17), 1),
        block((0.08, 0.055, 0.86), (1.82, 5.18, 11.17), 1),
        block((0.08, 0.055, 0.86), (1.82, 6.00, 11.17), 1),
        block((0.08, 2.5, 0.06), (1.82, 5.18, 11.17), 1),
    ], [m['oak'], m['copper']])
    stage.plain('clerestory_emitter', [glass], m['clerestory_glass'], moving=True)

    stage.atlas('maker_mark_plaque', [
        block((1.24, 0.09, 0.24), (0.0, 0.12, 10.95), 0, 0.02),
        block((0.66, 0.035, 0.09), (0.0, 0.065, 10.95), 1, 0.006),
    ], [m['oak'], m['enamel']])
    credit = bpy.data.curves.new('maker_credit', 'FONT')
    credit.body = 'MACHINE-MADE  ·  CLAUDE TEAM'
    credit.size = 0.070
    credit.extrude = 0.001
    credit.align_x = 'CENTER'
    mark = bpy.data.objects.new('maker_credit', credit)
    bpy.context.scene.collection.objects.link(mark)
    mark.location = (0.0, 0.043, 10.92)
    mark.rotation_euler = (math.pi / 2, 0.0, 0.0)
    bpy.context.view_layer.objects.active = mark
    mark.select_set(True)
    bpy.ops.object.convert(target='MESH')
    mark = bpy.context.object
    mark.name = 'maker_credit'
    mark.parent = stage.root
    mark.select_set(False)
    mark.data.materials.append(m['brass'])
    stage.parts.append(mark)


def build_board(stage, m):
    steel, brass, worn, black, paper_print = m['steel'], m['brass'], m['worn'], m['bakelite'], m['card_print']
    field = [block((3.92, 0.11, 3.80), (0.0, 8.70, 2.00), 0, 0.01)]
    for z in (0.22, 3.84):
        field.append(block((4.02, 0.13, 0.12), (0.0, 8.69, z), 1, 0.012))
    for x in (-1.94, 1.94):
        field.append(block((0.12, 0.12, 3.80), (x, 8.68, 2.00), 1, 0.01))
    for z in (1.06, 1.98, 2.90):
        field.append(block((3.74, 0.004, 0.006), (0.0, BOARD_FACE - 0.001, z), 1))
    for x in (-0.915, 0.0, 0.915):
        field.append(block((0.006, 0.004, 2.80), (x, BOARD_FACE - 0.001, 2.46), 1))
    stage.atlas('switchboard', field, [steel, brass])

    for line in range(1, 13):
        x, z = line_position(line)
        number = '%02d' % line
        certification = line == CERTIFICATION_LINE
        collar_material = 1 if certification else 0
        pieces = [
            spun([(0.0, 0.0), (0.068, 0.0), (0.075, 0.006), (0.074, 0.014), (0.062, 0.024), (0.048, 0.030),
                  (0.040, 0.044), (0.030, 0.048), (0.022, 0.044), (0.016, 0.032), (0.0, 0.030)],
                 collar_material, 24, (x, BOARD_FACE, z), (0.0, -1.0, 0.0)),
            spun([(0.0, 0.0), (0.066, 0.0), (0.070, 0.005), (0.060, 0.012), (0.0, 0.012)], 0, 20,
                 (x, BOARD_FACE, z + LAMP_RISE), (0.0, -1.0, 0.0)),
            block((0.44, 0.012, 0.016), (x, BOARD_FACE - 0.012, z - CARD_DROP + 0.008), 0, 0.002),
        ]
        stage.atlas('certification_jack' if certification else 'line_jack_' + number, pieces, [brass, worn])
        stage.plain('line_lamp_' + number, [
            spun([(0.0, 0.0), (0.043, 0.0), (0.052, 0.016), (0.044, 0.056), (0.026, 0.072), (0.0, 0.076)], 0, 20,
                 (x, BOARD_FACE - 0.008, z + LAMP_RISE), (0.0, -1.0, 0.0)),
        ], m['line_glow'], moving=True)
        face = 'card_certification' if certification else ('card_a', 'card_b', 'card_c')[line % 3]
        # The origin is the card's upper edge, the line it tips about.
        stage.sheet('line_card_' + number, (0.0, 0.0, -CARD_SIZE[1] / 2), (CARD_SIZE[0] / 2, 0.0, 0.0),
                    (0.0, 0.0, CARD_SIZE[1] / 2), 0.008, face, paper_print,
                    at=(x, BOARD_FACE - 0.020, z - CARD_DROP))

    # The sign is bolted to the board face above the top row.
    stage.plain('exchange_board_title', [block((2.48, 0.065, 0.38), (0.0, 8.6125, 4.30), 0, 0.012)], m['sign_board'])
    stage.sheet('exchange_board_title_face', (0.0, 8.5795, 4.30), (1.20, 0.0, 0.0), (0.0, 0.0, 0.17), 0.001, 'sign', m['sign_print'])
    fixings = []
    for x in (-1.195, 1.195):
        for z in (4.15, 4.45):
            fixings += slotted_screw((x, 8.58, z), 0, 1, radius=0.016, slot_roll=35.0)
    stage.atlas('exchange_board_title_fixings', fixings, [brass, black])


def build_ledge(stage, m):
    oak, iron, brass, worn, black = m['oak'], m['iron'], m['brass'], m['worn'], m['bakelite']
    paper_print = m['paper_print']
    shelf = [block((3.70, BOARD_FACE - 8.40, 0.03), (0.0, (8.40 + BOARD_FACE) / 2, LEDGE_TOP - 0.015), 0, 0.005)]
    for x in (-0.85, 0.05, 1.05):
        shelf.append(block((0.04, 0.22, 0.012), (x, 8.535, 0.944), 1, 0.002))
        shelf.append(block((0.04, 0.012, 0.26), (x, BOARD_FACE - 0.006, 0.82), 1, 0.002))
        strut = block((0.03, 0.27, 0.012), (x, 8.54, 0.82), 1, 0.002)
        geo.rotate(strut, (34.0, 0.0, 0.0), pivot=(x, 8.54, 0.82))
        shelf.append(strut)
    stage.atlas('ticket_shelf', shelf, [oak, iron])

    # Runners hang from the ledge; two stops at their fronts end the drawer's 0.22 m of travel.
    runners = []
    for x in (-1.665, -1.135):
        runners.append(block((0.012, 0.49, 0.012), (x, 8.40, 0.806), 0, 0.002))
        runners.append(block((0.012, 0.012, 0.15), (x, 8.44, 0.875), 0, 0.002))
        runners.append(block((0.012, 0.012, 0.15), (x, 8.62, 0.875), 0, 0.002))
        runners.append(block((0.024, 0.012, 0.024), (x + (0.006 if x < -1.4 else -0.006), 8.16, 0.812), 0, 0.002))
    stage.atlas('ticket_drawer_runners', runners, [brass])

    drawer = [
        block((0.50, 0.21, 0.01), (-1.40, 8.515, 0.805), 0, 0.002),
        block((0.012, 0.21, 0.13), (-1.644, 8.515, 0.87), 0, 0.002),
        block((0.012, 0.21, 0.13), (-1.156, 8.515, 0.87), 0, 0.002),
        block((0.50, 0.012, 0.13), (-1.40, 8.614, 0.87), 0, 0.002),
        block((0.50, 0.018, 0.145), (-1.40, 8.405, 0.875), 0, 0.003),
        block((0.16, 0.014, 0.018), (-1.40, 8.389, 0.875), 1, 0.004),
        block((0.46, 0.18, 0.012), (-1.40, 8.515, 0.925), 0, 0.002),
        block((0.012, 0.012, 0.115), (-1.60, 8.515, 0.865), 0, 0.001),
        block((0.012, 0.012, 0.115), (-1.20, 8.515, 0.865), 0, 0.001),
    ]
    tray = stage.atlas('ticket_shelf_drawer', drawer, [oak, brass], moving=True)
    stage.sheet('ticket_form', (-1.40, 8.515, 0.9325), (0.22, 0.0, 0.0), (0.0, 0.085, 0.0), 0.002, 'form', paper_print, parent=tray)

    lamp = [
        spun([(0.0, 0.0), (0.06, 0.0), (0.056, 0.012), (0.0, 0.016)], 0, 18, (-1.40, 8.52, LEDGE_TOP)),
        rod(0.009, 0.15, 0, (-1.40, 8.52, LEDGE_TOP + 0.012), segments=10),
        tube([(-1.40, 8.52, LEDGE_TOP + 0.16), (-1.40, 8.50, LEDGE_TOP + 0.20), (-1.40, 8.45, LEDGE_TOP + 0.205)], 0.009, 0, 8),
        spun([(0.0, 0.0), (0.075, 0.0), (0.08, 0.008), (0.05, 0.05), (0.018, 0.058), (0.0, 0.058)], 1, 20,
             (-1.40, 8.43, LEDGE_TOP + 0.15), (0.0, 0.0, 1.0)),
    ]
    stage.atlas('ledge_lamp', lamp, [brass, m['bakelite']])
    stage.plain('ledge_lamp_emitter', [spun([(0.0, 0.0), (0.022, 0.0), (0.026, 0.012), (0.0, 0.02)], 0, 12, (-1.40, 8.43, LEDGE_TOP + 0.135))],
                m['lamp_glass'], moving=True)

    # The rota hangs on a clipboard against the board; the index stands in a brass frame.
    board_y = BOARD_FACE - 0.006
    stage.atlas('rota_clipboard', [
        block((0.24, 0.012, 0.24), (-0.92, board_y, 1.12), 0, 0.003),
        block((0.07, 0.016, 0.026), (-0.92, board_y - 0.012, 1.235), 1, 0.003),
    ], [oak, brass])
    stage.sheet('inspect_shift_roster', (-0.92, board_y - 0.008, 1.105), (0.10, 0.0, 0.0), (0.0, 0.0, 0.105), 0.001, 'rota', paper_print)
    stage.atlas('shelf_index_frame', [
        block((0.30, 0.014, 0.012), (-0.55, board_y, 1.006), 0, 0.002),
        block((0.30, 0.014, 0.012), (-0.55, board_y, 1.114), 0, 0.002),
        block((0.012, 0.014, 0.12), (-0.694, board_y, 1.06), 0, 0.002),
        block((0.012, 0.014, 0.12), (-0.406, board_y, 1.06), 0, 0.002),
    ], [brass])
    stage.sheet('inspect_shelf_index', (-0.55, board_y - 0.002, 1.06), (0.135, 0.0, 0.0), (0.0, 0.0, 0.05), 0.001, 'index', paper_print)

    # A rest on the ledge and, above it, a fork open upward so the plug rises through it to the jack.
    x = PLUG_REST[0]
    guide = [
        block((0.10, 0.18, 0.008), (x, 8.46, LEDGE_TOP + 0.004), 0, 0.002),
        block((0.016, 0.03, 0.02), (x - 0.04, 8.46, LEDGE_TOP + 0.018), 0, 0.002),
        block((0.016, 0.03, 0.02), (x + 0.04, 8.46, LEDGE_TOP + 0.018), 0, 0.002),
        block((0.02, 0.02, PLUG_GUIDE[2] - LEDGE_TOP), (x + 0.075, 8.625, (PLUG_GUIDE[2] + LEDGE_TOP) / 2), 0, 0.003),
        block((0.15, 0.016, 0.012), (x + 0.01, 8.625, PLUG_GUIDE[2]), 0, 0.002),
        block((0.012, 0.19, 0.012), (x - 0.040, 8.53, PLUG_GUIDE[2]), 0, 0.002),
        block((0.012, 0.19, 0.012), (x + 0.040, 8.53, PLUG_GUIDE[2]), 0, 0.002),
    ]
    stage.atlas('enquiry_plug_guide', guide, [brass])
    plug = [
        rod(0.032, PLUG_BODY, 0, (0.0, -0.08, 0.0), (0.0, 1.0, 0.0), 20),
        rod(0.012, 0.07, 1, (0.0, 0.08, 0.0), (0.0, 1.0, 0.0), 14),
        rod(0.016, 0.03, 0, (0.0, -0.11, 0.0), (0.0, 1.0, 0.0), 12),
    ]
    stage.atlas('enquiry_plug', plug, [black, worn], at=PLUG_REST, moving=True)

    # The lever swings on the hinge pin carried by its pivot; the base stays on the ledge.
    pin = (1.37, 8.52, LEDGE_TOP + 0.04)
    stage.atlas('night_service_base', [
        block((0.14, 0.10, 0.04), (1.37, 8.52, LEDGE_TOP + 0.02), 0, 0.006),
        rod(0.012, 0.11, 1, (1.315, 8.52, pin[2]), (1.0, 0.0, 0.0), 12),
    ], [brass, iron])
    pivot = stage.pivot('night_service_pivot', pin)
    lever = [
        rod(0.009, 0.14, 0, (0.0, 0.0, 0.0), (0.0, -0.40, 0.92), 12),
        spun([(0.0, 0.0), (0.016, 0.003), (0.022, 0.016), (0.016, 0.03), (0.0, 0.034)], 1, 14, (0.0, -0.056, 0.128), (0.0, -0.40, 0.92)),
    ]
    stage.atlas('night_service_switch', lever, [brass, black], parent=pivot, moving=True)


def build_cord(stage, m):
    cord = m['cord']
    tail = PLUG_BODY / 2 + 0.03
    ends = (('rest', PLUG_REST), ('guide', PLUG_GUIDE), ('seated', PLUG_SEATED))
    for name, plug in ends:
        points = catenary(SHEAVE_TOP, (plug[0], plug[1] - tail, plug[2]), CORD_LENGTH, 28)
        measured = polyline_length(points)
        lowest = min(point[2] for point in points)
        print('  cord %s: length %.3f m, lowest z %.3f' % (name, measured, lowest))
        if abs(measured - CORD_LENGTH) > 0.01 or lowest < 0.2:
            raise RuntimeError('The %s cord pose is out of tolerance' % name)
        stage.plain('enquiry_cord_' + name, [tube(points, 0.009, 0, 6, up=(1.0, 0.0, 0.0))], cord, moving=True)


def build_desk(stage, m):
    walnut, brass, worn, black, cloth, enamel = m['walnut'], m['brass'], m['worn'], m['bakelite'], m['cloth'], m['enamel']
    stage.atlas('operator_desk', [
        block((2.25, 0.88, 0.10), desk(0.0, 1.62, 1.03), 0, 0.004, 3),
        block((0.12, 0.76, 0.98), desk(-0.91, 1.62, 0.49), 0, 0.003),
        block((0.12, 0.76, 0.98), desk(0.91, 1.62, 0.49), 0, 0.003),
        block((1.78, 0.08, 0.11), desk(0.0, 2.02, 0.74), 0, 0.003),
    ], [walnut])
    joinery = [
        block((1.84, 0.07, 0.20), desk(0.0, 1.15, 0.80), 0, 0.003),
        block((0.07, 0.66, 0.20), desk(-0.82, 1.60, 0.80), 0, 0.002),
        block((0.07, 0.66, 0.20), desk(0.82, 1.60, 0.80), 0, 0.002),
    ]
    for x in (-0.62, -0.21, 0.21, 0.62):
        joinery.append(block((0.34, 0.022, 0.145), desk(x, 1.108, 0.81), 0, 0.002))
        joinery.append(spun([(0.0, 0.0), (0.018, 0.0), (0.018, 0.012), (0.0, 0.012)], 1, 16, desk(x, 1.097, 0.81), (0.0, -1.0, 0.0)))
    stage.atlas('desk_joinery_and_drawers', joinery, [walnut, worn])

    stage.atlas('desk_blotter', [block((0.46, 0.30, 0.006), desk(0.38, 1.85, 1.083), 0, 0.001)], [cloth])

    # The telephone. The handset's origin is the middle of its grip, so its two rest poses are a
    # translation and one turn about the vertical.
    phone = desk(0.18, 1.48)
    body = [
        block((0.31, 0.25, 0.10), (phone[0], phone[1], 1.13), 0, 0.03),
        spun([(0.0, 0.0), (0.082, 0.0), (0.082, 0.014), (0.07, 0.018), (0.0, 0.018)], 0, 28, (phone[0], phone[1] - 0.02, 1.18)),
        block((0.022, 0.05, 0.10), (phone[0] - 0.14, phone[1], 1.225), 0, 0.006),
        block((0.022, 0.05, 0.10), (phone[0] + 0.14, phone[1], 1.225), 0, 0.006),
    ]
    for step in range(10):
        angle = math.radians(step * 32.0 + 20.0)
        body.append(rod(0.007, 0.004, 1, (phone[0] + math.cos(angle) * 0.053, phone[1] - 0.02 + math.sin(angle) * 0.053, 1.198), segments=8))
    stage.atlas('inspect_handset', body, [black, brass])

    grip = geo.sweep([(-0.205, 0.0, -0.030), (-0.165, 0.0, -0.002), (-0.08, 0.0, 0.010), (0.0, 0.0, 0.012),
                      (0.08, 0.0, 0.010), (0.165, 0.0, -0.002), (0.205, 0.0, -0.030)],
                     (0.024, 0.026), sides=14, up=(0.0, 1.0, 0.0), squareness=0.82)
    geo.set_material(grip, 0)
    handset = [grip]
    for sign in (-1, 1):
        handset.append(spun([(0.0, 0.0), (0.038, 0.0), (0.042, 0.010), (0.038, 0.026), (0.024, 0.044), (0.0, 0.05)],
                            0, 22, (sign * 0.226, 0.0, -0.1), (0.0, 0.0, 1.0)))
        handset.append(spun([(0.03, 0.0), (0.033, 0.0), (0.033, 0.002), (0.03, 0.002)], 1, 20, (sign * 0.226, 0.0, -0.1), (0.0, 0.0, 1.0)))
    stage.atlas('phone_handset', handset, [black, brass], at=(phone[0], phone[1], 1.30), moving=True)

    # The lead leaves the back of the body and ends at the left earpiece, wherever that lies.
    socket = (phone[0] - 0.12, phone[1] + 0.13, 1.10)
    cup = (phone[0] - 0.226, phone[1], 1.21)
    lying = desk(0.38, 1.85)
    laid_cup = (lying[0] - 0.226 * math.cos(0.35), lying[1] + 0.226 * math.sin(0.35), 1.12)
    cradled = helix([socket, (socket[0] - 0.06, socket[1] + 0.03, 1.095), (cup[0] - 0.08, cup[1] + 0.12, 1.095),
                     (cup[0] - 0.05, cup[1] + 0.03, 1.15), cup], 0.009, 90)
    laid = helix([socket, (socket[0] + 0.02, socket[1] + 0.05, 1.095), (laid_cup[0] - 0.10, laid_cup[1] - 0.06, 1.095),
                  (laid_cup[0] - 0.05, laid_cup[1] - 0.005, 1.10), laid_cup], 0.009, 90)
    stage.plain('phone_coiled_cord', [tube(cradled, 0.0035, 0, 5)], m['lead'], moving=True)
    stage.plain('phone_coiled_cord_laid', [tube(laid, 0.0035, 0, 5)], m['lead'], moving=True)

    book = desk(-0.43, 1.60)
    stage.atlas('inspect_rulebook', [
        block((0.43, 0.31, 0.007), (book[0], book[1], 1.0835), 0, 0.002),
        block((0.42, 0.296, 0.036), (book[0] + 0.004, book[1], 1.105), 1, 0.001),
        block((0.43, 0.31, 0.007), (book[0], book[1], 1.1265), 0, 0.002),
        block((0.014, 0.31, 0.05), (book[0] - 0.216, book[1], 1.105), 0, 0.005),
    ], [cloth, m['pages']])

    base = desk(-0.80, 1.72)
    head = desk(-0.52, 1.72)
    stage.atlas('bankers_lamp', [
        spun([(0.0, 0.0), (0.11, 0.0), (0.104, 0.022), (0.03, 0.032), (0.0, 0.032)], 1, 28, (base[0], base[1], 1.08)),
        tube([(base[0], base[1], 1.10), (base[0], base[1], 1.34), (base[0] + 0.05, base[1], 1.41), (head[0] - 0.08, head[1], 1.43),
              (head[0], head[1], 1.42)], 0.012, 1, 10),
        spun([(0.0, 0.105), (0.04, 0.10), (0.115, 0.04), (0.125, 0.0), (0.112, 0.0), (0.03, 0.09), (0.0, 0.095)], 0, 30, (head[0], head[1], 1.31)),
    ], [m['shade'], brass])
    stage.plain('desk_lamp_emitter', [spun([(0.0, 0.0), (0.028, 0.0), (0.034, 0.02), (0.0, 0.03)], 0, 14, (head[0], head[1], 1.325))],
                m['lamp_glass'], moving=True)

    # The chair faces the desk, clear of the kneehole, with the cardigan hung over its back.
    cx, cy = desk(-0.94, 0.63)[:2]
    chair = [
        block((0.52, 0.50, 0.05), (cx, cy, 0.62), 0, 0.012),
        block((0.52, 0.045, 0.62), (cx, cy - 0.24, 1.02), 0, 0.012),
        block((0.46, 0.44, 0.03), (cx, cy, 0.655), 1, 0.012),
    ]
    for dx in (-0.23, 0.23):
        for dy, top in ((-0.22, 0.72), (0.22, 0.60)):
            chair.append(block((0.04, 0.04, top), (cx + dx, cy + dy, top / 2), 0, 0.006))
    stage.atlas('operator_chair', chair, [walnut, cloth])
    top_z = 1.335
    back_y = cy - 0.24
    hanging = [(back_y - 0.045 + 0.01 * math.sin(i), top_z - 0.56 + i * 0.07) for i in range(8)]
    over = [(back_y - 0.03, top_z + 0.016), (back_y, top_z + 0.022), (back_y + 0.03, top_z + 0.016)]
    front = [(back_y + 0.042 + 0.006 * math.sin(i * 2), top_z - i * 0.06) for i in range(1, 6)]
    wool = drape(0.50, hanging + over + front, 0)
    geo.translate(wool, (cx, 0.0, 0.0))
    pieces = [wool]
    for sign in (-1, 1):
        sleeve = geo.sweep([(cx + sign * 0.25, back_y - 0.05, top_z - 0.04), (cx + sign * 0.285, back_y - 0.06, top_z - 0.2),
                            (cx + sign * 0.275, back_y - 0.065, top_z - 0.40), (cx + sign * 0.265, back_y - 0.06, top_z - 0.54)],
                           (0.042, 0.03), sides=10, up=(0.0, 1.0, 0.0))
        geo.set_material(sleeve, 0)
        pieces.append(sleeve)
    stage.atlas('inspect_cardigan', pieces, [m['wool']])

    flask = desk(-0.92, 1.88)
    stage.atlas('inspect_tea_flask', [
        spun([(0.0, 0.0), (0.072, 0.0), (0.075, 0.01), (0.075, 0.19), (0.058, 0.215), (0.0, 0.215)], 0, 26, (flask[0], flask[1], 1.08)),
        spun([(0.0, 0.0), (0.056, 0.0), (0.06, 0.008), (0.05, 0.05), (0.0, 0.056)], 1, 22, (flask[0], flask[1], 1.295)),
    ], [enamel, brass])

    bell = desk(0.60, 1.59)
    stage.atlas('inspect_desk_bell', [
        spun([(0.0, 0.0), (0.11, 0.0), (0.112, 0.012), (0.10, 0.014), (0.0, 0.014)], 1, 28, (bell[0], bell[1], 1.08)),
        spun([(0.0, 0.0), (0.098, 0.0), (0.092, 0.024), (0.066, 0.052), (0.02, 0.066), (0.0, 0.067)], 0, 28, (bell[0], bell[1], 1.094)),
        rod(0.008, 0.024, 0, (bell[0], bell[1], 1.16), segments=10),
        spun([(0.0, 0.0), (0.013, 0.0), (0.013, 0.008), (0.0, 0.012)], 0, 10, (bell[0], bell[1], 1.182)),
    ], [worn, m['bakelite']])

    # The post stands on the rear of the desk top; the sheave's groove lies along the cord's run.
    x, y, top = SHEAVE_TOP
    run = Vector((PLUG_SEATED[0] - x, PLUG_SEATED[1] - y, 0.0)).normalized()
    axle = run.cross(Vector((0.0, 0.0, 1.0)))
    radius = 0.03
    centre = (x, y, top - radius)
    sheave = spun([(0.0, -0.011), (radius, -0.011), (radius - 0.006, 0.0), (radius, 0.011), (0.0, 0.011)], 0, 20, centre, tuple(axle))
    post = [
        spun([(0.0, 0.0), (0.045, 0.0), (0.045, 0.012), (0.018, 0.022), (0.0, 0.022)], 0, 20, (x, y, 1.08)),
        rod(0.012, top - radius - 1.10, 0, (x, y, 1.10), segments=12),
        sheave,
    ]
    stage.atlas('enquiry_cord_post', post, [brass])
    drop = catenary((x, y, top), (x - run.x * 0.014, y - run.y * 0.014, 1.095), 0.47, 10)
    stage.plain('enquiry_cord_tail', [tube(drop, 0.009, 0, 6, up=(1.0, 0.0, 0.0))], m['cord'])


def build_kneehole(stage, m):
    walnut, brass, worn, black, iron = m['walnut'], m['brass'], m['worn'], m['bakelite'], m['iron']
    face = PANEL_FACE
    stage.atlas('operator_panel', [block((1.88, 0.04, 0.62), (0.24, face + 0.02, 0.37), 0, 0.002)], [walnut])

    # A concealed warm strip under the back rail; the batten in front of it hides it from the kneehole.
    stage.atlas('apron_batten', [block((1.60, 0.012, 0.08), (0.24, 5.665, 0.67), 0, 0.002),
                                 block((1.60, 0.07, 0.012), (0.24, 5.70, 0.705), 0, 0.002)], [walnut])
    stage.plain('apron_strip', [block((1.50, 0.012, 0.012), (0.24, 5.70, 0.692))], m['strip_glass'], moving=True)

    # The frame stands proud of the panel and makes the recess the plate closes over.
    frame = [
        block((0.03, 0.04, 0.28), (0.505, face - 0.02, 0.36), 0, 0.002),
        block((0.03, 0.04, 0.28), (0.855, face - 0.02, 0.36), 0, 0.002),
        block((0.38, 0.04, 0.03), (0.68, face - 0.02, 0.485), 0, 0.002),
        block((0.38, 0.04, 0.03), (0.68, face - 0.02, 0.235), 0, 0.002),
    ]
    stage.atlas('operator_recess_frame', frame, [walnut])
    stage.atlas('operator_socket_recess', [
        block((0.32, 0.004, 0.22), (0.68, face - 0.002, 0.36), 0),
        block((0.26, 0.022, 0.006), (0.68, face - 0.021, 0.2505), 1),
        block((0.26, 0.002, 0.006), (0.68, face - 0.041, 0.235), 1),
    ], [m['wool'], black], moving=True)
    stage.atlas('operator_socket', [
        spun([(0.0, 0.0), (0.05, 0.0), (0.05, 0.01), (0.04, 0.018), (0.024, 0.024), (0.016, 0.02), (0.0, 0.016)], 0, 24,
             (SOCKET[0], face - 0.004, SOCKET[1]), (0.0, -1.0, 0.0)),
    ], [brass], moving=True)

    # Behind the back rail a dark modesty board closes the kneehole up to the desk top, so the low
    # camera meets walnut and shadow, not the board across the room.
    stage.plain('desk_modesty_board', [block((1.70, 0.04, 0.185), (0.24, 5.77, 0.8875))], m['modesty'])

    # The conduit drops from the desk top under the cord post, steps forward of the back rail, and
    # runs along the panel to the socket.
    stage.atlas('operator_conduit', [
        spun([(0.0, 0.0), (0.018, 0.0), (0.018, 0.008), (0.0, 0.008)], 0, 12, (-0.585, 5.712, 0.972)),
        tube([(-0.585, 5.712, 0.975), (-0.585, 5.712, 0.70), (-0.585, 5.722, 0.68), (-0.585, face - 0.012, 0.66), (-0.585, face - 0.012, 0.625), (-0.57, face - 0.012, 0.605), (-0.55, face - 0.012, 0.60),
              (0.53, face - 0.012, 0.60), (0.55, face - 0.012, 0.595), (0.56, face - 0.012, 0.58), (0.56, face - 0.012, 0.50)], 0.009, 0, 10, up=(0.0, 1.0, 0.0)),
        spun([(0.0, 0.0), (0.016, 0.0), (0.016, 0.016), (0.0, 0.016)], 0, 12, (0.56, face - 0.012, 0.50)),
    ], [brass])

    # One short lead, 0.18 m, in two poses. It is clipped to the frame's left side at rest.
    root = (0.56, face - 0.018, 0.466)
    clip = (0.548, face - 0.018, 0.285)
    plugged = (SOCKET[0], face - 0.03, SOCKET[1])
    for name, points, tip in (
        ('operator_test_lead_rest', [root, (0.552, face - 0.018, 0.40), (0.548, face - 0.018, 0.34), clip], clip),
        ('operator_test_lead_seated', [root, (0.585, face - 0.024, 0.462), (0.64, face - 0.032, 0.436), (0.672, face - 0.032, 0.405), plugged], plugged),
    ):
        lead = tube(geo.catmull3([Vector(p) for p in points], per_seg=5), 0.0045, 0, 6, up=(0.0, 1.0, 0.0))
        head = rod(0.011, 0.034, 1, (tip[0], tip[1] - 0.016, tip[2]), (0.0, 1.0, 0.0), 10)
        stage.atlas(name, [lead, head], [m['lead_cloth'], black], moving=True)
    stage.atlas('operator_test_lead_clip', [
        block((0.03, 0.022, 0.012), (0.535, face - 0.02, 0.285), 0, 0.001),
        block((0.008, 0.024, 0.018), (0.5275, face - 0.02, 0.285), 0, 0.001),
    ], [brass], moving=True)

    paper_print = m['paper_print']
    stage.sheet('inspect_fitter_docket', (0.79, face - 0.0065, 0.36), (0.04, 0.0, 0.0), (0.0, 0.0, 0.06), 0.001, 'docket', paper_print)
    stage.atlas('fitter_docket_pin', [spun([(0.0, 0.0), (0.006, 0.0), (0.006, 0.004), (0.0, 0.006)], 0, 10, (0.79, face - 0.0065, 0.41), (0.0, -1.0, 0.0))],
                [brass], moving=True)

    # The older ticket starts in the slot; the fresh one waits below the slot until it is fed.
    stage.sheet('operator_ticket_old', (0.0, 0.0, 0.0), (0.05, 0.0, 0.0), (0.0, 0.0, 0.0275), 0.001, 'ticket_old', paper_print, at=(0.625, 5.73, 0.2525))
    stage.sheet('operator_ticket_new', (0.0, 0.0, 0.0), (0.05, 0.0, 0.0), (0.0, 0.0, 0.0275), 0.001, 'ticket_new', paper_print, at=(0.745, 5.73, 0.2315))

    lip = [block((0.24, 0.06, 0.006), (0.68, face - 0.03, 0.20), 0, 0.001),
           block((0.24, 0.004, 0.022), (0.68, face - 0.002, 0.209), 0, 0.001)]
    for x in (0.585, 0.775):
        lip += slotted_screw((x, face - 0.004, 0.209), 0, 1, radius=0.006, slot_roll=70.0)
    stage.atlas('operator_ticket_lip', lip, [brass, black])

    # The worn arc on the panel, under the leaf's swing.
    import bmesh
    arc = bmesh.new()
    steps = 14
    rings = []
    for step in range(steps + 1):
        t = step / steps
        angle = math.pi * (0.09 + 0.41 * t)
        thick = 0.0055 * math.sin(math.pi * t) + 0.0006
        rows = []
        for radius in (0.348 - thick, 0.348 + thick):
            rows.append(arc.verts.new((HINGE[0] - radius * math.cos(angle - 0.02), face - 0.0008, HINGE[2] - 0.135 - 0.05 * math.sin(angle) + radius * 0.0)))
        rings.append(rows)
    for one, two in zip(rings, rings[1:]):
        arc.faces.new((one[0], two[0], two[1], one[1]))
    arc.normal_update()
    bmesh.ops.recalc_face_normals(arc, faces=list(arc.faces))
    geo.mark_auto(arc)
    stage.atlas('operator_panel_wear', [arc], [worn])

    # The plate. Everything that swings hangs from its pivot on the hinge line.
    pivot = stage.pivot('operator_plate_pivot', HINGE)
    width, height, gauge = 0.36, 0.26, 0.012
    leaf = [block((width, gauge, height), (width / 2, 0.0, 0.0), 0, 0.002)]
    for sx, sz, newer in ((0.022, 0.108, False), (0.338, 0.108, False), (0.022, -0.108, False), (0.338, -0.108, True)):
        leaf += slotted_screw((sx, -gauge / 2, sz), 1 if newer else 2, 3, radius=0.0085, slot_roll=(25.0, 80.0)[newer])
    leaf.append(block((0.012, gauge + 0.004, 0.05), (0.004, 0.0, 0.085), 0, 0.001))
    leaf.append(block((0.012, gauge + 0.004, 0.05), (0.004, 0.0, -0.085), 0, 0.001))
    stage.atlas('operator_plate', leaf, [brass, worn, m['tarnish'], black], parent=pivot, moving=True)
    stage.sheet('operator_plate_outer', (0.18, -gauge / 2 - 0.0007, 0.0), (0.155, 0.0, 0.0), (0.0, 0.0, 0.092), 0.0006, 'plate_outer', m['plate_print'], parent=pivot)
    stage.sheet('operator_plate_inner', (0.18, gauge / 2 + 0.0007, 0.0), (-0.155, 0.0, 0.0), (0.0, 0.0, 0.092), 0.0006, 'plate_inner', m['plate_print'], parent=pivot)

    knuckles = []
    for z in (0.275, 0.445):
        knuckles.append(rod(0.009, 0.05, 0, (HINGE[0], HINGE[1], z - 0.025), segments=12))
        knuckles.append(block((0.024, 0.02, 0.05), (HINGE[0] - 0.012, HINGE[1] + 0.012, z), 0, 0.001))
    stage.atlas('operator_plate_hinge', knuckles, [iron])
    # The leaf ends 165 degrees round, about 0.09 m off the hinge plane; this post is what it taps.
    opened = math.radians(165.0)
    tip = (HINGE[0] + width * math.cos(opened), HINGE[1] - width * math.sin(opened))
    stage.atlas('operator_plate_stop', [
        rod(0.008, face - tip[1] + 0.012, 0, (tip[0] - 0.012, face, HINGE[2]), (0.0, -1.0, 0.0), 12),
        spun([(0.0, 0.0), (0.018, 0.0), (0.018, 0.004), (0.0, 0.004)], 0, 14, (tip[0] - 0.012, face, HINGE[2]), (0.0, -1.0, 0.0)),
    ], [iron])

    # The diagram: a walnut frame and four screws on the panel, its printed sheet inside.
    cx, cz = -0.18, 0.38
    frame = [block((0.42, 0.024, 0.30), (cx, face - 0.012, cz), 0, 0.004)]
    for dx in (-0.195, 0.195):
        for dz in (-0.135, 0.135):
            frame += slotted_screw((cx + dx, face - 0.024, cz + dz), 1, 2, radius=0.0065, slot_roll=45.0)
    stage.atlas('inspect_wiring_diagram', frame, [walnut, brass, black])
    stage.sheet('wiring_diagram_sheet', (cx, face - 0.0245, cz), (0.18, 0.0, 0.0), (0.0, 0.0, 0.12), 0.0005, 'diagram', m['diagram_print'])

    # The lamp stands on a bracket above the recess, dark until the lead is in.
    stage.atlas('operator_lamp_bracket', [
        block((0.08, 0.10, 0.008), (SOCKET[0], face - 0.05, 0.574), 0, 0.002),
        block((0.08, 0.004, 0.05), (SOCKET[0], face - 0.002, 0.60), 0, 0.001),
        spun([(0.0, 0.0), (0.05, 0.0), (0.05, 0.008), (0.03, 0.012), (0.0, 0.012)], 0, 18, (SOCKET[0], face - 0.06, 0.578)),
    ], [brass])
    stage.plain('operator_lamp', [
        spun([(0.0, 0.0), (0.03, 0.0), (0.038, 0.016), (0.03, 0.05), (0.016, 0.062), (0.0, 0.064)], 0, 20, (SOCKET[0], face - 0.06, 0.588)),
    ], m['operator_glow'], moving=True)


def build(_spec, root):
    print_path = os.path.join(kit.parse_args()['work'], 'exchange.print.png')
    atlas = make_print_atlas(print_path)

    m = dict(
        oak=mats.wood('ledge oak', light='#A48D70', dark='#6B5A48', axis='X', ring_freq=68.0, roughness=0.66, age=0.34, seed=711,
                      polish=0.10, pore=0.34, relief=0.018, edge_lift=0.14, rough_range=(0.58, 0.84)),
        walnut=mats.wood('operator walnut', light='#765D47', dark='#3F3429', axis='X', ring_freq=104.0, roughness=0.68, age=0.46, seed=714,
                         polish=0.14, pore=0.44, relief=0.024, edge_radius=0.004, edge_lift=0.20, rough_range=(0.56, 0.84),
                         spots=[dict(at=(0.24, 5.3, 1.03), radius=(0.36, 0.30, 0.14), strength=0.65)]),
        steel=mats.painted('board steel', color='#3C3C3A', age=0.26, seed=716, roughness=0.62, edge_radius=0.003, substrate='#857B68',
                           chip_amount=0.16, metal_substrate=True, cav_dist=0.018, variation=0.05, dust=0.12, scuffs=0.24,
                           smudge=0.5, grime='#2C2925', rough_range=(0.50, 0.80), life=0.62, prints=0.16),
        brass=mats.brass('aged brass', bright='#B9A06A', mid='#897044', dull='#665332', deep='#342B1D', age=0.40, seed=704,
                         rough_lo=0.36, rough_hi=0.50, spots=[dict(at=(0.24, 5.6, 1.1), radius=(0.8, 0.7, 0.6), strength=0.3)]),
        worn=mats.worn_metal('thumbed brass', bright='#D9BF84', mid='#B4975F', dull='#8A7146', deep='#4A3D29', age=0.16, seed=710,
                             rough_lo=0.20, rough_hi=0.28, rough_range=(0.20, 0.28), edge_radius=0.0008, scratches=0.2,
                             metal_floor=0.92, life=0.2, dust=0.05, prints=0.25),
        tarnish=mats.brass('tarnished screw', bright='#6E5C3C', mid='#54462E', dull='#3F3522', deep='#2A2317', age=0.55, seed=718,
                           rough_lo=0.46, rough_hi=0.60),
        iron=mats.lacquer('black iron', color='#23211E', age=0.34, seed=721, roughness=0.5, under='#47403A', rub=0.2),
        copper=mats.brass('oxidised copper', bright='#A5B9A1', mid='#5E8A7A', dull='#3A5D55', deep='#202D29', age=0.46, seed=705,
                          rough_lo=0.40, rough_hi=0.54, metal_floor=0.68),
        bakelite=mats.lacquer('bakelite', color='#1C1A18', age=0.28, seed=702, roughness=0.34, under='#594335', rub=0.22),
        enamel=mats.enamel('cream enamel', color='#D8CCB2', chip_metal='#5F594D', age=0.34, seed=703, variation=0.06, dust=0.08, roughness=0.46),
        shade=mats.enamel('sage lamp shade', color='#6F7A6C', chip_metal='#6C5840', age=0.24, seed=719, variation=0.05, dust=0.06, roughness=0.48),
        pages=mats.paper('rulebook pages', tone='#D9CDB2', age=0.3, seed=706, roughness=0.84),
        cloth=mats.fabric('green baize', color='#4D5A49', age=0.36, seed=707, roughness=0.9, nap=0.5),
        wool=mats.fabric('cardigan wool', color='#7A6A52', age=0.46, seed=722, roughness=0.92, nap=0.68),
        lead_cloth=mats.fabric('lead braid', color='#3A2C20', age=0.3, seed=723, roughness=0.86, nap=0.3),
        wall=flat_material('near-black plaster', (0.034, 0.028, 0.022), 0.94),
        floor=flat_material('oiled floor', (0.052, 0.040, 0.030), 0.62),
        steel_dark=flat_material('unlit steel', (0.034, 0.032, 0.030), 0.58, 0.2),
        modesty=flat_material('modesty board', (0.030, 0.023, 0.017), 0.86),
        sign_board=flat_material('sign backing', (0.10, 0.075, 0.052), 0.6),
        cord=flat_material('enquiry cord', (0.34, 0.24, 0.14), 0.8, glow=(0.34, 0.24, 0.14), strength=0.05),
        lead=flat_material('handset lead', (0.018, 0.016, 0.014), 0.5),
        lamp_glass=flat_material('warm lamp glass', (0.84, 0.48, 0.28), 0.36, glow=(0.84, 0.48, 0.28), strength=0.16),
        strip_glass=flat_material('apron strip glass', (0.84, 0.54, 0.30), 0.4, glow=(0.84, 0.54, 0.30), strength=0.16),
        clerestory_glass=flat_material('clerestory glass', (0.72, 0.76, 0.80), 0.36, glow=(0.72, 0.76, 0.80), strength=0.16),
        # Dark glass: an unlit lamp shows no colour of its own, so only its emission tells the lines apart.
        line_glow=flat_material('line lamp glass', (0.035, 0.022, 0.012), 0.34, glow=(1.0, 0.62, 0.26), strength=0.5),
        operator_glow=flat_material('operator lamp glass', (0.38, 0.20, 0.09), 0.34, glow=(1.0, 0.45, 0.14), strength=0.02),
        paper_print=printed_material('printed paper', atlas),
        card_print=printed_material('printed line card', atlas, glow=0.14),
        sign_print=printed_material('printed sign', atlas, glow=0.20),
        plate_print=printed_material('printed plate', atlas, roughness=0.42),
        diagram_print=printed_material('printed diagram', atlas, glow=0.05),
    )

    stage = Stage(root)
    build_shell(stage, m)
    build_board(stage, m)
    build_ledge(stage, m)
    build_cord(stage, m)
    build_desk(stage, m)
    build_kneehole(stage, m)
    return Built(root, stage.parts, moving=stage.moving, unbaked=stage.unbaked, stage='exchange',
                 view=dict(target=(0.0, 0.0, 6.3), distance=9.35, azimuth=0, lens=64),
                 detail=dict(target=(0.0, 1.62, 1.7), distance=1.0, azimuth=0, elevation=10),
                 notes={'stage': '4.2 m wide, 9 m deep, 12.6 m high', 'moving': ', '.join(stage.moving)})


if __name__ == '__main__':
    kit.run(ROOM, build)
