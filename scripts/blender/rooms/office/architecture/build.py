"""Office architectural fittings, authored in metres with glTF X/Y/Z coordinates.

Rebuild and validate: node scripts/blender/rooms/office/architecture/run.ts
Raw exports / optional private previews:
  blender -b --factory-startup --python scripts/blender/rooms/office/architecture/build.py \
    -- --work <scratch-directory> --preview
No inscriptions are part of these models. All label surfaces remain blank.
"""
import argparse
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / 'props'))
from propkit import geo, kit  # noqa: E402


def xyz(p):
    """glTF right/up/front to Blender right/back/up, a proper rotation."""
    return (p[0], -p[2], p[1])


def block(size, at=(0, 0, 0), bevel=.0015, segs=1):
    return geo.box((size[0], size[2], size[1]), xyz(at), bevel=bevel, segs=segs)


def turned(profile, at, axis=(0, 0, 1), segments=24):
    return geo.place(geo.lathe(profile, segments=segments), xyz(at), xyz(axis))


def rod(a, b, r, segments=12):
    d = Vector(b) - Vector(a)
    return turned([(0, 0), (r, 0), (r, d.length), (0, d.length)], a, d, segments)


def perimeter(w, h, depth, rail, at=(0, 0, 0), bevel=.001):
    x, y, z = at
    return geo.merge(
        block((w, rail, depth), (x, y + (h-rail)/2, z), bevel),
        block((w, rail, depth), (x, y - (h-rail)/2, z), bevel),
        block((rail, h-2*rail, depth), (x-(w-rail)/2, y, z), bevel),
        block((rail, h-2*rail, depth), (x+(w-rail)/2, y, z), bevel))


