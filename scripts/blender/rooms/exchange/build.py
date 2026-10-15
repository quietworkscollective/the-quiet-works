"""The Exchange stage set. This script is the Blender source for the room glTF."""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../props')))
from propkit import Built, geo, kit, mats  # noqa: E402

ROOM = [dict(id='exchange', title='The Exchange', tier='hero', texture=1024, ao_distance=0.22,
             ao_strength=0.40, bake_samples=64, ao_samples=192, uv_shape='AABB', cull=False)]
# The work surface sits under the lowest gallery, within reach of the board. It is pulled toward the
# threshold and slightly toward centre so the desk, chair and task light read together on a phone.
DESK_OFFSET = (0.24, 3.75)


def box(size, center, bevel=0.0, material=0):
    bm = geo.box(size, center=center, bevel=bevel, segs=3 if bevel else 1)
    geo.set_material(bm, material)
    return bm


def detail_box(size, center, bevel=0.0, material=0, segs=3, profile=0.5):
    bm = geo.box(size, center=center, bevel=bevel, segs=segs, profile=profile)
    geo.set_material(bm, material)
    return bm


def lathe(profile, material=0, segments=20):
    bm = geo.lathe(profile, segments=segments, seg_tol=0.0005)
    geo.set_material(bm, material)
    return bm


def group(root, name, pieces, materials, location=(0.0, 0.0, 0.0), moving=False):
    bm = geo.merge(*pieces)
    obj = kit.add_part(root, name, bm, materials, location=location, sharp_deg=48)
    if moving:
        obj['bake'] = 'dynamic'
    return obj


def emissive(name, colour, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = (*colour, 1.0)
    shader.inputs['Roughness'].default_value = 0.36
    shader.inputs['Emission Color'].default_value = (*colour, 1.0)
    shader.inputs['Emission Strength'].default_value = strength
    mat.node_tree.links.new(shader.outputs['BSDF'], out.inputs['Surface'])
    return mat


def plain(name, colour, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*colour, 1.0)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


def make_text(name, body, size, location, material, rotation=(math.pi / 2, 0.0, 0.0), extrude=0.001,
              bevel=0.0005, resolution=12):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = bevel
    curve.resolution_u = resolution
    curve.render_resolution_u = resolution
    curve.align_x = 'CENTER'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj.select_set(False)
    return obj


def join_into(target, detail):
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    detail.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)
    return target


def add_named(root, name, bm, material, location=(0.0, 0.0, 0.0), dynamic=False):
    obj = kit.add_part(root, name, bm, material, location=location, sharp_deg=42)
    if dynamic:
        obj['bake'] = 'dynamic'
    return obj


def cylinder(radius, height, z=0.0, segments=24):
    return lathe([(0.0, 0.0), (radius * 0.94, 0.0), (radius, 0.004),
                  (radius, height - 0.004), (radius * 0.92, height), (0.0, height)],
                 segments=segments)


