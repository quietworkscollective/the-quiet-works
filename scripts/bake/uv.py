"""Chart-area density allocation with an eight-pixel atlas gutter."""
import math
import bpy
import numpy as np

def charts(objects, width, height, space):
    result = []
    for obj in objects:
        mesh = obj.data
        uvs = mesh.uv_layers.active.data
        parents = list(range(len(mesh.polygons)))
        def root(i):
            while parents[i] != i:
                parents[i] = parents[parents[i]]
                i = parents[i]
            return i
        connected = {}
        for face in mesh.polygons:
            for loop in face.loop_indices:
                key = tuple(round(v, 6) for v in uvs[loop].uv)
                if key in connected:
                    parents[root(face.index)] = root(connected[key])
                else:
                    connected[key] = face.index
        islands = {}
        for face in mesh.polygons:
            islands.setdefault(root(face.index), []).append(face)
        for faces in islands.values():
            loops = [loop for face in faces for loop in face.loop_indices]
            world = [obj.matrix_world @ mesh.vertices[mesh.loops[loop].vertex_index].co for loop in loops]
            zs = [-v.y for v in world]
            if space == 'corridor':
                region = 'near' if max(zs) > -24 else 'distant'
                target = 24 if region == 'near' else 12
            elif min(zs) > 8:
                region, target = 'archive', 12
            elif all(-2.4 < v.x < .6 and 3.1 < -v.y < 4.9 and v.z < 1.3 for v in world):
                region, target = 'desk', 64
            else:
                region, target = 'foreground', 32
            area = 0
            uv_area = 0
            for face in faces:
                indices = list(face.loop_indices)
                first = indices[0]
                for i in range(1, len(indices)-1):
                    tri = [first, indices[i], indices[i+1]]
                    a,b,c = [obj.matrix_world @ mesh.vertices[mesh.loops[j].vertex_index].co for j in tri]
                    u,v,w = [uvs[j].uv for j in tri]
                    area += (b-a).cross(c-a).length / 2
                    uv_area += abs((v-u).cross(w-u)) / 2
            if area < 1e-10 or uv_area < 1e-14:
                continue
            density = math.sqrt(uv_area * width * height / area)
            result.append((uvs, loops, region, target, density, area, obj))
    return result

def scale_charts(items, shrink_only=False):
    for uvs, loops, _region, target, density, _area, _obj in items:
        ratio = min(1, target / density) if shrink_only else target / density
        coords = [uvs[i].uv.copy() for i in loops]
        centre = sum(coords, coords[0] * 0) / len(coords)
        for i, uv in zip(loops, coords):
            uvs[i].uv = centre + (uv - centre) * ratio

def metric_projection(items, width, height):
    for uvs, loops, _region, target, density, _area, _obj in items:
        values = np.array([tuple(uvs[i].uv) for i in loops])
        if np.ptp(values[:,1]) > np.ptp(values[:,0]):
            values = values[:,[1,0]]
        centre = values.mean(axis=0)
        aspect = np.array([math.sqrt(height/width), math.sqrt(width/height)])
        projected = (values-centre) * aspect * target/density
        for loop, uv in zip(loops, projected):
            uvs[loop].uv = tuple(uv)

def allocate(objects, width, height, space):
    bpy.ops.object.mode_set(mode='OBJECT')
    initial = charts(objects, width, height, space)
    print('CHARTS', len(initial), 'AREA',sum(x[5] for x in initial),'MAX_AREA', max(x[5] for x in initial), flush=True)
    metric_projection(initial, width, height)
    biggest = sorted(initial, key=lambda x:max(max(x[0][j].uv[k] for j in x[1])-min(x[0][j].uv[k] for j in x[1]) for k in (0,1)), reverse=True)[:5]
    print('LARGEST CHARTS', [(x[2], x[5], [max(x[0][j].uv[k] for j in x[1])-min(x[0][j].uv[k] for j in x[1]) for k in (0,1)]) for x in biggest], flush=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.pack_islands(rotate=False, margin=(4 if space == 'corridor' else 8)/min(width,height), margin_method='ADD', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    packed = charts(objects, width, height, space)
    # Never upscale a chart after packing; that could overlap its neighbour.
    scale_charts(packed, shrink_only=True)
    actual = charts(objects, width, height, space)
    report = {}
    for _uvs, _loops, region, target, density, area, _obj in actual:
        values = report.setdefault(region, {'min': density, 'max': density, 'area': 0, 'target': target})
        values['min'] = min(values['min'], density)
        values['max'] = max(values['max'], density)
        values['area'] += area
    if not report:
        raise RuntimeError('No measurable lightmap charts')
    print('MEASURED DENSITY', report, flush=True)
    for region, values in report.items():
        minimum = 16 if space == 'corridor' and region == 'near' else 8 if region in ('archive','distant') else values['target']
        if values['min'] < minimum * .99:
            raise RuntimeError(f'Atlas density shortfall: {region} {values["min"]:.2f} < {minimum} texels/m')
    return report
