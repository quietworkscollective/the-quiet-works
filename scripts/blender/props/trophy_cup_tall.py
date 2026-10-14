"""Tall two-handled loving cup with cover: Edwardian silver plate, for the corridor trophy cabinet.

A turned body (foot, knop, ovoid bowl with a blank engraving band between two reeds, domed cover and
acorn finial) and two strap handles swept along their own curves, each rooted on a round pad. The
band is left smooth for a label.

Run: blender -b --factory-startup --python trophy_cup_tall.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='trophy-cup-tall', title='Tall two-handled cup', tier='hero', texture=1024, ao_distance=0.1)]

SEGMENTS = 56
SEG_TOL = 0.00028
BAND = (0.1475, 0.1925)  # z range of the blank engraving band


def interp_r(poly, z):
    for (r0, z0), (r1, z1) in zip(poly, poly[1:]):
        if z0 <= z <= z1:
            t = 0.0 if abs(z1 - z0) < 1e-12 else (z - z0) / (z1 - z0)
            return r0 + (r1 - r0) * t
    return poly[-1][0]


def add_reeds(poly, zs, radius):
    """Insert half-round reeds into a monotonic (r, z) polyline at the given heights."""
    out = list(poly)
    for z in sorted(zs):
        r0 = interp_r(out, z)
        kept = [p for p in out if not (z - radius * 1.1 <= p[1] <= z + radius * 1.1)]
        idx = next(i for i, p in enumerate(kept) if p[1] > z)
        kept[idx:idx] = geo.bead(r0 - radius * 0.25, z, radius, n=3)
        out = kept
    return out


def body_profile():
    p = [(0.0, 0.0), (0.0535, 0.0, 0.0011), (0.0556, 0.0036), (0.0556, 0.0056, 0.0014)]
    p += geo.bezier2((0.0526, 0.0078), (0.0420, 0.0095), (0.0315, 0.0125), (0.0300, 0.0245), n=4)
    p += geo.bead(0.0300, 0.0268, 0.0017, n=3)[1:]
    p += [(0.0176, 0.0298, 0.0020), (0.0150, 0.0352), (0.0150, 0.0445)]
    p += geo.bezier2((0.0150, 0.0445), (0.0300, 0.0470), (0.0300, 0.0740), (0.0150, 0.0765), n=6)[1:]
    p += [(0.0150, 0.0880), (0.0178, 0.0895, 0.0010), (0.0178, 0.0912)]
    p += geo.bead(0.0182, 0.0932, 0.0017, n=3)
    p += [(0.0215, 0.0960, 0.0025)]
    bowl = geo.catmull2([(0.0300, 0.0975), (0.0470, 0.1090), (0.0640, 0.1300), (0.0745, 0.1600), (0.0752, 0.1850),
                         (0.0705, 0.2080), (0.0690, 0.2220), (0.0715, 0.2330)], per_seg=2)
    p += add_reeds(bowl, BAND, 0.0013)[1:]
    return p


def cover_profile():
    p = [(0.0716, 0.2330), (0.0722, 0.2338), (0.0722, 0.2352, 0.0008)]
    dome = geo.bezier2((0.0700, 0.2368), (0.0700, 0.2470), (0.0460, 0.2560), (0.0300, 0.2612), n=7)
    p += add_reeds(dome, (0.2412, 0.2452), 0.0010)
    p += [(0.0255, 0.2635, 0.0015), (0.0125, 0.2655, 0.0025)]
    p += [(0.0100, 0.2700), (0.0100, 0.2745)]
    p += geo.bezier2((0.0100, 0.2745), (0.0230, 0.2760), (0.0230, 0.3000), (0.0080, 0.3020), n=6)[1:]
    p += [(0.0040, 0.3090), (0.0, 0.3115)]
    return p


def handle(side):
    pts = [(0.0600, 0.2080), (0.0745, 0.2155), (0.0905, 0.2215), (0.1040, 0.2065), (0.1112, 0.1760),
           (0.1110, 0.1450), (0.1010, 0.1200), (0.0820, 0.1050), (0.0630, 0.1020), (0.0440, 0.1085)]
    path = geo.catmull3([(x * side, 0.0, z) for x, z in pts], per_seg=3)

    def section(t):
        # a strap: wide across the curve, thin along it; fuller at the thumb piece and the lower root
        width = 0.0072 - 0.0020 * math.sin(math.pi * t) + 0.0016 * math.exp(-((t - 0.22) / 0.07) ** 2)
        thick = 0.0042 - 0.0007 * math.sin(math.pi * t)
        return thick, width

    return geo.sweep(path, section, sides=8, up=(0, 1, 0))


def pad(side, at, normal):
    prof = geo.fillet_profile([(0.0, 0.0), (0.0100, 0.0, 0.0005), (0.0100, 0.0014), (0.0, 0.0018)], step_deg=60)
    bm = geo.lathe(prof, segments=12, seg_tol=0.0003)
    return geo.place(bm, (at[0] * side, at[1], at[2]), (normal[0] * side, normal[1], normal[2]))


def build(spec, root):
    silver = mats.silver_plate(
        'silver', age=0.4, seed=2.0, rub=0.28, rough_lo=0.17, rough_hi=0.46, spin=0.8, cav_dist=0.012, cav_power=0.7, cav_gain=1.1,
        bright='#EBEBE7', mid='#BDBCB8', bands=[(BAND[0] + 0.002, BAND[1] - 0.002, 0.07, 0.94)],
        solder=[dict(at=(0.0415, 0.0, 0.1075), radius=(0.012, 0.012, 0.007))],
        spots=[dict(at=(0.108, 0.0, 0.165), radius=(0.014, 0.014, 0.04)), dict(at=(-0.108, 0.0, 0.165), radius=(0.014, 0.014, 0.04)),
               dict(at=(0.0, 0.0, 0.292), radius=(0.016, 0.016, 0.016))])
    bp, cp = geo.fillet_profile(body_profile()), geo.fillet_profile(cover_profile())
    def dent(r, z, th):
        # a shallow knock on the bowl, the kind a cup gets from a decade in a cupboard
        d = math.hypot((z - 0.168) / 0.016, (math.remainder(th - math.radians(-62), 2 * math.pi) * r) / 0.014)
        return r - 0.0009 * math.exp(-d * d) if 0.14 < z < 0.2 else r

    body = geo.lathe(bp, segments=SEGMENTS, seg_tol=SEG_TOL, radial=dent)
    cover = geo.lathe(cp, segments=SEGMENTS, seg_tol=SEG_TOL)
    # hand-spun silver is never quite round: a swell of a third of a millimetre across a few centimetres
    geo.wobble(body, 0.00035, 0.04, seed=2.0)
    geo.wobble(cover, 0.0003, 0.05, seed=3.0)
    geo.merge(body, cover)
    parts = [handle(+1), handle(-1)]
    for side in (+1, -1):
        parts.append(pad(side, (0.0700, 0.0, 0.2105), (1.0, 0.0, 0.18)))
        parts.append(pad(side, (0.0440, 0.0, 0.1090), (0.70, 0.0, -0.45)))
    geo.merge(body, *parts)
    cup = kit.add_part(root, 'cup', body, silver)
    print(f'  rings body/cover {len(bp)}/{len(cp)}')
    return Built(root, [cup], moving=[], stage='shelf',
                 view=dict(target=(0, 0, 0.16), distance=0.95, azimuth=32),
                 detail=dict(target=(0.0, 0.0, 0.17), distance=0.4, azimuth=28, elevation=7))


if __name__ == '__main__':
    kit.run(PROPS, build)
