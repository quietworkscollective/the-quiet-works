"""Two archive box files, standing spine out: for shelves and desk dressing.

  box-file-a: marbled-paper boards (blue, madder and ochre) with a black cloth spine, a brass-eyelet finger
              hole and a brass label holder;
  box-file-b: dark green pressboard with a red cloth spine, a nickel eyelet and a leather-bound label.

Both are solid: the lid is the front board. Corners are rubbed through to the grey board, the finger hole is
darkened by years of use and the label cards are blank.

The footprint is centred on the origin, the file stands on y = 0, the spine faces +Z after export.

Run: blender -b --factory-startup --python box_files.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

VARIANTS = {
    'box-file-a': dict(W=0.086, H=0.326, D=0.288, marble=True, board='#22385A', spine='#17181A', eyelet='brass', label_z=0.68, seed=101.0),
    'box-file-b': dict(W=0.078, H=0.318, D=0.282, marble=False, board='#2E4638', spine='#7A2A2C', eyelet='nickel', label_z=0.66, seed=102.0),
}
PROPS = [
    dict(id='box-file-a', title='Marbled box file', tier='small', texture=512, ao_distance=0.08, ao_strength=0.55, variant='box-file-a'),
    dict(id='box-file-b', title='Green pressboard box file', tier='small', texture=512, ao_distance=0.08, variant='box-file-b'),
]


def ring_profile(r_out, r_in, depth):
    """A flat eyelet ring (revolved about Z) as a closed loop."""
    return [(r_in, 0.0), (r_out, 0.0, 0.0005), (r_out, depth * 0.55), (r_out - 0.0018, depth), (r_in + 0.0010, depth), (r_in, depth * 0.5), (r_in, 0.0)]


def build(spec, root):
    v = VARIANTS[spec['variant']]
    W, H, D, seed = v['W'], v['H'], v['D'], v['seed']
    spots = [dict(at=(0.0, -D / 2, 0.06), radius=(0.04, 0.02, 0.05), strength=0.8), dict(at=(0.0, -D / 2, 0.16), radius=(0.04, 0.02, 0.04), strength=0.5),
             dict(at=(0.0, -D / 2, H - 0.01), radius=(0.04, 0.03, 0.02), strength=0.8)]
    if v['marble']:
        boards = mats.marbled('marbled boards', colors=('#344557', '#45444A', '#5B5B5C', '#29313A'),
                              seed=seed, age=0.45, spots=spots, scale=120.0, warp=0.015)
    else:
        boards = mats.painted('pressboard', color=v['board'], roughness=0.7, age=0.8, seed=seed, substrate='#8D8A80', chip_amount=0.5,
                              metal_substrate=False, cav_dist=0.01, edge_radius=0.0022, dust=0.5, streaks=0.2, rub_color=(0.2, 0.28, 0.22, 1.0),
                              spots=spots)
    spine_spots = ([dict(at=(0.0, -D / 2, 0.05), radius=(0.013, 0.006, 0.016), strength=0.3)] if v['marble'] else
                   [dict(sp, strength=sp['strength'] * 0.4) for sp in spots])
    spine = mats.fabric('spine cloth', color='#33322F' if v['marble'] else v['spine'], age=0.45 if v['marble'] else 0.8,
                        seed=seed + 1, weave=False, roughness=0.8, nap=0.3, edge_radius=0.0025,
                        rub_edges=0.45 if v['marble'] else 0.6, fray=(0.45, 0.42, 0.42), mottle=0.0 if v['marble'] else 0.06,
                        life=0.0 if v['marble'] else 1.0, dust=0.0 if v['marble'] else 0.12,
                        relief=0.02 if v['marble'] else 0.15, spots=spine_spots)
    metal = mats.brass('eyelet', age=0.55, seed=seed + 2, rough_lo=0.34, rough_hi=0.55, edge_radius=0.001, cav_dist=0.005,
                       spots=[dict(at=(0.0, -D / 2 - 0.004, 0.045), radius=(0.02, 0.01, 0.02), strength=0.8)]) \
        if v['eyelet'] == 'brass' else mats.worn_metal('nickel', bright='#D4D6D5', mid='#A7AAA9', dull='#6E7170', deep='#2C2E2E', age=0.55, seed=seed + 2,
                                                         rough_lo=0.32, rough_hi=0.52, cav_dist=0.005, edge_radius=0.001)
    card = mats.paper('label card', tone='#E7DEC4', age=0.7, seed=seed + 3, edge_radius=0.0008)
    inside = mats.painted('hole dark', color='#0E0D0C', roughness=0.9, age=0.5, seed=seed + 4, metal_substrate=False, cav_dist=0.01)

    body = geo.box((W, D, H), center=(0.0, 0.0, H / 2), bevel=0.0045, segs=2)
    geo.refine(body, 0.07)
    geo.wobble(body, 0.0006, 0.2, seed=W * 100.0, axes='x')
    geo.set_material(body, 0)
    # the cloth spine wraps round onto both boards
    wrap = 0.020
    cloth = geo.set_material(geo.box((W + 0.0010, wrap, H + 0.0004), center=(0.0, -D / 2 + wrap / 2 - 0.0003, H / 2), bevel=0.0038, segs=3,
                                      selector=lambda e: abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1 and e.verts[0].co.y < -D / 2 + 0.005), 1)
    # the finger hole: cut through the cloth and a little way into the file
    hole_z = 0.050
    def hole():
        cutter = geo.lathe([(0.0, 0.0), (0.0145, 0.0), (0.0145, 0.050), (0.0, 0.050)], segments=22)
        return geo.place(cutter, (0.0, -D / 2 - 0.010, hole_z), (0.0, 1.0, 0.0))

    # cut each solid on its own: the body and the cloth overlap, and a boolean wants clean manifolds
    merged = geo.boolean_cut(body, [hole()])
    # Keep the cloth's front as the only surface on the spine face. The two nearly coplanar layers
    # otherwise leak the board's marbling through the dark cloth in close renders.
    front = [f for f in merged.faces if f.normal.y < -0.99 and abs(f.calc_center_median().y + D / 2) < 1e-5]
    if front:
        bmesh.ops.delete(merged, geom=front, context='FACES')
    cloth = geo.boolean_cut(cloth, [hole()])
    geo.set_material(cloth, 1)
    geo.set_material(merged, 0)
    geo.merge(merged, cloth)
    # (the boolean returns a fresh mesh; its faces keep their material slots)
    parts = [merged]
    eyelet = geo.lathe(ring_profile(0.0185, 0.0138, 0.0030), segments=24)
    geo.place(eyelet, (0.0, -D / 2 - 0.0016, hole_z), (0.0, -1.0, 0.0))
    parts.append(geo.set_material(eyelet, 2))
    dark = geo.lathe([(0.0, 0.0), (0.0138, 0.0), (0.0138, 0.0006), (0.0, 0.0006)], segments=20)
    geo.place(dark, (0.0, -D / 2 + 0.0398, hole_z), (0.0, -1.0, 0.0))
    parts.append(geo.set_material(dark, 4))
    # label holder
    lz = H * v['label_z']
    fw, fh = W - 0.020, 0.074
    frame = geo.box((fw, 0.0036, fh), center=(0.0, -D / 2 - 0.0020, lz))
    frame = geo.boolean_cut(frame, [geo.box((fw - 0.010, 0.010, fh - 0.010), center=(0.0, -D / 2 - 0.0030, lz))])
    geo.bevel_by_angle(frame, 0.0005, segs=1, min_deg=35)
    geo.set_material(frame, 2)
    parts.append(frame)
    parts.append(geo.set_material(geo.box((fw - 0.012, 0.0006, fh - 0.012), center=(0.0, -D / 2 - 0.0006, lz)), 3))
    body = parts[0]
    geo.merge(body, *parts[1:])
    obj = kit.add_part(root, 'box_file', body, [boards, spine, metal, card, inside], sharp_deg=55)
    return Built(root, [obj], moving=[], stage='floor',
                 view=dict(target=(0, 0, H * 0.5), distance=1.9, azimuth=20, lens=85),
                 detail=dict(target=(0.0, -D / 2, H * 0.55), distance=0.62, azimuth=16, elevation=8))


if __name__ == '__main__':
    kit.run(PROPS, build)