def capsule_ring(w, h, rail, depth, at):
    """Rounded slot surround, with an actual opening rather than a painted rectangle."""
    contours = []
    for width, height in [(w, h), (w-2*rail, h-2*rail)]:
        radius = height/2
        contours.append([(cx + radius*math.cos(a), radius*math.sin(a))
                         for cx, start in [(width/2-radius, -math.pi/2), (-width/2+radius, math.pi/2)]
                         for a in [start + math.pi*k/8 for k in range(9)]])
    verts = [xyz((at[0]+x, at[1]+y, at[2]+z))
             for z in [-depth/2, depth/2] for ring in contours for x, y in ring]
    n = len(contours[0])
    faces = []
    for i in range(n):
        j = (i+1) % n
        faces.extend([(i, j, n+j, n+i), (2*n+i, 3*n+i, 3*n+j, 2*n+j),
                      (i, 2*n+i, 2*n+j, j), (n+i, n+j, 3*n+j, 3*n+i)])
    import bmesh
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def material(name, colors, work, metallic=0, roughness=.5, alpha=1, emission=None):
    """Small deterministic, text-free finish map. Palette rows share one material."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    # Closed surfaces do not need double-sided draws; in particular the blended
    # glazing must not request the renderer's second transparency pass.
    m.use_backface_culling = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        m.surface_render_method = 'DITHERED'
    if emission:
        p.inputs['Base Color'].default_value = (*emission, 1)
        p.inputs['Emission Color'].default_value = (*emission, 1)
        p.inputs['Emission Strength'].default_value = .65
    else:
        image = bpy.data.images.new(name, 64, 64, alpha=False)
        rng = random.Random(1971)
        pixels = []
        for y in range(64):
            c = colors[min(len(colors)-1, y*len(colors)//64)]
            for x in range(64):
                grain = 1 + rng.uniform(-.022, .022) + .008*math.sin(x*.7)
                pixels.extend([min(1, max(0, v*grain)) for v in c] + [1])
        image.pixels.foreach_set(pixels)
        image.filepath_raw = str(work / f'{name}.png')
        image.file_format = 'PNG'
        image.save()
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        m.node_tree.links.new(tex.outputs['Color'], p.inputs['Base Color'])
    return m


class Assembly:
    def __init__(self, name):
        self.root = kit.make_root(name)
        self.bags = {}

    def add(self, name, mat, bm, palette=0, bands=1, parent=None, pivot=(0, 0, 0)):
        # UVs stay inside a palette row. No scene content enters the finish maps.
        uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
        for face in bm.faces:
            for loop in face.loops:
                v = loop.vert.co
                loop[uv].uv = (.1 + .8*((v.x*.31 + v.y*.19) % 1),
                               (palette + .15 + .7*((v.z*.37 + v.y*.13) % 1))/bands)
        key = (name, mat, parent or self.root, tuple(pivot))
        self.bags.setdefault(key, []).append(bm)

    def empty(self, name, at):
        obj = kit.make_root(name)
        obj.parent = self.root
        obj.location = xyz(at)
        return obj

    def finish(self):
        for (name, mat, parent, pivot), parts in self.bags.items():
            kit.add_part(parent, name, geo.merge(*parts), mat, location=xyz(pivot))
        bpy.context.view_layer.update()
        return self.root


def board(work):
    a = Assembly('application-board')
    enamel = material('board-enamel', [(.14,.21,.19), (.84,.81,.72)], work, roughness=.34)
    brass = material('board-brass', [(.62,.48,.24)], work, metallic=.78, roughness=.36)
    amber = material('board-amber', [], work, roughness=.24, emission=(.67,.34,.08))
    a.add('board-shell', enamel, block((1.95,.62,.048), (0,0,-.001), .005, 2), bands=2)
    a.add('board-trim', brass, perimeter(1.95,.62,.006,.009,(0,0,.023),.0015))
    # Rear folded seams and wall stand-offs; all static fittings share the brass node.
    for x in [-.77,.77]:
        a.add('board-trim', brass, block((.026,.42,.003),(x,0,-.027),.0008))
    for x in [-.941,.941]:
        for y in [-.276,.276]:
            a.add('board-trim', brass, turned([(0,0),(.006,0),(.006,.002),(.004,.003),(0,.003)],(x,y,.026),segments=12))
    for i in range(5):
        x = -.78 + i*.39
        # Open, stepped collar. The fifth socket contains a recessed contact, never a lens.
        a.add('board-trim', brass, turned([(.029,-.023),(.036,-.023),(.036,.006),(.034,.009),
                                          (.030,.009),(.029,.006),(.029,-.023)], (x,-.02,.045)))
        a.add('board-shell', enamel, turned([(0,0),(.028,0),(.028,.003),(0,.003)],(x,-.02,.024)), bands=2)
        if i == 4:
            a.add('board-trim', brass, turned([(0,0),(.004,0),(.004,.002),(0,.002)],(x,-.02,.027),segments=12))
        else:
            # Same 30 mm spherical lens envelope as the runtime primitive.
            profile = [(.03*math.sin(math.pi*k/12), -.03*math.cos(math.pi*k/12)) for k in range(13)]
            a.add(f'lamp-{i+1}', amber, turned(profile,(0,0,0),segments=20), pivot=(x,-.02,.057))
            # Catch centre is a translation pivot, matching the existing tab's resting pose.
            a.add(f'catch-{i+1}', enamel, block((.36,.13,.006),(0,0,0),.002,2),
                  palette=1,bands=2,pivot=(x,-.17,.060))
            for dx in [-.171,.171]:
                a.add('board-trim', brass, block((.008,.252,.006),(x+dx,-.132,.044),.001))
                a.add('board-trim', brass, turned([(0,0),(.005,0),(.005,.002),(0,.002)],(x+dx,-.252,.047),segments=12))
    return a.finish()


def window(work):
    a = Assembly('employee-window')
    enamel = material('window-enamel', [(.21,.26,.24)], work, metallic=.18, roughness=.38)
    brass = material('window-brass', [(.60,.48,.28)], work, metallic=.76, roughness=.40)
    glass = material('window-glass', [(.77,.85,.82)], work, roughness=.16, alpha=.12)
    # Original 1.66 x 1.22 frame envelope, 30 mm profiles and 200 mm sill depth.
    a.add('window-frame', enamel, perimeter(1.66,1.22,.20,.030,bevel=.003))
    a.add('window-hardware', brass, perimeter(1.566,1.116,.012,.012,(0,0,.040),.001))
    for i in range(10):
        x = -.675+i*.15
        bottom = -.283 if abs(x)<.18 else -.525
        a.add('window-hardware', brass, rod((x,bottom,.060),(x,.525,.060),.007))
    for y in [-.23,-.08,.07,.22,.37,.52]:
        a.add('window-hardware', brass, rod((-.75,y,.064),(.75,y,.064),.0015,8))
    # Upper glazing and two cheeks leave the speaking aperture genuinely open.
    a.add('window-glazing', glass, block((1.50,.82,.004),(0,.135,.050),.0005,1))
    for side in [-1,1]:
        a.add('window-glazing', glass, block((.565,.24,.004),(side*.4675,-.395,.050),.0005,1))
    a.add('window-hardware', brass, perimeter(.35,.22,.010,.015,(0,-.40,-.020),.001))
    pivot = a.empty('speaking-flap',(0,-.305,-.035))
    a.add('flap-panel',enamel,block((.32,.19,.015),(0,-.095,-.015),.0025,2),parent=pivot)
    a.add('flap-hardware',brass,perimeter(.307,.178,.003,.006,(0,-.095,-.024),.0008),parent=pivot)
    # Cranked pull and segmented hinge knuckles belong to the moving node.
    for x in [-.038,.038]:
        a.add('flap-hardware',brass,rod((x,-.156,-.024),(x,-.156,-.058),.004),parent=pivot)
    a.add('flap-hardware',brass,rod((-.038,-.156,-.058),(.038,-.156,-.058),.004),parent=pivot)
    for x in [-.14,.14]:
        a.add('flap-hardware',brass,rod((x-.012,0,0),(x+.012,0,0),.006),parent=pivot)
        a.add('window-hardware',brass,rod((x-.018,-.305,-.035),(x-.013,-.305,-.035),.007))
        a.add('window-hardware',brass,rod((x+.013,-.305,-.035),(x+.018,-.305,-.035),.007))
    a.add('window-hardware',brass,block((.023,.028,.010),(.168,-.398,-.039),.002))
    for x in [-.8,.8]:
        for y in [-.57,.57]:
            a.add('window-hardware',brass,turned([(0,0),(.005,0),(.005,.002),(0,.002)],(x,y,-.102),(0,0,-1),12))
    return a.finish()


def sign(work):
    a = Assembly('certificate-sign')
    enamel = material('sign-enamel', [(.14,.21,.19)], work, metallic=.12, roughness=.28)
    brass = material('sign-brass', [(.64,.52,.30)], work, metallic=.78, roughness=.38)
    # The centre of the original runtime plane is the root, and +Z faces the visitor after yaw PI.
    a.add('sign-face',enamel,block((1.60,.26,.016),(0,0,-.012),.004,2))
    a.add('sign-metal',brass,perimeter(1.60,.26,.005,.008,(0,0,-.0045),.0015))
    a.add('sign-metal',brass,perimeter(1.582,.242,.002,.003,(0,0,-.003),.0005))
    for x in [-.59,.59]:
        # Folded wall brackets with slotted feet and triangular gussets.
        a.add('sign-metal',brass,block((.028,.16,.006),(x,0,-.079),.0015))
        for y in [-.057,.057]:
            a.add('sign-metal',brass,rod((x,y,-.075),(x,y,-.020),.004))
            a.add('sign-metal',brass,rod((x,y,-.072),(x,y*.35,-.021),.003))
        for y in [-.09,.09]:
            a.add('sign-metal',brass,turned([(0,0),(.0045,0),(.0045,.003),(0,.003)],(x,y,-.004),segments=12))
    return a.finish()


def archive(work):
    a = Assembly('archive-bay')
    steel = material('archive-steel', [(.29,.35,.31)], work, metallic=.48, roughness=.62)
    card = material('archive-card', [(.61,.53,.39),(.55,.49,.38),(.68,.61,.47)], work, roughness=.87)
    paper = material('archive-label', [(.83,.80,.71)], work, roughness=.78)
    # Floor-centred 3 m module: pressed angle uprights, folded trays, feet and rear bracing.
    for x in [-1.4775,-.47,.47,1.4775]:
        for z in [-.2775,.2775]:
            a.add('bay-frame',steel,block((.045,2.8,.002),(x,1.4,z),.0005,1))
            a.add('bay-frame',steel,block((.002,2.8,.045),(x,1.4,z),.0005,1))
            a.add('bay-frame',steel,block((.045,.006,.045),(x,.003,z),.001))
    for y in [.13,.77,1.41,2.05,2.78]:
        a.add('bay-frame',steel,block((2.952,.006,.55),(0,y,0),.001))
        for z in [-.29,.29]:
            a.add('bay-frame',steel,block((3,.040,.020),(0,y-.018,z),.0015))
        for x in [-1.48,1.48]:
            a.add('bay-frame',steel,block((.04,.040,.56),(x,y-.018,0),.001))
    a.add('bay-frame',steel,rod((-1.45,.15,-.285),(1.45,2.74,-.285),.005,8))
    a.add('bay-frame',steel,rod((1.45,.15,-.285),(-1.45,2.74,-.285),.005,8))
    for row in range(4):
        y = .134 + row*.64
        for col in range(3):
            x = (col-1)*.94 + (.014 if row%2 else -.014)
            h = [.46,.50,.43][(col+row)%3]
            w, d = .80,.49
            palette = (col+row)%3
            # Lift-off lid has a shadow seam and an overhanging folded skirt.
            a.add('bay-cartons',card,block((w,h,d),(x,y+h/2,-.008),.004,1),palette,3)
            a.add('bay-cartons',card,block((w+.020,.028,d+.020),(x+.002,y+h+.016,-.007),.003,1),palette,3)
            a.add('bay-cartons',card,perimeter(w+.016,.040,.002,.008,(x,y+h-.01,.243),.0005),palette,3)
            a.add('bay-frame',steel,capsule_ring(.114,.033,.003,.002,(x,y+h*.70,.239)))
            # Dark finger recess, surrounded by the turned slot lip; no letter-like markings.
            a.add('bay-frame',steel,block((.105,.026,.001),(x,y+h*.70,.238),.004,1))
            a.add('bay-frame',steel,perimeter(.18,.069,.004,.004,(x,y+.115,.240),.0007))
            a.add('bay-labels',paper,block((.170,.059,.001),(x,y+.115,.243),.0005,1))
    return a.finish()


BUILDERS = {'application-board':board, 'employee-window':window,
            'certificate-sign':sign, 'archive-bay':archive}


def export(root, path):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_yup=True, export_apply=False, export_materials='EXPORT',
                             export_image_format='AUTO', export_texcoords=True, export_normals=True,
                             export_tangents=False, export_vertex_color='NONE', export_cameras=False,
                             export_lights=False, export_animations=False, export_extras=False)


def preview(root, work):
    """Private render of the authored assembly, without baking lighting into its textures."""
    meshes = kit.part_objects(root)
    lo, hi = kit.bounds(meshes)
    target = (lo+hi)*.5
    extent = max(hi-lo)
    front = -1 if root.name=='employee-window' else 1
    camera = bpy.data.objects.new('preview-camera', bpy.data.cameras.new('preview-camera'))
    bpy.context.scene.collection.objects.link(camera)
    camera.location = target + Vector((extent*.27, -front*extent*1.8, extent*.60))
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = extent*1.62
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.world = bpy.data.worlds.new('preview-world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.12,.15,.14,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
    for name, offset, power, size in [('key',(-.6,-front*.9,1.1),500,2),('fill',(1,-front*.6,.2),220,1.5),('edge',(-.8,front*.4,.8),350,1)]:
        light = bpy.data.lights.new(name,'AREA')
        light.energy = power*max(1,extent)
        light.shape = 'DISK'
        light.size = size*max(1,extent)
        obj = bpy.data.objects.new(name,light)
        scene.collection.objects.link(obj)
        obj.location = target + Vector(offset)*max(1,extent)
        obj.rotation_euler = (target-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(work / f'{root.name}.png')
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', required=True, type=Path)
    parser.add_argument('--only', choices=BUILDERS)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.work.mkdir(parents=True, exist_ok=True)
    for name, builder in BUILDERS.items():
        if args.only and args.only!=name:
            continue
        kit.reset_scene()
        root = builder(args.work)
        export(root,args.work / f'{name}.raw.glb')
        if args.preview:
            preview(root,args.work)


if __name__=='__main__':
    main()
