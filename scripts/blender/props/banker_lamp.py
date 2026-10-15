"""A banker's lamp: brass base and baluster stem, a long half-cylinder shade of green cased glass over a
tubular bulb, and a short beaded pull chain.

Nodes:
  `lamp_body`   the brass base, stem, bulb collar, shade bracket and boss (baked atlas);
  `shade`       the green cased-glass shell (baked atlas);
  `shade_glow`  the shade's underside, a separate surface the runtime can light (emissive factor, not baked);
  `bulb`        the tubular bulb (emissive factor, not baked);
  `pull_chain`  a short brass bead chain with a small pull, pivoted where it hangs from the collar.

The shade's length runs along X, its opening faces down, and the chain hangs on the front (-Y here, +Z
after export). The footprint is centred on the origin.

Run: blender -b --factory-startup --python banker_lamp.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='banker-lamp', title="Banker's lamp", tier='hero', texture=1024, ao_distance=0.12)]

AXIS_Z = 0.318           # height of the shade's and the bulb's axis
R_OUT, R_IN = 0.0790, 0.0752
HALF_L = 0.150
BULB_HALF = 0.105


def base_and_stem():
    p = [(0.0, 0.0), (0.0905, 0.0, 0.0030), (0.0905, 0.0060), (0.0845, 0.0115, 0.0040), (0.0700, 0.0150), (0.0560, 0.0190),
         (0.0420, 0.0290), (0.0250, 0.0400), (0.0170, 0.0480), (0.0170, 0.0560),
         (0.0230, 0.0585, 0.0020), (0.0230, 0.0640), (0.0160, 0.0675, 0.0015), (0.0145, 0.0780)]
    p += geo.catmull2([(0.0145, 0.078), (0.0125, 0.115), (0.0110, 0.150)], per_seg=3)[1:]
    p += geo.bezier2((0.0110, 0.150), (0.0260, 0.152), (0.0260, 0.176), (0.0110, 0.178), n=6)[1:]
    p += [(0.0100, 0.190), (0.0098, 0.250), (0.0135, 0.254, 0.0020), (0.0135, 0.262), (0.0075, 0.266), (0.0072, 0.304), (0.0, 0.304)]
    return p


def collar():
    """A brass ring round the middle of the bulb (a lathe about X)."""
    prof = [(0.0125, -0.0175), (0.0165, -0.0175, 0.0010), (0.0165, 0.0175, 0.0010), (0.0125, 0.0175), (0.0125, -0.0175)]
    bm = geo.lathe(prof, segments=18)
    return geo.place(bm, (0.0, 0.0, AXIS_Z), (1.0, 0.0, 0.0))


def shade_shell():
    prof = [(R_IN, -HALF_L), (R_OUT, -HALF_L, 0.0014), (R_OUT, HALF_L, 0.0014), (R_IN, HALF_L, 0.0014), (R_IN, -HALF_L)]
    bm = geo.lathe(prof, segments=40, sweep_deg=190.0)
    return _arch(bm)


def shade_glow_surface():
    r = R_IN - 0.0004
    bm = geo.lathe([(r, HALF_L - 0.0006), (r, -HALF_L + 0.0006)], segments=40, sweep_deg=190.0)
    return _arch(bm)


def _arch(bm):
    """A lathe about Z swept 0..190 deg becomes an arch over the top of an X-long shade, opening downwards."""
    geo.rotate(bm, (0.0, 0.0, -5.0))
    geo.permute_axes(bm, ('z', 'x', 'y'))
    return geo.translate(bm, (0.0, 0.0, AXIS_Z))


def bulb():
    prof = [(0.0, -BULB_HALF), (0.0060, -BULB_HALF + 0.0020), (0.0105, -BULB_HALF + 0.0070), (0.0115, -BULB_HALF + 0.0150),
            (0.0115, BULB_HALF - 0.0150), (0.0105, BULB_HALF - 0.0070), (0.0060, BULB_HALF - 0.0020), (0.0, BULB_HALF)]
    bm = geo.lathe(prof, segments=16)
    return geo.place(bm, (0.0, 0.0, AXIS_Z), (1.0, 0.0, 0.0))


def bracket():
    """A brass rod from the collar up to a boss on the shade's crown: how the shade hangs."""
    rod = geo.lathe([(0.0, AXIS_Z + 0.015), (0.0032, AXIS_Z + 0.015), (0.0032, AXIS_Z + R_IN + 0.002), (0.0, AXIS_Z + R_IN + 0.002)], segments=8)
    boss = geo.lathe(geo.fillet_profile([(0.0, AXIS_Z + R_OUT - 0.0005), (0.0100, AXIS_Z + R_OUT - 0.0005, 0.0008), (0.0100, AXIS_Z + R_OUT + 0.0040, 0.0015),
                                          (0.0, AXIS_Z + R_OUT + 0.0046)]), segments=16)
    return rod, boss


