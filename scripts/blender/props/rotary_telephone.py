"""A rotary desk telephone of the late 1960s and 1970s: brown-black Bakelite, chrome finger wheel.

Nodes: `base` (body, cradle horns, bezel and plate, the coiled handset cord), `handset` (handle and
the two cups; pivot where it rests across the cradle) and `dial` (the finger wheel; its node is tilted
to the dial plane so it turns about its own local Z axis).

The long axis runs along X, the dial faces the front (-Y here, +Z after export). The Bakelite has taken
a few hairline scratches, the dial wheel is bright where fingers pull it round and the handset is polished where it is held.

Run: blender -b --factory-startup --python rotary_telephone.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='rotary-telephone', title='Rotary telephone', tier='hero', texture=1024, ao_distance=0.1)]

L, Wd, Ht = 0.215, 0.170, 0.095          # base: length (x), depth (y), height (z)
SLOPE_A = (-0.092, 0.010)                # (y, z) where the dial slope starts
SLOPE_B = (-0.012, 0.090)                # and where it meets the top plateau
SLOPE_N = Vector((0.0, -0.7071, 0.7071))
DIAL_C = Vector((0.0, (SLOPE_A[0] + SLOPE_B[0]) / 2, (SLOPE_A[1] + SLOPE_B[1]) / 2)) + SLOPE_N * 0.004
HANDSET_Z = 0.150
HANDSET_Y = 0.016


def base_body():
    """Two shells, as moulded: a low skirt and the main housing with its dial slope, split by a seam."""
    skirt = geo.box((L + 0.005, Wd + 0.005, 0.0120), center=(0.0, 0.0, 0.0060), bevel=0.0075, segs=3)
    z0 = 0.0128
    bm = geo.box((L, Wd, Ht - z0), center=(0.0, 0.0, z0 + (Ht - z0) / 2))
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    plane_co = Vector((0.0, (SLOPE_A[0] + SLOPE_B[0]) / 2, (SLOPE_A[1] + SLOPE_B[1]) / 2))
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=plane_co, plane_no=SLOPE_N, clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    geo.bevel_by_angle(bm, 0.0120, segs=4, min_deg=25, profile=0.62)
    geo.merge(bm, skirt)
    return bm


def horn(sx):
    bm = geo.box((0.030, 0.074, 0.048), center=(sx * 0.0765, 0.014, Ht + 0.020), bevel=0.0100, segs=3)
    return bm


def dial_wheel():
    """A finger wheel: disc with ten finger holes round it, a raised rim and a hub."""
    disc = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0462, 0.0, 0.0006), (0.0462, 0.0078, 0.0010), (0.0430, 0.0086), (0.0150, 0.0086),
                                         (0.0130, 0.0102, 0.0010), (0.0, 0.0108)]), segments=44)
    cutters = []
    for k in range(10):
        a = math.radians(40 + k * 27.0)
        cyl = geo.lathe([(0.0, -0.01), (0.0072, -0.01), (0.0072, 0.02), (0.0, 0.02)], segments=16)
        geo.translate(cyl, (0.0335 * math.cos(a), 0.0335 * math.sin(a), 0.0))
        cutters.append(cyl)
    wheel = geo.boolean_cut(disc, cutters)
    geo.bevel_by_angle(wheel, 0.0007, segs=1, min_deg=40)
    return wheel


def dial_plate():
    """Static bezel ring and card, under the finger wheel, in dial-plane coordinates (Z = plane normal)."""
    ring = geo.lathe(geo.fillet_profile([(0.0480, 0.0), (0.0510, 0.0, 0.0006), (0.0510, 0.0040, 0.0008), (0.0480, 0.0044, 0.0008), (0.0480, 0.0)]), segments=44)
    card = geo.lathe([(0.0, 0.0006), (0.0478, 0.0006), (0.0478, 0.0010), (0.0, 0.0010)], segments=40)
    finger_stop = geo.box((0.0100, 0.0060, 0.0090), center=(0.0430, -0.0215, 0.0065), bevel=0.0010, segs=1)
    geo.rotate(finger_stop, (0, 0, 28))
    return ring, card, finger_stop


def handset_path(sx0=-0.100, n=14):
    pts = []
    for k in range(n + 1):
        t = k / n
        x = sx0 + (-2 * sx0) * t
        z = HANDSET_Z + 0.030 * (1 - (2 * t - 1) ** 2) ** 0.8
        pts.append((x, HANDSET_Y, z))
    return pts


def handset_handle():
    path = handset_path()
    # long flat-oval grip with a waist, flaring into the cups
    def section(t):
        flare = math.exp(-((t - 0.0) / 0.07) ** 2) + math.exp(-((t - 1.0) / 0.07) ** 2)
        waist = 1.0 - 0.10 * math.exp(-((t - 0.5) / 0.22) ** 2)
        return 0.0145 * waist * (1 + 0.55 * flare), 0.0170 * waist * (1 + 0.5 * flare)

    return geo.sweep(path, section, sides=18, up=(0, 1, 0), cap_start=False, cap_end=False, squareness=0.9)


def cup(sx):
    """An earpiece or mouthpiece cup: a short dished cylinder whose open face looks down onto the cradle horn."""
    prof = geo.fillet_profile([(0.0, 0.0), (0.0305, 0.0, 0.0012), (0.0305, 0.0160, 0.0016), (0.0268, 0.0200, 0.0030), (0.0230, 0.0215), (0.0,0.0215)],
                              step_deg=35)
    bm = geo.lathe(prof, segments=34, seg_tol=0.0003)
    # open face down: the cup's local +Z (its back) points up and a little inward
    geo.rotate(bm, (180.0, 0.0, 0.0))
    geo.rotate(bm, (0.0, -sx * 10.0, 0.0))
    return bm


def coiled_cord():
    """A short coil from the handset's belly to the back of the base, where it dives in."""
    pts = []
    turns, per = 8, 7
    p0 = Vector((0.030, HANDSET_Y, HANDSET_Z - 0.012))
    p1 = Vector((0.062, 0.066, Ht - 0.004))
    for i in range(turns * per + 1):
        u = i / (turns * per)
        a = 2 * math.pi * turns * u
        slack = 0.026 * math.sin(math.pi * u)
        c = p0 + (p1 - p0) * u + Vector((0.0, 0.0, -slack))
        pts.append((c.x + 0.0095 * math.cos(a), c.y + 0.0095 * math.sin(a) * 0.5, c.z + 0.0095 * math.sin(a)))
    return geo.sweep(pts, (0.0023, 0.0023), sides=6, up=(0, 1, 0), cap_start=True, cap_end=True)


