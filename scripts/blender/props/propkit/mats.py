"""Procedural material recipes. Each returns a Blender material authored in Principled BSDF; the bake
step later turns the result into atlas textures, so anything here (wear, tarnish, grime, grain) ends
up as pixels in the shipped file.

Colours are written as designer hex (sRGB) and converted. Wear masks are in world space, so they
line up across parts of the same prop. `spots` are places hands touch: dicts with a world-space
`at` (x, y, z) and a `radius` (a number, or per-axis (rx, ry, rz)).
"""
from .nodes import hex_rgb, new_material, principled


def touch_mask(ng, pos, spots):
    """0..1 mask, 1 at each hand spot, smooth falloff to the radius. Returns a float socket or 0.0."""
    result = None
    for spot in spots or ():
        at = spot['at']
        rad = spot.get('radius', 0.03)
        if isinstance(rad, (int, float)):
            rad = (rad, rad, rad)
        delta = ng.vec_math('SUBTRACT', pos, tuple(at))
        scaled = ng.vec_math('MULTIPLY', delta, (1.0 / rad[0], 1.0 / rad[1], 1.0 / rad[2]))
        d = ng.vec_math('LENGTH', scaled)
        m = ng.map_range(d, 0.0, 1.0, 1.0, 0.0, smooth=True)
        m = ng.mul(m, spot.get('strength', 1.0))
        result = m if result is None else ng.maxf(result, m)
    return result if result is not None else 0.0


def box_mask(ng, pos, center, half, soft=0.25):
    """0..1 mask inside an axis-aligned box in world space, fading over `soft` of the half-extent."""
    delta = ng.vec_math('SUBTRACT', pos, tuple(center))
    dx, dy, dz = ng.separate_xyz(ng.vec_math('ABSOLUTE', delta))
    m = None
    for comp, h in ((dx, half[0]), (dy, half[1]), (dz, half[2])):
        t = ng.map_range(comp, h * (1.0 - soft), h, 1.0, 0.0)
        m = t if m is None else ng.minf(m, t)
    return m


def decal_mask(ng, pos, d):
    """A decal's 0..1 coverage: a box (`half`) or a soft ellipsoid (`radius`), in world space."""
    if 'tri' in d:
        # a triangle standing on its base at `at`, `tri` = (half width at the base, height); points up (or down for a negative height)
        hw, h = d['tri']
        ax, ay, az = d['at']
        px, py, pz = ng.separate_xyz(pos)
        t = ng.map_range(ng.sub(pz, az), 0.0, h, 1.0, 0.0)                     # 1 at the base, 0 at the tip
        within = ng.sub(ng.mul(t, hw), ng.math('ABSOLUTE', ng.sub(px, ax)))    # distance inside the sloping side
        edge = ng.map_range(within, 0.0, d.get('soft', 0.0015), 0.0, 1.0)
        near = ng.map_range(ng.math('ABSOLUTE', ng.sub(py, ay)), 0.012, 0.016, 1.0, 0.0)
        lo, hi = min(0.0, h), max(0.0, h)
        dz = ng.sub(pz, az)
        inz = ng.mul(ng.map_range(dz, lo, lo + 0.0008, 0.0, 1.0), ng.map_range(dz, hi - 0.0008, hi, 1.0, 0.0))
        return ng.mul(ng.mul(ng.mul(ng.clamp01(edge), near), inz), d.get('strength', 1.0))
    if 'half' in d:
        return ng.mul(box_mask(ng, pos, d['at'], d['half'], soft=d.get('soft', 0.08)), d.get('strength', 1.0))
    spot = dict(at=d['at'], radius=d['radius'], strength=d.get('strength', 1.0))
    return touch_mask(ng, pos, [spot])


def _seed_loc(seed):
    return (seed * 7.13, seed * 3.71, seed * 5.29)


