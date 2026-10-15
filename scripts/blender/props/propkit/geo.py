"""Geometry builders: turned profiles, bevelled blocks, swept tubes and the mesh finishing that
makes bevels catch light (angle-split smoothing plus face-weighted normals).

Everything is built with bmesh in metres, Z up, then exported Y up.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector


# ---------------------------------------------------------------------------------------------
# 2D profile helpers (r, z) for lathe work
# ---------------------------------------------------------------------------------------------

def fillet_profile(points, step_deg=32.0, min_segs=2):
    """Turn [(r, z) | (r, z, fillet_radius)] into a dense polyline with true circular fillets.

    A point with a radius is rounded; plain points stay as written. The result is a list of (r, z).
    """
    pts = [(float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0) for p in points]
    out = []
    for i, (x, y, rad) in enumerate(pts):
        if rad <= 0.0 or i == 0 or i == len(pts) - 1:
            out.append((x, y))
            continue
        P = Vector((x, y))
        A = Vector(pts[i - 1][:2])
        B = Vector(pts[i + 1][:2])
        u = (A - P)
        v = (B - P)
        lu, lv = u.length, v.length
        if lu < 1e-9 or lv < 1e-9:
            out.append((x, y))
            continue
        u.normalize()
        v.normalize()
        cos_t = max(-1.0, min(1.0, u.dot(v)))
        theta = math.acos(cos_t)
        if theta < 1e-3 or abs(theta - math.pi) < 1e-3:
            out.append((x, y))
            continue
        t = rad / math.tan(theta / 2.0)
        # Neighbouring fillets share a segment, so each may claim at most half of it.
        t_max = min(lu * (0.5 if pts[i - 1][2] > 0 and i - 1 > 0 else 1.0),
                    lv * (0.5 if pts[i + 1][2] > 0 and i + 1 < len(pts) - 1 else 1.0))
        if t > t_max:
            t = t_max
            rad = t * math.tan(theta / 2.0)
        T1 = P + u * t
        T2 = P + v * t
        bis = (u + v).normalized()
        C = P + bis * (rad / math.sin(theta / 2.0))
        a1 = math.atan2(T1.y - C.y, T1.x - C.x)
        a2 = math.atan2(T2.y - C.y, T2.x - C.x)
        sweep = a2 - a1
        while sweep > math.pi:
            sweep -= 2 * math.pi
        while sweep < -math.pi:
            sweep += 2 * math.pi
        n = max(min_segs, int(math.ceil(abs(math.degrees(sweep)) / step_deg)))
        for k in range(n + 1):
            a = a1 + sweep * k / n
            out.append((C.x + rad * math.cos(a), C.y + rad * math.sin(a)))
    return dedupe_polyline(out)


def bead(r, z, radius, n=6, outward=True):
    """Half-round moulding as (r, z) points, rising from (r, z - radius) to (r, z + radius) and bulging
    outward (or inward). Drop it into a profile where a wall should carry a bead or a reed."""
    pts = []
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        pts.append((r + (radius if outward else -radius) * math.cos(a), z + radius * math.sin(a)))
    return pts


def circle_profile(R, r, n=8):
    """A closed circle of radius `r` centred at (R, 0), as a lathe profile: spun about Z it is a torus."""
    return [(R + r * math.cos(math.radians(-90 + 360.0 * k / n)), r * math.sin(math.radians(-90 + 360.0 * k / n)))
            for k in range(n + 1)]


def dedupe_polyline(pts, eps=1e-7):
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > eps or abs(p[1] - out[-1][1]) > eps:
            out.append((p[0], p[1]))
    return out


def bezier2(p0, p1, p2, p3, n=12, include_first=True):
    """Cubic Bezier through 2D control points; returns n+1 points (or n without the first)."""
    out = []
    for k in range(0 if include_first else 1, n + 1):
        t = k / n
        mt = 1 - t
        x = mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0]
        y = mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1]
        out.append((x, y))
    return out


def arc2(center, radius, a0_deg, a1_deg, n=10, include_first=True):
    out = []
    for k in range(0 if include_first else 1, n + 1):
        a = math.radians(a0_deg + (a1_deg - a0_deg) * k / n)
        out.append((center[0] + radius * math.cos(a), center[1] + radius * math.sin(a)))
    return out


def catmull2(points, per_seg=6):
    """Catmull-Rom spline through 2D points (centripetal-ish, uniform here); returns a dense polyline."""
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return [(p.x, p.y) for p in pts]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(per_seg):
            t = k / per_seg
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((q.x, q.y))
    out.append((pts[-1].x, pts[-1].y))
    return out


def catmull3(points, per_seg=8):
    """Catmull-Rom spline through 3D points as Vectors."""
    pts = [Vector(p) for p in points]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(per_seg):
            t = k / per_seg
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1].copy())
    return out


def bezier3(p0, p1, p2, p3, n=16):
    p0, p1, p2, p3 = (Vector(p) for p in (p0, p1, p2, p3))
    out = []
    for k in range(n + 1):
        t = k / n
        mt = 1 - t
        out.append(mt ** 3 * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t ** 3 * p3)
    return out


def offset_polyline(pts, d):
    """Shift an (r, z) polyline sideways by `d` metres. For a profile that runs bottom to top along an
    outer wall, positive `d` moves outward and negative moves inward."""
    out = []
    n = len(pts)
    for i in range(n):
        a = Vector(pts[max(i - 1, 0)])
        b = Vector(pts[i])
        c = Vector(pts[min(i + 1, n - 1)])
        t1 = (b - a)
        t2 = (c - b)
        if t1.length < 1e-12:
            t1 = t2
        if t2.length < 1e-12:
            t2 = t1
        n1 = Vector((t1.y, -t1.x)).normalized()
        n2 = Vector((t2.y, -t2.x)).normalized()
        nn = (n1 + n2)
        nn = nn.normalized() if nn.length > 1e-9 else n1
        # mitre: widen the offset so the wall keeps its thickness through a bend
        k = max(0.4, nn.dot(n1))
        out.append((b.x + nn.x * d / k, b.y + nn.y * d / k))
    return out


def shell_profile(outer, thickness, lip_segs=6, floor_z=None, inner_trim=0, inner_stride=1):
    """Close an outer wall profile (bottom to top) into a hollow vessel profile.

    The wall is offset inward by `thickness`, the rim is closed with a half-round lip, and the inner
    wall runs back down to `floor_z` on the axis. Returns the full closed polyline for `lathe`.
    """
    inner = offset_polyline(outer, -thickness)
    top = Vector(outer[-1])
    itop = Vector(inner[-1])
    mid = (top + itop) / 2.0
    half = (top - itop).length / 2.0
    # lip: half-round bridging outer top to inner top
    direction = (top - itop)
    base_angle = math.atan2(direction.y, direction.x)
    lip = []
    for k in range(1, lip_segs):
        a = base_angle + math.pi * k / lip_segs
        lip.append((mid.x + half * math.cos(a) * 1.0, mid.y + half * math.sin(a) * 1.0 + 0.0))
    inner_down = list(reversed(inner))
    if inner_stride > 1:
        # the inside of a vessel is smooth: it can carry fewer rings than the outside, which holds the mouldings
        inner_down = inner_down[::inner_stride] + ([inner_down[-1]] if (len(inner_down) - 1) % inner_stride else [])
    if inner_trim:
        inner_down = inner_down[:-inner_trim]
    bottom_z = floor_z if floor_z is not None else inner_down[-1][1]
    return list(outer) + lip + inner_down + [(0.0, bottom_z)]


# ---------------------------------------------------------------------------------------------
# Lathe
# ---------------------------------------------------------------------------------------------

def ring_segments(r, tol, cap, floor=10):
    """Even segment count that keeps a ring's chord sag under `tol` metres (never more than `cap`)."""
    if r < 1e-7:
        return 1
    ratio = max(-1.0, min(1.0, 1.0 - tol / r))
    n = math.pi / max(math.acos(ratio), 1e-6)
    n = int(math.ceil(n / 2.0) * 2)
    return max(floor, min(cap, n))


