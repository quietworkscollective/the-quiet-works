"""Cast-iron column radiators, six and ten sections long, for the corridor and the Office.

Each section is two upright tubes joined by a head and a foot block, with a hairline gap to its
neighbour. Old teal enamel has dulled and gone dark in the gaps, a few chips show iron at the edges and
the feet carry mop-splash grime. Brass lockshield valve and bleed plug, two pipe stubs rising from the
floor; the valve wheel is its own node (pivot at the spindle) so it can turn.

The footprint is centred on the origin, the feet stand on y = 0 after export, the front faces +Z.

Run: blender -b --factory-startup --python column_radiator.py -- --work <dir> [--only id] [--res N]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [
    dict(id='column-radiator-6', title='Column radiator, six sections', tier='hero', texture=1024, columns=6, ao_distance=0.08, finish='cream'),
    dict(id='column-radiator-10', title='Column radiator, ten sections', tier='hero', texture=1024, columns=10, ao_distance=0.08, finish='dark'),
]

PITCH = 0.0475
BLOCK_W, BLOCK_D = 0.0440, 0.1000
TUBE_W, TUBE_D = 0.0340, 0.0320
TUBE_Y = 0.0340
Z_FOOT0, Z_FOOT1 = 0.0750, 0.1150
Z_HEAD0, Z_HEAD1 = 0.6400, 0.6820
WHEEL_Z = 0.1340


def vertical_edges(e):
    a, b = e.verts
    return abs(a.co.z - b.co.z) > 0.05


def leg_profile():
    return [(0.0, 0.0), (0.0275, 0.0, 0.0020), (0.0275, 0.0080), (0.0205, 0.0165, 0.0030), (0.0185, 0.0520),
            (0.0230, 0.0640, 0.0020), (0.0250, 0.0750), (0.0, 0.0750)]


def build(spec, root):
    n = spec['columns']
    width = n * PITCH
    spots = [dict(at=(0.0, 0.0, Z_HEAD1), radius=(0.3, 0.06, 0.012), strength=0.6)]
    if spec['finish'] == 'cream':
        # the Office's radiators: oil-based cream gloss over iron, even and a little tired, yellowed at the head
        paint = mats.enamel('cream enamel', color='#ABA38C', chip_metal='#3A3632', age=0.8, seed=31.0, roughness=0.44, edge_radius=0.0021,
                            chip_amount=0.75, chip_radius=0.008, rust=0.4, cav_dist=0.05, rub_color=(0.44, 0.40, 0.31, 1.0), dust=0.7, streaks=0.35, scuffs=0.35,
                            smudge=0.4, floor_grime=(0.16, 0.75), heat=(0.40, 0.70, 0.35), yellowing=0.35, variation=0.08, spots=spots)
    else:
        # the corridor's: dark bottle-green enamel, hard and glossy, chipped at the edges to rusty iron
        paint = mats.enamel('dark enamel', color='#2A3A30', chip_metal='#3F3732', age=0.8, seed=31.0, roughness=0.38, edge_radius=0.0021,
                            chip_amount=0.75, chip_radius=0.008, rust=0.55, cav_dist=0.05, rub_color=(0.27, 0.32, 0.28, 1.0), dust=0.75, streaks=0.35, scuffs=0.35,
                            smudge=0.45, floor_grime=(0.16, 0.6), heat=(0.40, 0.70, 0.35), yellowing=0.2, variation=0.06, spots=spots)
    brass = mats.brass('brass valve', age=0.55, seed=32.0, rough_lo=0.34, rough_hi=0.55, cav_dist=0.008, edge_radius=0.0012,
                       spots=[dict(at=(width / 2 + 0.034, 0.0, WHEEL_Z + 0.003), radius=(0.026, 0.026, 0.008))])
    pipe = mats.worn_metal('copper', bright='#DB9068', mid='#B06A45', dull='#6E3E27', deep='#2F1A12', age=0.6, seed=33.0,
                           rough_lo=0.32, rough_hi=0.5, cav_dist=0.008)

    parts = []
    z_lo, z_hi = Z_FOOT1 - 0.004, Z_HEAD0 + 0.004
    # a column swells where it meets the head and the foot, as cast iron does
    stations = [(0.0, 1.10), (0.012, 1.05), (0.03, 1.0), (0.97, 1.0), (0.988, 1.05), (1.0, 1.10)]

    def swell(t):
        for (t0, k0), (t1, k1) in zip(stations, stations[1:]):
            if t0 <= t <= t1:
                k = k0 + (k1 - k0) * (t - t0) / max(t1 - t0, 1e-9)
                return TUBE_D / 2 * k, TUBE_W / 2 * k
        return TUBE_D / 2, TUBE_W / 2

    for i in range(n):
        x = (i - (n - 1) / 2.0) * PITCH
        for y in (-TUBE_Y, TUBE_Y):
            path = [(x, y, z_lo + (z_hi - z_lo) * t) for t, _ in stations]
            parts.append(geo.set_material(geo.sweep(path, swell, sides=10, up=(0, 1, 0), cap_start=False, cap_end=False,
                                                    squareness=0.85), 0))
        for z0, z1 in ((Z_FOOT0, Z_FOOT1), (Z_HEAD0, Z_HEAD1)):
            parts.append(geo.set_material(geo.box((BLOCK_W, BLOCK_D, z1 - z0), center=(x, 0.0, (z0 + z1) / 2), bevel=0.0055, segs=2), 0))
        # the cast lip along the top of each head
        parts.append(geo.set_material(geo.box((BLOCK_W + 0.003, BLOCK_D + 0.006, 0.0055), center=(x, 0.0, Z_HEAD1 + 0.00275),
                                              bevel=0.0020, segs=1), 0))
    legs_x = [-width / 2 + 0.034, width / 2 - 0.034] + ([0.0] if n >= 8 else [])
    for lx in legs_x:
        leg = geo.lathe(geo.fillet_profile(leg_profile(), step_deg=40), segments=14, seg_tol=0.0007)
        parts.append(geo.translate(geo.set_material(leg, 0), (lx, 0.0, 0.0)))
    body = parts[0]
    geo.merge(body, *parts[1:])

    # fittings: a pipe stub, elbow body and union on the right; a capped lockshield on the left; a bleed plug on top
    fit = []
    for side, wheel in ((+1, True), (-1, False)):
        x0 = side * (width / 2 + 0.034)
        stub = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0078, 0.0), (0.0078, 0.0800), (0.0, 0.0800)]), segments=14, seg_tol=0.0003, seg_floor=10)
        geo.translate(stub, (x0, 0.0, 0.0))
        fit.append(geo.set_material(stub, 2))
        elbow = geo.lathe(geo.fillet_profile([(0.0, 0.0780), (0.0110, 0.0780, 0.0020), (0.0170, 0.0880, 0.0040), (0.0170, 0.1000, 0.0040),
                                              (0.0120, 0.1100, 0.0020), (0.0120, 0.1160), (0.0, 0.1160)]), segments=18, seg_tol=0.0003, seg_floor=12)
        geo.translate(elbow, (x0, 0.0, 0.0))
        fit.append(geo.set_material(elbow, 1))
        union = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0120, 0.0, 0.0010), (0.0120, 0.0100, 0.0010), (0.0090, 0.0100), (0.0090, 0.0340), (0.0, 0.0340)]),
                          segments=6)
        geo.place(union, (side * (width / 2 - 0.0005), 0.0, 0.0950), (side, 0.0, 0.0))
        fit.append(geo.set_material(union, 1))
        if not wheel:
            cap = geo.lathe(geo.fillet_profile([(0.0, 0.1160), (0.0100, 0.1160, 0.0010), (0.0100, 0.1230, 0.0010), (0.0, 0.1240)]), segments=14, seg_floor=10)
            geo.translate(cap, (x0, 0.0, 0.0))
            fit.append(geo.set_material(cap, 1))
    bleed = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0105, 0.0, 0.0010), (0.0105, 0.0070, 0.0010), (0.0, 0.0072)]), segments=12, seg_floor=10)
    geo.place(bleed, (-width / 2 - 0.0069, 0.0, 0.6610), (-1.0, 0.0, 0.0))
    fit.append(geo.set_material(bleed, 1))
    key = geo.box((0.0035, 0.0070, 0.0070), center=(-width / 2 - 0.0103, 0.0, 0.6610), bevel=0.0004, segs=1)
    fit.append(geo.set_material(key, 1))
    geo.merge(body, *fit)
    rad = kit.add_part(root, 'radiator', body, [paint, brass, pipe], sharp_deg=55)

    # the valve wheel: a flat hand wheel with four lugs, pivoting on the spindle
    wheel = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0070, 0.0, 0.0006), (0.0070, 0.0050), (0.0230, 0.0050, 0.0010), (0.0230, 0.0080, 0.0010),
                                          (0.0090, 0.0090), (0.0, 0.0105)]), segments=20, seg_tol=0.0003, seg_floor=14)
    spindle = geo.lathe(geo.fillet_profile([(0.0, -0.0160), (0.0040, -0.0160), (0.0040, 0.0), (0.0, 0.0)]), segments=10)
    geo.merge(wheel, spindle)
    geo.set_material(wheel, 0)
    w = kit.add_part(root, 'valve_wheel', wheel, [brass], location=(width / 2 + 0.034, 0.0, WHEEL_Z))
    return Built(root, [rad, w], moving=['valve_wheel'], stage='floor',
                 view=dict(target=(0, 0, 0.35), distance=2.2, azimuth=30),
                 detail=dict(target=(width / 2 - 0.05, 0.0, 0.12), distance=0.4, azimuth=-28, elevation=14),
                 notes={'valve_wheel': 'rotates about its own vertical (Y after export) axis'})


if __name__ == '__main__':
    kit.run(PROPS, build)
