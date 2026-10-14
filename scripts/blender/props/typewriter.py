"""An office typewriter of the 1960s: a teal-grey enamel housing, four rows of round glass-topped keys in
chrome rings, a spacebar, a black platen between chrome end plates with knobs, a paper bail and a sheet of
blank paper, ribbon-spool covers, and a return lever.

Moving nodes: `carriage` (platen, end plates, knobs, bail and paper; slides along X), `return_lever`
(pivot at the carriage's left plate, swings forward and back) and `spacebar` (pivot at its back edge).
The key tops are blank: no letters, no marque.

The footprint is centred on the origin, the keyboard faces the front (-Y here, +Z after export).

Run: blender -b --factory-startup --python typewriter.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='typewriter', title='Office typewriter', tier='hero', texture=1024, ao_distance=0.12)]

# material slots shared by every part
TEAL, CHROME, GLASS, BLACK, PAPER = range(5)

W, Dp = 0.385, 0.372           # housing width (x) and depth (y)
Z_BASE, Z_TOP = 0.030, 0.158
DECK_A = Vector((-0.186, 0.058))       # (y, z) at the front foot of the keyboard slope
DECK_B = Vector((-0.040, 0.150))       # and where it meets the top plateau
DECK_DIR = (DECK_B - DECK_A).normalized()
DECK_N = Vector((-DECK_DIR.y, DECK_DIR.x))   # outward normal, (y, z) = (-, +)
DECK_N3 = (0.0, DECK_N.x, DECK_N.y)
PLATEN_Y, PLATEN_Z = 0.052, 0.200
PLATEN_R = 0.0205
HALF = 0.176                           # carriage end plates sit at +-HALF
KEY_R = 0.0098


def housing():
    bm = geo.box((W, Dp, Z_TOP - Z_BASE), center=(0.0, 0.0, (Z_BASE + Z_TOP) / 2))
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    plane_co = Vector((0.0, (DECK_A.x + DECK_B.x) / 2, (DECK_A.y + DECK_B.y) / 2))
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=plane_co, plane_no=Vector(DECK_N3), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    geo.bevel_by_angle(bm, 0.0140, segs=3, min_deg=25, profile=0.6)
    return geo.set_material(bm, TEAL)


def deck_point(s, x=0.0):
    p = DECK_A + DECK_DIR * s
    return (x, p.x, p.y)


def key_cap(size=1.0):
    """A round key: a thin black stem, a chrome ring, a cream glass top."""
    r = KEY_R * size
    prof = [(0.0036, 0.0), (0.0036, 0.0125), (r, 0.0132), (r, 0.0176), (r - 0.0014, 0.0190), (0.0, 0.0192)]
    bm = geo.lathe(prof, segments=9)

    def slot(c):
        rad = math.hypot(c.x, c.y)
        if c.z < 0.0127:
            return BLACK
        if c.z > 0.0185 and rad < r - 0.0012:
            return GLASS
        return BLACK

    return geo.assign_material(bm, slot)


def carriage_parts():
    """Everything that rides the carriage, in world coordinates."""
    parts = []
    platen = geo.lathe([(0.0, -0.170), (PLATEN_R, -0.170), (PLATEN_R, 0.170), (0.0, 0.170)], segments=24)
    geo.place(platen, (0.0, PLATEN_Y, PLATEN_Z), (1.0, 0.0, 0.0))
    parts.append(geo.set_material(platen, BLACK))
    for sx in (-1, 1):
        plate = geo.box((0.0100, 0.092, 0.058), center=(sx * HALF, PLATEN_Y + 0.010, PLATEN_Z - 0.014), bevel=0.0030, segs=2)
        parts.append(geo.set_material(plate, CHROME))
        shaft = geo.lathe([(0.0, 0.0), (0.0050, 0.0), (0.0050, 0.026), (0.0, 0.026)], segments=10)
        geo.place(shaft, (sx * (HALF + 0.004), PLATEN_Y, PLATEN_Z), (sx, 0.0, 0.0))
        parts.append(geo.set_material(shaft, CHROME))
        knob = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0225, 0.0, 0.0020), (0.0225, 0.0100, 0.0020), (0.0190, 0.0150, 0.0030),
                                             (0.0070, 0.0158), (0.0066, 0.0164), (0.0, 0.0164)]), segments=26)
        geo.place(knob, (sx * (HALF + 0.012), PLATEN_Y, PLATEN_Z), (sx, 0.0, 0.0))
        parts.append(geo.set_material(knob, BLACK))
        cap = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0090, 0.0, 0.0008), (0.0090, 0.0024), (0.0, 0.0030)]), segments=14)
        geo.place(cap, (sx * (HALF + 0.0285), PLATEN_Y, PLATEN_Z), (sx, 0.0, 0.0))
        parts.append(geo.set_material(cap, CHROME))
    rail = geo.box((2 * HALF + 0.010, 0.014, 0.012), center=(0.0, PLATEN_Y + 0.052, PLATEN_Z - 0.030), bevel=0.0030, segs=1)
    parts.append(geo.set_material(rail, CHROME))
    table = geo.box((2 * HALF - 0.016, 0.034, 0.0020), center=(0.0, PLATEN_Y - 0.040, PLATEN_Z - 0.020), bevel=0.0007, segs=1)
    geo.rotate(table, (-28.0, 0.0, 0.0), pivot=(0.0, PLATEN_Y - 0.040, PLATEN_Z - 0.020))
    parts.append(geo.set_material(table, CHROME))
    bail = geo.lathe([(0.0, -0.165), (0.0026, -0.165), (0.0026, 0.165), (0.0, 0.165)], segments=8)
    geo.place(bail, (0.0, PLATEN_Y - 0.027, PLATEN_Z + 0.012), (1.0, 0.0, 0.0))
    parts.append(geo.set_material(bail, CHROME))
    for bx in (-0.110, 0.0, 0.110):
        roller = geo.lathe(geo.fillet_profile([(0.0, -0.007), (0.0070, -0.007, 0.0010), (0.0070, 0.007, 0.0010), (0.0, 0.007)]), segments=12)
        geo.place(roller, (bx, PLATEN_Y - 0.027, PLATEN_Z + 0.012), (1.0, 0.0, 0.0))
        parts.append(geo.set_material(roller, BLACK))
    parts.append(paper_sheet())
    return parts


def paper_sheet():
    """A blank sheet wrapped over the platen's front and standing up behind its crown, leaning back a little."""
    rp = PLATEN_R + 0.0006
    pts = []
    for k in range(11):
        phi = math.radians(-118 + 120 * k / 10)    # 0 = crown, negative = towards the front
        pts.append(Vector((0.0, PLATEN_Y + rp * math.sin(phi), PLATEN_Z + rp * math.cos(phi))))
    top = pts[-1]
    for dy, dz in ((0.012, 0.016), (0.020, 0.046), (0.025, 0.080), (0.028, 0.105), (0.030, 0.132)):
        pts.append(top + Vector((0.0, dy, dz)))
    bm = geo.sweep(pts, (0.00025, 0.1080), sides=4, up=(0, 1, 0), cap_start=True, cap_end=True, squareness=0.2)
    return geo.set_material(bm, PAPER)