def lathe(profile, segments=48, uv_scale=1.0, name='lathe', axis_xy=(0.0, 0.0), z0=0.0, flip=False, sweep_deg=360.0,
          radial=None, seg_tol=None, seg_floor=10):
    """Revolve a (r, z) polyline about the Z axis and return a bmesh with a cylindrical UV map.

    `segments` is the ring resolution. With `seg_tol` set, narrow rings get fewer segments (down to
    `seg_floor`) so the sag of every ring stays within `seg_tol` metres, and neighbouring rings of
    different counts are stitched with triangles; stems and finials stop paying for the bowl's detail.
    `radial(r, z, theta) -> r` bends the radius per vertex (gadroons, flutes, a dented rim).
    Points with r ~ 0 collapse to a single pole vertex, so a closed profile (axis to axis) gives a
    watertight solid. UVs are metric: u runs round the circumference at the profile's largest radius,
    v follows arc length, so texel density stays roughly even.
    """
    bm = bmesh.new()
    uv_layer, _flag = _layers(bm, False)
    if any(len(p) > 2 for p in profile):
        profile = fillet_profile(profile)
    pts = [(float(r), float(z) + z0) for r, z in profile]
    full = abs(sweep_deg - 360.0) < 1e-6
    if seg_tol and full:
        counts = [ring_segments(r, seg_tol, segments, seg_floor) for r, _ in pts]
    else:
        counts = [1 if r < 1e-7 else segments for r, _ in pts]
    rings = []
    for (r, z), m in zip(pts, counts):
        if m == 1:
            rings.append([bm.verts.new((axis_xy[0], axis_xy[1], z))])
            continue
        n_verts = m if full else m + 1
        ring = []
        for j in range(n_verts):
            a = math.radians(sweep_deg) * j / m
            rr = radial(r, z, a) if radial else r
            ring.append(bm.verts.new((axis_xy[0] + rr * math.cos(a), axis_xy[1] + rr * math.sin(a), z)))
        rings.append(ring)
    arc = [0.0]
    for i in range(1, len(pts)):
        arc.append(arc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    r_ref = max(max(p[0] for p in pts), 1e-6)
    circ = 2 * math.pi * r_ref * (sweep_deg / 360.0) * uv_scale
    arc = [a * uv_scale for a in arc]

    def make_face(items):
        """items: [(vert, u_fraction, v)] in winding order for an upward-facing outside."""
        if flip:
            items = items[::-1]
        try:
            f = bm.faces.new([it[0] for it in items])
        except ValueError:
            return
        f.smooth = True
        for loop, it in zip(f.loops, items):
            loop[uv_layer].uv = (it[1] * circ, it[2])

    def vert(ring, idx, m):
        return ring[idx % m] if full else ring[idx]

    for i in range(len(pts) - 1):
        A, B = rings[i], rings[i + 1]
        ma, mb = counts[i], counts[i + 1]
        v0, v1 = arc[i], arc[i + 1]
        if ma == 1 and mb == 1:
            continue
        if ma == 1:
            for j in range(mb):
                make_face([(A[0], (j + 0.5) / mb, v0), (vert(B, j + 1, mb), (j + 1) / mb, v1), (vert(B, j, mb), j / mb, v1)])
        elif mb == 1:
            for j in range(ma):
                make_face([(vert(A, j, ma), j / ma, v0), (vert(A, j + 1, ma), (j + 1) / ma, v0), (B[0], (j + 0.5) / ma, v1)])
        elif ma == mb:
            for j in range(ma):
                make_face([(vert(A, j, ma), j / ma, v0), (vert(A, j + 1, ma), (j + 1) / ma, v0),
                           (vert(B, j + 1, mb), (j + 1) / mb, v1), (vert(B, j, mb), j / mb, v1)])
        else:
            a = b = 0
            while a < ma or b < mb:
                adv_a = b >= mb or (a < ma and (a + 1) * mb <= (b + 1) * ma)
                if adv_a:
                    make_face([(vert(A, a, ma), a / ma, v0), (vert(A, a + 1, ma), (a + 1) / ma, v0), (vert(B, b, mb), b / mb, v1)])
                    a += 1
                else:
                    make_face([(vert(A, a, ma), a / ma, v0), (vert(B, b + 1, mb), (b + 1) / mb, v1), (vert(B, b, mb), b / mb, v1)])
                    b += 1
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    return bm


# ---------------------------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------------------------

def _layers(bm, auto):
    """Every builder gives its bmesh a UV layer and an `uvauto` face flag, so meshes from different
    builders merge cleanly: 1 means "smart-project me", 0 means the builder wrote real UVs."""
    uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    flag = bm.faces.layers.int.get('uvauto') or bm.faces.layers.int.new('uvauto')
    return uv, flag


def mark_auto(bm, auto=True):
    _, flag = _layers(bm, auto)
    for f in bm.faces:
        f[flag] = 1 if auto else 0
    return bm


def box(size, center=(0.0, 0.0, 0.0), bevel=0.0, segs=2, profile=0.5, selector=None):
    """A cuboid, optionally bevelled on every edge (or on edges chosen by `selector(edge) -> bool`)."""
    bm = bmesh.new()
    _layers(bm, True)
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel > 0:
        edges = [e for e in bm.edges if selector is None or selector(e)]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=segs, profile=profile,
                        affect='EDGES', clamp_overlap=True, loop_slide=True)
    translate(bm, center)
    mark_auto(bm, True)
    return bm