def worn_metal(name, bright, mid, dull, deep, age=0.5, spots=(), seed=0.0, rough_lo=0.34, rough_hi=0.56,
               edge_radius=0.003, scratches=0.5, cav_dist=0.02, under=None, rub=0.0, tarnish_bias=0.0,
               metal_floor=0.72, spin=0.0, solder=(), cav_power=0.9, cav_gain=0.75, brush_axis=None, brush=0.0,
               waviness=0.0, grain=0.15, bands=(), rough_range=None):
    """Polished metal with an honest life: `age` 0 is freshly polished, 1 is long-neglected. Hand spots
    stay polished, crevices tarnish, edges catch bright metal. With `under` set, plating is rubbed
    through to the base metal along edges and at hand spots by `rub` (0..1)."""
    mat, ng = new_material(name)
    pos = ng.position()
    p = ng.mapping(pos, location=_seed_loc(seed))
    cav = ng.cavity_mask(cav_dist, power=cav_power)
    edge = ng.edge_mask(edge_radius)
    blotch = ng.noise(p, scale=8.0, detail=6, roughness=0.62, distortion=0.45)
    fine = ng.noise(p, scale=220.0, detail=2, roughness=0.5)
    hand = touch_mask(ng, pos, spots)
    t = ng.madd(blotch, 1.15, -0.28)
    t = ng.madd(t, age, ng.mul(cav, cav_gain + 0.2 * age))
    t = ng.add(t, age * 0.28 + tarnish_bias)
    t = ng.sub(t, ng.mul(hand, 1.1))
    t = ng.sub(t, ng.mul(edge, 0.7))
    t = ng.clamp01(t)
    col = ng.ramp(t, [(0.0, hex_rgb(bright)), (0.3, hex_rgb(mid)), (0.68, hex_rgb(dull)), (1.0, hex_rgb(deep))])
    col = ng.mix(ng.mul(fine, 0.18), col, hex_rgb(mid), blend='MIX')
    rough = ng.mixf(t, rough_lo, rough_hi)
    rough = ng.add(rough, ng.madd(fine, 0.07, -0.035))
    metal = ng.madd(t, -(1.0 - metal_floor), 1.0)
    if under is not None:
        wear_n = ng.noise(ng.mapping(pos, location=_seed_loc(seed + 5)), scale=55.0, detail=5, roughness=0.65, distortion=0.7)
        worn = ng.mul(ng.add(ng.mul(edge, 1.4), ng.mul(hand, 0.55)), ng.threshold(wear_n, 0.62 - 0.35 * rub, 0.14))
        worn = ng.clamp01(ng.mul(worn, ng.minf(1.0, rub * 2.2)))
        under_col = ng.mix(ng.mul(cav, 0.6), hex_rgb(under), hex_rgb(deep))
        col = ng.mix(worn, col, under_col)
        rough = ng.mixf(worn, rough, 0.46)
        metal = ng.mixf(worn, metal, 1.0)
    sc_vec = ng.mapping(pos, scale=(260.0, 11.0, 260.0), location=_seed_loc(seed + 1))
    lines = ng.voronoi(sc_vec, scale=1.0, feature='DISTANCE_TO_EDGE')
    lines = ng.inv(ng.map_range(lines, 0.0, 0.06, 0.0, 1.0))
    height = ng.add(ng.mul(fine, 0.35 * grain), ng.mul(lines, scratches * 0.4))
    if brush_axis and brush > 0.0:
        bs = {'X': (4.0, 520.0, 520.0), 'Y': (520.0, 4.0, 520.0), 'Z': (520.0, 520.0, 4.0)}[brush_axis]
        bn = ng.noise(ng.mapping(pos, scale=bs, location=_seed_loc(seed + 11)), scale=1.0, detail=2, roughness=0.6)
        rough = ng.add(rough, ng.mul(ng.madd(bn, 2.0, -1.0), 0.07 * brush))
        height = ng.add(height, ng.mul(bn, 0.5 * brush))
    if spin > 0.0:
        # polishing on the lathe leaves fine circumferential lines: bands that vary only with height
        spin_n = ng.wave(ng.mapping(pos, scale=(0.0, 0.0, 1.0), location=_seed_loc(seed + 7)), scale=170.0, distortion=2.0,
                         detail=1.0, direction='Z', profile='SIN')
        rough = ng.add(rough, ng.mul(ng.madd(spin_n, 2.0, -1.0), 0.05 * spin))
        height = ng.add(height, ng.mul(spin_n, 0.25 * spin))
    if solder:
        lump = ng.noise(ng.mapping(pos, location=_seed_loc(seed + 9)), scale=420.0, detail=3, roughness=0.6)
        sm = ng.mul(touch_mask(ng, pos, solder), ng.threshold(lump, 0.3, 0.5))
        col = ng.mix(sm, col, hex_rgb('#77736D'))
        rough = ng.mixf(sm, rough, 0.62)
        metal = ng.mixf(sm, metal, 0.78)
        height = ng.add(height, ng.mul(sm, ng.madd(lump, 2.5, 0.0)))
    for z0, z1, d_rough, tone in bands:
        # a zone round the object (say, a blank engraving band) given its own finish: rougher and a shade darker
        _, _, zz = ng.separate_xyz(pos)
        zm = ng.mul(ng.map_range(zz, z0, z0 + 0.002, 0.0, 1.0), ng.map_range(zz, z1 - 0.002, z1, 1.0, 0.0))
        rough = ng.add(rough, ng.mul(zm, d_rough))
        col = ng.mix(ng.mul(zm, 1.0 - tone), col, (0.55, 0.52, 0.48, 1.0), blend='MULTIPLY')
    if rough_range is not None:
        rough = ng.minf(ng.maxf(rough, rough_range[0]), rough_range[1])
    rough = ng.clamp01(rough)
    normal = ng.bump(height, strength=0.25, distance=0.0006)
    if waviness > 0.0:
        # sheet metal is never dead flat: a slow undulation moves the highlights around
        wav = ng.noise(ng.mapping(pos, location=_seed_loc(seed + 13)), scale=7.0, detail=2, roughness=0.5)
        normal = ng.bump(wav, strength=0.35 * waviness, distance=0.0016, normal=normal)
    principled(mat, ng, col, rough, metallic=metal, normal=normal)
    return mat


def brass(name='brass', **kw):
    """Cast or spun brass: warm, polished where hands go, tarnish in the crevices."""
    kw.setdefault('bright', '#E6C06A')
    kw.setdefault('mid', '#B08A3A')
    kw.setdefault('dull', '#715826')
    kw.setdefault('deep', '#3A2D15')
    # brass keeps to the brief's roughness range, 0.35 to 0.55, wherever it has been polished or tarnished
    kw['rough_lo'] = max(kw.get('rough_lo', 0.35), 0.36)
    kw['rough_hi'] = min(kw.get('rough_hi', 0.55), 0.54)
    kw.setdefault('rough_range', (0.35, 0.55))
    return worn_metal(name, **kw)


def silver_plate(name='silver plate', **kw):
    """Electroplated nickel silver: cool and bright, grey-violet tarnish, brassing at the high points."""
    kw.setdefault('bright', '#DCDCD7')
    kw.setdefault('mid', '#A9A8A3')
    kw.setdefault('dull', '#6D6862')
    kw.setdefault('deep', '#2B282B')
    kw.setdefault('under', '#B8914A')
    kw.setdefault('rub', 0.35)
    kw.setdefault('rough_lo', 0.30)
    kw.setdefault('rough_hi', 0.52)
    return worn_metal(name, **kw)


def gilt(name='gilt', **kw):
    """Gold-coloured anodised or lacquered metal of the 1970s: even, satin, scuffed rather than tarnished."""
    kw.setdefault('bright', '#DDBB5E')
    kw.setdefault('mid', '#BC9E48')
    kw.setdefault('dull', '#85702F')
    kw.setdefault('deep', '#47391A')
    kw.setdefault('rough_lo', 0.38)
    kw.setdefault('rough_hi', 0.55)
    return worn_metal(name, **kw)


