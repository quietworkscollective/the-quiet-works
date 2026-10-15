"""The Exchange stage set. This script is the Blender source for the room glTF."""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../props')))
from propkit import Built, geo, kit, mats  # noqa: E402

ROOM = [dict(id='exchange', title='The Exchange', tier='hero', texture=1024, ao_distance=0.45,
             bake_samples=48, ao_samples=128, cull=False)]


def box(size, center, bevel=0.0, material=0):
    bm = geo.box(size, center=center, bevel=bevel, segs=3 if bevel else 1)
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


def make_text(name, body, size, location, material, rotation=(math.pi / 2, 0.0, 0.0), extrude=0.001):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = 0.0005
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


def desk_parts(root, wood, brass, bakelite, paper, cloth, enamel, lamp_glow):
    parts = []
    desk = [
        box((2.25, 0.88, 0.10), (0.0, 1.62, 1.03), 0.035),
        box((0.12, 0.76, 0.86), (-0.91, 1.62, 0.52), 0.025),
        box((0.12, 0.76, 0.86), (0.91, 1.62, 0.52), 0.025),
        box((1.78, 0.08, 0.11), (0.0, 2.02, 0.74), 0.025),
        box((0.82, 0.62, 0.055), (-0.38, 1.62, 0.91), 0.012, 1),
        box((0.72, 0.54, 0.07), (0.58, 1.70, 0.91), 0.018, 2),
    ]
    parts.append(group(root, 'operator_desk', desk, [wood, brass, paper, bakelite]))

    # Four brass drawer pulls are part of the desk assembly and catch the low practical.
    # Separate simple pulls keep their orientation consistent and are cheap as a single merged mesh.
    pulls = []
    for x in (-0.58, -0.2, 0.2, 0.58):
        pull = lathe([(0.0, 0.0), (0.020, 0.0), (0.020, 0.012), (0.0, 0.012)], segments=14)
        geo.translate(pull, (x, 1.17, 0.69))
        pulls.append(pull)
    parts.append(group(root, 'desk_drawer_pulls', pulls, [brass]))

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

    handset = [
        box((0.38, 0.075, 0.052), (0.0, 0.0, 0.0), 0.026),
        lathe([(0.0, 0.0), (0.047, 0.0), (0.047, 0.016), (0.0, 0.016)], segments=18),
    ]
    geo.translate(handset[1], (-0.15, 0.0, 0.018))
    geo.merge(handset[0], handset[1])
    handle = add_named(root, 'phone_handset', handset[0], bakelite, (0.18, 1.48, 1.38), dynamic=True)
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
        box((0.025, 0.018, 0.34), (1.34, 2.174, 1.76), 0.004, 2),
        box((0.34, 0.019, 0.025), (1.18, 2.171, 1.60), 0.004, 2),
        box((0.10, 0.021, 0.12), (1.48, 2.160, 1.98), 0.004, 2),
    ]
    diagram = group(root, 'inspect_wiring_diagram', diagram_parts, [wood, paper, brass])
    diagram['inspection'] = 'wiring-diagram'
    parts.append(diagram)

    # Banker's lamp: a visible source above the board and a soft cream pool on the papers.
    lamp = [
        lathe([(0.0, 0.0), (0.14, 0.0), (0.12, 0.035), (0.065, 0.26), (0.0, 0.28)], segments=32),
        cylinder(0.035, 0.32, 0.0, 20),
        lathe([(0.0, 0.0), (0.11, 0.0), (0.12, 0.018), (0.0, 0.018)], segments=28),
    ]
    geo.translate(lamp[0], (-0.82, 1.56, 1.10))
    geo.translate(lamp[1], (-0.82, 1.56, 0.90))
    geo.translate(lamp[2], (-0.82, 1.56, 0.89))
    parts.append(group(root, 'bankers_lamp', lamp, [enamel, brass]))
    bulb = cylinder(0.035, 0.009, 0.0, 16)
    geo.translate(bulb, (-0.82, 1.56, 1.115))
    parts.append(add_named(root, 'desk_lamp_emitter', bulb, lamp_glow, dynamic=True))

    # A low chair and warm textile soften the machinery; both are close enough to inspect.
    chair = [
        box((0.60, 0.52, 0.09), (-1.30, 1.05, 0.62), 0.05, 0),
        box((0.58, 0.10, 0.72), (-1.30, 1.30, 1.00), 0.05, 0),
        box((0.49, 0.38, 0.035), (-1.30, 1.05, 0.68), 0.02, 1),
        box((0.10, 0.08, 0.12), (-1.30, 1.26, 0.83), 0.04, 2),
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

    frame_parts = [
        box((0.43, 0.065, 0.51), (1.03, 1.99, 1.91), 0.028, 0),
        box((0.31, 0.025, 0.39), (1.03, 1.945, 1.91), 0.008, 1),
    ]
    frame = group(root, 'inspect_operator_frame', frame_parts, [brass, paper])
    frame['inspection'] = 'operator-frame'
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
    wood = mats.wood('exchange oak', light='#765237', dark='#302319', axis='X', ring_freq=72.0,
                     age=0.43, seed=701, polish=0.12, pore=0.38, relief=0.025)
    bakelite = mats.lacquer('bakelite black', color='#1C1A18', age=0.28, seed=702, roughness=0.31,
                            under='#594335', rub=0.23, spots=[dict(at=(0, 1.5, 1.1), radius=(0.4, 0.5, 0.4), strength=0.3)])
    enamel = mats.enamel('cream enamel', color='#E6DCC7', chip_metal='#5F594D', age=0.3, seed=703,
                         variation=0.06, dust=0.08, roughness=0.39)
    brass = mats.brass('aged brass', age=0.38, seed=704, rough_lo=0.36, rough_hi=0.53,
                       spots=[dict(at=(0, 1.5, 1.0), radius=(0.5, 0.7, 0.6), strength=0.35)])
    copper = mats.brass('oxidised copper', bright='#A5B9A1', mid='#5E8A7A', dull='#3A5D55', deep='#202D29',
                        age=0.46, seed=705, rough_lo=0.40, rough_hi=0.54, metal_floor=0.68)
    paper = mats.paper('cream paper', tone='#E6DCC7', age=0.24, seed=706, roughness=0.82)
    cloth = mats.fabric('wool and felt', color='#6D7667', age=0.36, seed=707, roughness=0.88, nap=0.52)
    floor = mats.wood('oiled oak floor', light='#64462D', dark='#251C16', axis='Y', ring_freq=52.0,
                      age=0.34, seed=708, polish=0.18, pore=0.3, relief=0.018)

    lamp_glow = emissive('warm desk lamp glass', (1.0, 0.68, 0.33), 0.2)
    clerestory_glow = emissive('clerestory glass', (0.7, 0.78, 0.78), 0.08)
    static_dark_glow = emissive('unlit board lamp', (0.08, 0.11, 0.08), 0.015)
    line_glow = [emissive('line lamp %02d' % n, (0.24, 0.48, 0.29), 0.015) for n in range(1, 13)]
    operator_glow = emissive('operator lamp', (0.9, 0.49, 0.27), 0.02)

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
    parts.append(group(root, 'exchange_envelope', envelope, [floor, wood]))

    boards = [
        box((3.92, 0.11, 12.2), (0.0, 8.80, 6.24), 0.03, 0),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 0.22), 0.024, 1),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 4.20), 0.024, 1),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 8.40), 0.024, 1),
        box((4.06, 0.13, 0.16), (0.0, 8.69, 12.25), 0.024, 1),
        box((0.12, 0.12, 12.12), (-1.94, 8.68, 6.24), 0.018, 1),
        box((0.12, 0.12, 12.12), (1.94, 8.68, 6.24), 0.018, 1),
    ]
    parts.append(group(root, 'three_gallery_switchboard', boards, [bakelite, brass]))

    # Galleries leave the switchboard face visible from the entrance and the desk.
    gallery = []
    for level in (4.2, 8.4):
        gallery.extend([
            box((4.0, 2.36, 0.16), (0.0, 7.62, level), 0.025, 0),
            box((4.0, 0.08, 0.18), (0.0, 6.39, level + 0.13), 0.018, 1),
            box((0.07, 2.2, 0.86), (-1.88, 7.58, level + 0.52), 0.018, 1),
            box((0.07, 2.2, 0.86), (1.88, 7.58, level + 0.52), 0.018, 1),
        ])
        for x in (-1.72, -0.88, 0.0, 0.88, 1.72):
            gallery.append(box((0.055, 0.055, 0.62), (x, 6.45, level + 0.49), 0.014, 1))
    parts.append(group(root, 'gallery_rails_and_walks', gallery, [wood, brass]))

    # A clerestory gives the upper ironwork a cool edge; its source is visible in the side wall.
    window = [
        box((0.04, 2.8, 1.05), (1.90, 5.18, 11.17), 0.035, 0),
        box((0.035, 2.54, 0.82), (1.865, 5.18, 11.17), 0.025, 1),
        box((0.08, 0.055, 0.86), (1.82, 4.36, 11.17), 0.012, 2),
        box((0.08, 0.055, 0.86), (1.82, 5.18, 11.17), 0.012, 2),
        box((0.08, 0.055, 0.86), (1.82, 6.00, 11.17), 0.012, 2),
        box((0.08, 2.5, 0.06), (1.82, 5.18, 11.17), 0.012, 2),
    ]
    parts.append(group(root, 'clerestory_frame', window, [wood, copper, enamel]))
    glass = box((0.025, 2.48, 0.76), (1.83, 5.18, 11.17), 0.008)
    window_emitter = add_named(root, 'clerestory_emitter', glass, clerestory_glow, dynamic=True)
    unbaked.append(window_emitter)

    # Two repeated board fields carry a hundred and fifty-six dark lamps and jacks as merged meshes.
    active_positions = {}
    active_grid = {(col, row): n for n, (col, row) in enumerate(
        [(1, 1), (4, 1), (7, 1), (10, 1), (1, 5), (4, 5), (7, 5), (10, 5),
         (1, 9), (4, 9), (7, 9), (10, 9)], start=1)}
    jack_group, lamp_group = [], []
    for row in range(13):
        for col in range(12):
            x = -1.68 + col * 0.305
            z = 0.60 + row * 0.92
            if (col, row) in active_grid:
                active_positions[active_grid[(col, row)]] = (x, 8.62, z)
                continue
            jack = lathe([(0.0, 0.0), (0.065, 0.0), (0.072, 0.018), (0.064, 0.028),
                          (0.047, 0.029), (0.040, 0.039), (0.0, 0.039)], segments=14)
            geo.translate(jack, (x, 8.59, z))
            jack_group.append(jack)
            lamp = lathe([(0.0, 0.0), (0.044, 0.0), (0.052, 0.014), (0.042, 0.058),
                          (0.025, 0.072), (0.0, 0.075)], segments=14)
            geo.translate(lamp, (x, 8.535, z + 0.11))
            lamp_group.append(lamp)
    parts.append(group(root, 'field_jacks', jack_group, [brass]))
    parts.append(group(root, 'field_lamps', lamp_group, [static_dark_glow]))

    line_locations = {}
    for line in range(1, 13):
        x, y, z = active_positions[line]
        line_locations[line] = (x, -y, z)
        jack = lathe([(0.0, 0.0), (0.068, 0.0), (0.075, 0.02), (0.064, 0.031),
                      (0.047, 0.032), (0.039, 0.043), (0.0, 0.043)], segments=18)
        parts.append(add_named(root, 'line_jack_%02d' % line, jack, brass, (x, y, z)))
        bulb = lathe([(0.0, 0.0), (0.043, 0.0), (0.053, 0.016), (0.043, 0.060),
                      (0.025, 0.074), (0.0, 0.078)], segments=20)
        lamp = add_named(root, 'line_lamp_%02d' % line, bulb, line_glow[line - 1], (x, y - 0.06, z + 0.105), dynamic=True)
        unbaked.append(lamp)
        parts.append(lamp)
        card_mesh = box((0.42, 0.035, 0.18), (0.0, 0.0, 0.0), 0.012, 0)
        card = add_named(root, 'line_card_%02d' % line, card_mesh, [paper, brass],
                         (x, y - 0.11, z - 0.18), dynamic=True)
        parts.append(card)
        moving.append(card.name)

    # A single stepped brass ladder runs on the board rail. Only its carriage moves at runtime.
    rail_parts = []
    for z in (0.22, 4.2, 8.4, 12.05):
        rail_parts.append(box((3.95, 0.055, 0.055), (0.0, 8.38, z), 0.012, 0))
    for x in (-1.86, 1.86):
        rail_parts.append(box((0.055, 0.055, 12.0), (x, 8.37, 6.1), 0.012, 0))
    parts.append(group(root, 'ladder_rail', rail_parts, [brass]))
    ladder_parts = [
        box((0.075, 0.09, 3.85), (-1.0, 0.0, 0.0), 0.025, 0),
        box((0.075, 0.09, 3.85), (1.0, 0.0, 0.0), 0.025, 0),
        box((2.12, 0.09, 0.07), (0.0, 0.0, -1.81), 0.022, 1),
        box((2.12, 0.09, 0.07), (0.0, 0.0, -1.12), 0.022, 1),
        box((2.12, 0.09, 0.07), (0.0, 0.0, -0.43), 0.022, 1),
        box((2.12, 0.09, 0.07), (0.0, 0.0, 0.26), 0.022, 1),
        box((2.12, 0.09, 0.07), (0.0, 0.0, 0.95), 0.022, 1),
        box((2.12, 0.09, 0.07), (0.0, 0.0, 1.64), 0.022, 1),
    ]
    ladder = group(root, 'inspect_ladder', ladder_parts, [brass, wood], (0.75, 8.32, 5.55), moving=True)
    ladder['inspection'] = 'ladder'
    parts.append(ladder)
    moving.append(ladder.name)
    for x in (-0.93, 0.93):
        wheel = lathe([(0.0, 0.0), (0.105, 0.0), (0.105, 0.035), (0.0, 0.035)], segments=22)
        geo.place(wheel, (0.75 + x, 8.36, 7.58), z_axis=(0.0, 1.0, 0.0))
        parts.append(group(root, 'ladder_wheel_' + str(x), [wheel], [brass]))

    # Handset lead is an intentionally slack, cloth-covered loop at the edge of the desk.
    cord_points = [(-0.80, 1.55, 1.43), (-0.69, 1.66, 1.17), (-0.49, 1.70, 1.09),
                   (-0.28, 1.72, 1.14), (-0.10, 1.66, 1.31), (0.09, 1.58, 1.31)]
    cord = geo.sweep(cord_points, (0.009, 0.009), sides=8, up=(0, 0, 1))
    parts.append(group(root, 'phone_coiled_cord', [cord], [cloth]))

    parts.extend(desk_parts(root, wood, brass, bakelite, paper, cloth, enamel, lamp_glow))
    for item in parts:
        if item.get('bake') == 'dynamic' and item.name not in moving:
            moving.append(item.name)

    # The operator point stays dark until a route is found.
    operator_mesh = lathe([(0.0, 0.0), (0.057, 0.0), (0.066, 0.016), (0.053, 0.075),
                           (0.027, 0.092), (0.0, 0.095)], segments=24)
    operator = add_named(root, 'operator_lamp', operator_mesh, operator_glow, (0.45, 1.54, 0.34), dynamic=True)
    unbaked.append(operator)
    op_card = box((0.48, 0.055, 0.17), (0.45, 1.49, 0.22), 0.014)
    card = add_named(root, 'operator_nameplate', op_card, paper, dynamic=True)
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

    # Rear desk-side notice. The wording belongs to the authored set, not a visitor prompt.
    notice = [box((0.74, 0.045, 0.33), (0.0, 2.73, 1.82), 0.025, 0),
              box((0.62, 0.020, 0.23), (0.0, 2.70, 1.82), 0.008, 1)]
    notice_obj = group(root, 'operator_notice', notice, [wood, paper])
    parts.append(notice_obj)

    # A lived-in route: low repeated toe-kick lights are material, not additional runtime lights.
    sconce = []
    for y in (1.2, 3.6, 6.2):
        sconce.append(box((0.04, 0.27, 0.46), (-1.88, y, 2.72), 0.018, 0))
        sconce.append(box((0.035, 0.13, 0.19), (-1.85, y - 0.03, 2.72), 0.012, 1))
    parts.append(group(root, 'warm_wall_practicals', sconce, [brass, enamel]))

    return Built(root, parts + [operator, card], moving=moving, unbaked=unbaked,
                 stage='exchange', view=dict(target=(0.0, 0.0, 6.0), distance=10.0, azimuth=0, lens=64),
                 detail=dict(target=(0.0, 1.62, 1.7), distance=1.0, azimuth=0, elevation=10),
                 notes={'stage': '4.2 m wide, 9 m deep, 12.6 m high',
                        'interactive': 'line_jack_01..12, line_lamp_01..12, line_card_01..12, inspect_*',
                        'moving': 'inspect_ladder, line_card_01..12, operator_nameplate'})


if __name__ == '__main__':
    kit.run(ROOM, build)
