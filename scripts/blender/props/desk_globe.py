"""A desk globe on a turned wooden stand, with a brass meridian ring.

Nodes: `stand` (the turned foot and column, the brass meridian ring and its pole bosses) and `globe` (the
sphere, its origin at its centre). The globe's polar axis is tilted 23.5 degrees from the vertical, and in
the shipped file the sphere's own local +Y is that polar axis, so it spins about its local Y axis.

The map is invented: continents, borders and a graticule drawn procedurally for this project. It is not any
real cartography, carries no place names and was copied from nothing. It is a varnished paper skin gone
amber, crazed in places, with a rubbed patch where a hand always spins it.

The footprint is centred on the origin and the foot stands on y = 0 after export.

Run: blender -b --factory-startup --python desk_globe.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mathutils import Vector  # noqa: E402

from propkit import Built, geo, kit, mats  # noqa: E402
from propkit.nodes import hex_rgb, new_material, principled  # noqa: E402

PROPS = [dict(id='desk-globe', title='Desk globe', tier='hero', texture=1024, ao_distance=0.15)]

R = 0.115                 # the globe
RING_R = 0.1215           # the brass meridian, a little outside it
TILT = math.radians(23.5)
CENTER = Vector((0.0, 0.0, 0.232))
AXIS = Vector((math.sin(TILT), 0.0, math.cos(TILT)))


def globe_material():
    mat, ng = new_material('invented map')
    pos = ng.position()
    po = ng.object_coords()
    ox, oy, oz = ng.separate_xyz(po)
    lat = ng.math('ARCSINE', ng.math('MINIMUM', ng.math('MAXIMUM', ng.mul(oz, 1.0 / R), -0.999), 0.999))
    lon = ng.math('ARCTAN2', oy, ox)
    d = ng.mapping(po, scale=(1.0 / R,) * 3, location=(2.3, 7.1, 4.4))
    # continents: warped fractal noise on the sphere, thresholded; a paler band is the continental shelf
    warp = ng.noise_vector(ng.mapping(po, scale=(5.0 / R * 0.5,) * 3, location=(9.0, 1.0, 3.0)), scale=1.0, detail=2.0)
    dv = ng.vec_math('ADD', d, ng.vec_math('SCALE', ng.vec_math('SUBTRACT', warp, (0.5, 0.5, 0.5)), scale=0.55))
    shape = ng.noise(dv, scale=1.35, detail=5, roughness=0.55)
    land = ng.threshold(shape, 0.53, 0.012)
    shelf = ng.threshold(shape, 0.47, 0.10)
    # countries: random cells on the land, coloured from an aged palette, with thin borders
    cells = ng.voronoi(ng.mapping(po, scale=(7.0 / R * 0.35,) * 3, location=(1.0, 2.0, 5.0)), scale=1.0, feature='F1', output='Color')
    cr, _, _ = ng.separate_color(cells)
    palette = ng.ramp(cr, [(0.0, hex_rgb('#C2A66C')), (0.2, hex_rgb('#A96A4E')), (0.4, hex_rgb('#869864')), (0.6, hex_rgb('#CDBE92')),
                            (0.8, hex_rgb('#9A7C4C')), (0.95, hex_rgb('#AE7F6E'))], interpolation='CONSTANT')
    border = ng.inv(ng.map_range(ng.voronoi(ng.mapping(po, scale=(7.0 / R * 0.35,) * 3, location=(1.0, 2.0, 5.0)), scale=1.0,
                                           feature='DISTANCE_TO_EDGE'), 0.0, 0.035, 0.0, 1.0))
    ocean = ng.mix(shelf, hex_rgb('#35605F'), hex_rgb('#668D88'))
    col = ng.mix(land, ocean, palette)
    col = ng.mix(ng.mul(ng.mul(border, land), 0.7), col, hex_rgb('#5A3C28'))
    # graticule: a line every 15 degrees, faint towards the poles, with a stronger equator
    fade = ng.map_range(ng.math('ABSOLUTE', lat), 1.30, 1.05, 0.0, 1.0)
    glat = ng.inv(ng.threshold(ng.math('ABSOLUTE', ng.math('SINE', ng.mul(lat, 12.0))), 0.07, 0.05))
    glon = ng.mul(ng.inv(ng.threshold(ng.math('ABSOLUTE', ng.math('SINE', ng.mul(lon, 12.0))), 0.05, 0.04)), fade)
    grat = ng.maxf(glat, glon)
    equator = ng.inv(ng.threshold(ng.math('ABSOLUTE', lat), 0.012, 0.006))
    col = ng.mix(ng.mul(grat, 0.45), col, hex_rgb('#4B3626'))
    col = ng.mix(ng.mul(equator, 0.8), col, hex_rgb('#3B2A1E'))
    # polar caps
    cap = ng.map_range(ng.math('ABSOLUTE', lat), 1.23, 1.28, 0.0, 1.0)
    col = ng.mix(cap, col, hex_rgb('#D8E0DA'))
    # amber varnish, crazing and a rubbed patch where a hand turns it
    big = ng.noise(ng.mapping(po, location=(3.0, 3.0, 3.0)), scale=14.0, detail=4, roughness=0.6)
    col = ng.mix(ng.mul(ng.madd(big, 0.6, 0.15), 0.9), col, (1.05, 0.80, 0.50, 1.0), blend='MULTIPLY')
    craze = ng.inv(ng.map_range(ng.voronoi(ng.mapping(po, scale=(30.0 / R * 0.3,) * 3, location=(5.0, 2.0, 8.0)), scale=1.0,
                                           feature='DISTANCE_TO_EDGE'), 0.0, 0.02, 0.0, 1.0))
    craze = ng.mul(craze, ng.threshold(ng.noise(ng.mapping(po, location=(1.0, 6.0, 2.0)), scale=10.0, detail=3), 0.55, 0.2))
    col = ng.mix(ng.mul(craze, 0.5), col, (0.32, 0.22, 0.12, 1.0), blend='MULTIPLY')
    hand = mats.touch_mask(ng, pos, [dict(at=(0.0, -R, CENTER.z), radius=(0.05, 0.03, 0.05), strength=0.8)])
    col = ng.mix(ng.mul(hand, 0.55), col, hex_rgb('#C9B890'))
    seam = ng.inv(ng.threshold(ng.math('ABSOLUTE', ng.sub(ng.math('ABSOLUTE', lon), math.pi)), 0.012, 0.01))
    col = ng.mix(ng.mul(seam, 0.35), col, hex_rgb('#8E7A58'))
    rough = ng.madd(big, 0.12, 0.34)
    rough = ng.sub(rough, ng.mul(hand, 0.08))
    rough = ng.add(rough, ng.mul(craze, 0.2))
    normal = ng.bump(ng.add(ng.mul(craze, -0.6), ng.mul(grat, 0.15)), strength=0.15, distance=0.0004)
    principled(mat, ng, col, ng.clamp01(rough), metallic=0.0, normal=normal, spec=0.55)
    return mat


def sphere_profile(n=20):
    pts = [(0.0, -R)]
    for k in range(1, n):
        a = -math.pi / 2 + math.pi * k / n
        pts.append((R * math.cos(a), R * math.sin(a)))
    pts.append((0.0, R))
    return pts


def stand_profile():
    p = [(0.0, 0.0), (0.0860, 0.0, 0.0030), (0.0860, 0.0110), (0.0800, 0.0180, 0.0040), (0.0620, 0.0220), (0.0480, 0.0300),
         (0.0420, 0.0400, 0.0030), (0.0280, 0.0440), (0.0200, 0.0500, 0.0030), (0.0160, 0.0620)]
    p += geo.bead(0.0165, 0.0690, 0.0042, n=3)
    p += [(0.0150, 0.0760), (0.0150, 0.0900), (0.0230, 0.0930, 0.0025), (0.0230, 0.1000), (0.0090, 0.1030), (0.0, 0.1030)]
    return p


def build(spec, root):
    wood = mats.wood('mahogany', light='#6E3F26', dark='#2E170C', axis='Z', ring_freq=150.0, warp=3.5, wander=0.05, roughness=0.6,
                     age=0.6, seed=141.0, relief=0.03, polish=0.1, edge_lift=0.1, contrast=0.9,
                     spots=[dict(at=(0.0, -0.085, 0.01), radius=(0.04, 0.02, 0.015), strength=0.5)])
    brass = mats.brass('brass ring', age=0.5, seed=142.0, cav_dist=0.01, edge_radius=0.0014, scratches=0.5, waviness=0.3,
                       spots=[dict(at=tuple(CENTER + Vector((0.0, 0.0, RING_R))), radius=(0.05, 0.02, 0.03), strength=0.8),
                              dict(at=tuple(CENTER + Vector((RING_R, 0.0, 0.0))), radius=(0.03, 0.02, 0.05), strength=0.7)])
    map_m = globe_material()

    foot = geo.lathe(stand_profile(), segments=36, seg_tol=0.0004, seg_floor=14)
    geo.set_material(foot, 0)
    ring = geo.lathe(geo.circle_profile(RING_R, 0.0034, 6), segments=44)
    geo.rotate(ring, (90.0, 0.0, 0.0))
    geo.translate(ring, tuple(CENTER))
    geo.set_material(ring, 1)
    # a short brass post from the column top up to the ring's lowest point
    post = geo.lathe([(0.0, 0.1000), (0.0065, 0.1000), (0.0065, CENTER.z - RING_R + 0.003), (0.0, CENTER.z - RING_R + 0.003)], segments=10)
    geo.set_material(post, 1)
    bosses = []
    for sign in (1, -1):
        c = CENTER + AXIS * (RING_R * sign)
        boss = geo.lathe(geo.fillet_profile([(0.0, -0.0040), (0.0085, -0.0040, 0.0010), (0.0085, 0.0040, 0.0010), (0.0, 0.0050)]), segments=14)
        geo.place(boss, tuple(c), tuple(AXIS * sign))
        bosses.append(geo.set_material(boss, 1))
    geo.merge(foot, ring, post, *bosses)
    stand = kit.add_part(root, 'stand', foot, [wood, brass], sharp_deg=55)

    sphere = geo.lathe(sphere_profile(26), segments=48)
    globe = kit.add_part(root, 'globe', sphere, [map_m], sharp_deg=80, weighted=False, location=tuple(CENTER))
    globe.rotation_mode = 'QUATERNION'
    globe.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(AXIS)
    return Built(root, [stand, globe], moving=['globe'], stage='desk',
                 view=dict(target=(0, 0, 0.19), distance=1.2, azimuth=22),
                 detail=dict(target=(0.0, -0.06, 0.24), distance=0.5, azimuth=18, elevation=10),
                 notes={'globe': 'spins about its local Y axis (its polar axis, tilted 23.5 degrees from vertical)'})


if __name__ == '__main__':
    kit.run(PROPS, build)
