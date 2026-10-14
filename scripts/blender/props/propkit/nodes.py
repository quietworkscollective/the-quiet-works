"""A small shader-node DSL so procedural materials read as recipes, not as socket plumbing.

Every helper returns an output socket. Arguments may be sockets (linked) or plain numbers and
colour tuples (written as default values). Nothing here is specific to one prop.
"""
import bpy
from mathutils import Color


def srgb_to_linear(c):
    """One sRGB channel (0..1) to scene-linear."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def hex_rgb(value, alpha=1.0):
    """'#RRGGBB' (sRGB, as a designer writes it) to a scene-linear RGBA tuple."""
    value = value.lstrip('#')
    r, g, b = (int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def _is_socket(v):
    return isinstance(v, bpy.types.NodeSocket)


class NodeGraph:
    """Wraps one node tree. `ng.noise(...)`, `ng.ramp(...)` and so on add nodes and return sockets."""

    def __init__(self, tree):
        self.tree = tree
        self._col = 0
        self._row = 0

    # -- plumbing -----------------------------------------------------------------------------
    def node(self, idname, **props):
        n = self.tree.nodes.new(idname)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (self._col * 220, self._row * -180)
        self._row += 1
        if self._row > 6:
            self._row = 0
            self._col += 1
        return n

    def _feed(self, socket, value):
        if value is None:
            return
        if _is_socket(value):
            self.tree.links.new(value, socket)
        else:
            socket.default_value = value

    def _set_inputs(self, node, **inputs):
        for name, value in inputs.items():
            self._feed(node.inputs[name.replace('_', ' ')], value)

    # -- inputs -------------------------------------------------------------------------------
    def position(self):
        """World-space position of the shading point (all masks are authored in the assembled pose)."""
        return self.node('ShaderNodeNewGeometry').outputs['Position']

    def normal(self):
        return self.node('ShaderNodeNewGeometry').outputs['Normal']

    def object_coords(self):
        return self.node('ShaderNodeTexCoord').outputs['Object']

    def uv(self):
        return self.node('ShaderNodeTexCoord').outputs['UV']

    def attribute(self, name):
        n = self.node('ShaderNodeAttribute', attribute_name=name)
        return n.outputs['Fac'] if 'Fac' in n.outputs else n.outputs['Factor']

    def mapping(self, vector, scale=(1, 1, 1), location=(0, 0, 0), rotation=(0, 0, 0)):
        n = self.node('ShaderNodeMapping')
        self._set_inputs(n, Vector=vector, Scale=scale, Location=location, Rotation=rotation)
        return n.outputs['Vector']

    def separate_xyz(self, vector):
        n = self.node('ShaderNodeSeparateXYZ')
        self._feed(n.inputs['Vector'], vector)
        return n.outputs['X'], n.outputs['Y'], n.outputs['Z']

    # -- textures -----------------------------------------------------------------------------
    def noise(self, vector, scale=5.0, detail=4.0, roughness=0.5, distortion=0.0, lacunarity=2.0):
        n = self.node('ShaderNodeTexNoise', noise_dimensions='3D', noise_type='FBM')
        self._set_inputs(n, Vector=vector, Scale=scale, Detail=detail, Roughness=roughness,
                         Distortion=distortion, Lacunarity=lacunarity)
        return n.outputs['Factor']

    def noise_vector(self, vector, scale=5.0, detail=3.0, roughness=0.5):
        """The Color output of a noise texture, usable as a displacement vector (domain warping)."""
        n = self.node('ShaderNodeTexNoise', noise_dimensions='3D', noise_type='FBM')
        self._set_inputs(n, Vector=vector, Scale=scale, Detail=detail, Roughness=roughness)
        return n.outputs['Color']

    def wave(self, vector, scale=5.0, distortion=0.0, detail=0.0, detail_scale=1.0, detail_roughness=0.5,
             rings=False, direction='X', profile='SIN', phase=0.0):
        n = self.node('ShaderNodeTexWave', wave_type='RINGS' if rings else 'BANDS',
                      bands_direction=direction, rings_direction=direction, wave_profile=profile)
        self._set_inputs(n, Vector=vector, Scale=scale, Distortion=distortion, Detail=detail,
                         Detail_Scale=detail_scale, Detail_Roughness=detail_roughness, Phase_Offset=phase)
        return n.outputs['Factor']

    def voronoi(self, vector, scale=5.0, feature='F1', randomness=1.0, output='Distance'):
        n = self.node('ShaderNodeTexVoronoi', feature=feature, voronoi_dimensions='3D')
        self._set_inputs(n, Vector=vector, Scale=scale, Randomness=randomness)
        return n.outputs[output]

    def gradient(self, vector, kind='LINEAR'):
        n = self.node('ShaderNodeTexGradient', gradient_type=kind)
        self._feed(n.inputs['Vector'], vector)
        return n.outputs['Factor']

    def image(self, image, vector=None, colorspace=None, interpolation='Linear'):
        n = self.node('ShaderNodeTexImage', image=image, interpolation=interpolation)
        if colorspace:
            image.colorspace_settings.name = colorspace
        if vector is not None:
            self._feed(n.inputs['Vector'], vector)
        return n

    # -- maths --------------------------------------------------------------------------------
    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self._feed(n.inputs[0], a)
        if b is not None:
            self._feed(n.inputs[1], b)
        if c is not None:
            self._feed(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b, clamp=False):
        return self.math('ADD', a, b, clamp=clamp)

    def sub(self, a, b, clamp=False):
        return self.math('SUBTRACT', a, b, clamp=clamp)

    def mul(self, a, b, clamp=False):
        return self.math('MULTIPLY', a, b, clamp=clamp)

    def madd(self, a, m, c, clamp=False):
        """a * m + c."""
        return self.math('MULTIPLY_ADD', a, m, c, clamp=clamp)

    def lerp_f(self, t, a, b):
        return self.mixf(t, a, b)

    def maxf(self, a, b):
        return self.math('MAXIMUM', a, b)

    def minf(self, a, b):
        return self.math('MINIMUM', a, b)

    def inv(self, a):
        return self.math('SUBTRACT', 1.0, a)

    def power(self, a, p):
        return self.math('POWER', a, p)

    def clamp01(self, a):
        return self.math('ADD', a, 0.0, clamp=True)

    def map_range(self, value, lo, hi, out_lo=0.0, out_hi=1.0, clamp=True, steps=None, smooth=False):
        n = self.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=clamp)
        self._feed(n.inputs['Value'], value)
        self._feed(n.inputs[1], lo)
        self._feed(n.inputs[2], hi)
        self._feed(n.inputs[3], out_lo)
        self._feed(n.inputs[4], out_hi)
        return n.outputs['Result']

    def threshold(self, value, edge, softness=0.05):
        """Soft step: 0 below `edge`, 1 above, with a transition `softness` wide."""
        return self.map_range(value, self._lo(edge, softness), self._hi(edge, softness), 0.0, 1.0)

    def _lo(self, edge, softness):
        return self.math('SUBTRACT', edge, softness * 0.5) if _is_socket(edge) else edge - softness * 0.5

    def _hi(self, edge, softness):
        return self.math('ADD', edge, softness * 0.5) if _is_socket(edge) else edge + softness * 0.5

    def vec_math(self, op, a, b=None, scale=None):
        n = self.node('ShaderNodeVectorMath', operation=op)
        self._feed(n.inputs[0], a)
        if b is not None:
            self._feed(n.inputs[1], b)
        if scale is not None:
            self._feed(n.inputs['Scale'], scale)
        return n.outputs['Value'] if op in ('DISTANCE', 'LENGTH', 'DOT_PRODUCT') else n.outputs['Vector']

    # -- colour -------------------------------------------------------------------------------
    def mix(self, fac, a, b, blend='MIX', clamp=True):
        """Colour mix (RGBA). `a` and `b` are sockets or linear RGBA tuples."""
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=clamp)
        self._feed(n.inputs[0], fac)
        self._feed(n.inputs[6], a)
        self._feed(n.inputs[7], b)
        return n.outputs[2]

    def mixf(self, fac, a, b, clamp=True):
        """Scalar mix."""
        n = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=clamp)
        self._feed(n.inputs[0], fac)
        self._feed(n.inputs[2], a)
        self._feed(n.inputs[3], b)
        return n.outputs[0]

    def ramp(self, fac, stops, interpolation='LINEAR'):
        """Colour ramp from [(position, rgba), ...]."""
        n = self.node('ShaderNodeValToRGB')
        n.color_ramp.interpolation = interpolation
        els = n.color_ramp.elements
        while len(els) > len(stops):
            els.remove(els[-1])
        while len(els) < len(stops):
            els.new(0.5)
        for el, (pos, col) in zip(els, stops):
            el.position = pos
            el.color = col
        self._feed(n.inputs['Factor'], fac)
        return n.outputs['Color']

    def scalar_ramp(self, fac, stops):
        """Float ramp from [(position, value), ...] using a colour ramp's red channel."""
        col = self.ramp(fac, [(p, (v, v, v, 1.0)) for p, v in stops])
        return self.separate_color(col)[0]

    def separate_color(self, color):
        n = self.node('ShaderNodeSeparateColor')
        self._feed(n.inputs['Color'], color)
        return n.outputs['Red'], n.outputs['Green'], n.outputs['Blue']

    def combine_color(self, r, g, b):
        n = self.node('ShaderNodeCombineColor')
        self._feed(n.inputs['Red'], r)
        self._feed(n.inputs['Green'], g)
        self._feed(n.inputs['Blue'], b)
        return n.outputs['Color']

    # -- geometry-aware masks -----------------------------------------------------------------
    def ao(self, distance=0.02, inside=False, local=False, normal=None):
        n = self.node('ShaderNodeAmbientOcclusion', inside=inside, only_local=local, samples=16)
        self._feed(n.inputs['Distance'], distance)
        if normal is not None:
            self._feed(n.inputs['Normal'], normal)
        return n.outputs['AO']

    def edge_mask(self, radius=0.002, power=1.0):
        """Convex-edge mask: AO traced from inside the solid is high where the surface is a rounded
        edge or corner, and zero on flats. Works on any topology, unlike a vertex attribute."""
        v = self.ao(distance=radius, inside=True)
        v = self.inv(v)
        return self.power(v, power) if power != 1.0 else v

    def cavity_mask(self, distance=0.02, power=1.0):
        """Recess mask: 1 deep in crevices, 0 on open surface."""
        v = self.inv(self.ao(distance=distance, inside=False))
        return self.power(v, power) if power != 1.0 else v

    def bump(self, height, strength=0.3, distance=0.001, invert=False, normal=None):
        n = self.node('ShaderNodeBump', invert=invert)
        self._feed(n.inputs['Height'], height)
        self._feed(n.inputs['Strength'], strength)
        self._feed(n.inputs['Distance'], distance)
        if normal is not None:
            self._feed(n.inputs['Normal'], normal)
        return n.outputs['Normal']

    def blackbody(self, kelvin):
        n = self.node('ShaderNodeBlackbody')
        self._feed(n.inputs['Temperature'], kelvin)
        return n.outputs['Color']


