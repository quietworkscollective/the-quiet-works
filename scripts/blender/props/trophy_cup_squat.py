"""Squat two-eared cup of the 1970s: gold-anodised bowl on a black plinth, for the corridor trophy cabinet.

A heavy open bowl on a short fat stem, two stout square ears and a smooth recessed band left blank for a
label. It is the tall cup's opposite on purpose: modern, plain, thick-walled, polished by use rather
than tarnished.

Run: blender -b --factory-startup --python trophy_cup_squat.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='trophy-cup-squat', title='Squat two-eared cup', tier='small', texture=512, ao_distance=0.08)]

SEGMENTS = 36
SEG_TOL = 0.0005
BAND = (0.1000, 0.1450)


def recess_band(poly, z0, z1, depth):
    """Sink a smooth band into a monotonic (r, z) wall with 45-degree steps."""
    def r_at(z):
        for (r0, za), (r1, zb) in zip(poly, poly[1:]):
            if za <= z <= zb:
                return r0 + (r1 - r0) * (z - za) / max(zb - za, 1e-12)
        return poly[-1][0]

    out = [p for p in poly if not (z0 - depth * 1.5 <= p[1] <= z1 + depth * 1.5)]
    idx = next(i for i, p in enumerate(out) if p[1] > z1)
    out[idx:idx] = [(r_at(z0 - depth), z0 - depth), (r_at(z0) - depth, z0), (r_at(z1) - depth, z1), (r_at(z1 + depth), z1 + depth)]
    return out


def plinth_profile():
    return [(0.0, 0.0), (0.0660, 0.0, 0.0028), (0.0660, 0.0110), (0.0620, 0.0140, 0.0020), (0.0540, 0.0140),
            (0.0540, 0.0212, 0.0016), (0.0500, 0.0245), (0.0, 0.0245)]


WALL = geo.catmull2([(0.0190, 0.0680), (0.0300, 0.0735), (0.0500, 0.0850), (0.0650, 0.1030), (0.0745, 0.1280),
                     (0.0785, 0.1600), (0.0800, 0.1850)], per_seg=2)


def wall_r(z):
    for (r0, z0), (r1, z1) in zip(WALL, WALL[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return WALL[-1][0]


def cup_profile():
    base = [(0.0, 0.0245), (0.0440, 0.0245, 0.0010), (0.0440, 0.0300, 0.0012), (0.0330, 0.0340), (0.0200, 0.0360),
            (0.0200, 0.0440), (0.0310, 0.0440, 0.0010), (0.0310, 0.0505, 0.0012), (0.0200, 0.0515), (0.0200, 0.0620)]
    wall = recess_band(WALL, BAND[0], BAND[1], 0.0007)
    return base + geo.shell_profile(wall, 0.0030, lip_segs=4, inner_stride=3)


def ear(side):
    z0, z1 = 0.1000, 0.1560
    path2 = geo.fillet_profile([(wall_r(z0) - 0.0012, z0), (0.1010, z0, 0.0090), (0.1010, z1, 0.0090), (wall_r(z1) - 0.0012, z1)],
                               step_deg=45)
    path = [(x * side, 0.0, z) for x, z in path2]
    return geo.sweep(path, (0.0040, 0.0090), sides=8, up=(0, 1, 0), squareness=0.5)


def build(spec, root):
    gold = mats.gilt('gilt', age=0.3, seed=4.0, under='#B9BCBB', rub=0.22, cav_dist=0.012, rough_lo=0.24, rough_hi=0.5,
                     bands=[(BAND[0] + 0.001, BAND[1] - 0.001, 0.2, 0.9)],
                     spots=[dict(at=(0.099, 0.0, 0.13), radius=(0.012, 0.015, 0.03)), dict(at=(-0.099, 0.0, 0.13), radius=(0.012, 0.015, 0.03)),
                            dict(at=(0.0, 0.0, 0.19), radius=(0.09, 0.09, 0.005))])
    black = mats.lacquer('plinth', color='#1B1A19', roughness=0.2, age=0.4, seed=5.0, under='#5B4B3A', rub=0.3,
                         spots=[dict(at=(0.0, -0.066, 0.007), radius=(0.02, 0.02, 0.01))])
    plinth = geo.set_material(geo.lathe(geo.fillet_profile(plinth_profile()), segments=SEGMENTS, seg_tol=SEG_TOL), 1)
    cup = geo.set_material(geo.lathe(geo.fillet_profile(cup_profile()), segments=SEGMENTS, seg_tol=SEG_TOL), 0)
    ears = [geo.set_material(ear(+1), 0), geo.set_material(ear(-1), 0)]
    geo.merge(plinth, cup, *ears)
    obj = kit.add_part(root, 'cup', plinth, [gold, black])
    return Built(root, [obj], moving=[], stage='shelf',
                 view=dict(target=(0, 0, 0.1), distance=0.85, azimuth=32),
                 detail=dict(target=(0.0, 0.0, 0.13), distance=0.4, azimuth=28, elevation=9))


if __name__ == '__main__':
    kit.run(PROPS, build)
