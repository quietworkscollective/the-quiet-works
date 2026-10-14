"""Books for shelves and desks, from one shared material.

  book-row-60   twenty-two books across 0.60 m of shelf;
  book-row-90   thirty-four books across 0.90 m;
  book-stack    five books lying in a loose pile, spines to the front;
  book-open     a book open at a spread on a desk, with a ribbon marker.

A row is built as three merged meshes sharing one atlas. Books differ in height, thickness, depth and
lean (the last few lean on their neighbours), in cloth or leather, in colour and in sun-fade, in gilt
bands and blank labels; each is a plain bevelled block, and the decoration is drawn by the shared material
from per-book mesh attributes (see mats.bookshelf). Only what shows is kept: backs, undersides and faces
pressed against neighbours are deleted. The open book's pages carry faint ruled lines, never words.

The row's backs sit against the shelf; the footprint is centred on the origin, the books stand on y = 0
after export and the spines face +Z.

Run: blender -b --factory-startup --python book_rows.py -- --work <dir> [--only id] [--res N]
"""
import math
import os
import random
import sys

import bmesh
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from propkit import Built, geo, kit, mats  # noqa: E402

PROPS = [
    dict(id='book-row-60', title='Row of books, 0.6 m of shelf', tier='hero', texture=1024, kind='row', length=0.60, count=22, seed=11,
         ao_distance=0.1),
    dict(id='book-row-90', title='Row of books, 0.9 m of shelf', tier='hero', texture=1024, kind='row', length=0.90, count=34, seed=23,
         ao_distance=0.1),
    dict(id='book-stack', title='Short stack of books', tier='small', texture=512, kind='stack', seed=5, ao_distance=0.08),
    dict(id='book-open', title='Open book', tier='small', texture=512, kind='open', seed=7, ao_distance=0.06),
]


def tag(bm, bk, T, H, stack_axis='x'):
    """Write the per-book attributes the shared material reads (all in the book's own standing frame)."""
    bkL = bm.faces.layers.float.get('bk') or bm.faces.layers.float.new('bk')
    btL = bm.faces.layers.float.get('bt') or bm.faces.layers.float.new('bt')
    bzL = bm.verts.layers.float.get('bz') or bm.verts.layers.float.new('bz')
    bxL = bm.verts.layers.float.get('bx') or bm.verts.layers.float.new('bx')
    blL = bm.verts.layers.float.get('bl') or bm.verts.layers.float.new('bl')
    for v in bm.verts:
        v[bzL] = max(0.0, min(1.0, v.co.z / H))
        v[bxL] = max(0.0, min(1.0, v.co.x / T + 0.5))
        v[blL] = v.co.x if stack_axis == 'x' else v.co.z
    for f in bm.faces:
        f[bkL] = bk
        f[btL] = 1.0 if abs(f.normal.z) > 0.7 else 0.0
    return bm


