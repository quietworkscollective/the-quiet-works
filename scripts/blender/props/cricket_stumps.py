"""Three cricket stumps and two bails in a rubber practice stand.

Ash stumps (38 mm, 711 mm above their sockets) stand 95.5 mm apart; two turned bails (111 mm) lie across
the stump tops. Each bail is its own node, pivoted at its centre, so a bowled ball can take them off.
The lower half of the stumps has taken a season of dirt and the stand has the cracked shine of old rubber.

Run: blender -b --factory-startup --python cricket_stumps.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='cricket-stumps', title='Cricket stumps and bails', tier='small', texture=512, ao_distance=0.1)]

PITCH = 0.0955
Z_SOCKET = 0.014
Z_TOP = Z_SOCKET + 0.711
R = 0.01875


def stump_profile():
    return [(0.0, Z_SOCKET), (R - 0.0020, Z_SOCKET, 0.0010), (R, Z_SOCKET + 0.0020), (R, Z_TOP - 0.0210),
            (R * 0.88, Z_TOP - 0.0075, 0.006), (R * 0.58, Z_TOP - 0.0020, 0.003), (0.0, Z_TOP)]


def bail_profile():
    """Half a bail from its tip (z = 0) to its centre (z = 55.5 mm): a thin spigot, a shoulder, a barrel."""
    half = [(0.0031, 0.0), (0.0031, 0.0210), (0.0048, 0.0236, 0.0012), (0.0062, 0.0285), (0.0066, 0.0330), (0.0066, 0.0390)]
    half += geo.bead(0.0066, 0.0445, 0.0026, n=3)[1:]
    half += [(0.0066, 0.0510), (0.0066, 0.0555)]
    return [(p[0], p[1] * 0.91) + tuple(p[2:]) for p in half]


def build(spec, root):
    ash = mats.wood('ash', light='#DCC596', dark='#B28F5D', axis='Z', ring_freq=300.0, warp=2.0, wander=0.01, roughness=0.55, age=0.7,
                    seed=61.0, pore=0.3, relief=0.04, contrast=0.7, edge_lift=0.05, polish=0.1,
                    spots=[dict(at=(0.0, 0.0, 0.58), radius=(0.14, 0.04, 0.06), strength=0.5)],
                    decals=[dict(at=(0.0, 0.0, 0.05), radius=(0.2, 0.06, 0.09), color='#5B4630', strength=0.45),
                            dict(at=(-0.0955, 0.0, 0.10), radius=(0.03, 0.03, 0.04), color='#4C6A3A', strength=0.25),
                            dict(at=(0.0955, -0.012, 0.30), radius=(0.01, 0.02, 0.02), color='#A04030', strength=0.4)])
    bail_m = mats.wood('boxwood', light='#E1C99A', dark='#B89560', axis='Z', ring_freq=280.0, warp=1.5, wander=0.008, roughness=0.5,
                       age=0.5, seed=62.0, pore=0.2, relief=0.03, polish=0.2, spots=[dict(at=(0.0, 0.0, Z_TOP + 0.003), radius=(0.12, 0.02, 0.01))])
    rubber = mats.painted('rubber', color='#1F1D1C', roughness=0.7, age=0.9, seed=63.0, substrate='#3D3835', chip_amount=0.05,
                          metal_substrate=False, cav_dist=0.01, dust=0.6, rub_color=(0.15, 0.14, 0.13, 1.0),
                          spots=[dict(at=(0.0, -0.04, 0.012), radius=(0.14, 0.02, 0.01), strength=0.7)])

    stand = geo.set_material(geo.box((0.292, 0.088, 0.016), center=(0.0, 0.0, 0.008), bevel=0.0050, segs=2), 2)
    parts = [stand]
    for i in (-1, 0, 1):
        x = i * PITCH
        collar = geo.lathe(geo.fillet_profile([(0.0, 0.016), (0.0275, 0.016, 0.0020), (0.0275, 0.0200), (0.0220, 0.0230, 0.0020), (0.0, 0.0230)]),
                           segments=20, seg_tol=0.0004)
        parts.append(geo.translate(geo.set_material(collar, 2), (x, 0.0, 0.0)))
        st = geo.lathe(geo.fillet_profile(stump_profile(), step_deg=35), segments=16, seg_tol=0.0005, seg_floor=12)
        parts.append(geo.translate(geo.set_material(st, 0), (x, 0.0, 0.0)))
    base = parts[0]
    geo.merge(base, *parts[1:])
    body = kit.add_part(root, 'stumps', base, [ash, bail_m, rubber])

    nodes = [body]
    for n, cx in enumerate((-PITCH / 2, PITCH / 2), start=1):
        bm = geo.lathe(geo.fillet_profile(bail_profile(), step_deg=40), segments=12, seg_tol=0.0004, seg_floor=10)
        mirror = geo.lathe(geo.fillet_profile(bail_profile(), step_deg=40), segments=12, seg_tol=0.0004, seg_floor=10, flip=True)
        # one half runs +Z from the centre, the other is its mirror image
        geo.translate(bm, (0.0, 0.0, -0.0505))
        geo.translate(mirror, (0.0, 0.0, -0.0505))
        mirror = geo.scale(mirror, (1.0, 1.0, -1.0))
        geo.merge(bm, mirror)
        geo.set_material(bm, 1)
        geo.rotate(bm, (0.0, 90.0, 0.0))
        node = kit.add_part(root, f'bail_{n}', bm, [ash, bail_m], location=(cx, 0.0, Z_TOP + 0.0070))
        nodes.append(node)
    return Built(root, nodes, moving=['bail_1', 'bail_2'], stage='floor',
                 view=dict(target=(0, 0, 0.36), distance=2.4, azimuth=28),
                 detail=dict(target=(0.0, 0.0, 0.69), distance=0.65, azimuth=22, elevation=12),
                 notes={'bails': 'each lifts off the stump tops; pivot at the bail centre'})


if __name__ == '__main__':
    kit.run(PROPS, build)
