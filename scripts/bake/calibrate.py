"""Known 10-candela source, 2 m above a white receiver; diffuse irradiance must be 2.5."""
import bpy
import json
import math
import sys
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
bpy.ops.mesh.primitive_plane_add(size=1)
plane = bpy.context.object
material = bpy.data.materials.new('receiver')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (1,1,1,1)
bsdf.inputs['Roughness'].default_value = 1
plane.data.materials.append(material)
image = bpy.data.images.new('calibration',32,32,float_buffer=True)
image.colorspace_settings.name = 'Non-Color'
node = material.node_tree.nodes.new('ShaderNodeTexImage')
node.image = image
material.node_tree.nodes.active = node
args = sys.argv[sys.argv.index('--')+1:]
kind = args[1] if len(args)>1 else 'point'
light = bpy.data.lights.new('10cd','SPOT' if kind == 'spot' else 'POINT')
light.energy = float(args[2]) if len(args)>2 else 10 * 4 * math.pi
if kind == 'spot':
    light.spot_size=1.24
    light.spot_blend=.75
    light.normalize=False
light.shadow_soft_size = 0
obj = bpy.data.objects.new('source',light)
scene.collection.objects.link(obj)
obj.location = (0,0,2)
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT'},margin=0)
centre = (16 * 32 + 16) * 4
value = image.pixels[centre] * math.pi
result = {'irradiance': value, 'expected': 2.5, 'relativeError': abs(value - 2.5)/2.5, 'tolerance': .03}
print('CALIBRATION ' + json.dumps(result))
with open(sys.argv[sys.argv.index('--')+1], 'w') as handle:
    json.dump(result, handle, indent=2)
if result['relativeError'] > result['tolerance']:
    raise RuntimeError('Physical light calibration exceeds 3% tolerance')
