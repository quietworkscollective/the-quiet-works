"""A cricket bat, 850 mm: pale willow blade with a flat face and a spined back, cane handle bound with
twine, black rubber grip. Oiled, ball-marked in dull red, edges softened by seasons of use, the grip
polished where hands close and the toe wrapped in cloth tape.

Standing on its toe; the face looks towards +Z after export.

Run: blender -b --factory-startup --python cricket_bat.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='cricket-bat', title='Cricket bat', tier='hero', texture=1024, ao_distance=0.08)]

# (height, full width, full thickness) down the blade, toe to shoulder
STATIONS = [(0.000, 0.040, 0.016), (0.005, 0.072, 0.023), (0.016, 0.096, 0.030), (0.045, 0.1055, 0.036), (0.100, 0.108, 0.040),
            (0.200, 0.108, 0.041), (0.300, 0.108, 0.0415), (0.400, 0.108, 0.0425), (0.455, 0.105, 0.0440), (0.495, 0.096, 0.0450),
            (0.530, 0.078, 0.0440), (0.560, 0.058, 0.0400), (0.585, 0.042, 0.0350), (0.605, 0.034, 0.0320)]
FACE_Y = -0.0165   # the flat face
BLADE_RINGS = sorted(set([z for z, _, _ in STATIONS] + [0.012, 0.030, 0.040, 0.046, 0.146, 0.150, 0.154, 0.184, 0.188, 0.192, 0.246, 0.250]))
Z_HANDLE = 0.585


def interp(t_z):
    for a, b in zip(STATIONS, STATIONS[1:]):
        if a[0] <= t_z <= b[0]:
            k = (t_z - a[0]) / (b[0] - a[0])
            return [a[i] + (b[i] - a[i]) * k for i in (1, 2)]
    return [STATIONS[-1][1], STATIONS[-1][2]]


def blade():
    path = [(0.0, 0.0, z) for z in BLADE_RINGS]
    top = STATIONS[-1][0]

    def section(t):
        z = t * top
        w, th = interp(z)
        # cloth tape: a binding over a crack above the toe, and a guard at the toe itself
        bump = 0.0016 * max(0.0, min(1.0, (z - 0.148) / 0.004, (0.188 - z) / 0.004)) + 0.0012 * max(0.0, min(1.0, (0.044 - z) / 0.004))
        w, th = w + 2 * bump, th + 2 * bump
        # the section is centred so its front extreme sits on the flat face plane
        return th / 2.0, w / 2.0, FACE_Y + th / 2.0 - bump

    bm = geo.sweep(path, section, sides=18, up=(0, 1, 0), cap_start=True, cap_end=False, squareness=0.8)
    for v in bm.verts:
        # flatten the front: a bat's face is planar, only its back is bellied
        v.co.y = max(v.co.y, FACE_Y + 0.0035)
    return bm


def handle_profile():
    p = [(0.0, Z_HANDLE - 0.010), (0.0150, Z_HANDLE - 0.010), (0.0150, Z_HANDLE + 0.010)]
    # twine binding where the handle meets the blade: three raised turns
    for z in (0.612, 0.622, 0.632):
        p += geo.bead(0.0150, z, 0.0045, n=3)
    p += [(0.0150, 0.640), (0.0158, 0.646, 0.003), (0.0166, 0.660)]
    # rubber grip with shallow rings
    for z in range(0, 8):
        zz = 0.676 + z * 0.0225
        p += [(0.0170, zz - 0.006), (0.0176, zz - 0.003), (0.0176, zz + 0.003), (0.0170, zz + 0.006)]
    p += [(0.0166, 0.838), (0.0160, 0.844, 0.003), (0.0120, 0.850), (0.0, 0.8505)]
    return p


def build(spec, root):
    willow = mats.wood('willow', light='#B38E60', dark='#70492A', axis='Z', ring_freq=170.0, warp=4.5, wander=0.06, roughness=0.6,
                       age=0.85, seed=51.0, pore=0.4, relief=0.06, edge_lift=0.08, contrast=1.0, polish=0.1, rough_range=(0.5, 0.75),
                       spots=[dict(at=(0.0, FACE_Y, 0.21), radius=(0.05, 0.02, 0.09)), dict(at=(0.0, 0.0, 0.62), radius=(0.04, 0.04, 0.04))],
                       decals=[dict(at=(0.0, FACE_Y, 0.285), half=(0.040, 0.01, 0.100), color='#9B6F3E', strength=0.32, rough=0.52),
                               dict(at=(0.012, FACE_Y, 0.255), radius=(0.014, 0.01, 0.009), color='#7A3A2C', strength=0.55),
                               dict(at=(-0.022, FACE_Y, 0.30), radius=(0.011, 0.01, 0.007), color='#7A3A2C', strength=0.4),
                               dict(at=(0.0, FACE_Y, 0.37), half=(0.032, 0.01, 0.036), color='#D9CBA7', strength=0.9, rough=0.7),
                               dict(at=(0.0, FACE_Y, 0.37), half=(0.026, 0.01, 0.030), color='#A64B35', strength=0.35),
                               # the cane handle's splice: a V of darker cane let into the face below the shoulders
                               dict(at=(0.0, FACE_Y, 0.505), tri=(0.016, -0.060), color='#B58C52', strength=0.9, rough=0.55)])
    cane = mats.wood('cane', light='#C79A58', dark='#7D5428', axis='Z', ring_freq=200.0, warp=2.0, wander=0.01, roughness=0.55, age=0.7,
                     seed=52.0, relief=0.05, polish=0.1, spots=[dict(at=(0.0, 0.0, 0.62), radius=(0.04, 0.04, 0.03))])
    grip = mats.painted('rubber grip', color='#1D1B1A', roughness=0.72, age=0.8, seed=53.0, substrate='#3B3633', chip_amount=0.1,
                        metal_substrate=False, cav_dist=0.006, rub_color=(0.12, 0.11, 0.1, 1.0),
                        spots=[dict(at=(0.0, 0.0, 0.73), radius=(0.03, 0.03, 0.06), strength=0.9)])
    twine = mats.fabric('twine', color='#B79B6A', age=0.6, seed=54.0, weave=False, roughness=0.92, mottle=0.3)
    tape = mats.fabric('toe tape', color='#CBC5B3', age=0.8, seed=55.0, weave=False, roughness=0.9, mottle=0.4)

    bl = geo.assign_material(blade(), lambda c: 4 if (c.z < 0.046 or 0.150 < c.z < 0.1905) else 0)
    hd = geo.lathe(geo.fillet_profile(handle_profile(), step_deg=40), segments=18, seg_tol=0.0003, seg_floor=12)
    # cane below the twine, twine at the splice, rubber from the grip's foot to the cap
    geo.assign_material(hd, lambda c: 1 if c.z < 0.608 else (3 if c.z < 0.645 else 2))
    geo.merge(bl, hd)
    bat = kit.add_part(root, 'bat', bl, [willow, cane, grip, twine, tape], sharp_deg=55)
    # centre the footprint
    return Built(root, [bat], moving=[], stage='floor',
                 view=dict(target=(0, 0, 0.42), distance=2.0, azimuth=28),
                 detail=dict(target=(0.0, FACE_Y, 0.25), distance=0.4, azimuth=18, elevation=10))


if __name__ == '__main__':
    kit.run(PROPS, build)