def pull_chain():
    """Fourteen small beads hanging in a slightly lazy line, ending in a small brass pull. Short and plain."""
    parts = []
    ax, ay, az = 0.016, -0.0135, AXIS_Z - 0.012
    n, pitch = 14, 0.0050
    bead = [(0.0, -0.0019), (0.0019, 0.0), (0.0, 0.0019)]
    for k in range(n):
        z = az - 0.004 - k * pitch
        x = ax + 0.0012 * math.sin(k * 0.7)
        b = geo.lathe(bead, segments=6)
        parts.append(geo.translate(b, (x, ay, z)))
    zt = az - 0.004 - n * pitch - 0.004
    pull = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0030, 0.0), (0.0042, -0.0040, 0.0020), (0.0030, -0.0105), (0.0012, -0.0150), (0.0, -0.0156)][::1],
                                        step_deg=45), segments=10)
    parts.append(geo.translate(pull, (ax + 0.0012 * math.sin(n * 0.7), ay, zt)))
    return parts, (ax, ay, az)


def build(spec, root):
    brass = mats.brass('brass', age=0.8, seed=131.0, cav_dist=0.012, scratches=0.5, edge_radius=0.0016, spin=0.6, contrast=2.0, tarnish_bias=0.06,
                       spots=[dict(at=(0.0, 0.0, 0.13), radius=(0.02, 0.02, 0.04), strength=0.9),
                              dict(at=(0.0, -0.088, 0.008), radius=(0.04, 0.02, 0.015), strength=0.7),
                              dict(at=(0.016, -0.0135, 0.235), radius=(0.012, 0.012, 0.03), strength=0.9)])
    glass = mats.cased_glass('green cased glass', color='#0F4430', age=0.5, seed=132.0,
                             spots=[dict(at=(-0.115, -0.078, 0.262), radius=(0.04, 0.03, 0.03), strength=0.9),
                                    dict(at=(0.115, -0.078, 0.262), radius=(0.04, 0.03, 0.03), strength=0.8)])
    glow_shade = mats.glow('shade glow', color='#FFE0A0', base='#E7EBD3')
    glow_bulb = mats.glow('bulb', color='#FFE6B0', base='#F6EED6', roughness=0.25)

    # brass: base, stem, collar, rod and boss
    body = geo.lathe(geo.fillet_profile(base_and_stem(), step_deg=35), segments=36, seg_tol=0.0004, seg_floor=14)
    rod, boss = bracket()
    geo.merge(body, collar(), rod, boss)
    geo.set_material(body, 0)
    lamp_body = kit.add_part(root, 'lamp_body', body, [brass], sharp_deg=55)

    shade = geo.set_material(shade_shell(), 0)
    shade_obj = kit.add_part(root, 'shade', shade, [glass], sharp_deg=70, weighted=False)

    glow_obj = kit.add_part(root, 'shade_glow', geo.set_material(shade_glow_surface(), 0), [glow_shade], sharp_deg=70, weighted=False)
    bulb_obj = kit.add_part(root, 'bulb', geo.set_material(bulb(), 0), [glow_bulb], sharp_deg=70, weighted=False)

    pieces, pivot = pull_chain()
    chain = pieces[0]
    geo.merge(chain, *pieces[1:])
    geo.set_material(chain, 0)
    chain_obj = kit.add_part(root, 'pull_chain', chain, [brass], sharp_deg=60, weighted=False)
    geo.set_pivot(chain_obj, pivot)

    return Built(root, [lamp_body, shade_obj, glow_obj, bulb_obj, chain_obj], moving=['pull_chain'], stage='desk',
                 unbaked=[glow_obj, bulb_obj],
                 view=dict(target=(0, 0, 0.19), distance=1.35, azimuth=22),
                 detail=dict(target=(0.0, 0.0, 0.30), distance=0.4, azimuth=28, elevation=-7),
                 notes={'shade_glow': 'emissive factor warm white; the runtime scales it',
                        'bulb': 'emissive factor warm white; the runtime scales it',
                        'pull_chain': 'swings a few degrees about the vertical hang point; a tug moves it 6 mm down'})


if __name__ == '__main__':
    kit.run(PROPS, build)
