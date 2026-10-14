"""A desk stamp rack with four rubber stamps: beech handles, rubber faces cut in plain geometric marks.

The rack is a walnut bar with four pockets of different shapes; the stamps stand in them face down.
Each stamp is its own node (stamp_1 ... stamp_4), its origin at the centre of its rubber face, so it
lifts straight out along the vertical axis. The marks are abstract (rules, rings, a cross, a frame), never
words. Faces carry old ink in three colours; the handles are polished by the hand that picks them up.

Run: blender -b --factory-startup --python stamp_rack.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='stamp-rack', title='Desk stamp rack with four stamps', tier='hero', texture=1024, ao_distance=0.05)]

RACK = (0.250, 0.085, 0.030)
POCKET_DEPTH = 0.018
Z_FLOOR = RACK[2] - POCKET_DEPTH
RELIEF = 0.0008
# (kind, width x, depth y) of each stamp's footprint
STAMPS = [('rect', 0.062, 0.032), ('round', 0.048, 0.048), ('rect', 0.046, 0.022), ('round', 0.048, 0.048)]
INK = ['#2C2A68', '#7A1F22', '#1D1C1B', '#2C2A68']


def layout():
    pockets = [(k, w + 0.004, d + 0.004) for k, w, d in STAMPS]
    total = sum(p[1] for p in pockets)
    gap = (RACK[0] - total) / (len(pockets) + 1)
    x = -RACK[0] / 2 + gap
    out = []
    for kind, w, d in pockets:
        out.append((x + w / 2, kind, w, d))
        x += w + gap
    return out


def ring_marks(radius, t=0.0018):
    h = RELIEF
    return geo.lathe([(radius - t / 2, -h), (radius + t / 2, -h), (radius + t / 2, 0.0), (radius - t / 2, 0.0), (radius - t / 2, -h)], segments=28)


def marks(i, w, d):
    """Rubber relief for stamp i as bmeshes in the stamp's own frame (face plane z = 0, relief below it)."""
    parts = []
    t, h = 0.0016, RELIEF

    def bar(cx, cy, sx, sy):
        return geo.box((sx, sy, h), center=(cx, cy, -h / 2))

    if i == 0:       # a frame with a diagonal bar
        hw, hd = w / 2 - 0.004, d / 2 - 0.004
        parts += [bar(0, hd, 2 * hw, t), bar(0, -hd, 2 * hw, t), bar(hw, 0, t, 2 * hd), bar(-hw, 0, t, 2 * hd)]
        diag = bar(0, 0, 2 * hw - 0.008, t)
        geo.rotate(diag, (0, 0, 18))
        parts.append(diag)
    elif i == 1:     # a ring around a dot
        parts += [ring_marks(0.0185), geo.lathe([(0.0, -h), (0.0050, -h), (0.0050, 0.0), (0.0, 0.0)], segments=14)]
    elif i == 2:     # three rules and a square
        hw = w / 2 - 0.004
        parts += [bar(0, 0.0045, 2 * hw, t), bar(0, 0.0, 2 * hw, t), bar(0, -0.0045, 2 * hw * 0.6, t), bar(hw - 0.004, -0.0045, 0.006, 0.006)]
    else:            # a ring with a cross
        parts += [ring_marks(0.0185), bar(0, 0, 0.026, t), bar(0, 0, t, 0.026)]
    out = parts[0]
    geo.merge(out, *parts[1:])
    return out


def handle_profile(i):
    z0 = 0.016
    small = i == 2
    top = 0.050 if small else 0.0675
    p = [(0.0, z0), (0.0150, z0, 0.0010), (0.0150, z0 + 0.0030), (0.0110, z0 + 0.0055), (0.0080, z0 + 0.0100)]
    if small:
        p += [(0.0078, z0 + 0.0180), (0.0100, z0 + 0.0220), (0.0150, z0 + 0.0270), (0.0150, z0 + 0.0300), (0.0100, z0 + 0.0345), (0.0, top)]
    else:
        p += [(0.0075, z0 + 0.0200), (0.0095, z0 + 0.0250), (0.0165, z0 + 0.0340), (0.0170, z0 + 0.0400), (0.0140, z0 + 0.0465),
              (0.0070, z0 + 0.0500), (0.0, top)]
    return p