def translate(bm, offset):
    bmesh.ops.translate(bm, vec=Vector(offset), verts=bm.verts)
    return bm


def rotate(bm, euler_deg, pivot=(0.0, 0.0, 0.0)):
    from mathutils import Euler
    m = Euler([math.radians(a) for a in euler_deg], 'XYZ').to_matrix().to_4x4()
    p = Vector(pivot)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p) @ m @ Matrix.Translation(-p), verts=bm.verts)
    return bm


def permute_axes(bm, order=('z', 'x', 'y')):
    """Re-map axes as a proper rotation: the new x, y, z take the old components named in `order`.
    ('z', 'x', 'y') turns a part built about the Z axis into one about X with its x-y arc now in y-z."""
    idx = {'x': 0, 'y': 1, 'z': 2}
    m = Matrix.Identity(4)
    m[0][0] = m[1][1] = m[2][2] = 0.0
    for row, name in enumerate(order):
        m[row][idx[name]] = 1.0
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def place(bm, location, z_axis=(0.0, 0.0, 1.0), roll_deg=0.0):
    """Orient a part built around the Z axis so its +Z points along `z_axis`, then move it to `location`."""
    from mathutils import Quaternion
    q = Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(z_axis).normalized())
    m = Matrix.Translation(Vector(location)) @ q.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(roll_deg), 4, 'Z')
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def scale(bm, factors, pivot=(0.0, 0.0, 0.0)):
    p = Vector(pivot)
    m = Matrix.Diagonal((factors[0], factors[1], factors[2], 1.0))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p) @ m @ Matrix.Translation(-p), verts=bm.verts)
    return bm


