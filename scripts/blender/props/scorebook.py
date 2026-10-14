"""A cloth-bound cricket scorebook, lying flat with its spine to the left.

The front cover is its own node, pivoted on the hinge along the spine (rotate about the hinge axis to open
it, which shows an endpaper, then a ruled scoring page). Navy bookcloth, brown leather corners, a blank
title label, a red ribbon marker out of the tail, and the cloth rubbed pale at the corners and along
the spine where it has been picked up for many seasons.

The footprint is centred on the origin; the cover's hinge runs along Z after export, at the spine.

Run: blender -b --factory-startup --python scorebook.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [dict(id='scorebook', title='Cloth-bound scorebook', tier='small', texture=512, ao_distance=0.06)]

W, D = 0.215, 0.330          # a board: width (x) and head-to-tail (y)
BOARD = 0.0032
BLOCK = 0.0200
SPINE_R = 0.0150
Z_BLOCK0 = BOARD
Z_BLOCK1 = BOARD + BLOCK
Z_COVER0 = Z_BLOCK1 + 0.0005
Z_COVER1 = Z_COVER0 + BOARD
HINGE_X = -W / 2 + 0.002
HINGE_Z = (Z_COVER0 + Z_COVER1) / 2


def corner(x, y, z0, z1, sx, sy, leg=0.036):
    """A triangular leather corner lying over the board's corner (sx, sy = which corner)."""
    bm = bmesh.new()
    geo._layers(bm, True)
    pts = [(x, y), (x - sx * leg, y), (x, y - sy * leg)]
    top = [bm.verts.new((px, py, z1)) for px, py in pts]
    bot = [bm.verts.new((px, py, z0)) for px, py in pts]
    order = top if sx * sy > 0 else top[::-1]
    bm.faces.new(order)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new([bot[i], bot[j], top[j], top[i]] if sx * sy > 0 else [bot[j], bot[i], top[i], top[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    geo.bevel_by_angle(bm, 0.0005, segs=1, min_deg=40)
    geo.mark_auto(bm, True)
    return bm


def build(spec, root):
    cloth = mats.fabric('navy bookcloth', color='#27303F', age=0.7, seed=71.0, weave=False, roughness=0.92, nap=0.4, edge_radius=0.0025,
                        rub_edges=1.0, fray=(0.55, 0.57, 0.62), mottle=0.3,
                        spots=[dict(at=(-W / 2 + 0.002, 0.0, Z_BLOCK1 / 2), radius=(0.012, 0.15, 0.014), strength=0.8),
                               dict(at=(W / 2, -D / 2, Z_COVER1), radius=(0.05, 0.05, 0.01), strength=0.7)])
    leather = mats.painted('leather corners', color='#4A2E1E', roughness=0.6, age=0.8, seed=72.0, substrate='#7A5638', chip_amount=0.3,
                           metal_substrate=False, cav_dist=0.004, edge_radius=0.0003, rub_color=(0.3, 0.19, 0.12, 1.0), grime='#0A0604',
                           spots=[dict(at=(W / 2, -D / 2, Z_COVER1), radius=(0.04, 0.04, 0.01), strength=0.9)])
    page = mats.paper('page block', tone='#E9E0C8', age=0.6, seed=73.0, stack_axis='Z', page_pitch=0.0016, edge_radius=0.0012)
    endpaper = mats.paper('endpaper', tone='#D9D0B8', age=0.5, seed=74.0, edge_radius=0.0012)
    label = mats.paper('title label', tone='#E8DFC4', age=0.7, seed=75.0, edge_radius=0.0008)
    ribbon = mats.fabric('ribbon', color='#8A2327', age=0.5, seed=76.0, weave=False, roughness=0.5, nap=0.2, edge_radius=0.0004, mottle=0.2)

    # the body: back board, page block, rounded spine
    back = geo.set_material(geo.box((W, D, BOARD), center=(0.0, 0.0, BOARD / 2), bevel=0.0012, segs=2), 0)
    block = geo.assign_material(geo.box((W - 0.012, D - 0.010, BLOCK), center=(0.0035, 0.0, (Z_BLOCK0 + Z_BLOCK1) / 2), bevel=0.0007, segs=1), lambda c: 2)
    spine = geo.set_material(geo.box((0.017, D, Z_COVER1), center=(-W / 2 + 0.0015, 0.0, Z_COVER1 / 2),
                                      bevel=0.0060, segs=4, selector=lambda e: abs(e.verts[0].co.y - e.verts[1].co.y) > 0.1), 0)
    tail_ribbon = geo.set_material(geo.box((0.0075, 0.075, 0.0006), center=(0.040, -D / 2 - 0.0225, Z_BLOCK1 - 0.002), bevel=0.0002, segs=1), 5)
    geo.rotate(tail_ribbon, (-7.0, 0.0, 3.0), pivot=(0.040, -D / 2 + 0.01, Z_BLOCK1 - 0.002))
    corners_back = [geo.set_material(corner(W / 2, sy * D / 2, 0.0, BOARD + 0.0004, 1, sy), 1) for sy in (-1, 1)]
    geo.merge(back, block, spine, tail_ribbon, *corners_back)
    body = kit.add_part(root, 'book', back, [cloth, leather, page, endpaper, label, ribbon], sharp_deg=55)

    # the front cover, hinged at the spine; its inside faces down, so its inner face carries the endpaper
    board = geo.box((W, D, BOARD), center=(0.0, 0.0, (Z_COVER0 + Z_COVER1) / 2), bevel=0.0012, segs=2)
    for f in board.faces:
        f.material_index = 3 if f.normal.z < -0.5 else 0
    tag = geo.set_material(geo.box((0.092, 0.052, 0.0006), center=(0.012, 0.085, Z_COVER1 + 0.0003), bevel=0.0002, segs=1), 4)
    corners = [geo.set_material(corner(W / 2, sy * D / 2, Z_COVER1 - 0.0004, Z_COVER1 + 0.0004, 1, sy), 1) for sy in (-1, 1)]
    geo.merge(board, tag, *corners)
    cover = kit.add_part(root, 'cover', board, [cloth, leather, page, endpaper, label, ribbon], sharp_deg=55)
    geo.set_pivot(cover, (HINGE_X, 0.0, HINGE_Z))

    return Built(root, [body, cover], moving=['cover'], stage='desk',
                 view=dict(target=(0, 0, 0.01), distance=1.35, azimuth=24, lens=70),
                 detail=dict(target=(W / 2 - 0.03, -D / 2 + 0.03, 0.02), distance=0.4, azimuth=-24, elevation=24),
                 notes={'cover': 'rotates about its own Y axis (Z after export) at the spine; about 170 degrees to open'})


if __name__ == '__main__':
    kit.run(PROPS, build)
