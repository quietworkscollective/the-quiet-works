"""Three archive ledgers, standing spine out: for shelves and desk dressing.

  ledger-a: a tall green cloth ledger, quarter-bound in burgundy leather with raised bands and corners;
  ledger-b: a slim black day book with a red cloth spine and sprinkled red page edges;
  ledger-c: a thick oxblood journal with brass corner guards, a gilt top edge and a ribbon marker.

Every spine carries a blank label. Wear is the story: corners and spine heads rubbed pale, dust on the
top edge, a spine foot scuffed by years of being pulled from the shelf by the same two fingers.

The footprint is centred on the origin, the book stands on y = 0, the spine faces +Z after export (when
the book is rotated 90 degrees to lie flat, the same face is up).

Run: blender -b --factory-startup --python ledgers.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

VARIANTS = {
    'ledger-a': dict(title='Green cloth ledger', T=0.056, H=0.372, D=0.262, bands=4, label=(0.070, 0.026), corners='leather',
                     cloth='#3A5A42', spine='#5A2427', edge='plain', ribbon=None, seed=91.0),
    'ledger-b': dict(title='Black day book', T=0.040, H=0.338, D=0.206, bands=2, label=(0.085, 0.020), corners=None,
                     cloth='#1E1E20', spine='#7B2A2B', edge='red', ribbon=None, seed=92.0),
    'ledger-c': dict(title='Oxblood journal', T=0.070, H=0.314, D=0.246, bands=5, label=(0.060, 0.030), corners='brass',
                     cloth='#5A2328', spine='#3E181C', edge='gilt', ribbon='#2F4A3A', seed=93.0),
}
PROPS = [
    dict(id='ledger-a', title='Green cloth ledger', tier='small', texture=512, ao_distance=0.06, variant='ledger-a'),
    dict(id='ledger-b', title='Black day book', tier='small', texture=512, ao_distance=0.06, variant='ledger-b'),
    dict(id='ledger-c', title='Oxblood journal', tier='small', texture=512, ao_distance=0.06, variant='ledger-c'),
]


def bowed(bm, seed):
    """A cloth board warps a little with the years: a swell of a few tenths of a millimetre."""
    geo.refine(bm, 0.07)
    return geo.wobble(bm, 0.0007, 0.2, seed=seed * 2.7 + 1.0, axes='x')


def build(spec, root):
    v = VARIANTS[spec['variant']]
    T, H, D = v['T'], v['H'], v['D']
    b = 0.0032
    seed = v['seed']
    cloth = mats.fabric('cover cloth', color=v['cloth'], age=0.7, seed=seed, weave=False, roughness=0.88, nap=0.4, edge_radius=0.0025,
                        rub_edges=1.0, fray=(0.5, 0.5, 0.5), mottle=0.3,
                        spots=[dict(at=(0.0, -D / 2, H - 0.01), radius=(0.04, 0.03, 0.02), strength=0.7),
                               dict(at=(0.0, -D / 2, 0.012), radius=(0.04, 0.03, 0.02), strength=0.9),
                               dict(at=(0.0, -D / 2, H * 0.55), radius=(0.04, 0.02, 0.03), strength=0.4)])
    spine_m = mats.fabric('spine', color=v['spine'], age=0.8, seed=seed + 1, weave=False, roughness=0.7, nap=0.2, edge_radius=0.0025,
                          rub_edges=1.0, fray=(0.5, 0.42, 0.38), mottle=0.3,
                          spots=[dict(at=(0.0, -D / 2, H - 0.01), radius=(0.04, 0.03, 0.02), strength=0.8),
                                 dict(at=(0.0, -D / 2, 0.012), radius=(0.04, 0.03, 0.02), strength=0.9),
                                 dict(at=(0.0, -D / 2, H * 0.5), radius=(0.04, 0.02, 0.05), strength=0.4)])
    tone = {'plain': '#E6DDC4', 'red': '#E4DAC0', 'gilt': '#D8B65C'}[v['edge']]
    page = mats.paper('page block', tone=tone, age=0.7, seed=seed + 2, stack_axis='Z', page_pitch=0.0018, edge_radius=0.0012,
                      speckle=('#9C2424', 0.8) if v['edge'] == 'red' else None, metallic=0.9 if v['edge'] == 'gilt' else 0.0,
                      roughness=0.5 if v['edge'] == 'gilt' else 0.9)
    label = mats.paper('spine label', tone='#E9E0C6', age=0.8, seed=seed + 3, edge_radius=0.0008)
    trim = mats.brass('corner trim', age=0.6, seed=seed + 4, rough_lo=0.36, rough_hi=0.55, edge_radius=0.001, cav_dist=0.005) \
        if v['corners'] == 'brass' else mats.painted('leather', color=v['spine'], roughness=0.6, age=0.8, seed=seed + 4, substrate='#8A6040',
                                                       chip_amount=0.05, metal_substrate=False, cav_dist=0.004, edge_radius=0.0012,
                                                       grime='#0A0604')
    rib = mats.fabric('ribbon', color=v['ribbon'] or '#7A1F22', age=0.5, seed=seed + 5, weave=False, roughness=0.5, nap=0.2, mottle=0.2)

    boards = [geo.set_material(bowed(geo.box((b, D, H), center=(sx * (T / 2 - b / 2), 0.0, H / 2), bevel=0.0012, segs=2), sx), 0) for sx in (-1, 1)]
    spine = geo.set_material(geo.box((T, 0.012, H), center=(0.0, -D / 2 + 0.001, H / 2), bevel=0.0055, segs=4,
                                      selector=lambda e: abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1), 1)
    block = geo.set_material(geo.box((T - 2 * b - 0.002, D - 0.014, H - 0.012), center=(0.0, 0.0035, H / 2), bevel=0.0007, segs=1), 2)
    parts = boards + [spine, block]
    # raised bands across the spine, with the label in the second panel from the top
    if v['bands']:
        zs = [H - 0.020 - i * (H - 0.040) / max(v['bands'] - 1, 1) for i in range(v['bands'])]
        for z in zs:
            parts.append(geo.set_material(geo.box((T - 0.003, 0.0045, 0.0075), center=(0.0, -D / 2 - 0.0055, z), bevel=0.0022, segs=2), 1))
    lw, lh = v['label']
    lz = H - 0.020 - (H - 0.040) / max(v['bands'], 2) * 0.55 - lw / 2 if v['bands'] else H * 0.7
    parts.append(geo.set_material(geo.box((T - 0.016, 0.0007, lw), center=(0.0, -D / 2 - 0.0070, min(lz, H - 0.05)), bevel=0.0002, segs=1), 3))
    if v['corners']:
        s = 0.030
        for sx in (-1, 1):
            for z0 in (0.0, H):
                sz = -1 if z0 > 0 else 1
                c = geo.box((0.0012 + b, s, s), center=(sx * (T / 2 - b / 2), D / 2 - s / 2 + 0.0005, z0 + sz * s / 2), bevel=0.0008, segs=1) \
                    if v['corners'] == 'brass' else None
                if c is not None:
                    parts.append(geo.set_material(c, 4))
    if v['ribbon']:
        r = geo.box((0.007, 0.0006, 0.060), center=(0.004, -D / 2 + 0.040, H + 0.020), bevel=0.0002, segs=1)
        parts.append(geo.set_material(r, 5))
    body = parts[0]
    geo.merge(body, *parts[1:])
    obj = kit.add_part(root, 'ledger', body, [cloth, spine_m, page, label, trim, rib], sharp_deg=55)
    return Built(root, [obj], moving=[], stage='floor',
                 view=dict(target=(0, 0, H * 0.55), distance=1.9, azimuth=16, lens=85),
                 detail=dict(target=(0.0, -D / 2, H * 0.7), distance=0.4, azimuth=14, elevation=8))


if __name__ == '__main__':
    kit.run(PROPS, build)