def new_material(name):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    tree = mat.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    return mat, NodeGraph(tree)


def principled(mat, ng, base_color, roughness, metallic=0.0, normal=None, ior=1.45, spec=None,
               coat=None, coat_rough=None, sheen=None, sheen_rough=0.5, anisotropic=None):
    """Attach a Principled BSDF and Material Output to `mat`. Inputs may be sockets or constants."""
    out = ng.node('ShaderNodeOutputMaterial')
    bsdf = ng.node('ShaderNodeBsdfPrincipled')
    ng._feed(bsdf.inputs['Base Color'], base_color)
    ng._feed(bsdf.inputs['Roughness'], roughness)
    ng._feed(bsdf.inputs['Metallic'], metallic)
    ng._feed(bsdf.inputs['IOR'], ior)
    if normal is not None:
        ng._feed(bsdf.inputs['Normal'], normal)
    if spec is not None:
        ng._feed(bsdf.inputs['Specular IOR Level'], spec)
    if coat is not None:
        ng._feed(bsdf.inputs['Coat Weight'], coat)
        if coat_rough is not None:
            ng._feed(bsdf.inputs['Coat Roughness'], coat_rough)
    if sheen is not None:
        ng._feed(bsdf.inputs['Sheen Weight'], sheen)
        ng._feed(bsdf.inputs['Sheen Roughness'], sheen_rough)
    if anisotropic is not None:
        ng._feed(bsdf.inputs['Anisotropic'], anisotropic)
    ng.tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return bsdf
