"""Four-drawer steel filing cabinet, 1960s-70s enamel: sage paint, brass label holders, recessed pulls.

Each drawer is its own node (drawer_1 at the top, drawer_4 at the bottom): a pressed front with a
recessed finger pull and a brass label holder around a blank card, plus a hollow steel tub behind it.
The drawer's origin is the centre of its front face, and it slides out along the cabinet's depth axis
(towards the viewer, +Z after export). The top drawer has a small brass lock.

The cabinet has lived a life: scuffed at the bottom by feet, a touched-up patch that no longer matches,
brass worn bright where fingers find the labels.

The footprint is centred on the origin; the front faces +Z after export.

Run: blender -b --factory-startup --python filing_cabinet.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='filing-cabinet-4', title='Four-drawer filing cabinet', tier='hero', texture=1024, ao_distance=0.25)]

W, D = 0.460, 0.620
Z_KICK, Z_TOP = 0.060, 1.300
FRONT = -D / 2  # the carcass face
PROUD = 0.0015
FRAME = 0.012
DRAWER_H, RAIL = 0.295, 0.012
FRONT_Y = FRONT - PROUD  # the drawer faces


def drawer_top(i):
    return Z_TOP - FRAME - i * (DRAWER_H + RAIL)


def box_at(size, centre, bevel=0.0, segs=2, selector=None):
    return geo.box(size, center=centre, bevel=bevel, segs=segs, selector=selector)


def hollow_tub(size, centre, wall=0.004):
    bm = box_at(size, centre)
    top = geo.faces_facing(bm, (0, 0, 1))[0]
    bmesh.ops.inset_region(bm, faces=[top], thickness=wall, depth=-(size[2] - wall), use_even_offset=True)
    return bm


def front_panel(i):
    zt = drawer_top(i)
    zc = zt - DRAWER_H / 2
    panel = box_at((W - 2 * FRAME - 0.004, 0.020, DRAWER_H - 0.004), (0.0, FRONT_Y + 0.010, zc - 0.002))
    geo.refine(panel, 0.075)
    pocket_z = zt - 0.036
    cutters = [box_at((0.150, 0.032, 0.034), (0.0, FRONT_Y - 0.004, pocket_z))]
    panel = geo.boolean_cut(panel, cutters)
    geo.bevel_by_angle(panel, 0.0022, segs=2, min_deg=35)
    # pressed sheet steel is never quite flat: the front oil-cans a few tenths of a millimetre
    geo.wobble(panel, 0.0004, 0.16, seed=i * 3.1 + 1.0, axes='y')
    return panel, zc


def build(spec, root):
    sage = '#5F7967'
    paint = mats.enamel('sage enamel', color=sage, age=0.6, seed=41.0, roughness=0.42, dust=0.5, streaks=0.35, variation=0.1, scuffs=0.9, smudge=0.7,
                        floor_grime=(0.2, 0.6), rub_color=(0.55, 0.58, 0.5, 1.0), chip_amount=0.7, rust=0.35, cav_dist=0.03,
                        patches=[dict(at=(-0.12, FRONT_Y, 0.15), half=(0.05, 0.01, 0.032), color='#7E8975', strength=0.9)],
                        spots=[dict(at=(0.0, FRONT_Y, 0.11), radius=(0.2, 0.03, 0.06), strength=0.8)]
                        + [dict(at=(0.0, FRONT_Y, drawer_top(i) - 0.036), radius=(0.08, 0.02, 0.02), strength=0.9) for i in range(4)])
    inside = mats.painted('inside steel', color='#43474A', age=0.7, seed=42.0, roughness=0.55, cav_dist=0.05, substrate='#2B2D2E',
                          chip_amount=0.2, dust=0.4)
    steel = mats.worn_metal('pull steel', bright='#C9CCCB', mid='#9EA2A1', dull='#6C706F', deep='#2E3030', age=0.5, seed=43.0,
                            rough_lo=0.32, rough_hi=0.5, cav_dist=0.006, edge_radius=0.0012, brush_axis='X', brush=0.8,
                            spots=[dict(at=(0.0, FRONT_Y - 0.01, drawer_top(i) - 0.045), radius=(0.07, 0.02, 0.012)) for i in range(4)])
    brass = mats.brass('label brass', age=0.5, seed=44.0, rough_lo=0.34, rough_hi=0.52, edge_radius=0.0009, cav_dist=0.004,
                       brush_axis='X', brush=0.5, waviness=0.4,
                       spots=[dict(at=(0.0, FRONT_Y - 0.003, drawer_top(i) - 0.150), radius=(0.05, 0.02, 0.022)) for i in range(4)])
    card = mats.paper('label card', tone='#E6DCC4', age=0.7, seed=45.0, scribble=[
        dict(at=(0.0, FRONT_Y - 0.0006, drawer_top(i) - 0.150), half=(0.034, 0.002, 0.011)) for i in range(4)])

    # carcass: a hollow steel box open at the front, a cap that overhangs it, a recessed kick plinth, three rails
    shell = box_at((W, D, Z_TOP - Z_KICK), (0.0, 0.0, (Z_TOP + Z_KICK) / 2))
    cavity = box_at((W - 2 * FRAME, D, Z_TOP - Z_KICK - 2 * FRAME), (0.0, -0.012, (Z_TOP + Z_KICK) / 2))
    shell = geo.boolean_cut(shell, [cavity])
    geo.bevel_by_angle(shell, 0.0035, segs=2, min_deg=35)
    geo.refine(shell, 0.22)
    geo.wobble(shell, 0.0005, 0.3, seed=9.0, axes='xy')
    geo.set_material(shell, 0)
    cap = geo.set_material(box_at((W + 0.012, D + 0.012, 0.025), (0.0, 0.0, Z_TOP + 0.0125), bevel=0.0045, segs=2), 0)
    kick = geo.set_material(box_at((W - 0.040, D - 0.040, Z_KICK), (0.0, 0.0, Z_KICK / 2), bevel=0.003, segs=2), 1)
    rails = [geo.set_material(box_at((W - 2 * FRAME + 0.002, 0.030, RAIL), (0.0, FRONT + 0.015 - 0.002, drawer_top(i) - DRAWER_H - RAIL / 2),
                                    bevel=0.0012, segs=1), 0) for i in range(3)]
    geo.merge(shell, cap, kick, *rails)
    cabinet = kit.add_part(root, 'cabinet', shell, [paint, inside], sharp_deg=55)

    drawers = []
    for i in range(4):
        panel, zc = front_panel(i)
        geo.set_material(panel, 0)
        zt = drawer_top(i)
        tub = hollow_tub((W - 2 * FRAME - 0.030, 0.520, 0.232), (0.0, FRONT_Y + 0.020 + 0.260 - 0.001, zt - DRAWER_H + 0.018 + 0.116))
        geo.set_material(tub, 1)
        # the finger pull: a steel tongue lying in the recess
        pocket_z = zt - 0.036
        tongue = geo.set_material(box_at((0.146, 0.0035, 0.0045), (0.0, FRONT_Y + 0.0060, pocket_z - 0.011), bevel=0.0012, segs=1), 2)
        # label holder: a brass frame around a window, a blank card behind the window
        frame = box_at((0.092, 0.0040, 0.042), (0.0, FRONT_Y - 0.0020, zt - 0.150))
        frame = geo.boolean_cut(frame, [box_at((0.080, 0.0100, 0.030), (0.0, FRONT_Y - 0.0020 - 0.0015, zt - 0.150))])
        geo.bevel_by_angle(frame, 0.0006, segs=1, min_deg=35)
        geo.set_material(frame, 3)
        label = geo.set_material(box_at((0.080, 0.0006, 0.030), (0.0, FRONT_Y - 0.0006, zt - 0.150)), 4)
        parts = [panel, tub, tongue, frame, label]
        for sx in (-1, 1):
            s = geo.lathe([(0.0016, 0.0), (0.0013, 0.0006), (0.0, 0.0009)], segments=6)
            geo.place(s, (sx * 0.0430, FRONT_Y - 0.0040, zt - 0.150), (0.0, -1.0, 0.0), roll_deg=45 * sx)
            parts.append(geo.set_material(s, 3))
        if i == 0:
            lock = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0105, 0.0, 0.0008), (0.0105, 0.0030, 0.0008), (0.0, 0.0034)]), segments=18)
            geo.place(lock, (0.165, FRONT_Y, zt - 0.100), (0.0, -1.0, 0.0))
            parts.append(geo.set_material(lock, 3))
            slot = geo.box((0.0016, 0.0006, 0.0100), center=(0.165, FRONT_Y - 0.0034, zt - 0.100))
            parts.append(geo.set_material(slot, 1))
        geo.merge(parts[0], *parts[1:])
        node = kit.add_part(root, f'drawer_{i + 1}', parts[0], [paint, inside, steel, brass, card], sharp_deg=55)
        geo.set_pivot(node, (0.0, FRONT_Y, zc))
        drawers.append(node)

    return Built(root, [cabinet] + drawers, moving=[f'drawer_{i + 1}' for i in range(4)], stage='floor',
                 view=dict(target=(0, 0, 0.62), distance=3.0, azimuth=32),
                 detail=dict(target=(0.0, FRONT_Y, 1.10), distance=0.4, azimuth=24, elevation=8),
                 notes={'drawers': 'each slides along local -Y in Blender, +Z after export, up to 0.45 m'})


if __name__ == '__main__':
    kit.run(PROPS, build)