def wood(name='wood', light='#C79B62', dark='#7A4F2A', axis='Z', ring_freq=95.0, grain_stretch=0.03,
         roughness=0.62, age=0.4, spots=(), seed=0.0, warp=5.0, pore=0.5, edge_radius=0.003,
         edge_lift=0.12, polish=0.0, patches=(), contrast=1.0, ray_flecks=0.0, wander=0.045, relief=0.035, decals=(), rough_range=None):
    """Sawn timber. Grain runs along the object's local `axis`: growth-ring bands wander with the wood,
    pores show as short dark dashes, hands darken and gloss what they touch, edges lift pale where
    the finish has worn through. `ring_freq` is bands per 0.314 m (about 3.3 mm apart at 95)."""
    mat, ng = new_material(name)
    pos = ng.position()
    pos_o = ng.object_coords()
    ax = {'X': 0, 'Y': 1, 'Z': 2}[axis]
    band_dir = {'X': 'Y', 'Y': 'X', 'Z': 'X'}[axis]
    scale = [1.0, 1.0, 1.0]
    scale[ax] = grain_stretch
    vec = ng.mapping(pos_o, scale=tuple(scale), location=_seed_loc(seed))
    # domain warp: the growth rings wander and swell across the board instead of ruling straight lines
    swirl = ng.noise_vector(ng.mapping(pos_o, scale=tuple((6.0 if i != ax else 2.4) for i in range(3)), location=_seed_loc(seed + 9)), scale=1.0, detail=3.0)
    vec = ng.vec_math('ADD', vec, ng.vec_math('SCALE', ng.vec_math('SUBTRACT', swirl, (0.5, 0.5, 0.5)), scale=wander))
    rings = ng.wave(vec, scale=ring_freq, distortion=warp, detail=2.0, detail_scale=1.3, detail_roughness=0.55,
                    rings=False, direction=band_dir, profile='SAW')
    # the strength of the ring contrast drifts along and across the board, like real figure
    figure = ng.noise(ng.mapping(pos_o, scale=tuple(v * 0.12 for v in scale), location=_seed_loc(seed + 4)), scale=9.0, detail=3)
    late = ng.power(ng.clamp01(rings), 1.7)
    late = ng.mul(late, ng.madd(figure, 0.9 * contrast, 0.55))
    streak_scale = [420.0, 420.0, 420.0]
    streak_scale[ax] = 9.0
    streaks = ng.noise(ng.mapping(pos_o, scale=tuple(streak_scale), location=_seed_loc(seed + 3)), scale=1.0, detail=3)
    pore_scale = [520.0, 520.0, 520.0]
    pore_scale[ax] = 38.0
    pores = ng.threshold(ng.noise(ng.mapping(pos_o, scale=tuple(pore_scale), location=_seed_loc(seed + 6)), scale=1.0, detail=1), 0.66, 0.16)
    cav = ng.cavity_mask(0.02, power=1.0)
    edge = ng.edge_mask(edge_radius)
    hand = touch_mask(ng, pos, spots)
    ghost = None
    for patch in patches:
        m = box_mask(ng, pos, patch['at'], patch['half'], soft=0.08)
        ghost = m if ghost is None else ng.maxf(ghost, m)
    light_c = hex_rgb(light)
    dark_c = hex_rgb(dark)
    col = ng.mix(ng.clamp01(late), light_c, dark_c)
    col = ng.mix(ng.mul(ng.madd(streaks, 1.0, -0.5), 0.5), col, ng.mix(0.4, dark_c, (0.01, 0.006, 0.003, 1.0)))
    col = ng.mix(ng.mul(pores, 0.55 * pore), col, ng.mix(0.65, dark_c, (0.012, 0.007, 0.004, 1.0)))
    if ray_flecks > 0.0:
        rs = [30.0, 30.0, 30.0]
        rs[(ax + 1) % 3] = 900.0
        ray = ng.threshold(ng.noise(ng.mapping(pos_o, scale=tuple(rs), location=_seed_loc(seed + 8)), scale=1.0, detail=1), 0.7, 0.1)
        col = ng.mix(ng.mul(ray, ray_flecks), col, ng.mix(0.4, light_c, (0.9, 0.8, 0.6, 1.0)))
    col = ng.mix(ng.mul(cav, 0.45 + 0.4 * age), col, (0.03, 0.02, 0.012, 1.0))
    col = ng.mix(ng.mul(hand, 0.35), col, ng.mix(0.5, dark_c, (0.05, 0.028, 0.012, 1.0)))
    col = ng.mix(ng.mul(edge, edge_lift), col, light_c)
    if ghost is not None:
        # where a plate or label stood: the wood beneath kept its colour while the rest aged around it
        col = ng.mix(ng.mul(ghost, 0.5), col, ng.mix(0.5, light_c, (0.42, 0.28, 0.16, 1.0)))
    rough = ng.madd(late, 0.05, roughness - 0.03)
    rough = ng.add(rough, ng.mul(pores, 0.10 * pore))
    for d in decals:
        # paint, tape, stickers and stains laid over the grain
        m = decal_mask(ng, pos, d)
        col = ng.mix(m, col, hex_rgb(d['color']))
        if 'rough' in d:
            rough = ng.mixf(m, rough, d['rough'])
    rough = ng.sub(rough, ng.mul(hand, 0.14 + polish))
    rough = ng.sub(rough, ng.mul(edge, 0.05))
    if rough_range is not None:
        rough = ng.minf(ng.maxf(rough, rough_range[0]), rough_range[1])
    rough = ng.clamp01(rough)
    height = ng.add(ng.mul(late, 0.4), ng.mul(pores, -0.9 * pore))
    height = ng.add(height, ng.mul(streaks, 0.25))
    normal = ng.bump(height, strength=relief, distance=0.0004)
    principled(mat, ng, col, rough, metallic=0.0, normal=normal)
    return mat


def enamel(name='enamel', color='#8D977F', chip_metal='#4A4B49', age=0.5, **kw):
    """Baked enamel on sheet steel: a harder, glossier paint than the old cast-iron coats; chips at the
    edges down to bare steel with a little rust, grime in the recesses, rubbed paint where hands go."""
    kw.setdefault('roughness', 0.42)
    kw.setdefault('chip_amount', 0.6)
    kw.setdefault('edge_radius', 0.0025)
    kw.setdefault('rust', 0.35)
    kw.setdefault('cav_dist', 0.025)
    kw.setdefault('rough_range', (0.35, 0.50))     # the brief's range for enamel
    return painted(name, color=color, substrate=chip_metal, age=age, **kw)