def merge(*bms):
    """Append every bmesh after the first into the first (UV layers matched by name); frees the rest."""
    base = bms[0]
    for other in bms[1:]:
        tmp = bpy.data.meshes.new('_merge')
        other.to_mesh(tmp)
        other.free()
        base.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    return base


def boolean_cut(bm, cutters, operation='DIFFERENCE'):
    """Subtract (or intersect) bmesh cutters from `bm` with Blender's exact boolean; returns a new bmesh."""
    keep = {'mat': None}
    tmp = bpy.data.meshes.new('_bool')
    bm.to_mesh(tmp)
    obj = bpy.data.objects.new('_bool', tmp)
    bpy.context.scene.collection.objects.link(obj)
    junk = []
    for i, c in enumerate(cutters):
        cm = bpy.data.meshes.new(f'_cut{i}')
        c.to_mesh(cm)
        c.free()
        co = bpy.data.objects.new(f'_cut{i}', cm)
        bpy.context.scene.collection.objects.link(co)
        junk.append(co)
        mod = obj.modifiers.new(f'cut{i}', 'BOOLEAN')
        mod.operation = operation
        mod.solver = 'EXACT'
        mod.object = co
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    out = bmesh.new()
    out.from_mesh(obj.data)
    for o in junk + [obj]:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(data)
    bm.free()
    _layers(out, True)
    mark_auto(out, True)
    return out


