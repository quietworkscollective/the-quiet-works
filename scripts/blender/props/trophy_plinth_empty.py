"""The empty plinth for the trophy cabinet's "RESERVED" space: an octagonal stepped plinth with a blank
brass label plate and a green baize top that still carries the pale disc where something used to stand.

Run: blender -b --factory-startup --python trophy_plinth_empty.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='trophy-plinth-empty', title='Empty plinth for the reserved place', tier='small', texture=512, ao_distance=0.06)]

# octagon circumradius for a given across-flats width
def rr(width):
    return width / 2.0 / math.cos(math.pi / 8.0)


def octagon(profile):
    bm = geo.lathe(geo.fillet_profile(profile, step_deg=45), segments=8)
    return geo.rotate(bm, (0.0, 0.0, 22.5))


def build(spec, root):
    wood = mats.wood('ebonised', light='#3F2B1D', dark='#1A120C', axis='Z', ring_freq=140.0, roughness=0.6, rough_range=(0.55, 0.75), age=0.5, seed=12.0,
                     relief=0.03, wander=0.06, edge_lift=0.1, spots=[dict(at=(0.0, -0.06, 0.012), radius=(0.04, 0.02, 0.012))])
    baize = mats.fabric('baize', color='#244630', age=0.6, seed=13.0, roughness=0.95, weave=False, nap=0.8, edge_radius=0.0015,
                        spots=[dict(at=(0.0, 0.0, 0.0495), radius=(0.030, 0.030, 0.006), strength=0.9)], mottle=0.12)
    plate = mats.brass('label plate', age=0.35, seed=14.0, rough_lo=0.34, rough_hi=0.5, edge_radius=0.0007, cav_dist=0.004,
                       brush_axis='X', brush=1.0, waviness=0.7, grain=0.2)
    w1, w2, w3 = rr(0.132), rr(0.112), rr(0.094)
    body = octagon([(0.0, 0.0), (w1, 0.0), (w1, 0.0100), (w1 - 0.0025, 0.0125), (w2, 0.0125), (w2, 0.0330), (w2 - 0.0025, 0.0355),
                    (w3, 0.0355), (w3, 0.0470), (w3 - 0.0025, 0.0495), (rr(0.081), 0.0495), (rr(0.081), 0.0485), (0.0, 0.0485)])
    geo.set_material(body, 0)
    cloth = geo.lathe([(0.0, 0.0501), (0.0405, 0.0501), (0.0405, 0.0485), (0.0, 0.0485)][::-1], segments=28)
    geo.set_material(cloth, 1)
    face = 0.112 / 2.0
    pl = geo.set_material(geo.box((0.058, 0.0012, 0.0170), center=(0, -(face + 0.0006), 0.0238), bevel=0.0005, segs=1), 2)
    geo.merge(body, cloth, pl)
    for sx in (-1, 1):
        s = geo.lathe([(0.0016, 0.0), (0.0013, 0.0006), (0.0, 0.0009)], segments=6)
        geo.place(s, (sx * 0.0245, -(face + 0.0012), 0.0238), (0.0, -1.0, 0.0), roll_deg=40 * sx)
        geo.merge(body, geo.set_material(s, 2))
    obj = kit.add_part(root, 'plinth', body, [wood, baize, plate], sharp_deg=30)
    return Built(root, [obj], moving=[], stage='shelf',
                 view=dict(target=(0, 0, 0.03), distance=0.8, azimuth=28),
                 detail=dict(target=(0.0, 0.0, 0.035), distance=0.3, azimuth=20, elevation=22))


if __name__ == '__main__':
    kit.run(PROPS, build)