def build(spec, root):
    walnut = mats.wood('walnut', light='#6A4429', dark='#2C1B0F', axis='X', ring_freq=120.0, warp=4.0, wander=0.05, roughness=0.58, age=0.6,
                       seed=81.0, relief=0.03, polish=0.1, edge_lift=0.1, contrast=0.9,
                       spots=[dict(at=(0.0, -0.043, 0.015), radius=(0.12, 0.02, 0.012))])
    beech = mats.wood('beech', light='#D6AE74', dark='#A57B45', axis='Z', ring_freq=190.0, warp=3.0, wander=0.02, roughness=0.42, age=0.7,
                      seed=82.0, relief=0.04, polish=0.18, edge_lift=0.1,
                      decals=[dict(at=(-0.078, -0.012, 0.062), radius=(0.012, 0.012, 0.016), color='#2C2A68', strength=0.5),
                              dict(at=(0.0, 0.0, 0.035), radius=(0.03, 0.03, 0.01), color='#8A6A3C', strength=0.3)])
    rubber = mats.painted('rubber', color='#252322', roughness=0.8, age=0.8, seed=83.0, substrate='#3A3836', chip_amount=0.05,
                          metal_substrate=False, cav_dist=0.004, dust=0.4)
    plate = mats.brass('label plate', age=0.4, seed=84.0, rough_lo=0.34, rough_hi=0.5, edge_radius=0.0007, cav_dist=0.004,
                       brush_axis='X', brush=1.0, waviness=0.6, grain=0.2)

    slots = layout()
    bar = geo.box(RACK, center=(0.0, 0.0, RACK[2] / 2))
    cutters = []
    for cx, kind, w, d in slots:
        if kind == 'round':
            cyl = geo.lathe([(0.0, Z_FLOOR), (w / 2, Z_FLOOR), (w / 2, RACK[2] + 0.01), (0.0, RACK[2] + 0.01)], segments=26)
            cutters.append(geo.translate(cyl, (cx, 0.0, 0.0)))
        else:
            cutters.append(geo.box((w, d, POCKET_DEPTH + 0.01), center=(cx, 0.0, Z_FLOOR + (POCKET_DEPTH + 0.01) / 2)))
    bar = geo.boolean_cut(bar, cutters)
    geo.bevel_by_angle(bar, 0.0028, segs=2, min_deg=35)
    geo.set_material(bar, 0)
    fplate = geo.set_material(geo.box((0.070, 0.0012, 0.0115), center=(0.0, -RACK[1] / 2 - 0.0006, RACK[2] / 2), bevel=0.0005, segs=1), 3)
    geo.merge(bar, fplate)
    rack = kit.add_part(root, 'rack', bar, [walnut, beech, rubber, plate], sharp_deg=55)

    nodes = [rack]
    for i, (cx, kind, pw, pd) in enumerate(slots):
        _, w, d = STAMPS[i]
        parts = []
        if kind == 'round':
            wood_block = geo.lathe(geo.fillet_profile([(0.0, 0.0030), (w / 2, 0.0030), (w / 2, 0.0145), (w / 2 - 0.0020, 0.0160), (0.0, 0.0160)]),
                                   segments=26)
            rub = geo.lathe([(0.0, 0.0), (w / 2 - 0.0030, 0.0), (w / 2 - 0.0030, 0.0030), (0.0, 0.0030)], segments=26)
        else:
            wood_block = geo.box((w, d, 0.0130), center=(0.0, 0.0, 0.0030 + 0.0065), bevel=0.0020, segs=2)
            rub = geo.box((w - 0.006, d - 0.006, 0.0030), center=(0.0, 0.0, 0.0015))
        geo.set_material(wood_block, 1)
        geo.set_material(rub, 2)
        handle = geo.set_material(geo.lathe(geo.fillet_profile(handle_profile(i), step_deg=35), segments=24, seg_tol=0.00025, seg_floor=14), 1)
        mk = geo.set_material(marks(i, w, d), 2)
        geo.merge(wood_block, rub, handle, mk)
        node = kit.add_part(root, f'stamp_{i + 1}', wood_block, [walnut, beech, rubber, plate], sharp_deg=80,
                            location=(cx, 0.0, Z_FLOOR + RELIEF))
        nodes.append(node)
    return Built(root, nodes, moving=[f'stamp_{i + 1}' for i in range(4)], stage='desk',
                 view=dict(target=(0, 0, 0.04), distance=1.05, azimuth=28, lens=80),
                 detail=dict(target=(-0.04, 0.0, 0.06), distance=0.36, azimuth=24, elevation=20),
                 notes={'stamps': 'each lifts out along its own Z axis (Y after export); origin at the rubber face'})


if __name__ == '__main__':
    kit.run(PROPS, build)