def bevel_by_angle(bm, width, segs=2, min_deg=35.0, profile=0.5):
    """Round every edge sharper than `min_deg`. Use after booleans, so cut edges and block edges match."""
    lim = math.radians(min_deg)
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle() > lim]
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type='OFFSET', segments=segs, profile=profile, affect='EDGES',
                        clamp_overlap=True, loop_slide=True)
    return bm


def mirror_x(bm, merge_dist=1e-6):
    """Append an X mirror of `bm` (flipped winding) and weld the seam."""
    tmp = bpy.data.meshes.new('_mirror')
    bm.to_mesh(tmp)
    other = bmesh.new()
    other.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    for v in other.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(other, faces=other.faces)
    merge(bm, other)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    return bm


def inset_recess(bm, face, inset, depth):
    """Push a rectangular recess into `face` (negative depth sinks it) and return the new faces."""
    res = bmesh.ops.inset_region(bm, faces=[face], thickness=inset, depth=depth, use_even_offset=True, use_boundary=True)
    return res['faces']


def faces_facing(bm, direction, min_dot=0.9):
    d = Vector(direction).normalized()
    return [f for f in bm.faces if f.normal.dot(d) > min_dot]


def convex_edges(bm, min_deg=20.0):
    """Edges whose neighbouring faces fold outward by more than `min_deg`."""
    out = []
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle_signed() > math.radians(min_deg):
            out.append(e)
    return out


def offset_polygon(pts, d):
    """Inset a counter-clockwise (x, z) polygon by `d` metres (negative grows it). Mitred at each corner."""
    out = []
    n = len(pts)
    for i in range(n):
        a, b, c = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        t1, t2 = (b - a), (c - b)
        if t1.length < 1e-12 or t2.length < 1e-12:
            out.append((b.x, b.y))
            continue
        n1 = Vector((-t1.y, t1.x)).normalized()
        n2 = Vector((-t2.y, t2.x)).normalized()
        nn = n1 + n2
        nn = nn.normalized() if nn.length > 1e-9 else n1
        k = max(0.35, nn.dot(n1))
        out.append((b.x + nn.x * d / k, b.y + nn.y * d / k))
    return out


