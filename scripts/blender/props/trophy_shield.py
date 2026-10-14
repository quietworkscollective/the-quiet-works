"""Wooden presentation shield with brass plates, for the corridor trophy cabinet.

A heater-shaped oak board with a raised field, a blank crest roundel and rows of blank brass plates,
each held by two screws. The plates are left unengraved for labels. Its history is visible: one plate
was replaced (brighter, four mismatched screws), one is gone (a pale ghost and two screw holes), and
the rest have tarnished unevenly.

The back plane sits against the wall; the footprint is centred on the origin and the lowest point
(the tip) rests on y = 0 after export.

Run: blender -b --factory-startup --python trophy_shield.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='trophy-shield', title='Oak shield with brass plates', tier='small', texture=512, ao_distance=0.05)]

HW, H, ZS, RC = 0.170, 0.400, 0.215, 0.018
Y_BACK, Y_BOARD, Y_FIELD, Y_PLATE, Y_SCREW = 0.0120, -0.0060, -0.0100, -0.0116, -0.0124
FIELD_INSET = 0.016
PLATE_W, PLATE_H, PLATE_PITCH = 0.074, 0.021, 0.0345


def outline():
    """Counter-clockwise (x, z) seen from the front; the tip is rounded."""
    pts = [(HW, ZS)]
    pts += geo.arc2((HW - RC, H - RC), RC, 0, 90, n=4)
    pts += geo.arc2((-HW + RC, H - RC), RC, 90, 180, n=4)
    pts += [(-HW, ZS)]
    pts += geo.bezier2((-HW, ZS), (-HW, 0.095), (-0.062, 0.034), (0.0, 0.0), n=8)[1:-1]
    pts += [(0.0, 0.0, 0.020)]
    right = geo.bezier2((0.0, 0.0), (0.062, 0.034), (HW, 0.095), (HW, ZS), n=8)[1:-1]
    pts += right
    return geo.fillet_profile(pts, step_deg=30, min_segs=3)


def half_width(poly, z):
    best = 0.0
    for (x0, z0), (x1, z1) in zip(poly, poly[1:] + poly[:1]):
        if (z0 - z) * (z1 - z) <= 0 and abs(z1 - z0) > 1e-9:
            t = (z - z0) / (z1 - z0)
            best = max(best, abs(x0 + (x1 - x0) * t))
    return best


def screw(x, z, color_idx, spin_deg):
    prof = [(0.0017, 0.0), (0.0014, 0.0006), (0.0, 0.0010)]
    bm = geo.lathe(prof, segments=6)
    geo.place(bm, (x, Y_PLATE, z), (0.0, -1.0, 0.0), roll_deg=spin_deg)
    return geo.set_material(bm, color_idx)


def build(spec, root):
    field = outline()
    board = geo.slab(field, Y_BACK, Y_BOARD, bevel_front=0.0035, segs=2)
    inner = geo.offset_polygon(field, FIELD_INSET)
    raised = geo.slab(inner, Y_BOARD, Y_FIELD, bevel_front=0.0016, segs=2)
    geo.set_material(board, 0)
    geo.set_material(raised, 0)
    parts = [board, raised]

    # crest roundel: a blank disc inside a raised reed
    crest = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0320, 0.0, 0.0005), (0.0320, 0.0014, 0.0005), (0.0293, 0.0022),
                                          (0.0262, 0.0022), (0.0253, 0.0013), (0.0, 0.0013)], step_deg=45),
                      segments=36, seg_tol=0.0004)
    geo.place(crest, (0.0, Y_FIELD, 0.3595), (0.0, -1.0, 0.0))
    parts.append(geo.set_material(crest, 1))

    ghost = None
    spin = 0
    rows = 7
    for k in range(rows):
        z = 0.3065 - k * PLATE_PITCH
        avail = 2.0 * (half_width(field, z - PLATE_H / 2) - FIELD_INSET - 0.014)
        n = max(1, min(3, int((avail + 0.008) // (PLATE_W + 0.008))))
        for c in range(n):
            x = (c - (n - 1) / 2.0) * (PLATE_W + 0.008)
            if (k, c, n) == (3, 1, 3):
                ghost = dict(at=(x, Y_FIELD, z), half=(PLATE_W / 2 + 0.0015, 0.004, PLATE_H / 2 + 0.0015))
                for sx in (-1, 1):  # the screw holes are all that is left of it
                    parts.append(geo.set_material(screw(x + sx * (PLATE_W / 2 - 0.006), z, 3, 0.0), 3))
                continue
            replaced = (k, c) == (1, 0)
            pw, ph = (PLATE_W + 0.002, PLATE_H + 0.0012) if replaced else (PLATE_W, PLATE_H)
            plate = geo.box((pw, 0.0016, ph), center=(x, (Y_FIELD + Y_PLATE) / 2, z), bevel=0.0005, segs=1)
            parts.append(geo.set_material(plate, 2 if replaced else 1))
            spots = [(-1, 1), (1, 1)] if not replaced else [(-1, 1), (1, 1), (-1, -1), (1, -1)]
            for sx, sz in spots:
                spin += 37
                zz = z + (sz * (ph / 2 - 0.0055) if replaced else 0.0)
                parts.append(geo.set_material(screw(x + sx * (pw / 2 - 0.0055), zz, 2 if replaced else 1, spin), 2 if replaced else 1))
    shield = parts[0]
    geo.merge(shield, *parts[1:])

    oak = mats.wood('oak', light='#6A482C', dark='#33210F', axis='Z', ring_freq=125.0, roughness=0.6, rough_range=(0.55, 0.75), age=0.55, seed=3.0,
                    patches=[ghost] if ghost else (), polish=0.1, ray_flecks=0.12, wander=0.09,
                    spots=[dict(at=(0.0, Y_BOARD, 0.01), radius=(0.04, 0.04, 0.03))])
    brass = mats.brass('brass', age=0.6, seed=6.0, rough_lo=0.34, rough_hi=0.52, edge_radius=0.0008, cav_dist=0.006, scratches=0.5,
                       brush_axis='X', brush=1.0, waviness=1.0, grain=0.25,
                       spots=[dict(at=(0.0, Y_FIELD, 0.3595), radius=(0.012, 0.01, 0.012))])
    fresh = mats.brass('brass replacement', age=0.12, seed=7.0, rough_lo=0.34, rough_hi=0.48, edge_radius=0.0008, cav_dist=0.006,
                       bright='#F0CE78', mid='#D0A650', scratches=0.2, brush_axis='X', brush=0.6, waviness=0.6, grain=0.2)
    dark_hole = mats.brass('screw holes', age=1.0, seed=8.0, rough_lo=0.5, rough_hi=0.6, tarnish_bias=0.5, cav_dist=0.004)
    obj = kit.add_part(root, 'shield', shield, [oak, brass, fresh, dark_hole], sharp_deg=55)
    # origin: footprint centred, lowest point on y = 0, back plane against the wall
    return Built(root, [obj], moving=[], stage='wall',
                 view=dict(target=(0, 0, 0.21), distance=1.15, azimuth=24),
                 detail=dict(target=(0.0, -0.01, 0.27), distance=0.5, azimuth=20, elevation=4))


if __name__ == '__main__':
    kit.run(PROPS, build)