def standing_book(bk, T, H, D, rng):
    """A block with a rounded spine (the two front vertical edges) and softened head and tail at the front."""
    bm = geo.box((T, D, H), center=(0.0, 0.0, H / 2))
    # boards are never dead flat: give the block a few vertices to bend, and bend it a hair
    geo.refine(bm, 0.07)
    geo.wobble(bm, 0.0006, 0.16, seed=bk * 41.0, axes='xy')
    on_front = lambda e: all(abs(v.co.y + D / 2) < 1e-5 for v in e.verts)
    vertical = [e for e in bm.edges if on_front(e) and abs(e.verts[0].co.z - e.verts[1].co.z) > H * 0.5]
    bmesh.ops.bevel(bm, geom=vertical, offset=min(T * 0.32, 0.007), offset_type='OFFSET', segments=3, profile=0.5, affect='EDGES',
                    clamp_overlap=True)
    across = [e for e in bm.edges if on_front(e) and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6 and abs(e.verts[0].co.x - e.verts[1].co.x) > 1e-6]
    bmesh.ops.bevel(bm, geom=across, offset=0.0018, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES', clamp_overlap=True)
    geo.mark_auto(bm, True)
    return tag(bm, bk, T, H)


def prune_hidden(bm, back=True):
    """Delete undersides and (for shelf work) backs: nobody sees them."""
    doomed = [f for f in bm.faces if f.normal.z < -0.7 or (back and f.normal.y > 0.7)]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    return bm


def lift_to_floor(bm):
    z = min(v.co.z for v in bm.verts)
    return geo.translate(bm, (0.0, 0.0, -z))


def choose_book(rng):
    kind = rng.random()
    if kind < 0.18:     # a big tome
        return rng.uniform(0.040, 0.062), rng.uniform(0.30, 0.345), rng.uniform(0.21, 0.255)
    if kind < 0.55:     # an ordinary volume
        return rng.uniform(0.020, 0.040), rng.uniform(0.225, 0.285), rng.uniform(0.15, 0.20)
    if kind < 0.85:     # a slim one
        return rng.uniform(0.011, 0.024), rng.uniform(0.19, 0.26), rng.uniform(0.13, 0.18)
    return rng.uniform(0.014, 0.03), rng.uniform(0.15, 0.19), rng.uniform(0.11, 0.15)    # a small one


def build_row(spec, root, slots):
    rng = random.Random(spec['seed'])
    n, length = spec['count'], spec['length']
    sizes = [choose_book(rng) for _ in range(n)]
    lean_from = n - rng.randint(3, 4)
    total = sum(s[0] for s in sizes) + 0.0007 * (n - 1) + 0.010
    k = (length - 0.045) / total      # the leaning group takes a little extra room
    books = []
    x = 0.0                       # right edge of the last standing book
    lean_deg = 5.0 + rng.uniform(0.0, 3.0)
    prev_cx = prev_T = None
    for i, (T, H, D) in enumerate(sizes):
        T *= k
        bk = rng.random()
        bm = standing_book(bk, T, H, D, rng)
        # one book now and then is pulled forward a centimetre
        pull = rng.choice((0.0, 0.0, 0.0, 0.006, 0.012))
        if i >= lean_from:
            # the last few lean towards their neighbour, all at about one angle so they stack like cards
            a = math.radians(lean_deg + rng.uniform(-0.4, 0.4))
            geo.rotate(bm, (0.0, -math.degrees(a), 0.0))
            if prev_cx is None:
                cx = x + (T / 2) * math.cos(a) + H * math.sin(a)      # its top corner just touches the last upright book
            else:
                cx = prev_cx + (prev_T / 2 + T / 2) / math.cos(a)
            prev_cx, prev_T = cx, T
            lift_to_floor(bm)
            geo.translate(bm, (cx, 0.12 - D / 2 - pull, 0.0))
        else:
            geo.translate(bm, (x + T / 2, 0.12 - D / 2 - pull, 0.0))
            x += T + rng.uniform(0.0003, 0.0010)
        books.append(prune_hidden(bm))
    # recentre the whole row
    xs = [v.co.x for b in books for v in b.verts]
    ys = [v.co.y for b in books for v in b.verts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    for b in books:
        geo.translate(b, (-cx, -cy, 0.0))
    # three merged meshes
    thirds = [books[: n // 3], books[n // 3: 2 * n // 3], books[2 * n // 3:]]
    objs = []
    for name, group in zip(('row_left', 'row_middle', 'row_right'), thirds):
        merged = group[0]
        geo.merge(merged, *group[1:])
        objs.append(kit.add_part(root, name, merged, slots, sharp_deg=55, weighted=False))
    return objs


def build_stack(spec, root, slots):
    rng = random.Random(spec['seed'])
    sizes = [(0.034, 0.285, 0.205), (0.046, 0.255, 0.19), (0.026, 0.235, 0.17), (0.040, 0.275, 0.205), (0.022, 0.20, 0.15)]
    z = 0.0
    books = []
    for i, (T, H, D) in enumerate(sizes):
        bm = standing_book(rng.random(), T, H, D, rng)
        # lie it on its side: the spine stays on the front face, its top (bz = 1) points along +X
        geo.rotate(bm, (0.0, 90.0, 0.0))
        geo.translate(bm, (-H / 2, 0.0, 0.0))
        lift_to_floor(bm)
        geo.rotate(bm, (0.0, 0.0, rng.uniform(-6.0, 6.0)))
        geo.translate(bm, (rng.uniform(-0.012, 0.012), rng.uniform(-0.008, 0.008), z))
        z += T + 0.0004
        books.append(prune_hidden(bm, back=False))
    merged = books[0]
    geo.merge(merged, *books[1:])
    geo.translate(merged, (0.0, 0.0, 0.0))
    return [kit.add_part(root, 'stack', merged, slots, sharp_deg=55, weighted=False)]


def page_curl(bm, rng):
    """An open book's leaves are not flat: they sag toward the gutter, and the fore-edge corners lift and flutter."""
    geo.refine(bm, 0.025)
    seed = rng.random() * 50.0
    for v in bm.verts:
        if v.co.z < 0.0045:
            continue
        u = min(1.0, abs(v.co.x) / 0.2)
        w = min(1.0, abs(v.co.y) / 0.128)
        lift = 0.0032 * (u ** 1.5) * (w ** 2.4) + 0.0011 * noise.noise(v.co * 21.0 + Vector((seed, 0.0, 0.0))) * u * (0.4 + w)
        v.co.z += lift
    return bm


def build_open(spec, root, slots):
    rng = random.Random(spec['seed'])
    bk = 0.42
    parts = []
    # boards and spine
    for sx in (-1, 1):
        b = geo.box((0.206, 0.268, 0.0035), center=(sx * 0.103, 0.0, 0.00175), bevel=0.0014, segs=1)
        parts.append(b)
    parts.append(geo.box((0.014, 0.268, 0.0030), center=(0.0, 0.0, 0.0015)))

    def top(u):
        return 0.0035 + 0.0170 - 0.0115 * math.exp(-u / 0.030) + 0.0030 * (u / 0.2) ** 2

    for sx in (-1, 1):
        us = [0.004 + (0.196) * (i / 14) for i in range(15)]
        if sx > 0:
            outline = [(0.004, 0.0035), (0.200, 0.0035)] + [(u, top(u)) for u in reversed(us)]
        else:
            outline = [(-0.200, 0.0035), (-0.004, 0.0035)] + [(-u, top(u)) for u in us]
        block = geo.slab(outline, 0.128, -0.128, open_back=False)
        parts.append(block)
    ribbon = geo.box((0.007, 0.050, 0.0006), center=(0.040, -0.150, 0.0128), bevel=0.0002, segs=1)
    geo.rotate(ribbon, (0.0, 0.0, 8.0), pivot=(0.040, -0.128, 0.0128))
    parts.append(ribbon)
    merged = parts[0]
    geo.merge(merged, *parts[1:])
    page_curl(merged, rng)
    bkL = merged.faces.layers.float.get('bk') or merged.faces.layers.float.new('bk')
    btL = merged.faces.layers.float.get('bt') or merged.faces.layers.float.new('bt')
    bzL = merged.verts.layers.float.get('bz') or merged.verts.layers.float.new('bz')
    bxL = merged.verts.layers.float.get('bx') or merged.verts.layers.float.new('bx')
    blL = merged.verts.layers.float.get('bl') or merged.verts.layers.float.new('bl')
    for v in merged.verts:
        v[bzL] = 0.3
        v[bxL] = 0.5
        v[blL] = v.co.z
    for f in merged.faces:
        f[bkL] = bk
        c = f.calc_center_median()
        if c.z > 0.006 and f.normal.z > 0.5:
            f[btL] = 2.0          # a page face
        elif c.z > 0.0036 and c.z < 0.02 and abs(f.normal.z) < 0.7:
            f[btL] = 1.0          # the edge of the page block
        else:
            f[btL] = 0.0
    prune_hidden(merged, back=False)
    return [kit.add_part(root, 'book', merged, slots, sharp_deg=55, weighted=False)]


def build(spec, root):
    zones = [dict(at=(sx * 0.100, 0.0, 0.012), half=(0.078, 0.108, 0.03)) for sx in (-1, 1)] if spec['kind'] == 'open' else ()
    mat = mats.bookshelf('books', seed=spec['seed'] * 1.7, age=0.65, text_zones=zones)
    slots = [mat]
    if spec['kind'] == 'row':
        objs = build_row(spec, root, slots)
        view = dict(target=(0, 0, 0.15), distance=2.0, azimuth=16)
        detail = dict(target=(spec['length'] * 0.18, -0.1, 0.18), distance=0.4, azimuth=10, elevation=6)
    elif spec['kind'] == 'stack':
        objs = build_stack(spec, root, slots)
        view = dict(target=(0, 0, 0.08), distance=1.2, azimuth=-26)
        detail = dict(target=(0.0, -0.1, 0.1), distance=0.4, azimuth=-22, elevation=16)
    else:
        objs = build_open(spec, root, slots)
        view = dict(target=(0, 0, 0.01), distance=1.15, azimuth=14)
        detail = dict(target=(-0.06, 0.0, 0.012), distance=0.4, azimuth=10, elevation=40)
    return Built(root, objs, moving=[], stage='desk' if spec['kind'] != 'row' else 'shelf', view=view, detail=detail)


if __name__ == '__main__':
    kit.run(PROPS, build)
