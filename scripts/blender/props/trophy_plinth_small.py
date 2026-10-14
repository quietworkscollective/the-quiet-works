"""Small plinth trophy for the corridor trophy cabinet: a turned brass column with a grooved ball, on a
stepped ebonised plinth with a blank brass label plate. Abstract on purpose: no figure, no sport.

Run: blender -b --factory-startup --python trophy_plinth_small.py -- --work <dir> [--only id] [--res N]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='trophy-plinth-small', title='Small column trophy on a plinth', tier='small', texture=512, ao_distance=0.06)]

SEG_TOL = 0.0004


def column_profile():
    z0 = 0.0610
    p = [(0.0, z0), (0.0265, z0, 0.0010), (0.0265, z0 + 0.0040, 0.0010), (0.0215, z0 + 0.0075)]
    p += geo.bezier2((0.0215, z0 + 0.0075), (0.0150, z0 + 0.0100), (0.0125, z0 + 0.0140), (0.0108, z0 + 0.0215), n=4)[1:]
    p += [(0.0100, z0 + 0.0250)]
    for z in (0.0345, 0.0640):
        p += [(0.0100, z0 + z - 0.0035)]
        p += geo.bead(0.0100, z0 + z, 0.0022, n=3)
    p += [(0.0100, z0 + 0.0715)]
    p += geo.bezier2((0.0100, z0 + 0.0715), (0.0130, z0 + 0.0745), (0.0200, z0 + 0.0760), (0.0200, z0 + 0.0810), n=4)[1:]
    p += [(0.0215, z0 + 0.0815, 0.0006), (0.0215, z0 + 0.0845, 0.0006), (0.0120, z0 + 0.0855)]
    # the ball: a sphere with two shallow grooves
    cz, R = z0 + 0.1115, 0.0270
    import math
    ball = []
    for a in range(-62, 91, 14):
        r = R * math.cos(math.radians(a))
        z = cz + R * math.sin(math.radians(a))
        ball.append((max(r, 0.0), z))
    p += [(0.0100, z0 + 0.0870)]
    p += ball[:-1] + [(0.0, cz + R)]
    return p


def build(spec, root):
    ebony = mats.wood('ebonised', light='#3A281C', dark='#17100B', axis='X', ring_freq=140.0, roughness=0.6, rough_range=(0.55, 0.75), age=0.45, seed=9.0,
                      relief=0.03, wander=0.06, edge_lift=0.1,
                      spots=[dict(at=(0.0, -0.05, 0.007), radius=(0.04, 0.02, 0.01))])
    brass = mats.brass('brass', age=0.5, seed=10.0, rough_lo=0.34, rough_hi=0.54, spin=0.8, edge_radius=0.001, cav_dist=0.008,
                       spots=[dict(at=(0.0, 0.0, 0.1925), radius=(0.02, 0.02, 0.014)), dict(at=(0.0, 0.0, 0.14), radius=(0.014, 0.014, 0.03))])
    plate = mats.brass('label plate', age=0.4, seed=11.0, rough_lo=0.34, rough_hi=0.5, edge_radius=0.0007, cav_dist=0.004,
                       brush_axis='X', brush=1.0, waviness=0.7, grain=0.2)
    tiers = [
        geo.box((0.100, 0.100, 0.012), center=(0, 0, 0.006), bevel=0.0030, segs=2),
        geo.box((0.082, 0.082, 0.010), center=(0, 0, 0.017), bevel=0.0025, segs=2),
        geo.box((0.066, 0.066, 0.032), center=(0, 0, 0.038), bevel=0.0020, segs=2),
        geo.box((0.080, 0.080, 0.007), center=(0, 0, 0.0575), bevel=0.0025, segs=2),
    ]
    base = geo.set_material(tiers[0], 0)
    geo.merge(base, *[geo.set_material(t, 0) for t in tiers[1:]])
    col = geo.set_material(geo.lathe(geo.fillet_profile(column_profile(), step_deg=30), segments=28, seg_tol=SEG_TOL), 1)
    pl = geo.set_material(geo.box((0.044, 0.0012, 0.016), center=(0, -0.0336, 0.038), bevel=0.0005, segs=1), 2)
    geo.merge(base, col, pl)
    for sx in (-1, 1):
        s = geo.lathe([(0.0016, 0.0), (0.0013, 0.0006), (0.0, 0.0009)], segments=6)
        geo.place(s, (sx * 0.0185, -0.0342, 0.038), (0.0, -1.0, 0.0), roll_deg=30 * sx)
        geo.merge(base, geo.set_material(s, 2))
    # the ball becomes a small armillary: an equator and a tilted meridian ring
    cz = 0.0610 + 0.1115
    equator = geo.lathe(geo.circle_profile(0.0345, 0.0021, 6), segments=36, z0=cz)
    meridian = geo.lathe(geo.circle_profile(0.0345, 0.0021, 6), segments=36)
    geo.rotate(meridian, (113.5, 0.0, 25.0))
    geo.translate(meridian, (0.0, 0.0, cz))
    geo.merge(base, geo.set_material(equator, 1), geo.set_material(meridian, 1))
    obj = kit.add_part(root, 'trophy', base, [ebony, brass, plate])
    return Built(root, [obj], moving=[], stage='shelf',
                 view=dict(target=(0, 0, 0.12), distance=0.85, azimuth=30),
                 detail=dict(target=(0.0, 0.0, 0.15), distance=0.4, azimuth=26, elevation=8))


if __name__ == '__main__':
    kit.run(PROPS, build)