def desk_parts(root, wood, brass, hardware, bakelite, paper, cloth, enamel, lamp_glow, lamp_shade):
    parts = []
    desk = [
        detail_box((2.25, 0.88, 0.10), (0.0, 1.62, 1.03), 0.003, 0, 3),
        detail_box((0.12, 0.76, 0.86), (-0.91, 1.62, 0.52), 0.0025, 0, 3),
        detail_box((0.12, 0.76, 0.86), (0.91, 1.62, 0.52), 0.0025, 0, 3),
        detail_box((1.78, 0.08, 0.11), (0.0, 2.02, 0.74), 0.0025, 0, 3),
        detail_box((0.82, 0.62, 0.055), (-0.38, 1.62, 0.91), 0.001, 1, 2),
        detail_box((0.72, 0.54, 0.07), (0.58, 1.70, 0.91), 0.0015, 2, 2),
    ]
    parts.append(group(root, 'operator_desk', desk, [wood, brass, paper, bakelite]))

    joinery = [
        detail_box((1.84, 0.07, 0.20), (0.0, 1.15, 0.80), 0.003, 0, 3),
        detail_box((0.07, 0.66, 0.20), (-0.82, 1.60, 0.80), 0.002, 0, 2),
        detail_box((0.07, 0.66, 0.20), (0.82, 1.60, 0.80), 0.002, 0, 2),
    ]
    for x in (-0.62, -0.21, 0.21, 0.62):
        joinery.append(detail_box((0.34, 0.022, 0.145), (x, 1.108, 0.81), 0.002, 0, 2))
        pull = lathe([(0.0, 0.0), (0.018, 0.0), (0.018, 0.012), (0.0, 0.012)], segments=24)
        geo.place(pull, (x, 1.083, 0.81), z_axis=(0.0, -1.0, 0.0))
        geo.set_material(pull, 1)
        joinery.append(pull)
    for x in (-0.94, 0.94):
        for y in (1.34, 1.90):
            brace = detail_box((0.12, 0.12, 0.018), (x, y, 0.97), 0.001, 1, 2, 0.25)
            joinery.append(brace)
    parts.append(group(root, 'desk_joinery_and_drawers', joinery, [wood, hardware]))

    phone_parts = [
        box((0.31, 0.25, 0.10), (0.18, 1.48, 1.17), 0.04),
        cylinder(0.082, 0.018, 0.0, 28),
    ]
    geo.translate(phone_parts[1], (0.18, 1.48, 1.23))
    phone = group(root, 'inspect_handset', phone_parts, [bakelite])
    phone['inspection'] = 'handset'
    parts.append(phone)
    for angle in range(0, 360, 36):
        a = math.radians(angle)
        pin = cylinder(0.007, 0.004, 0.0, 10)
        geo.translate(pin, (0.18 + math.cos(a) * 0.053, 1.48 + math.sin(a) * 0.053, 1.253))
        parts.append(group(root, 'phone_dial_pin_' + str(angle), [pin], [brass]))

    handset = [geo.sweep(
        [(-0.235, 0.0, 0.055), (-0.22, 0.0, 0.105), (-0.16, 0.0, 0.145),
         (0.0, 0.0, 0.158), (0.16, 0.0, 0.145), (0.22, 0.0, 0.105), (0.235, 0.0, 0.055)],
        lambda t: (0.026 + 0.006 * abs(2 * t - 1), 0.032 + 0.004 * abs(2 * t - 1)), sides=24, up=(0.0, 1.0, 0.0), squareness=0.82)]
    for sign in (-1, 1):
        cup = lathe([(0.0, 0.0), (0.025, 0.0), (0.037, 0.006), (0.040, 0.015),
                     (0.035, 0.026), (0.020, 0.034), (0.0, 0.034)], segments=32)
        geo.place(cup, (sign * 0.238, 0.0, 0.055), z_axis=(0.0, -1.0, 0.0))
        handset.append(cup)
        collar = geo.circle_profile(0.032, 0.0015, n=24)
        ring = lathe(collar, segments=24)
        geo.place(ring, (sign * 0.238, 0.0, 0.055), z_axis=(0.0, -1.0, 0.0))
        handset.append(ring)
    geo.set_material(handset[0], 0)
    for piece in handset[1:3]: geo.set_material(piece, 0)
    for piece in handset[3:]: geo.set_material(piece, 2)
    handle = group(root, 'phone_handset', handset, [bakelite, brass, hardware], (0.18, 1.48, 1.38), moving=True)
    handle['bake'] = 'dynamic'
    parts.append(handle)

    rulebook_parts = [
        box((0.43, 0.31, 0.055), (-0.43, 1.60, 1.13), 0.016, 0),
        box((0.39, 0.28, 0.018), (-0.43, 1.59, 1.17), 0.006, 1),
        box((0.018, 0.29, 0.075), (-0.43, 1.45, 1.13), 0.006, 0),
    ]
    rulebook = group(root, 'inspect_rulebook', rulebook_parts, [cloth, paper])
    rulebook['inspection'] = 'rulebook'
    parts.append(rulebook)

    diagram_parts = [
        box((0.78, 0.045, 0.62), (1.22, 2.22, 1.76), 0.018, 0),
        box((0.68, 0.018, 0.52), (1.22, 2.188, 1.76), 0.006, 1),
    ]
    # Three routed pairs and their terminal blocks make the framed object read as a wiring diagram
    # before it is close enough to inspect. These are shallow brass inlays on the paper face.
    diagram_y = 2.161
    route_paths = (
        ((0.94, 1.60), (1.08, 1.60), (1.08, 1.88), (1.20, 1.88), (1.20, 1.72), (1.49, 1.72)),
        ((0.94, 1.76), (1.15, 1.76), (1.15, 1.60), (1.34, 1.60), (1.34, 1.91), (1.49, 1.91)),
        ((0.94, 1.92), (1.02, 1.92), (1.02, 1.82), (1.41, 1.82), (1.41, 1.60), (1.49, 1.60)),
    )
    for path in route_paths:
        for start, end in zip(path, path[1:]):
            x0, z0 = start
            x1, z1 = end
            diagram_parts.append(detail_box((max(abs(x1 - x0), 0.014), 0.010,
                                             max(abs(z1 - z0), 0.014)),
                                            ((x0 + x1) / 2, diagram_y, (z0 + z1) / 2),
                                            0.002, 2, 2))
    for x in (0.94, 1.49):
        for z in (1.60, 1.76, 1.92):
            diagram_parts.append(detail_box((0.036, 0.016, 0.036), (x, 2.151, z), 0.006, 2, 2))
    diagram_frame = plain('wiring diagram walnut frame', (0.18, 0.115, 0.075), 0.48, 0.06)
    diagram_paper = emissive('wiring diagram paper', (0.82, 0.76, 0.62), 0.78)
    diagram_brass = plain('wiring diagram brass routes', (0.64, 0.43, 0.17), 0.36, 0.62)
    diagram = group(root, 'inspect_wiring_diagram', diagram_parts,
                    [diagram_frame, diagram_paper, diagram_brass])
    diagram['inspection'] = 'wiring-diagram'
    parts.append(diagram)

    # Banker's lamp: a visible source above the board and a soft cream pool on the papers.
    lamp = [
        lathe([(0.0, 0.0), (0.14, 0.0), (0.13, 0.025), (0.0, 0.03)], segments=32),
        cylinder(0.023, 0.32, 0.0, 20),
        geo.sweep([(-0.82, 1.56, 1.17), (-0.80, 1.56, 1.34), (-0.63, 1.56, 1.42),
                   (-0.48, 1.56, 1.41)], (0.014, 0.014), sides=12, up=(0.0, 1.0, 0.0)),
        lathe([(0.0, 0.0), (0.115, 0.0), (0.16, 0.035), (0.155, 0.065),
               (0.07, 0.10), (0.0, 0.105)], segments=32),
        lathe([(0.0, 0.0), (0.11, 0.0), (0.12, 0.012), (0.0, 0.012)], segments=28),
    ]
    geo.translate(lamp[0], (-0.82, 1.56, 0.89))
    geo.translate(lamp[1], (-0.82, 1.56, 0.92))
    geo.place(lamp[3], (-0.48, 1.56, 1.41), z_axis=(0.0, 0.0, -1.0))
    geo.place(lamp[4], (-0.48, 1.56, 1.30), z_axis=(0.0, 0.0, -1.0))
    geo.set_material(lamp[3], 2)
    parts.append(group(root, 'bankers_lamp', lamp, [enamel, brass, lamp_shade]))
    bulb = cylinder(0.025, 0.012, 0.0, 16)
    geo.translate(bulb, (-0.48, 1.56, 1.285))
    parts.append(add_named(root, 'desk_lamp_emitter', bulb, lamp_glow, dynamic=True))

    # A low chair and warm textile soften the machinery; both are close enough to inspect.
    chair = [
        box((0.60, 0.52, 0.09), (-1.10, 1.05, 0.62), 0.05, 0),
        box((0.58, 0.10, 0.72), (-1.10, 1.30, 1.00), 0.05, 0),
        box((0.49, 0.38, 0.035), (-1.10, 1.05, 0.68), 0.02, 1),
        box((0.10, 0.08, 0.12), (-1.10, 1.26, 0.83), 0.04, 2),
    ]
    seat = group(root, 'inspect_cardigan', chair, [wood, cloth, cloth])
    seat['inspection'] = 'cardigan'
    parts.append(seat)

    flask = [
        cylinder(0.075, 0.28, 0.0, 24),
        lathe([(0.0, 0.0), (0.084, 0.0), (0.084, 0.018), (0.066, 0.035), (0.063, 0.23), (0.044, 0.26), (0.0, 0.26)], segments=28),
    ]
    geo.translate(flask[0], (-0.92, 1.88, 1.10))
    geo.translate(flask[1], (-0.92, 1.88, 1.10))
    tea = group(root, 'inspect_tea_flask', flask, [brass])
    tea['inspection'] = 'tea-flask'
    parts.append(tea)

    roster = [
        box((0.48, 0.035, 0.62), (-0.78, 2.12, 1.36), 0.018, 0),
        box((0.40, 0.02, 0.54), (-0.78, 2.095, 1.36), 0.004, 1),
        box((0.08, 0.024, 0.08), (-0.78, 2.074, 1.60), 0.008, 2),
    ]
    roster_obj = group(root, 'inspect_shift_roster', roster, [wood, paper, brass])
    roster_obj['inspection'] = 'shift-roster'
    parts.append(roster_obj)
    for row in range(5):
        line = box((0.28, 0.006, 0.005), (-0.78, 2.067, 1.50 - row * 0.065), 0.002, 2)
        parts.append(group(root, 'roster_rule_' + str(row + 1), [line], [paper]))

    # The operator's award frame sits on the work surface now, with a visible stand and a small
    # two-line card. It is a desk object rather than a blank panel suspended over the work area.
    frame_parts = [
        detail_box((0.25, 0.045, 0.31), (0.96, 1.80, 1.29), 0.012, 0, 3),
        detail_box((0.19, 0.020, 0.24), (0.96, 1.769, 1.29), 0.005, 2, 2),
        detail_box((0.24, 0.28, 0.035), (0.96, 1.83, 1.10), 0.012, 1, 3),
        detail_box((0.035, 0.20, 0.035), (0.96, 1.91, 1.19), 0.006, 1, 2),
    ]
    frame = group(root, 'inspect_operator_frame', frame_parts, [brass, wood, paper, bakelite])
    frame['inspection'] = 'operator-frame'
    frame_text = make_text('operator_frame_name', 'YOU', 0.050, (0.96, 1.752, 1.33), bakelite,
                           extrude=0, bevel=0, resolution=6)
    join_into(frame, frame_text)
    frame_subtitle = make_text('operator_frame_subtitle', 'PROVISIONAL', 0.020, (0.96, 1.751, 1.25), bakelite,
                               extrude=0, bevel=0, resolution=6)
    join_into(frame, frame_subtitle)
    parts.append(frame)

    bell_parts = [
        lathe([(0.0, 0.0), (0.105, 0.0), (0.098, 0.026), (0.074, 0.055), (0.0, 0.067)], segments=32),
        cylinder(0.024, 0.016, 0.068, 18),
        lathe([(0.0, 0.0), (0.11, 0.0), (0.12, 0.014), (0.0, 0.014)], segments=32),
    ]
    geo.translate(bell_parts[0], (1.28, 1.59, 1.06))
    geo.translate(bell_parts[1], (1.28, 1.59, 1.06))
    geo.translate(bell_parts[2], (1.28, 1.59, 1.06))
    bell = group(root, 'inspect_wanted_bell', bell_parts, [brass])
    bell['inspection'] = 'wanted-bell'
    parts.append(bell)

    lamp_button_parts = [
        box((0.38, 0.24, 0.075), (0.90, 1.63, 1.12), 0.03, 0),
        cylinder(0.045, 0.025, 0.0, 22),
    ]
    geo.translate(lamp_button_parts[1], (0.90, 1.63, 1.16))
    button = group(root, 'inspect_lamp_test', lamp_button_parts, [bakelite, brass])
    button['inspection'] = 'lamp-test'
    parts.append(button)

    # Keep the work surface below the switchboard in the doorway composition.
    for item in parts:
        item.location.x += DESK_OFFSET[0]
        item.location.y += DESK_OFFSET[1]

    # Lower gallery window seat, visibly cared for and reached from the rail ladder.
    seat_parts = [
        box((1.12, 0.54, 0.10), (0.95, 6.35, 4.29), 0.06, 0),
        box((1.12, 0.10, 0.54), (0.95, 6.61, 4.56), 0.06, 0),
        box((0.88, 0.39, 0.06), (0.95, 6.34, 4.37), 0.03, 1),
        box((0.52, 0.30, 0.14), (0.95, 6.38, 4.47), 0.07, 1),
    ]
    parts.append(group(root, 'window_seat', seat_parts, [wood, cloth]))
    return parts


