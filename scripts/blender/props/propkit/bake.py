"""Atlas baking: unwrap and pack every part into one UV space, bake the authored Principled
materials with Cycles into base colour, occlusion-roughness-metallic and normal images, and
rebuild a single image-textured material the glTF exporter can carry.
"""
import math
import os
import struct
import time
import zlib

import bpy
import numpy as np

from .nodes import NodeGraph, linear_to_srgb


# ---------------------------------------------------------------------------------------------
# Cycles on the Metal GPU
# ---------------------------------------------------------------------------------------------

def setup_cycles(samples=64, device='GPU'):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('METAL', 'OPTIX', 'CUDA', 'HIP', 'NONE'):
        try:
            prefs.compute_device_type = kind
            break
        except TypeError:
            continue
    prefs.get_devices()
    gpu = False
    for d in prefs.devices:
        d.use = d.type != 'CPU'
        gpu = gpu or d.use
    scene.cycles.device = 'GPU' if (gpu and device == 'GPU') else 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    print(f'  cycles device: {scene.cycles.device}')
    return scene.cycles.device


# ---------------------------------------------------------------------------------------------
# UV layout
# ---------------------------------------------------------------------------------------------

def _enter_edit(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')


def unwrap_and_pack(parts, margin_px=6, size=1024, island_margin=0.004, shape_method='CONCAVE'):
    """Smart-project auto faces, then place each object's UV charts in one shared atlas.

    Blender's multi-object UV pack can leave mesh UVs in their authored world-space range. Packing
    each object into its own area-weighted atlas cell keeps the object and pivot boundaries intact
    while making every exported UV usable by glTF.
    """
    import bmesh
    ts = bpy.context.scene.tool_settings
    ts.use_uv_select_sync = True
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    uv_data = []
    for o in parts:
        uv = o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
        o.data.uv_layers.active = uv
        attr = o.data.attributes.get('uvauto')
        if attr is not None and any(d.value for d in attr.data):
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.mode_set(mode='EDIT')
            bm = bmesh.from_edit_mesh(o.data)
            flag = bm.faces.layers.int.get('uvauto')
            for f in bm.faces:
                f.select_set(bool(f[flag]))
            bm.select_flush_mode()
            bmesh.update_edit_mesh(o.data)
            bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=island_margin, area_weight=0.0,
                                     correct_aspect=True, scale_to_bounds=False)
            bpy.ops.object.mode_set(mode='OBJECT')

        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=max(island_margin, 0.055),
                                shape_method=shape_method)
        bpy.ops.object.mode_set(mode='OBJECT')

        uv = o.data.uv_layers['UVMap']
        coords = [loop.uv.copy() for loop in uv.data]
        if not coords:
            continue
        lo_u = min(value.x for value in coords)
        hi_u = max(value.x for value in coords)
        lo_v = min(value.y for value in coords)
        hi_v = max(value.y for value in coords)
        if hi_u - lo_u < 1e-8 or hi_v - lo_v < 1e-8:
            raise RuntimeError(f'UV pack produced a degenerate chart on {o.name}')
        area = sum(poly.area for poly in o.data.polygons)
        uv_data.append((o, uv, coords, lo_u, hi_u, lo_v, hi_v, max(area, 1e-8)))

    if not uv_data:
        return

    total_area = sum(entry[7] for entry in uv_data)
    atlas_area = 0.70
    minimum_cell = max(16 / size, margin_px / size * 2.0)
    gap = max(2 / size, margin_px / size)
    cells = []
    for entry in uv_data:
        side = max(minimum_cell, math.sqrt(entry[7] / total_area * atlas_area))
        cells.append((side, entry))
    cells.sort(key=lambda item: item[0], reverse=True)

    def arrange(scale):
        x = y = row_height = 0.0
        placements = []
        for base_side, entry in cells:
            side = max(minimum_cell, base_side * scale)
            if x + side > 1.0 + 1e-8:
                x = 0.0
                y += row_height + gap
                row_height = 0.0
            if y + side > 1.0 + 1e-8:
                return None
            placements.append((entry, x, y, side))
            x += side + gap
            row_height = max(row_height, side)
        return placements

    placements = next((layout for factor in (1.0, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76, 0.73, 0.70)
                       if (layout := arrange(factor)) is not None), None)
    if placements is None:
        raise RuntimeError('Could not fit material charts in the shared atlas')

    inset = max(2 / size, min(margin_px, max(4, size // 128)) / size)
    for entry, x, y, side in placements:
        o, uv, coords, lo_u, hi_u, lo_v, hi_v, _area = entry
        span = side - 2 * inset
        if span <= 0:
            raise RuntimeError(f'UV atlas cell is too small for {o.name}')
        width, height = hi_u - lo_u, hi_v - lo_v
        for item, value in zip(uv.data, coords):
            item.uv = (x + inset + ((value.x - lo_u) / width) * span,
                       y + inset + ((value.y - lo_v) / height) * span)

    values = [component for o, uv, *_rest in uv_data for loop in uv.data for component in loop.uv]
    if min(values) < -1e-6 or max(values) > 1.0 + 1e-6:
        raise RuntimeError(f'UV atlas escaped 0..1: {min(values):.4f}..{max(values):.4f}')


# ---------------------------------------------------------------------------------------------
# Bake
# ---------------------------------------------------------------------------------------------

def _material_nodes(mat):
    tree = mat.node_tree
    out = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL')
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    return tree, out, bsdf


def _new_data_image(name, size, float_buffer=True):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buffer, is_data=True)
    img.colorspace_settings.name = 'Non-Color'
    return img


def _read(img):
    n = img.size[0] * img.size[1]
    arr = np.empty(n * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(img.size[1], img.size[0], 4)


def write_png(path, rgb, bits=8):
    """Minimal PNG writer for an (h, w, 3|4) uint8 array. Row 0 is the top row."""
    h, w, c = rgb.shape
    colour = {3: 2, 4: 6}[c]
    raw = b''.join(b'\x00' + rgb[y].tobytes() for y in range(h))

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, bits, colour, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


def bake_atlas(parts, size, work_dir, name, ao_distance=0.3, samples=96, ao_samples=256, floor=True, log=print):
    """Bake base colour, roughness, metallic, AO and normal for every part; returns a dict of numpy arrays.

    Each part's authored material must hold one Principled BSDF feeding a Material Output.
    """
    scene = bpy.context.scene
    setup_cycles(samples=samples)
    margin = max(4, size // 128)
    materials = []
    for o in parts:
        for slot in o.material_slots:
            if slot.material and slot.material not in materials:
                materials.append(slot.material)

    # Helper nodes: an active image node per material is what the bake writes into.
    state = {}
    for m in materials:
        tree, out, bsdf = _material_nodes(m)
        img_node = tree.nodes.new('ShaderNodeTexImage')
        emit = tree.nodes.new('ShaderNodeEmission')
        state[m] = (tree, out, bsdf, img_node, emit)

    world = scene.world or bpy.data.worlds.new('BakeWorld')
    scene.world = world
    world.light_settings.distance = ao_distance
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (1, 1, 1, 1)
        bg.inputs['Strength'].default_value = 1.0

    ground = None
    if floor:
        bpy.ops.mesh.primitive_plane_add(size=6.0, location=(0, 0, 0))
        ground = bpy.context.object
        ground.name = '_bake_ground'

    def select_parts():
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]

    def point_image(img):
        for m, (tree, out, bsdf, img_node, emit) in state.items():
            img_node.image = img
            img_node.select = True
            tree.nodes.active = img_node

    def link_surface(m, socket):
        tree, out, bsdf, img_node, emit = state[m]
        tree.links.new(socket, out.inputs['Surface'])

    def emit_channel(channel):
        for m, (tree, out, bsdf, img_node, emit) in state.items():
            sock = bsdf.inputs[channel]
            if sock.is_linked:
                tree.links.new(sock.links[0].from_socket, emit.inputs['Color'])
            else:
                v = sock.default_value
                if channel == 'Base Color':
                    emit.inputs['Color'].default_value = tuple(v)
                else:
                    emit.inputs['Color'].default_value = (v, v, v, 1.0)
            tree.links.new(emit.outputs['Emission'], out.inputs['Surface'])

    results = {}
    select_parts()
    for channel, key in (('Base Color', 'base'), ('Roughness', 'rough'), ('Metallic', 'metal')):
        log(f'  bake {key}')
        t_ = time.time()
        img = _new_data_image(f'{name}_{key}', size)
        point_image(img)
        emit_channel(channel)
        select_parts()
        bpy.ops.object.bake(type='EMIT', margin=margin, margin_type='EXTEND', use_clear=True)
        results[key] = _read(img)[:, :, :3].copy()
        bpy.data.images.remove(img)
        log(f'    {time.time() - t_:.1f}s')
    for m in materials:
        tree, out, bsdf, img_node, emit = state[m]
        tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    log('  bake normal')
    img = _new_data_image(f'{name}_normal', size)
    point_image(img)
    select_parts()
    bpy.ops.object.bake(type='NORMAL', margin=margin, margin_type='EXTEND', use_clear=True, normal_space='TANGENT')
    results['normal'] = _read(img)[:, :, :3].copy()
    bpy.data.images.remove(img)

    log('  bake ao')
    scene.cycles.samples = ao_samples
    img = _new_data_image(f'{name}_ao', size)
    point_image(img)
    select_parts()
    bpy.ops.object.bake(type='AO', margin=margin, margin_type='EXTEND', use_clear=True)
    results['ao'] = _read(img)[:, :, 0].copy()
    bpy.data.images.remove(img)

    for m, (tree, out, bsdf, img_node, emit) in state.items():
        tree.nodes.remove(img_node)
        tree.nodes.remove(emit)
    if ground is not None:
        bpy.data.objects.remove(ground, do_unlink=True)
    return results


# ---------------------------------------------------------------------------------------------
# Packing and the shipping material
# ---------------------------------------------------------------------------------------------

def save_textures(maps, work_dir, name, ao_strength=1.0):
    """Write base colour (sRGB), ORM and normal PNGs; returns their paths. Image row 0 is the bottom in
    Blender, so rows are flipped on the way out."""
    os.makedirs(work_dir, exist_ok=True)
    base = np.clip(maps['base'], 0.0, 1.0)
    lin = np.where(base <= 0.0031308, base * 12.92, 1.055 * np.power(base, 1 / 2.4) - 0.055)
    base8 = np.round(np.clip(lin, 0, 1) * 255).astype(np.uint8)
    ao = np.clip(maps['ao'], 0, 1)
    ao = 1.0 - (1.0 - ao) * ao_strength
    orm = np.stack([ao, np.clip(maps['rough'][:, :, 0], 0, 1), np.clip(maps['metal'][:, :, 0], 0, 1)], axis=2)
    orm8 = np.round(orm * 255).astype(np.uint8)
    nrm = np.clip(maps['normal'], 0, 1)
    nrm8 = np.round(nrm * 255).astype(np.uint8)
    paths = {}
    for key, arr in (('basecolor', base8), ('orm', orm8), ('normal', nrm8)):
        p = os.path.join(work_dir, f'{name}_{key}.png')
        write_png(p, np.ascontiguousarray(arr[::-1]))
        paths[key] = p
    return paths


def _occlusion_group():
    existing = bpy.data.node_groups.get('glTF Material Output')
    if existing:
        return existing
    g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def build_shipping_material(name, paths):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    tree = mat.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    ng = NodeGraph(tree)
    out = ng.node('ShaderNodeOutputMaterial')
    bsdf = ng.node('ShaderNodeBsdfPrincipled')
    tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    base_img = bpy.data.images.load(paths['basecolor'])
    base_img.colorspace_settings.name = 'sRGB'
    base_img.pack()
    orm_img = bpy.data.images.load(paths['orm'])
    orm_img.colorspace_settings.name = 'Non-Color'
    orm_img.pack()
    nrm_img = bpy.data.images.load(paths['normal'])
    nrm_img.colorspace_settings.name = 'Non-Color'
    nrm_img.pack()
    base_tex = ng.image(base_img)
    orm_tex = ng.image(orm_img)
    nrm_tex = ng.image(nrm_img)
    r, g, b = ng.separate_color(orm_tex.outputs['Color'])
    tree.links.new(base_tex.outputs['Color'], bsdf.inputs['Base Color'])
    tree.links.new(g, bsdf.inputs['Roughness'])
    tree.links.new(b, bsdf.inputs['Metallic'])
    nm = ng.node('ShaderNodeNormalMap')
    tree.links.new(nrm_tex.outputs['Color'], nm.inputs['Color'])
    tree.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    grp = ng.node('ShaderNodeGroup')
    grp.node_tree = _occlusion_group()
    tree.links.new(r, grp.inputs['Occlusion'])
    return mat


def assign_single_material(parts, mat):
    for o in parts:
        o.data.materials.clear()
        o.data.materials.append(mat)
