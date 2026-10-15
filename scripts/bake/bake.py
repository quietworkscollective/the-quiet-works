"""Blender 5.2.2 LTS: static diffuse-only bake, UV1 and inline-ready geometry."""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
from denoise import denoise
from uv import allocate
from seams import mark_seams
from encode import encode

if bpy.app.version != (5, 2, 2):
    raise RuntimeError('Bake requires Blender 5.2.2 LTS')
directory = sys.argv[sys.argv.index('--') + 1]
with open(os.path.join(directory, 'source.json')) as handle:
    manifest = json.load(handle)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(directory, 'source.glb'), merge_vertices=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.seed = 17
scene.cycles.use_denoising = True
scene.cycles.diffuse_bounces = 4
scene.cycles.max_bounces = 6
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'METAL'
if not any(d.use for d in prefs.devices):
    raise RuntimeError('Metal GPU unavailable')
scene.cycles.device = os.environ.get('BAKE_DEVICE', 'CPU')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
meshes = [o for o in scene.objects if o.type == 'MESH' and o.get('bakeRole') != 'occluder']
# The source's Y-up transform is converted to Blender Z-up by the glTF importer.
def point(values):
    return Vector((values[0], -values[2], values[1]))
for index, light in enumerate(manifest['lights']):
    kind = light['type']
    if kind == 'HemisphereLight':
        # Uniform baseline environment: retained only as a diffuse bounce source.
        node = scene.world.node_tree.nodes['Background']
        node.inputs['Color'].default_value = (*light['colour'], 1)
        node.inputs['Strength'].default_value = light['intensity'] * 0.25
        continue
    light_type = 'SUN' if kind == 'DirectionalLight' else 'SPOT' if kind == 'SpotLight' else 'POINT'
    data = bpy.data.lights.new('source_' + str(index), light_type)
    data.color = light['colour']
    data.energy = light['intensity'] if light_type == 'SUN' else light['power']
    if light_type == 'SPOT':
        data.normalize = False
    data.use_shadow = True
    if light_type != 'SUN' and light['distance'] > 0:
        data.use_custom_distance = True
        data.cutoff_distance = light['distance']
    if light_type != 'SUN':
        data.shadow_soft_size = 0.02
    if light_type == 'SPOT':
        data.spot_size = light['angle'] * 2
        data.spot_blend = light['penumbra']
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    obj.location = point(light['position'])
    if 'direction' in light:
        obj.rotation_euler = point(light['direction']).to_track_quat('-Z', 'Y').to_euler()

space = manifest['space']
if space == 'office':
    # Bound rare indirect-path fireflies before encoding the foreground's shared HDR scale.
    # Direct illumination is live; legitimate indirect pools are below this per-sample ceiling.
    scene.cycles.sample_clamp_indirect = 1
    scene.cycles.samples = 128
# Corridor uses a single rectangular image equivalent to two 1K tiles: no extra draws.
groups = ([(meshes, 1860, 930)] if space == 'corridor' else
          [(meshes, 2048, 2048)] if space == 'apartment' else
          [(meshes, 2048, 2048)] if space == 'codex-room' else
          [([], 2048, 2048), ([], 1152 if space == 'office' else 1024, 1152 if space == 'office' else 1024)])
if space == 'office':
    for obj in meshes:
        z = min(-(obj.matrix_world @ vertex.co).y for vertex in obj.data.vertices)
        groups[1 if z > 8 else 0][0].append(obj)
elif space == 'exchange':
    # Keep the board and upper galleries in the large map; the desk and threshold use the compact map.
    for obj in meshes:
        depth = min(-(obj.matrix_world @ vertex.co).y for vertex in obj.data.vertices)
        groups[0 if depth < -4.5 else 1][0].append(obj)
manifest['atlases'] = []
for atlas_index, (objects, width, height) in enumerate(groups):
    if not objects:
        continue
    image = bpy.data.images.new('irradiance_' + str(atlas_index), width, height, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    for obj in objects:
        obj['atlas'] = atlas_index
        # Keep original material UV0. Lightmap uses the second set in glTF.
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UV0')
        uv = obj.data.uv_layers.new(name='Lightmap', do_init=False)
        obj.data.uv_layers.active = uv
        for slot in obj.material_slots:
            material = slot.material.copy()
            slot.material = material
            material.use_nodes = True
            target = material.node_tree.nodes.new('ShaderNodeTexImage')
            target.image = image
            material.node_tree.nodes.active = target
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT' if space != 'corridor' else 'DESELECT')
    if space == 'corridor':
        for obj in objects:
            bm = bmesh.from_edit_mesh(obj.data)
            for face in bm.faces:
                face.select_set(max(-(obj.matrix_world @ vertex.co).y for vertex in face.verts) >= -24)
            bmesh.update_edit_mesh(obj.data)
    # glTF splits vertices at material UV/normal seams; weld positions for connected UV charts.
    # Loop UV0 and custom normals remain, so the runtime's material seams are preserved.
    bpy.ops.mesh.remove_doubles(threshold=0.000001)
    print('STAGE '+str(atlas_index)+': smart UV', flush=True)
    mark_seams(objects)
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.008)
    print('STAGE '+str(atlas_index)+': UV density', flush=True)
    bpy.ops.uv.average_islands_scale()
    print('STAGE '+str(atlas_index)+': UV packing', flush=True)
    density = allocate(objects, width, height, space)
    print('DENSITY '+json.dumps(density), flush=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene.render.bake.margin = 2 if space == 'corridor' else 4
    scene.render.bake.use_clear = True
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    print('STAGE '+str(atlas_index)+': indirect bake', flush=True)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'INDIRECT'}, use_clear=True, margin=scene.render.bake.margin)
    # Cycles diffuse pass has the white Lambert BRDF baked in. three lightMap expects irradiance.
    import numpy as np
    print('STAGE '+str(atlas_index)+': denoise', flush=True)
    radiance = denoise(image)
    values = np.maximum(0, radiance * math.pi)
    if space == 'corridor':
        values[:4, :4] = 0
    scale = encode(values, os.path.join(directory, f'{space}-{atlas_index}.png'), minimum_scale=8 if space == 'corridor' else 0)
    manifest['atlases'].append({'file': f'{space}-{atlas_index}.webp', 'width': width, 'height': height, 'scale': scale, 'encoding': 'srgb-scale', 'bytes': 0, 'density': density})
    # Contact is measured independently; not multiplied into irradiance twice.
    print('STAGE '+str(atlas_index)+': contact AO', flush=True)
    bpy.ops.object.bake(type='AO', use_clear=True, margin=scene.render.bake.margin)
    image.file_format = 'OPEN_EXR'
    image.filepath_raw = os.path.join(directory, f'ao-{atlas_index}.exr')
    image.save()

# No material texture/buffer URI can trigger a connection at runtime.
neutral = bpy.data.materials.new('runtime_rebind')
neutral.use_nodes = True
vertex_colour = neutral.node_tree.nodes.new('ShaderNodeVertexColor')
neutral.node_tree.links.new(vertex_colour.outputs['Color'], neutral.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
for obj in meshes:
    obj.data.materials.clear()
    obj.data.materials.append(neutral)
    obj.data.uv_layers.active_index = 0
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(directory, 'baked.glb'), export_format='GLB', use_selection=True,
    export_extras=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
with open(os.path.join(directory, 'manifest.json'), 'w') as handle:
    json.dump(manifest, handle, indent=2)