def build(spec, root):
    wood = mats.wood('exchange oak', light='#A48D70', dark='#71604D', axis='X', ring_freq=72.0,
                     roughness=0.68, age=0.32, seed=701, polish=0.08, pore=0.34, relief=0.018,
                     edge_lift=0.12, rough_range=(0.60, 0.86))
    walnut = mats.wood('worn walnut desk', light='#765D47', dark='#3F3429', axis='X', ring_freq=104.0,
                       roughness=0.70, age=0.48, seed=714, polish=0.12, pore=0.44, relief=0.024,
                       edge_radius=0.004, edge_lift=0.20, rough_range=(0.58, 0.86),
                       spots=[dict(at=(0.24, 5.3, 1.03), radius=(0.36, 0.30, 0.14), strength=0.65)])
    plaster = mats.painted('warm mottled plaster', color='#AFA590', age=0.28, seed=715, roughness=0.92,
                           edge_radius=0.001, substrate='#9A856C', chip_amount=0.025,
                           metal_substrate=False, cav_dist=0.022, variation=0.09, dust=0.10,
                           streaks=0.06, scuffs=0.08, smudge=0.55, grime='#5D5145',
                           rough_range=(0.82, 0.99), life=0.7, prints=0.08)
    board_metal = mats.painted('charcoal switchboard steel', color='#454543', age=0.26, seed=716,
                               roughness=0.67, edge_radius=0.003, substrate='#857B68', chip_amount=0.18,
                               metal_substrate=True, cav_dist=0.018, variation=0.05, dust=0.13,
                               scuffs=0.26, smudge=0.55, grime='#2C2925',
                               rough_range=(0.52, 0.82), life=0.65, prints=0.18)
    gallery_soffit = mats.painted('warm gallery soffit', color='#D4CCBA', age=0.18, seed=718,
                                  roughness=0.90, edge_radius=0.001, substrate='#877B67', chip_amount=0.03,
                                  metal_substrate=False, variation=0.04, dust=0.05, smudge=0.15,
                                  grime='#675E50', rough_range=(0.82, 0.98), life=0.5, prints=0.05)
    bakelite = mats.lacquer('bakelite black', color='#1C1A18', age=0.28, seed=702, roughness=0.38,
                            under='#594335', rub=0.23, spots=[dict(at=(0, 1.5, 1.1), radius=(0.4, 0.5, 0.4), strength=0.3)])
    enamel = mats.enamel('cream enamel', color='#E6DCC7', chip_metal='#5F594D', age=0.3, seed=703,
                         variation=0.06, dust=0.08, roughness=0.46)
    brass = mats.brass('aged brass', bright='#B9A06A', mid='#897044', dull='#665332', deep='#342B1D',
                       age=0.38, seed=704, rough_lo=0.36, rough_hi=0.50,
                       spots=[dict(at=(0, 1.5, 1.0), radius=(0.5, 0.7, 0.6), strength=0.35)])
    hardware = mats.worn_metal('touched brass', bright='#C4AA72', mid='#9A7F4D', dull='#705B37', deep='#392F20',
                               age=0.22, seed=710, rough_lo=0.22, rough_hi=0.30,
                               rough_range=(0.22, 0.30), edge_radius=0.0008, scratches=0.18,
                               metal_floor=0.92, life=0.22, dust=0.08, prints=0.25)
    copper = mats.brass('oxidised copper', bright='#A5B9A1', mid='#5E8A7A', dull='#3A5D55', deep='#202D29',
                        age=0.46, seed=705, rough_lo=0.40, rough_hi=0.54, metal_floor=0.68)
    paper = mats.paper('cream paper', tone='#E6DCC7', age=0.24, seed=706, roughness=0.82)
    cloth = mats.fabric('wool and felt', color='#6D7667', age=0.36, seed=707, roughness=0.88, nap=0.52)
    lamp_shade = mats.enamel('sage enamel task-lamp shade', color='#788476', chip_metal='#6C5840', age=0.24,
                             seed=719, variation=0.05, dust=0.06, roughness=0.48)
    floor = mats.wood('oiled oak floor', light='#80715A', dark='#4C4437', axis='Y', ring_freq=52.0,
                      age=0.32, seed=708, polish=0.12, pore=0.3, relief=0.018,
                      rough_range=(0.58, 0.84), edge_lift=0.12)

    lamp_glow = emissive('warm desk lamp glass', (0.84, 0.48, 0.28), 0.006)
    clerestory_glow = emissive('clerestory glass', (0.82, 0.78, 0.68), 0.006)
    static_dark_glow = emissive('unlit board lamp', (0.08, 0.11, 0.08), 0.015)
    line_glow = [emissive('line lamp %02d' % n, (0.24, 0.48, 0.29), 0.015) for n in range(1, 13)]
    operator_glow = emissive('operator lamp', (0.9, 0.49, 0.27), 0.01)

    parts = []
    unbaked = []
    moving = []

    # The full envelope is measured in metres and built only inside its visible stage.
    envelope = [
        box((4.2, 9.0, 0.20), (0.0, 4.5, -0.10), 0.025, 0),
        box((0.18, 9.0, 12.6), (-2.01, 4.5, 6.3), 0.018, 1),
        box((0.18, 9.0, 12.6), (2.01, 4.5, 6.3), 0.018, 1),
        box((4.2, 9.0, 0.16), (0.0, 4.5, 12.52), 0.02, 1),
        box((4.2, 0.16, 12.6), (0.0, 8.92, 6.3), 0.012, 1),
        box((0.15, 0.15, 12.55), (-2.02, 0.075, 6.27), 0.018, 0),
        box((0.15, 0.15, 12.55), (2.02, 0.075, 6.27), 0.018, 0),
        box((4.0, 0.16, 0.23), (0.0, 0.08, 0.12), 0.025, 0),
    ]
    parts.append(group(root, 'exchange_envelope', envelope, [floor, plaster]))

    boards = [
        box((3.92, 0.11, 12.2), (0.0, 8.80, 6.24), 0.03, 0),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 0.22), 0.024, 1),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 4.20), 0.024, 1),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 8.40), 0.024, 1),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 12.25), 0.024, 1),
        box((0.12, 0.12, 12.12), (-1.94, 8.68, 6.24), 0.018, 1),
        box((0.12, 0.12, 12.12), (1.94, 8.68, 6.24), 0.018, 1),
    ]
    parts.append(group(root, 'three_gallery_switchboard', boards, [board_metal, brass]))

    # Shallow galleries leave the switchboard face visible from the entrance and desk. Their warm
    # soffits, visible timber corbels and fine handrail sections give each landing a real support.
    gallery = []
    soffits = []
    for level in (4.2, 8.4):
        gallery.extend([
            detail_box((3.55, 1.46, 0.14), (0.0, 7.96, level), 0.003, 0, 2),
            detail_box((3.45, 0.08, 0.16), (0.0, 7.25, level + 0.12), 0.002, 1, 2),
            detail_box((0.07, 1.34, 0.86), (-1.68, 7.96, level + 0.50), 0.002, 1, 2),
            detail_box((0.07, 1.34, 0.86), (1.68, 7.96, level + 0.50), 0.002, 1, 2),
        ])
        for x in (-1.35, -0.675, 0.0, 0.675, 1.35):
            gallery.append(detail_box((0.085, 1.34, 0.115), (x, 7.96, level - 0.148), 0.001, 0, 1))
        for y in (7.30, 8.61):
            gallery.append(detail_box((3.38, 0.075, 0.12), (0.0, y, level - 0.145), 0.001, 1, 1))
        for x in (-1.55, -0.78, 0.0, 0.78, 1.55):
            gallery.append(detail_box((0.055, 0.055, 0.62), (x, 7.30, level + 0.47), 0.001, 1, 1))
            gallery.append(detail_box((0.082, 0.082, 0.028), (x, 7.30, level + 0.79), 0.001, 1, 1))
        for x in (-1.63, 1.63):
            bracket = detail_box((0.14, 1.34, 0.12), (x, 7.96, level - 0.28), 0.012, 0, 3)
            geo.rotate(bracket, (-14.0, 0.0, 0.0), pivot=(x, 7.96, level - 0.28))
            gallery.append(bracket)
        soffits.append(detail_box((3.45, 1.38, 0.04), (0.0, 7.96, level - 0.086), 0.002, 0, 1))
    parts.append(group(root, 'gallery_rails_and_walks', gallery, [wood, brass, gallery_soffit]))
    parts.append(group(root, 'gallery_soffits', soffits, [gallery_soffit], moving=True))

    # A clerestory gives the upper ironwork a cool edge; its source is visible in the side wall.
    window = [
        detail_box((0.04, 2.8, 1.05), (1.90, 5.18, 11.17), 0.0025, 0, 3),
        detail_box((0.035, 2.54, 0.82), (1.865, 5.18, 11.17), 0.002, 1, 3),
        detail_box((0.08, 0.055, 0.86), (1.82, 4.36, 11.17), 0.001, 2, 2),
        detail_box((0.08, 0.055, 0.86), (1.82, 5.18, 11.17), 0.001, 2, 2),
        detail_box((0.08, 0.055, 0.86), (1.82, 6.00, 11.17), 0.001, 2, 2),
        detail_box((0.08, 2.5, 0.06), (1.82, 5.18, 11.17), 0.001, 2, 2),
    ]
    parts.append(group(root, 'clerestory_frame', window, [wood, copper, enamel]))
    glass = box((0.025, 2.48, 0.76), (1.83, 5.18, 11.17), 0.008)
    window_emitter = add_named(root, 'clerestory_emitter', glass, clerestory_glow, dynamic=True)
    unbaked.append(window_emitter)
    parts.append(window_emitter)

    # Two repeated board fields carry a hundred and fifty-six dark lamps and jacks as merged meshes.
    active_positions = {}
    active_grid = {(col, row): n for n, (col, row) in enumerate(
        [(1, 1), (4, 1), (7, 1), (10, 1), (1, 5), (4, 5), (7, 5), (10, 5),
         (1, 9), (4, 9), (7, 9), (10, 9)], start=1)}
    jack_families = [[] for _ in range(4)]
    lamp_group = []
    jack_profiles = [
        [(0.0, 0.0), (0.064, 0.0), (0.073, 0.008), (0.071, 0.019), (0.060, 0.027), (0.051, 0.029),
         (0.045, 0.037), (0.038, 0.046), (0.026, 0.050), (0.0, 0.050)],
        [(0.0, 0.0), (0.066, 0.0), (0.074, 0.007), (0.069, 0.018), (0.057, 0.024), (0.049, 0.034),
         (0.044, 0.044), (0.034, 0.050), (0.0, 0.050)],
        [(0.0, 0.0), (0.061, 0.0), (0.073, 0.010), (0.072, 0.021), (0.061, 0.030), (0.052, 0.031),
         (0.047, 0.040), (0.043, 0.051), (0.030, 0.056), (0.0, 0.056)],
        [(0.0, 0.0), (0.063, 0.0), (0.070, 0.009), (0.067, 0.020), (0.055, 0.026), (0.048, 0.036),
         (0.041, 0.041), (0.035, 0.050), (0.025, 0.052), (0.0, 0.052)],
    ]
    jack_materials = [brass]
    for variant, values in enumerate(((0.40, 0.48, 0.37), (0.35, 0.46, 0.34), (0.43, 0.50, 0.41))):
        low, high, age = values
        jack_materials.append(mats.brass(f'jack brass {variant + 2}', bright='#B9A06A', mid='#897044',
                                         dull='#665332', deep='#342B1D', age=age, seed=711 + variant,
                                         rough_lo=low, rough_hi=high))
    for row in range(13):
        for col in range(12):
            x = -1.68 + col * 0.305
            z = 0.60 + row * 0.92
            if (col, row) in active_grid:
                active_positions[active_grid[(col, row)]] = (x, 8.62, z)
                continue
            variant = (row * 3 + col) % 4
            jack = lathe(jack_profiles[variant], segments=18 + variant * 2)
            geo.translate(jack, (x, 8.59, z))
            jack_families[variant].append(jack)
            lamp = lathe([(0.0, 0.0), (0.044, 0.0), (0.052, 0.014), (0.042, 0.058),
                          (0.025, 0.072), (0.0, 0.075)], segments=14)
            geo.translate(lamp, (x, 8.535, z + 0.11))
            lamp_group.append(lamp)
    for variant, family in enumerate(jack_families):
        parts.append(group(root, f'field_jacks_{variant + 1}', family, [jack_materials[variant]]))
    parts.append(group(root, 'field_lamps', lamp_group, [static_dark_glow]))

    line_locations = {}
    for line in range(1, 13):
        x, y, z = active_positions[line]
        line_locations[line] = (x, -y, z)
        jack = lathe([(0.0, 0.0), (0.068, 0.0), (0.075, 0.006), (0.074, 0.014),
                      (0.066, 0.023), (0.053, 0.028), (0.047, 0.036), (0.040, 0.045),
                      (0.032, 0.049), (0.026, 0.045), (0.024, 0.036), (0.0, 0.031)], segments=24)
        parts.append(add_named(root, 'line_jack_%02d' % line, jack, brass, (x, y, z)))
        bulb = lathe([(0.0, 0.0), (0.043, 0.0), (0.053, 0.016), (0.043, 0.060),
                      (0.025, 0.074), (0.0, 0.078)], segments=20)
        lamp = add_named(root, 'line_lamp_%02d' % line, bulb, line_glow[line - 1], (x, y - 0.06, z + 0.105), dynamic=True)
        unbaked.append(lamp)
        parts.append(lamp)
        card_mesh = detail_box((0.42, 0.035, 0.18), (0.0, 0.0, 0.0), 0.002, 0, 3)
        card = add_named(root, 'line_card_%02d' % line, card_mesh, [paper, brass],
                         (x, y - 0.11, z - 0.18), dynamic=True)
        # A clean number stays attached when the card tips to its connected state.
        card_number = make_text('line_card_number_%02d' % line, '%02d' % line, 0.085,
                                (x, y - 0.129, z - 0.205), bakelite, extrude=0, bevel=0, resolution=4)
        join_into(card, card_number)
        parts.append(card)
        moving.append(card.name)

    # A single stepped brass ladder runs on the board rail. Only its carriage moves at runtime.
    rail_parts = []
    for z in (0.22, 4.2, 8.4, 12.05):
        rail_parts.append(detail_box((3.95, 0.055, 0.055), (0.0, 8.38, z), 0.001, 0, 2))
    for x in (-1.86, 1.86):
        rail_parts.append(detail_box((0.055, 0.055, 12.0), (x, 8.37, 6.1), 0.001, 0, 2))
    parts.append(group(root, 'ladder_rail', rail_parts, [brass]))
    ladder_parts = [
        detail_box((0.075, 0.09, 3.85), (-1.0, 0.0, 0.0), 0.0015, 0, 3),
        detail_box((0.075, 0.09, 3.85), (1.0, 0.0, 0.0), 0.0015, 0, 3),
        detail_box((2.12, 0.09, 0.07), (0.0, 0.0, -1.81), 0.001, 1, 3),
        detail_box((2.12, 0.09, 0.07), (0.0, 0.0, -1.12), 0.001, 1, 3),
        detail_box((2.12, 0.09, 0.07), (0.0, 0.0, -0.43), 0.001, 1, 3),
        detail_box((2.12, 0.09, 0.07), (0.0, 0.0, 0.26), 0.001, 1, 3),
        detail_box((2.12, 0.09, 0.07), (0.0, 0.0, 0.95), 0.001, 1, 3),
        detail_box((2.12, 0.09, 0.07), (0.0, 0.0, 1.64), 0.001, 1, 3),
    ]
    ladder = group(root, 'inspect_ladder', ladder_parts, [brass, wood], (0.75, 8.32, 5.55), moving=True)
    ladder['inspection'] = 'ladder'
    parts.append(ladder)
    moving.append(ladder.name)
    for x in (-0.93, 0.93):
        wheel = lathe([(0.0, 0.0), (0.105, 0.0), (0.105, 0.008), (0.098, 0.013),
                       (0.098, 0.026), (0.105, 0.031), (0.105, 0.039), (0.0, 0.039)], segments=24)
        geo.place(wheel, (0.75 + x, 8.36, 7.58), z_axis=(0.0, 1.0, 0.0))
        parts.append(group(root, 'ladder_wheel_' + str(x), [wheel], [brass]))

    # Handset lead is an intentionally slack, cloth-covered loop at the edge of the desk.
    cord_points = [(-0.80, 1.55, 1.43), (-0.69, 1.66, 1.17), (-0.49, 1.70, 1.09),
                   (-0.28, 1.72, 1.14), (-0.10, 1.66, 1.31), (0.09, 1.58, 1.31)]
    cord = geo.sweep(cord_points, (0.009, 0.009), sides=8, up=(0, 0, 1))
    cord_obj = group(root, 'phone_coiled_cord', [cord], [cloth])
    cord_obj.location.x += DESK_OFFSET[0]
    cord_obj.location.y += DESK_OFFSET[1]
    parts.append(cord_obj)

    desk = desk_parts(root, walnut, brass, hardware, bakelite, paper, cloth, enamel, lamp_glow, lamp_shade)
    parts.extend(desk)
    unbaked.extend(item for item in desk if item.name == 'desk_lamp_emitter')
    unbaked.extend(item for item in desk if item.name == 'inspect_wiring_diagram')
    for item in parts:
        if item.get('bake') == 'dynamic' and item.name not in moving:
            moving.append(item.name)

    # The operator point stays dark until a route is found.
    operator_mesh = lathe([(0.0, 0.0), (0.057, 0.0), (0.066, 0.016), (0.053, 0.075),
                           (0.027, 0.092), (0.0, 0.095)], segments=24)
    operator = add_named(root, 'operator_lamp', operator_mesh, operator_glow,
                         (0.45 + DESK_OFFSET[0], 1.54 + DESK_OFFSET[1], 0.34), dynamic=True)
    unbaked.append(operator)
    support = [
        lathe([(0.0, 0.0), (0.15, 0.0), (0.16, 0.018), (0.13, 0.035), (0.0, 0.035)], segments=32),
        cylinder(0.022, 0.30, 0.0, 20),
        lathe([(0.0, 0.0), (0.045, 0.0), (0.05, 0.012), (0.034, 0.025), (0.0, 0.025)], segments=24),
    ]
    geo.translate(support[0], (0.45 + DESK_OFFSET[0], 1.54 + DESK_OFFSET[1], 0.0))
    geo.translate(support[1], (0.45 + DESK_OFFSET[0], 1.54 + DESK_OFFSET[1], 0.035))
    geo.translate(support[2], (0.45 + DESK_OFFSET[0], 1.54 + DESK_OFFSET[1], 0.305))
    parts.append(group(root, 'operator_lamp_floor_support', support, [brass]))
    op_card = box((0.38, 0.018, 0.15), (0.0, 1.10, 0.80), 0.012)
    card = add_named(root, 'operator_nameplate', op_card, paper, dynamic=True)
    label = make_text('operator_nameplate_letters', 'OPERATOR', 0.036, (0.0, 1.087, 0.80), bakelite,
                      extrude=0, bevel=0, resolution=6)
    join_into(card, label)
    card.location.x += DESK_OFFSET[0]
    card.location.y += DESK_OFFSET[1]
    moving.append(card.name)

    # A warm threshold fitting and the physical maker's mark live within the set.
    marks = [
        box((1.24, 0.09, 0.24), (0.0, 0.12, 10.95), 0.024, 0),
        box((0.66, 0.035, 0.09), (0.0, 0.065, 10.95), 0.008, 1),
    ]
    parts.append(group(root, 'maker_mark_plaque', marks, [wood, enamel]))
    plaque_text = make_text('maker_mark_text', 'MACHINE-MADE  ·  CLAUDE TEAM', 0.070,
                            (0.0, 0.043, 10.92), brass)
    mark = add_named(root, 'maker_credit', box((0.02, 0.02, 0.02), (0, 0, 0)), brass)
    join_into(mark, plaque_text)
    parts.append(mark)

    # The room reads as a telephone exchange before the visitor reaches the first line.
    title_panel = emissive('exchange title paper', (0.78, 0.72, 0.58), 0.24)
    title_ink = emissive('exchange title lettering', (0.22, 0.13, 0.08), 0.20)
    title_plate = add_named(root, 'exchange_board_title', box((2.48, 0.075, 0.44), (-0.80, 7.155, 4.60),
                                                              0.026, 0), title_panel)
    title_letters = make_text('exchange_board_title_letters', 'TELEPHONE EXCHANGE', 0.145,
                              (-0.80, 7.085, 4.60), title_ink, extrude=0.002, bevel=0.0005, resolution=8)
    join_into(title_plate, title_letters)
    parts.append(title_plate)
    unbaked.append(title_plate)

    # A lived-in route: low repeated toe-kick lights are material, not additional runtime lights.
    sconce = []
    for y in (1.2, 3.6, 6.2):
        sconce.append(box((0.04, 0.27, 0.46), (-1.88, y, 2.72), 0.018, 0))
        sconce.append(box((0.035, 0.13, 0.19), (-1.85, y - 0.03, 2.72), 0.012, 1))
    parts.append(group(root, 'warm_wall_practicals', sconce, [brass, enamel]))

    return Built(root, parts + [operator, card], moving=moving, unbaked=unbaked,
                 stage='exchange', view=dict(target=(0.0, 0.0, 6.3), distance=9.35, azimuth=0, lens=64),
                 detail=dict(target=(0.0, 1.62, 1.7), distance=1.0, azimuth=0, elevation=10),
                 notes={'stage': '4.2 m wide, 9 m deep, 12.6 m high',
                        'interactive': 'line_jack_01..12, line_lamp_01..12, line_card_01..12, inspect_*',
                        'moving': 'inspect_ladder, line_card_01..12, operator_nameplate'})


if __name__ == '__main__':
    kit.run(ROOM, build)