def build(spec, root):
    teal = mats.enamel('teal enamel', color='#41605F', age=0.65, seed=121.0, roughness=0.38, dust=0.5, streaks=0.2, variation=0.1, scuffs=0.8, smudge=0.6,
                       rub_color=(0.14, 0.2, 0.19, 1.0), chip_amount=0.55, rust=0.25, cav_dist=0.02,
                       spots=[dict(at=(-0.17, -0.1, 0.12), radius=(0.05, 0.05, 0.03), strength=0.5)])
    chrome = mats.worn_metal('chrome', bright='#E7E9E9', mid='#BFC3C3', dull='#7C8080', deep='#2B2D2D', age=0.5, seed=122.0,
                             rough_lo=0.16, rough_hi=0.4, cav_dist=0.006, edge_radius=0.0012, scratches=0.2, grain=0.0,
                             spots=[dict(at=(-0.208, PLATEN_Y, PLATEN_Z), radius=(0.012, 0.03, 0.03), strength=0.6)])
    glass = mats.painted('key tops', color='#E6E0CD', roughness=0.25, age=0.7, seed=123.0, yellowing=1.2, metal_substrate=False, cav_dist=0.004,
                         edge_radius=0.0012, grime='#1A1308', spec=0.5,
                         spots=[dict(at=(0.0, -0.13, 0.09), radius=(0.1, 0.03, 0.03), strength=0.5)])
    black = mats.lacquer('black parts', color='#171616', roughness=0.4, age=0.5, seed=124.0, under='#4A4036', rub=0.2)
    paper = mats.paper('typing paper', tone='#EAE3D0', age=0.3, seed=125.0)
    slots = [teal, chrome, glass, black, paper]

    # --- housing: shell, feet, spool covers, a blank badge and 46 keys, one static mesh -------------
    body = housing()
    parts = []
    rows = [(12, 0.150, 0.0), (11, 0.1275, 0.0045), (11, 0.105, 0.0100), (10, 0.0825, 0.0160)]
    for n, s, shift in rows:
        x0 = shift - (n - 1) * 0.0198 / 2
        for i in range(n):
            bm = key_cap()
            parts.append(geo.place(bm, deck_point(s, x0 + i * 0.0198), DECK_N3))
    for sx in (-1, 1):
        bm = key_cap(1.35)
        parts.append(geo.place(bm, deck_point(0.0825, sx * (0.0160 + 0.0891 + 0.0198 * 1.3)), DECK_N3))
    for fx in (-0.150, 0.150):
        for fy in (-0.140, 0.140):
            f = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0150, 0.0, 0.0010), (0.0150, 0.0050, 0.0015), (0.0, 0.0056)]), segments=12)
            parts.append(geo.set_material(geo.translate(f, (fx, fy, 0.0)), BLACK))
    for sx in (-1, 1):
        sp = geo.lathe(geo.fillet_profile([(0.0, 0.0), (0.0240, 0.0, 0.0010), (0.0240, 0.0100, 0.0030), (0.0200, 0.0140, 0.0030), (0.0, 0.0146)]),
                       segments=22)
        parts.append(geo.set_material(geo.translate(sp, (sx * 0.100, 0.020, Z_TOP - 0.001)), CHROME))
    parts.append(geo.set_material(geo.box((0.064, 0.016, 0.0012), center=(0.0, -0.022, Z_TOP + 0.0006), bevel=0.0005, segs=1), CHROME))
    geo.merge(body, *parts)
    housing_obj = kit.add_part(root, 'housing', body, slots, sharp_deg=55)

    # --- carriage ----------------------------------------------------------------------------------
    cp = carriage_parts()
    carriage_bm = cp[0]
    geo.merge(carriage_bm, *cp[1:])
    carriage = kit.add_part(root, 'carriage', carriage_bm, slots, sharp_deg=55)
    geo.set_pivot(carriage, (0.0, PLATEN_Y, PLATEN_Z))

    # --- return lever: a swept rod ending in a black bulb ----------------------------------------
    path = geo.catmull3([(-HALF - 0.004, PLATEN_Y - 0.004, PLATEN_Z + 0.012), (-0.196, PLATEN_Y - 0.030, PLATEN_Z + 0.020),
                         (-0.204, PLATEN_Y - 0.075, PLATEN_Z + 0.012), (-0.205, PLATEN_Y - 0.105, PLATEN_Z - 0.004)], per_seg=4)
    lever = geo.set_material(geo.sweep(path, (0.0035, 0.0035), sides=8, up=(0, 0, 1)), CHROME)
    tip = geo.lathe(geo.fillet_profile([(0.0, -0.011), (0.0070, -0.0100, 0.0030), (0.0085, 0.0), (0.0070, 0.0100, 0.0030), (0.0, 0.011)], step_deg=30), segments=12)
    geo.place(tip, (-0.205, PLATEN_Y - 0.113, PLATEN_Z - 0.008), (0.0, -0.3, -1.0))
    geo.merge(lever, geo.set_material(tip, BLACK))
    lever_obj = kit.add_part(root, 'return_lever', lever, slots, sharp_deg=55)
    geo.set_pivot(lever_obj, (-HALF - 0.004, PLATEN_Y - 0.004, PLATEN_Z + 0.012))

    # --- spacebar -----------------------------------------------------------------------------------
    bar = geo.box((0.150, 0.016, 0.011), center=(0.0, 0.0, 0.0), bevel=0.0035, segs=2)
    geo.set_material(bar, BLACK)
    centre = Vector(deck_point(0.045)) + Vector(DECK_N3) * 0.014
    geo.place(bar, tuple(centre), DECK_N3)
    bar_obj = kit.add_part(root, 'spacebar', bar, slots, sharp_deg=55)
    geo.set_pivot(bar_obj, tuple(centre + Vector((0.0, DECK_DIR.x, DECK_DIR.y)) * 0.008))

    return Built(root, [housing_obj, carriage, lever_obj, bar_obj], moving=['carriage', 'return_lever', 'spacebar'], stage='desk',
                 view=dict(target=(0, 0, 0.11), distance=1.35, azimuth=24, lens=70),
                 detail=dict(target=(0.0, -0.10, 0.10), distance=0.5, azimuth=18, elevation=26),
                 notes={'carriage': 'translates along X', 'return_lever': 'swings about its base, vertical axis',
                        'spacebar': 'pivots at its back edge; presses down about 4 mm'})


if __name__ == '__main__':
    kit.run(PROPS, build)
