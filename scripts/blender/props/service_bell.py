"""The Office's service bell: a spun brass dome on a cast brass base, with a black Bakelite plunger.

The plunger is its own node, pivoted where its stem meets the dome, and moves along the vertical axis
(about 6 mm of travel). The dome is polished by the same hand that has struck it for decades; the base
has tarnished in its crevices.

Run: blender -b --factory-startup --python service_bell.py -- --work <dir> [--only id] [--res N]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='service-bell', title='Service bell', tier='small', texture=512, ao_distance=0.05)]

SEG = 40
TOL = 0.0003
APEX = 0.0535  # z of the plunger pivot (the dome's crown)


def base_profile():
    return [(0.0, 0.0), (0.0480, 0.0, 0.0015), (0.0480, 0.0048), (0.0455, 0.0064, 0.0014), (0.0430, 0.0078), (0.0414, 0.0098),
            (0.0414, 0.0125), (0.0, 0.0125)]


def dome_profile():
    p = [(0.0, 0.0125), (0.0420, 0.0125, 0.0007), (0.0420, 0.0152), (0.0408, 0.0170, 0.0014)]
    p += geo.catmull2([(0.0400, 0.0180), (0.0394, 0.0235), (0.0366, 0.0335), (0.0306, 0.0430), (0.0210, 0.0494), (0.0110, 0.0522),
                       (0.0075, 0.0530)], per_seg=3)[1:]
    p += [(0.0075, 0.0545, 0.0010), (0.0, 0.0545)]
    return p


def plunger_brass():
    return [(0.0, -0.0100), (0.0033, -0.0100), (0.0033, -0.0010), (0.0068, -0.0008, 0.0008), (0.0068, 0.0030, 0.0008), (0.0040, 0.0036),
            (0.0, 0.0036)]


def plunger_cap():
    return [(0.0, 0.0034), (0.0120, 0.0034, 0.0008), (0.0120, 0.0085), (0.0100, 0.0108), (0.0050, 0.0122), (0.0, 0.0126)]


def build(spec, root):
    dome_m = mats.brass('dome', age=0.35, seed=21.0, rough_lo=0.3, rough_hi=0.5, cav_dist=0.01, scratches=0.35, spin=0.6,
                        spots=[dict(at=(0.0, -0.01, 0.052), radius=(0.02, 0.02, 0.008)), dict(at=(0.0, -0.04, 0.025), radius=(0.02, 0.01, 0.015))])
    base_m = mats.brass('base', age=0.7, seed=22.0, rough_lo=0.4, rough_hi=0.58, cav_dist=0.008, cav_gain=1.0, scratches=0.8, spin=0.5)
    cap_m = mats.lacquer('bakelite', color='#161413', roughness=0.22, age=0.5, seed=23.0, under='#4B3B2D', rub=0.3,
                         spots=[dict(at=(0.0, 0.0, 0.0535 + 0.0126), radius=(0.008, 0.008, 0.004))])
    base = geo.lathe(geo.fillet_profile(base_profile()), segments=SEG, seg_tol=TOL)
    dome = geo.lathe(geo.fillet_profile(dome_profile()), segments=SEG, seg_tol=TOL)
    geo.set_material(base, 1)
    geo.set_material(dome, 0)
    geo.merge(base, dome)
    body = kit.add_part(root, 'bell_body', base, [dome_m, base_m])
    stem = geo.set_material(geo.lathe(geo.fillet_profile(plunger_brass()), segments=16, seg_tol=TOL, seg_floor=10), 0)
    cap = geo.set_material(geo.lathe(geo.fillet_profile(plunger_cap()), segments=28, seg_tol=0.0001, seg_floor=14), 1)
    geo.merge(stem, cap)
    plunger = kit.add_part(root, 'plunger', stem, [dome_m, cap_m], location=(0.0, 0.0, APEX))
    return Built(root, [body, plunger], moving=['plunger'], stage='desk',
                 view=dict(target=(0, 0, 0.035), distance=1.1, azimuth=32, lens=105),
                 detail=dict(target=(0.0, 0.0, 0.04), distance=0.4, azimuth=28, elevation=20),
                 notes={'plunger': 'translates along Y by -0.006 m'})


if __name__ == '__main__':
    kit.run(PROPS, build)