def build(spec, root):
    bakelite = mats.lacquer('bakelite', color='#1B1411', age=0.12, seed=111.0, roughness=0.3, edge_radius=0.0022, under='#5A4535', rub=0.3,
                         spots=[dict(at=(0.0, HANDSET_Y, HANDSET_Z + 0.030), radius=(0.05, 0.02, 0.012), strength=0.9),
                                dict(at=(0.0, -0.050, 0.025), radius=(0.1, 0.02, 0.012), strength=0.5)])
    chrome = mats.worn_metal('chrome', bright='#E6E8E8', mid='#BFC2C2', dull='#7D8080', deep='#2D2F2F', age=0.45, seed=112.0,
                             rough_lo=0.16, rough_hi=0.4, cav_dist=0.006, edge_radius=0.0012, scratches=0.15, grain=0.0,
                             spots=[dict(at=tuple(DIAL_C + Vector((0.0, 0.0, 0.0))), radius=(0.052, 0.052, 0.052), strength=0.6)])
    card = mats.paper('dial card', tone='#EFE9D8', age=0.2, seed=113.0)
    cord_m = mats.fabric('cord', color='#2E2622', age=0.6, seed=114.0, weave=False, roughness=0.6, nap=0.2, mottle=0.3)

    # --- base -------------------------------------------------------------------------------
    body = geo.set_material(base_body(), 0)
    horns = [geo.set_material(horn(sx), 0) for sx in (-1, 1)]
    feet = []
    for fx in (-0.085, 0.085):
        for fy in (-0.060, 0.060):
            f = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0110, 0.0, 0.0008), (0.0110, 0.0030), (0.0, 0.0034)]), segments=12)
            feet.append(geo.set_material(geo.translate(f, (fx, fy, 0.0)), 3))
    plungers = []
    for sx in (-1, 1):
        pl = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0070, 0.0, 0.0006), (0.0070, 0.0090), (0.0, 0.0094)]), segments=14, seg_floor=10)
        plungers.append(geo.set_material(geo.translate(pl, (sx * 0.026, 0.014, Ht)), 0))
    ring, card_bm, stop = dial_plate()
    for part, m in ((ring, 1), (card_bm, 2), (stop, 1)):
        geo.set_material(part, m)
        # these are built about the dial axis: tilt them onto the slope
        geo.place(part, tuple(DIAL_C), tuple(SLOPE_N))
    cord = geo.set_material(coiled_cord(), 3)
    geo.merge(body, *horns, *feet, *plungers, ring, card_bm, stop, cord)
    base = kit.add_part(root, 'base', body, [bakelite, chrome, card, cord_m], sharp_deg=55)

    # --- handset -----------------------------------------------------------------------------
    handle = geo.set_material(handset_handle(), 0)
    cups = []
    for sx in (-1, 1):
        c = geo.set_material(cup(sx), 0)
        geo.translate(c, (sx * 0.100, HANDSET_Y, HANDSET_Z - 0.004))
        cups.append(c)
    geo.merge(handle, *cups)
    handset = kit.add_part(root, 'handset', handle, [bakelite, chrome, card, cord_m], sharp_deg=55)
    geo.set_pivot(handset, (0.0, HANDSET_Y, HANDSET_Z))

    # --- dial ----------------------------------------------------------------------------------
    wheel = geo.set_material(dial_wheel(), 1)
    dial = kit.add_part(root, 'dial', wheel, [bakelite, chrome, card, cord_m], sharp_deg=45)
    dial.location = tuple(DIAL_C + SLOPE_N * 0.0046)
    dial.rotation_mode = 'QUATERNION'
    dial.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(SLOPE_N)

    return Built(root, [base, handset, dial], moving=['handset', 'dial'], stage='desk',
                 view=dict(target=(0, 0, 0.07), distance=1.0, azimuth=26, lens=85),
                 detail=dict(target=(0.0, -0.05, 0.06), distance=0.38, azimuth=18, elevation=22),
                 notes={'handset': 'lifts off the cradle; pivot where it rests',
                        'dial': 'rotates about its own local Z axis (the dial-plane normal)'})


if __name__ == '__main__':
    kit.run(PROPS, build)