def slab(outline, y_back, y_front, bevel_front=0.0, bevel_back=0.0, segs=2, open_back=True):
    """A flat panel from a counter-clockwise (x, z) outline seen from the front (-Y).

    The front face is one n-gon; the back face is left out when `open_back` (it faces the wall). Front
    and back perimeter edges can be bevelled independently.
    """
    bm = bmesh.new()
    _layers(bm, True)
    n = len(outline)
    front = [bm.verts.new((x, y_front, z)) for x, z in outline]
    back = [bm.verts.new((x, y_back, z)) for x, z in outline]
    bm.faces.new(front)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([front[i], back[i], back[j], front[j]])
    if not open_back:
        bm.faces.new(back[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel_front > 0 or bevel_back > 0:
        fset, bset = set(front), set(back)
        edges = [e for e in bm.edges if (bevel_front > 0 and all(v in fset for v in e.verts))]
        if edges:
            bmesh.ops.bevel(bm, geom=edges, offset=bevel_front, offset_type='OFFSET', segments=segs, profile=0.5,
                            affect='EDGES', clamp_overlap=True)
        if bevel_back > 0:
            edges = [e for e in bm.edges if all(v in bset for v in e.verts)]
            if edges:
                bmesh.ops.bevel(bm, geom=edges, offset=bevel_back, offset_type='OFFSET', segments=segs, profile=0.5,
                                affect='EDGES', clamp_overlap=True)
    mark_auto(bm, True)
    return bm


# ---------------------------------------------------------------------------------------------
# Sweep
# ---------------------------------------------------------------------------------------------

def sweep(path, section, sides=14, cap_start=True, cap_end=True, up=(0.0, 0.0, 1.0), uv_scale=1.0, closed=False,
          twist_deg=0.0, squareness=1.0):
    """Extrude an elliptical section along a polyline of 3D points.

    `section` is (rx, ry) or a callable t in [0, 1] -> (rx, ry[, offset]): half-axes along the frame's
    normal and binormal, and an optional shift of the section's centre along the normal. `squareness` below 1 turns the ellipse towards a rounded rectangle (0.5 is a stout bar). Frames are parallel-transported so the tube does not twist on its own.
    """
    pts = [Vector(p) for p in path]
    n = len(pts)
    tangents = []
    for i in range(n):
        if closed:
            a, b = pts[(i - 1) % n], pts[(i + 1) % n]
        else:
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        t = (b - a)
        tangents.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    up_v = Vector(up)
    n0 = up_v - tangents[0] * up_v.dot(tangents[0])
    if n0.length < 1e-6:
        n0 = Vector((1, 0, 0)) - tangents[0] * tangents[0].x
    n0.normalize()
    normals = [n0]
    for i in range(1, n):
        prev_t, cur_t = tangents[i - 1], tangents[i]
        axis = prev_t.cross(cur_t)
        if axis.length > 1e-9:
            ang = math.asin(max(-1.0, min(1.0, axis.length)))
            if prev_t.dot(cur_t) < 0:
                ang = math.pi - ang
            rot = Matrix.Rotation(ang, 3, axis.normalized())
            nn = rot @ normals[-1]
        else:
            nn = normals[-1].copy()
        nn = nn - cur_t * nn.dot(cur_t)
        nn.normalize()
        normals.append(nn)

    bm = bmesh.new()
    uv_layer, _flag = _layers(bm, False)
    rings = []
    arc = [0.0]
    for i in range(1, n):
        arc.append(arc[-1] + (pts[i] - pts[i - 1]).length)
    total = max(arc[-1], 1e-9)
    for i in range(n):
        t = arc[i] / total
        sec = section(t) if callable(section) else section
        rx, ry = sec[0], sec[1]
        nrm = normals[i]
        bnm = tangents[i].cross(nrm).normalized()
        centre = pts[i] + nrm * (sec[2] if len(sec) > 2 else 0.0)
        tw = math.radians(twist_deg) * t
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides + tw
            c, sn = math.cos(a), math.sin(a)
            if squareness != 1.0:
                c = math.copysign(abs(c) ** squareness, c)
                sn = math.copysign(abs(sn) ** squareness, sn)
            ring.append(bm.verts.new(centre + nrm * (rx * c) + bnm * (ry * sn)))
        rings.append(ring)
    r_mean = max(*(section(0.5) if callable(section) else section), 1e-4)
    circ = 2 * math.pi * r_mean
    last = n if closed else n - 1
    for i in range(last):
        ra, rb = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            k1 = (k + 1) % sides
            f = bm.faces.new([ra[k], ra[k1], rb[k1], rb[k]])
            f.smooth = True
            u0, u1 = k / sides * circ * uv_scale, (k + 1) / sides * circ * uv_scale
            v0, v1 = arc[i] * uv_scale, arc[min(i + 1, n - 1)] * uv_scale
            for loop, uv in zip(f.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
                loop[uv_layer].uv = uv
    if not closed:
        for flag, ring, flip in ((cap_start, rings[0], True), (cap_end, rings[-1], False)):
            if flag:
                try:
                    f = bm.faces.new(ring[::-1] if flip else ring)
                    f.smooth = True
                    for loop in f.loops:
                        loop[uv_layer].uv = (0.0, 0.0)
                except ValueError:
                    pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------------------------------------------------------------------------------------------
# Finishing
# ---------------------------------------------------------------------------------------------

def set_material(bm, index):
    """Assign every face to material slot `index` (slots are the list passed to kit.add_part)."""
    for f in bm.faces:
        f.material_index = index
    return bm


def assign_material(bm, fn):
    """Give each face the material slot `fn(centre) -> int` returns (centre is the face's centre, a Vector)."""
    for f in bm.faces:
        f.material_index = int(fn(f.calc_center_median()))
    return bm


def mark_sharp(bm, angle_deg=50.0):
    """Smooth-shade everything, then cut the shading wherever neighbouring faces fold past `angle_deg`."""
    lim = math.radians(angle_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle() <= lim
        else:
            e.smooth = True
    return bm


def clean(bm, weld=1e-6):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def to_object(name, bm, collection=None, parent=None, location=(0.0, 0.0, 0.0), sharp_deg=50.0):
    """Turn a bmesh into a scene object (smoothing applied, bmesh freed)."""
    mark_sharp(bm, sharp_deg)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    obj.location = location
    if parent is not None:
        obj.parent = parent
    return obj


def weight_normals(obj, weight=60, thresh=0.01):
    """Face-area weighted normals so flat faces stay flat up to their bevel edge. Applied, not live."""
    mod = obj.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')
    mod.mode = 'FACE_AREA'
    mod.weight = weight
    mod.keep_sharp = True
    mod.thresh = thresh
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def set_pivot(obj, point):
    """Move the object's origin to `point` (world, object has no parent transform) without moving the shape."""
    p = Vector(point)
    obj.data.transform(Matrix.Translation(-p))
    obj.location = obj.location + p
    obj.data.update()


def triangle_count(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def refine(bm, max_edge):
    """Splits every edge longer than `max_edge` so a flat or sparse part has vertices to bend."""
    from math import ceil
    long_edges = [e for e in bm.edges if e.calc_length() > max_edge]
    if not long_edges:
        return bm
    bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=max(1, int(ceil(max(e.calc_length() for e in long_edges) / max_edge)) - 1), use_grid_fill=True)
    return bm


def wobble(bm, amp, wavelength, seed=0.0, axes='xyz'):
    """Pushes every vertex by a smooth, low-frequency noise: real objects are never perfectly true. `amp` is the
    peak shift in metres, `wavelength` the size of a swell in metres. Deterministic from `seed`."""
    from mathutils import noise
    off = Vector((seed * 1.713, seed * 2.371, seed * 3.119))
    for v in bm.verts:
        n = noise.noise_vector(v.co / wavelength + off)
        v.co.x += n.x * amp if 'x' in axes else 0.0
        v.co.y += n.y * amp if 'y' in axes else 0.0
        v.co.z += n.z * amp if 'z' in axes else 0.0
    return bm


def lean(bm, deg, pivot=(0.0, 0.0, 0.0), axis='x'):
    """Tilts a part a little about one axis, as a thing that has settled or been set down by hand."""
    e = {'x': (deg, 0.0, 0.0), 'y': (0.0, deg, 0.0), 'z': (0.0, 0.0, deg)}[axis]
    return rotate(bm, e, pivot)
