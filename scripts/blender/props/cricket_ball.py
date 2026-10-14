"""A cricket ball: red leather, a raised seam with six rows of stitching, 71 mm across.

Old and well loved: the shine has gone dull on one side and stayed on the other, the seam is rubbed
pale where fingers grip it, there are grass stains and a scuff, and a few stitches have gone grey.

The ball rests on y = 0 with its seam tilted; the stitching is drawn in the ball's own space.

Run: blender -b --factory-startup --python cricket_ball.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402
from propkit.nodes import hex_rgb, new_material, principled  # noqa: E402

PROPS = [dict(id='cricket-ball', title='Cricket ball', tier='small', texture=512, ao_distance=0.04)]

R = 0.03565
RIDGE = 0.0014   # height of the seam ridge
STITCHES = 46


def sphere_profile():
    pts = []
    n = 26
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        r = R * math.cos(a)
        z = R * math.sin(a)
        # raised seam: a ridge about 5 mm wide along the equator
        ridge = RIDGE * max(0.0, math.cos(min(abs(z) / 0.0026, 1.0) * math.pi / 2)) ** 1.5
        pts.append((max(r + ridge, 0.0), z))
    # put extra rings through the seam so the ridge has a shape
    extra = []
    for z in (-0.0030, -0.0021, -0.0012, -0.0004, 0.0004, 0.0012, 0.0021, 0.0030):
        r = math.sqrt(max(R * R - z * z, 0.0))
        ridge = RIDGE * max(0.0, math.cos(min(abs(z) / 0.0026, 1.0) * math.pi / 2)) ** 1.5
        extra.append((r + ridge, z))
    pts = [p for p in pts if abs(p[1]) > 0.0036] + extra
    pts.sort(key=lambda p: p[1])
    pts[0] = (0.0, pts[0][1])
    pts[-1] = (0.0, pts[-1][1])
    return pts


def leather():
    mat, ng = new_material('ball leather')
    pos = ng.position()
    po = ng.object_coords()
    p = ng.mapping(pos, location=(1.3, 4.1, 2.2))
    edge = ng.edge_mask(0.0012)
    big = ng.noise(p, scale=9.0, detail=5, roughness=0.6, distortion=0.5)
    grain = ng.noise(ng.mapping(po, location=(3.3, 1.1, 5.2)), scale=420.0, detail=2, roughness=0.55)
    _, _, oz = ng.separate_xyz(po)
    ox, oy, _ = ng.separate_xyz(po)
    phi = ng.math('ARCTAN2', oy, ox)
    # six rows of stitches: three each side of the seam, each stitch a short thread across it
    row = None
    for off in (0.0048, 0.0078, 0.0108):
        for sgn in (-1.0, 1.0):
            r = ng.threshold(ng.inv(ng.math('ABSOLUTE', ng.sub(oz, sgn * off))), 1.0 - 0.00055, 0.0003)
            row = r if row is None else ng.maxf(row, r)
    dash = ng.threshold(ng.math('ABSOLUTE', ng.math('SINE', ng.mul(phi, STITCHES / 2.0))), 0.72, 0.16)
    # the stitches are not a perfect rank: some pairs lean
    stitch = ng.mul(row, dash)
    leather_red = hex_rgb('#6A1812')
    worn_red = hex_rgb('#92402F')
    col = ng.mix(ng.mul(big, 0.5), leather_red, hex_rgb('#4A0F0B'))
    scuff = ng.threshold(ng.noise(ng.mapping(po, location=(7.0, 1.0, 3.0)), scale=14.0, detail=4), 0.74, 0.1)
    col = ng.mix(ng.mul(scuff, 0.6), col, worn_red)
    # grass stain, low on one side, and chalky seam rubbed pale
    stain = ng.threshold(ng.noise(ng.mapping(po, location=(2.0, 9.0, 1.0)), scale=11.0, detail=3), 0.7, 0.12)
    col = ng.mix(ng.mul(stain, 0.5), col, hex_rgb('#4A5A24'))
    seam_wear = ng.mul(ng.threshold(ng.inv(ng.math('ABSOLUTE', oz)), 1.0 - 0.0040, 0.0020), ng.madd(big, 0.8, 0.3))
    col = ng.mix(ng.clamp01(ng.mul(seam_wear, 0.6)), col, hex_rgb('#B5755E'))
    thread = ng.mix(ng.mul(big, 0.6), hex_rgb('#CFC4A8'), hex_rgb('#7A7466'))
    col = ng.mix(stitch, col, thread)
    # shine survives on one half of the ball
    shine = ng.map_range(ox, -R, R, 0.0, 1.0)
    rough = ng.madd(shine, 0.18, 0.36)
    rough = ng.add(rough, ng.madd(grain, 0.12, -0.06))
    rough = ng.add(rough, ng.mul(scuff, 0.18))
    rough = ng.mixf(stitch, rough, 0.85)
    height = ng.add(ng.mul(grain, 0.4), ng.mul(stitch, 1.6))
    normal = ng.bump(height, strength=0.9, distance=0.0011)
    principled(mat, ng, col, ng.clamp01(rough), metallic=0.0, normal=normal)
    return mat


def build(spec, root):
    mat = leather()
    bm = geo.lathe(sphere_profile(), segments=30)
    obj = kit.add_part(root, 'ball', bm, mat, location=(0.0, 0.0, R + RIDGE), sharp_deg=70, weighted=False)
    obj.rotation_euler = (math.radians(26.0), math.radians(14.0), math.radians(10.0))
    return Built(root, [obj], moving=[], stage='desk',
                 view=dict(target=(0, 0, 0.036), distance=1.0, azimuth=28, lens=120),
                 detail=dict(target=(0.0, 0.0, 0.036), distance=0.4, azimuth=22, elevation=22))


if __name__ == '__main__':
    kit.run(PROPS, build)