def painted(name='painted', color='#D8D0BD', age=0.5, spots=(), seed=0.0, roughness=0.5, edge_radius=0.003,
            substrate='#4B4A47', chip_amount=0.4, metal_substrate=True, cav_dist=0.03, yellowing=1.0,
            rub_color=None, grime='#0D0A07', spec=None, dust=0.0, streaks=0.0, floor_grime=None, heat=None,
            variation=0.12, rust=0.0, patches=(), scuffs=0.0, smudge=0.0, rough_range=None):
    """Many-coat paint on cast iron or timber: soft thick edges, yellowing, grime in recesses, a few
    chips down to the substrate. Yellowing multiplies the paint colour (so black stays black), and
    `rub_color` is the sheen colour that hand-rubbed paint tends towards.

    Dirt layers (all world-space): `dust` settles on upward faces, `streaks` run down the surface,
    `floor_grime=(height, strength)` is mop splash and shoe scuff near the floor, `heat=(z0, z1, strength)`
    is the brown stain a hot surface gets towards its top."""
    mat, ng = new_material(name)
    pos = ng.position()
    p = ng.mapping(pos, location=_seed_loc(seed))
    cav = ng.cavity_mask(cav_dist, power=1.0)
    edge = ng.edge_mask(edge_radius)
    big = ng.noise(p, scale=3.0, detail=4, roughness=0.6)
    mid_n = ng.noise(p, scale=32.0, detail=4, roughness=0.55)
    fine = ng.noise(p, scale=260.0, detail=1, roughness=0.5)
    hand = touch_mask(ng, pos, spots)
    cf = ng.noise(p, scale=55.0, detail=5, roughness=0.62, distortion=0.8)
    chips = ng.mul(edge, ng.threshold(cf, 0.7 - 0.25 * chip_amount, 0.12))
    chips = ng.clamp01(chips)
    paint = hex_rgb(color)
    col = ng.mix(ng.mul(big, 0.55 * age * yellowing), paint, (1.12, 0.98, 0.72, 1.0), blend='MULTIPLY')
    # slow tonal drift: repaints that never quite matched, lighting that bleached one side
    col = ng.mix(ng.mul(ng.madd(big, 2.0, -1.0), variation), col, (1.0, 0.96, 0.9, 1.0), blend='MULTIPLY')
    _, _, z = ng.separate_xyz(pos)
    _, _, nz = ng.separate_xyz(ng.normal())
    grime_col = hex_rgb(grime)
    if floor_grime is not None:
        h, k = floor_grime
        fm = ng.mul(ng.map_range(z, 0.0, h, 1.0, 0.0, smooth=True), ng.madd(mid_n, 0.9, 0.35))
        col = ng.mix(ng.clamp01(ng.mul(fm, k)), col, (0.045, 0.034, 0.024, 1.0))
    if heat is not None:
        z0, z1, k = heat
        hm = ng.mul(ng.map_range(z, z0, z1, 0.0, 1.0, smooth=True), ng.madd(big, 1.3, 0.2))
        col = ng.mix(ng.clamp01(ng.mul(hm, k)), col, (0.62, 0.42, 0.20, 1.0), blend='MULTIPLY')
    if streaks > 0.0:
        sv = ng.mapping(pos, scale=(70.0, 70.0, 2.5), location=_seed_loc(seed + 5))
        st = ng.threshold(ng.noise(sv, scale=1.0, detail=2, roughness=0.6), 0.52, 0.3)
        col = ng.mix(ng.mul(st, streaks * 0.55), col, (0.10, 0.085, 0.07, 1.0), blend='MULTIPLY')
    if dust > 0.0:
        top = ng.map_range(nz, 0.5, 0.95, 0.0, 1.0)
        dm = ng.mul(top, ng.madd(ng.noise(p, scale=14.0, detail=3), 0.9, 0.2))
        col = ng.mix(ng.clamp01(ng.mul(dm, dust)), col, (0.17, 0.155, 0.135, 1.0))
    # grime darkens the paint rather than greying it: it multiplies, so a green stays green in the crevices
    dirt = ng.clamp01(ng.mul(ng.add(ng.mul(cav, 0.6), ng.mul(mid_n, 0.1)), 0.4 + age * 0.6))
    col = ng.mix(dirt, col, (0.30, 0.26, 0.22, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.mul(dirt, 0.35), col, grime_col, blend='MIX')
    rub = rub_color if rub_color is not None else (0.34, 0.31, 0.26, 1.0)
    col = ng.mix(ng.mul(hand, 0.2), col, rub)
    if scuffs > 0.0:
        # fine pale scratches and scuffs, thickest low down and on the edges
        lines = None
        for k, rot in enumerate(((0.0, 0.0, 0.0), (0.0, 0.0, 1.1), (0.0, 0.0, 2.3))):
            sv = ng.mapping(pos, scale=(260.0, 26.0, 260.0), location=_seed_loc(seed + 20 + k), rotation=rot)
            ln = ng.inv(ng.map_range(ng.voronoi(sv, scale=1.0, feature='DISTANCE_TO_EDGE'), 0.0, 0.05, 0.0, 1.0))
            lines = ln if lines is None else ng.maxf(lines, ln)
        gate = ng.threshold(ng.noise(ng.mapping(pos, location=_seed_loc(seed + 25)), scale=7.0, detail=3), 0.40, 0.40)
        low = ng.map_range(z, 0.0, 0.45, 1.0, 0.25)
        sm = ng.clamp01(ng.mul(ng.mul(lines, gate), ng.madd(ng.add(low, edge), 0.7, 0.0)))
        col = ng.mix(ng.mul(sm, scuffs * 0.6), col, rub)
    for patch in patches:
        # a touch-up: fresh paint a shade off the old, with a clean edge
        pm = box_mask(ng, pos, patch['at'], patch['half'], soft=0.06)
        col = ng.mix(ng.mul(pm, patch.get('strength', 0.85)), col, hex_rgb(patch['color']))
    sub_col = hex_rgb(substrate)
    if rust > 0.0:
        rust_m = ng.mul(chips, ng.threshold(mid_n, 0.62 - 0.3 * rust, 0.25))
        sub_col = ng.mix(rust_m, sub_col, hex_rgb('#6B4026'))
    col = ng.mix(chips, col, sub_col)
    rough = ng.madd(fine, 0.06, roughness - 0.03)
    rough = ng.add(rough, ng.mul(cav, 0.12))
    rough = ng.sub(rough, ng.mul(hand, 0.06))
    if smudge > 0.0:
        # fingermarks and wipe marks: broad soft variations in how glossy the paint is
        smu = ng.noise(ng.mapping(pos, location=_seed_loc(seed + 30)), scale=22.0, detail=3, roughness=0.6)
        rough = ng.add(rough, ng.mul(ng.madd(smu, 2.0, -1.0), 0.09 * smudge))
    if rough_range is not None:
        rough = ng.minf(ng.maxf(rough, rough_range[0]), rough_range[1])
    rough = ng.mixf(chips, rough, 0.6)
    rough = ng.clamp01(rough)
    height = ng.add(ng.mul(fine, 0.2), ng.mul(mid_n, 0.15))
    height = ng.sub(height, ng.mul(chips, 0.5))
    normal = ng.bump(height, strength=0.25, distance=0.0008)
    metal = ng.mul(chips, 0.6) if metal_substrate else 0.0
    principled(mat, ng, col, rough, metallic=metal, normal=normal, spec=spec)
    return mat


def lacquer(name='lacquer', color='#1B1A19', age=0.3, spots=(), seed=0.0, roughness=0.2, edge_radius=0.0025,
            under='#5B4B3A', rub=0.35):
    """Glossy black lacquer or Bakelite: crisp reflections, hairline scratches, edges rubbed through to the
    brown or brass beneath, hand-polished spots a touch glossier."""
    mat, ng = new_material(name)
    pos = ng.position()
    p = ng.mapping(pos, location=_seed_loc(seed))
    cav = ng.cavity_mask(0.012, power=1.0)
    edge = ng.edge_mask(edge_radius)
    fine = ng.noise(p, scale=260.0, detail=1, roughness=0.5)
    cf = ng.noise(p, scale=70.0, detail=5, roughness=0.6, distortion=0.7)
    hand = touch_mask(ng, pos, spots)
    worn = ng.clamp01(ng.mul(ng.mul(edge, 1.2), ng.threshold(cf, 0.7 - 0.3 * rub, 0.14)))
    sc = ng.voronoi(ng.mapping(pos, scale=(300.0, 14.0, 300.0), location=_seed_loc(seed + 3)), scale=1.0, feature='DISTANCE_TO_EDGE')
    scratches = ng.inv(ng.map_range(sc, 0.0, 0.05, 0.0, 1.0))
    col = ng.mix(ng.mul(cav, 0.6), hex_rgb(color), (0.004, 0.003, 0.003, 1.0))
    col = ng.mix(ng.mul(scratches, 0.35 * age), col, (0.05, 0.048, 0.045, 1.0))
    col = ng.mix(worn, col, hex_rgb(under))
    rough = ng.madd(fine, 0.05, roughness - 0.025)
    rough = ng.add(rough, ng.mul(scratches, 0.25 * age))
    rough = ng.sub(rough, ng.mul(hand, 0.05))
    rough = ng.mixf(worn, rough, 0.55)
    rough = ng.clamp01(rough)
    height = ng.add(ng.mul(fine, 0.12), ng.mul(scratches, -0.25 * age))
    normal = ng.bump(height, strength=0.2, distance=0.0004)
    principled(mat, ng, col, rough, metallic=ng.mul(worn, 0.4), normal=normal)
    return mat


def fabric(name='fabric', color='#2F5B3C', age=0.4, spots=(), seed=0.0, roughness=0.92, nap=0.5, weave=True,
           weave_scale=900.0, fray=(0.6, 0.55, 0.42), edge_radius=0.003, rub_edges=0.5, mottle=0.5):
    """Baize, bookcloth or felt: matte, finely woven, worn pale at the edges and where hands rub."""
    mat, ng = new_material(name)
    pos = ng.position()
    pos_o = ng.object_coords()
    p = ng.mapping(pos, location=_seed_loc(seed))
    cav = ng.cavity_mask(0.025, power=1.0)
    edge = ng.edge_mask(edge_radius)
    big = ng.noise(p, scale=5.0, detail=4, roughness=0.6)
    mid_n = ng.noise(p, scale=60.0, detail=3, roughness=0.55)
    hand = touch_mask(ng, pos, spots)
    base = hex_rgb(color)
    if weave:
        wx = ng.wave(ng.mapping(pos_o, scale=(1.0, 1.0, 1.0)), scale=weave_scale, rings=False, direction='X', profile='SIN')
        wy = ng.wave(ng.mapping(pos_o, scale=(1.0, 1.0, 1.0)), scale=weave_scale, rings=False, direction='Y', profile='SIN')
        cloth = ng.mul(wx, wy)
    else:
        cloth = ng.noise(ng.mapping(pos, scale=(1, 1, 1)), scale=700.0, detail=1)
    col = ng.mix(ng.mul(big, mottle), base, ng.mix(0.5, base, (0.0, 0.0, 0.0, 1.0)))
    col = ng.mix(ng.mul(cloth, 0.22), col, ng.mix(0.4, base, (0.0, 0.0, 0.0, 1.0)))
    col = ng.mix(ng.mul(cav, 0.5), col, (0.012, 0.01, 0.008, 1.0))
    pale = (fray[0] ** 2.2, fray[1] ** 2.2, fray[2] ** 2.2, 1.0)
    rubbed = ng.clamp01(ng.add(ng.mul(edge, rub_edges * (0.25 + 0.4 * age)), ng.mul(hand, 0.3)))
    rubbed = ng.mul(rubbed, ng.threshold(mid_n, 0.6, 0.22))
    col = ng.mix(rubbed, col, ng.mix(0.55, base, pale))
    rough = ng.clamp01(ng.madd(cloth, -0.06 * nap, roughness))
    rough = ng.sub(rough, ng.mul(hand, 0.12))
    height = ng.add(ng.mul(cloth, 0.5), ng.mul(mid_n, 0.15))
    normal = ng.bump(height, strength=0.2, distance=0.0005)
    principled(mat, ng, col, rough, metallic=0.0, normal=normal)
    return mat


def marbled(name='marbled paper', colors=('#2D4A6B', '#B4442F', '#D8C58E', '#1B1E24'), scale=14.0, age=0.6, spots=(), seed=0.0,
            roughness=0.55, edge_radius=0.0015, warp=0.06):
    """Spanish-style marbled paper over boards: big soft clouds of three inks netted with fine dark
    veins, glazed, the corners worn through to the grey board beneath. `colors` = (main, accent, light, vein)."""
    mat, ng = new_material(name)
    pos = ng.position()
    pos_o = ng.object_coords()
    p = ng.mapping(pos_o, location=_seed_loc(seed))
    swirl = ng.noise_vector(ng.mapping(pos_o, scale=(scale * 0.5,) * 3, location=_seed_loc(seed + 1)), scale=1.0, detail=3.0, roughness=0.55)
    vec = ng.vec_math('ADD', p, ng.vec_math('SCALE', ng.vec_math('SUBTRACT', swirl, (0.5, 0.5, 0.5)), scale=warp))
    cloud = ng.noise(vec, scale=scale * 0.55, detail=5, roughness=0.55, distortion=1.2)
    fine = ng.noise(ng.mapping(pos_o, location=_seed_loc(seed + 2)), scale=scale * 6.0, detail=3, roughness=0.6)
    stops = [(0.0, hex_rgb(colors[0])), (0.55, hex_rgb(colors[0])), (0.61, hex_rgb(colors[1])), (0.72, hex_rgb(colors[2])), (0.78, hex_rgb(colors[1])),
             (0.88, hex_rgb(colors[0])), (1.0, hex_rgb(colors[0]))]
    col = ng.ramp(cloud, stops)
    # veins: thin dark lines wherever the cloud field crosses a set of levels
    ring = ng.math('ABSOLUTE', ng.math('SINE', ng.mul(cloud, 46.0)))
    veins = ng.inv(ng.threshold(ring, 0.07, 0.05))
    col = ng.mix(ng.mul(veins, 0.5), col, hex_rgb(colors[3]))
    edge = ng.edge_mask(edge_radius)
    cav = ng.cavity_mask(0.01, power=1.0)
    hand = touch_mask(ng, pos, spots)
    worn = ng.clamp01(ng.mul(ng.add(edge, ng.mul(hand, 0.5)), ng.threshold(ng.noise(ng.mapping(pos, location=_seed_loc(seed + 3)), scale=60.0, detail=4), 0.55 - 0.1 * age, 0.2)))
    col = ng.mix(ng.mul(cav, 0.4), col, (0.01, 0.008, 0.006, 1.0))
    col = ng.mix(worn, col, hex_rgb('#8A8478'))
    col = ng.mix(ng.mul(ng.noise(ng.mapping(pos, location=_seed_loc(seed + 4)), scale=5.0, detail=3), 0.3 * age), col, (0.72, 0.64, 0.52, 1.0), blend='MULTIPLY')
    rough = ng.clamp01(ng.madd(fine, 0.1, roughness - 0.05))
    rough = ng.mixf(worn, rough, 0.85)
    normal = ng.bump(ng.mul(fine, 0.3), strength=0.1, distance=0.0003)
    principled(mat, ng, col, rough, metallic=0.0, normal=normal)
    return mat


def paper(name='paper', tone='#E3D9C0', age=0.4, spots=(), seed=0.0, roughness=0.9, edge_radius=0.0012, stack_axis=None,
          page_pitch=0.004, speckle=None, metallic=0.0, scribble=()):
    """Writing paper and card: warm cream, yellowed towards the edges, foxed in places, softly fibrous.
    With `stack_axis` set, the surface is the edge of a block of pages: fine parallel leaves along that
    axis, `page_pitch` apart (coarser than real paper, which no atlas could hold)."""
    mat, ng = new_material(name)
    pos = ng.position()
    pos_o = ng.object_coords()
    p = ng.mapping(pos, location=_seed_loc(seed))
    edge = ng.edge_mask(edge_radius)
    cav = ng.cavity_mask(0.01, power=1.0)
    big = ng.noise(p, scale=5.0, detail=4, roughness=0.6)
    fibre = ng.noise(ng.mapping(pos_o, scale=(260.0, 40.0, 260.0), location=_seed_loc(seed + 2)), scale=1.0, detail=2)
    fox = ng.threshold(ng.noise(ng.mapping(pos, location=_seed_loc(seed + 4)), scale=48.0, detail=3, roughness=0.6), 0.64, 0.12)
    hand = touch_mask(ng, pos, spots)
    base = hex_rgb(tone)
    col = ng.mix(ng.mul(big, 0.5 * age), base, (1.06, 0.92, 0.68, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.mul(fibre, 0.12), col, (0.8, 0.77, 0.7, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.mul(fox, 0.55 * age), col, (0.55, 0.32, 0.12, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.mul(ng.add(edge, ng.mul(cav, 0.6)), 0.5 + 0.4 * age), col, (0.55, 0.36, 0.18, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.mul(hand, 0.4), col, (0.45, 0.38, 0.28, 1.0), blend='MULTIPLY')
    if speckle is not None:
        # sprinkled edges: tiny flecks of colour (a red or marbled top edge)
        dots = ng.threshold(ng.noise(ng.mapping(pos, location=_seed_loc(seed + 7)), scale=380.0, detail=1), 0.6, 0.06)
        col = ng.mix(ng.mul(dots, speckle[1]), col, hex_rgb(speckle[0]))
    if scribble:
        # a hand has been here: short wavering dashes in ink, on the lines of a few centimetres of card. Never words.
        _, _, zz = ng.separate_xyz(pos)
        xx, yy, _ = ng.separate_xyz(pos)
        rows = ng.threshold(ng.math('ABSOLUTE', ng.math('SINE', ng.mul(zz, 571.0))), 0.93, 0.05)
        wob = ng.mul(ng.noise(ng.mapping(pos, scale=(30.0, 1.0, 1.0), location=_seed_loc(seed + 9)), scale=1.0, detail=2), 1.0)
        runs = ng.threshold(wob, 0.42, 0.10)
        zone = None
        for sc in scribble:
            m = box_mask(ng, pos, sc['at'], sc['half'], soft=0.05)
            zone = m if zone is None else ng.maxf(zone, m)
        col = ng.mix(ng.mul(ng.mul(ng.mul(rows, runs), zone), 0.8), col, hex_rgb('#2A2C3E'))
    height = ng.mul(fibre, 0.4)
    if stack_axis:
        v = [0.0, 0.0, 0.0]
        v['XYZ'.index(stack_axis)] = 1.0
        leaves = ng.wave(ng.mapping(pos_o, scale=tuple(v), location=_seed_loc(seed + 6)), scale=0.314 / page_pitch, direction=stack_axis,
                         profile='SIN')
        col = ng.mix(ng.mul(leaves, 0.28), col, (0.72, 0.66, 0.55, 1.0), blend='MULTIPLY')
        height = ng.add(height, ng.mul(leaves, 0.8))
    normal = ng.bump(height, strength=0.12, distance=0.0003)
    rough = ng.clamp01(ng.madd(fibre, 0.06, roughness - 0.03))
    principled(mat, ng, col, rough, metallic=metallic, normal=normal)
    return mat


BOOK_PALETTE = ('#5B2227', '#27453A', '#26304A', '#A27A2A', '#7B5B3E', '#2F3133', '#3C6360', '#4C2E48', '#B9AB88', '#6E2F20')


def bookshelf(name='shelf books', seed=0.0, palette=BOOK_PALETTE, age=0.6, text_zones=()):
    """Every book in a row from one material. Per-book variation comes from mesh attributes the builder writes:
    `bk` (a random number per book, picks colour, cloth or leather, bands, label and fading), `bz` and `bx`
    (position up and across the spine, 0..1) and `bt` (0 covers and spine, 1 page edges, 2 page faces) and `bl` (metres along the stack of leaves). Gilt
    bands, blank labels, sun-faded spines, rubbed edges and dust are all drawn from those."""
    mat, ng = new_material(name)
    pos = ng.position()
    p = ng.mapping(pos, location=_seed_loc(seed))
    bk, bz, bx, bt, bl = (ng.attribute(n) for n in ('bk', 'bz', 'bx', 'bt', 'bl'))
    nx, ny, nz = ng.separate_xyz(ng.normal())
    n = len(palette)
    stops = [(i / n, hex_rgb(c)) for i, c in enumerate(palette)]
    cover = ng.ramp(bk, stops, interpolation='CONSTANT')

    def hsh(k, b):
        return ng.math('FRACT', ng.madd(bk, k, b))

    leather = ng.threshold(hsh(13.7, 0.31), 0.62, 0.02)
    faded = ng.mul(ng.threshold(hsh(29.1, 0.77), 0.65, 0.02), 0.55 * age)
    cover = ng.mix(faded, cover, (0.30, 0.27, 0.22, 1.0))
    big = ng.noise(p, scale=7.0, detail=4, roughness=0.6)
    cover = ng.mix(ng.mul(ng.madd(big, 0.8, 0.0), 0.25), cover, (0.6, 0.58, 0.55, 1.0), blend='MULTIPLY')
    edge = ng.edge_mask(0.0022)
    cav = ng.cavity_mask(0.015, power=1.0)
    rub = ng.mul(ng.mul(edge, ng.threshold(ng.noise(ng.mapping(pos, location=_seed_loc(seed + 3)), scale=90.0, detail=3), 0.5, 0.25)), 0.55 + 0.4 * age)
    cover = ng.mix(rub, cover, hex_rgb('#8E826D'))

    spine = ng.map_range(ng.inv(ny), 1.25, 1.7, 0.0, 1.0)           # faces looking out of the shelf
    gilt_on = ng.threshold(hsh(7.3, 0.11), 0.4, 0.02)

    def band(z, w):
        return ng.map_range(ng.math('ABSOLUTE', ng.sub(bz, z)), w * 0.5, w * 0.5 + 0.004, 1.0, 0.0)

    bands = None
    for z, w in ((0.085, 0.014), (0.158, 0.008), (0.842, 0.008), (0.915, 0.014)):
        b = band(z, w)
        bands = b if bands is None else ng.maxf(bands, b)
    bands = ng.mul(ng.mul(bands, spine), ng.mul(ng.inv(bt), 1.0))
    gilt = hex_rgb('#C9A24A')
    cover = ng.mix(ng.mul(bands, ng.mul(gilt_on, 0.9)), cover, gilt)

    lab = ng.mul(ng.mul(ng.map_range(bz, 0.58, 0.60, 0.0, 1.0), ng.map_range(bz, 0.76, 0.74, 0.0, 1.0)),
                 ng.mul(ng.map_range(bx, 0.10, 0.13, 0.0, 1.0), ng.map_range(bx, 0.90, 0.87, 0.0, 1.0)))
    lab = ng.mul(ng.mul(lab, spine), ng.mul(ng.threshold(hsh(5.1, 0.57), 0.62, 0.02), ng.inv(bt)))
    cover = ng.mix(lab, cover, ng.mix(ng.mul(big, 0.5), hex_rgb('#D9CCA8'), hex_rgb('#B9A878')))
    # a short dark rule in the label where a title would go: a mark, not a word
    rule = ng.mul(ng.mul(ng.map_range(bz, 0.664, 0.670, 0.0, 1.0), ng.map_range(bz, 0.676, 0.670, 0.0, 1.0)),
                  ng.mul(ng.map_range(bx, 0.24, 0.27, 0.0, 1.0), ng.map_range(bx, 0.76, 0.73, 0.0, 1.0)))
    cover = ng.mix(ng.mul(ng.mul(rule, lab), 0.7), cover, hex_rgb('#3B2C20'))
    cover = ng.mix(ng.mul(ng.map_range(bz, 0.12, 0.0, 0.0, 1.0), 0.5), cover, (0.28, 0.24, 0.2, 1.0), blend='MULTIPLY')
    cover = ng.mix(ng.mul(cav, 0.5), cover, (0.10, 0.08, 0.06, 1.0), blend='MULTIPLY')

    # page edges: leaves of paper; page faces: faint printed lines (no words)
    leaves = ng.madd(ng.math('SINE', ng.mul(bl, 1795.6)), 0.5, 0.5)       # leaves of paper, 3.5 mm apart (`bl` is the metres along the stack)
    paper = ng.mix(ng.mul(leaves, 0.3), hex_rgb('#DCD0B2'), (0.7, 0.64, 0.54, 1.0), blend='MULTIPLY')
    lines_y = ng.threshold(ng.math('ABSOLUTE', ng.math('SINE', ng.mul(py_of(ng, pos), 523.6))), 0.9, 0.06)   # a line every 6 mm
    run = ng.threshold(ng.noise(ng.mapping(pos, scale=(55.0, 170.0, 3.0), location=_seed_loc(seed + 8)), scale=1.0, detail=1), 0.42, 0.08)
    ink = ng.mul(ng.mul(lines_y, run), 0.55)
    if text_zones:
        # printed lines only inside the text blocks, with margins round them
        zone = None
        for z in text_zones:
            m = box_mask(ng, pos, z['at'], z['half'], soft=0.06)
            zone = m if zone is None else ng.maxf(zone, m)
        ink = ng.mul(ink, zone)
    page_face = ng.mix(ink, hex_rgb('#E4DAC0'), hex_rgb('#5C554A'))
    pageedge = ng.map_range(bt, 0.4, 0.6, 0.0, 1.0)
    pageface = ng.map_range(bt, 1.4, 1.6, 0.0, 1.0)
    col = ng.mix(pageedge, cover, paper)
    col = ng.mix(pageface, col, page_face)
    top = ng.mul(ng.map_range(nz, 0.5, 0.9, 0.0, 1.0), ng.madd(ng.noise(p, scale=14.0, detail=3), 0.8, 0.2))
    col = ng.mix(ng.clamp01(ng.mul(top, 0.55 * age)), col, (0.2, 0.185, 0.16, 1.0))

    rough = ng.mixf(leather, 0.9, 0.6)
    rough = ng.mixf(ng.clamp01(ng.mul(bands, gilt_on)), rough, 0.45)
    rough = ng.mixf(ng.maxf(pageedge, pageface), rough, 0.88)
    metal = ng.mul(ng.clamp01(ng.mul(bands, gilt_on)), 0.55)
    grain = ng.noise(ng.mapping(pos, location=_seed_loc(seed + 4)), scale=380.0, detail=2)
    height = ng.add(ng.mul(grain, ng.mixf(leather, 0.25, 0.5)), ng.mul(bands, 0.8))
    height = ng.add(height, ng.mul(lab, -0.2))
    height = ng.add(height, ng.mul(leaves, ng.mul(pageedge, 0.4)))
    normal = ng.bump(height, strength=0.18, distance=0.0005)
    principled(mat, ng, col, ng.clamp01(rough), metallic=metal, normal=normal)
    return mat


def py_of(ng, pos):
    return ng.separate_xyz(pos)[1]


def cased_glass(name='cased glass', color='#1B6B45', rim='#CFE6D4', age=0.4, spots=(), seed=0.0, roughness=0.1, edge_radius=0.002, dust=0.5):
    """Cased glass for a lamp shade: deep colour over a white lining that shows at the cut edges, a hard
    clean gloss, streaks of dust on the crown and a few fine scuffs."""
    mat, ng = new_material(name)
    pos = ng.position()
    p = ng.mapping(pos, location=_seed_loc(seed))
    edge = ng.edge_mask(edge_radius)
    cav = ng.cavity_mask(0.01, power=1.0)
    big = ng.noise(p, scale=3.0, detail=3, roughness=0.5)
    swirl = ng.noise(ng.mapping(pos, scale=(1.0, 6.0, 1.0), location=_seed_loc(seed + 1)), scale=14.0, detail=3)
    _, _, nz = ng.separate_xyz(ng.normal())
    base = hex_rgb(color)
    col = ng.mix(ng.mul(swirl, 0.3), base, (0.55, 0.85, 0.6, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.mul(ng.madd(big, 0.5, 0.0), 0.25), col, (1.0, 1.15, 1.0, 1.0), blend='MULTIPLY')
    col = ng.mix(ng.clamp01(ng.mul(edge, 1.3)), col, hex_rgb(rim))
    top = ng.map_range(nz, 0.35, 0.95, 0.0, 1.0)
    dm = ng.mul(top, ng.madd(ng.noise(p, scale=16.0, detail=3), 0.9, 0.2))
    col = ng.mix(ng.clamp01(ng.mul(dm, dust * age)), col, (0.30, 0.34, 0.31, 1.0))
    col = ng.mix(ng.mul(cav, 0.4), col, (0.01, 0.02, 0.014, 1.0))
    rough = ng.madd(swirl, 0.05, roughness - 0.02)
    rough = ng.add(rough, ng.mul(ng.clamp01(ng.mul(dm, dust * age)), 0.5))
    sc = ng.voronoi(ng.mapping(pos, scale=(300.0, 18.0, 300.0), location=_seed_loc(seed + 2)), scale=1.0, feature='DISTANCE_TO_EDGE')
    scr = ng.inv(ng.map_range(sc, 0.0, 0.05, 0.0, 1.0))
    rough = ng.add(rough, ng.mul(scr, 0.06 * age))
    normal = ng.bump(ng.mul(scr, -0.3), strength=0.04, distance=0.0003)
    principled(mat, ng, col, ng.clamp01(rough), metallic=0.0, normal=normal, spec=0.6)
    return mat


def glow(name, color='#FFE2A8', base='#F1E7C8', strength=1.0, roughness=0.4):
    """An emissive surface that stays an emissive factor in the shipped file (not baked): the runtime scales it
    to light the lamp. Returns a plain Principled material with emission."""
    mat, ng = new_material(name)
    out = ng.node('ShaderNodeOutputMaterial')
    bsdf = ng.node('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = hex_rgb(base)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Emission Color'].default_value = hex_rgb(color)
    bsdf.inputs['Emission Strength'].default_value = strength
    ng.tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat
