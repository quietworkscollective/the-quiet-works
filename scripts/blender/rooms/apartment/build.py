"""Build the Apartment's authored stage set. Coordinates are exported into the room's +Z forward convention."""
import math
import os
import sys
from array import array
from collections import defaultdict

import bpy
from mathutils import Vector


def room_point(x, height, depth):
    return (x, -depth, height)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.images:
        if block.name != "Render Result":
            bpy.data.images.remove(block)


def value_noise(x, y, size, cells, seed):
    """Small deterministic, seamless value noise for authored surface maps."""
    px = (x / size) * cells
    py = (y / size) * cells
    x0 = math.floor(px)
    y0 = math.floor(py)
    tx = px - x0
    ty = py - y0
    tx = tx * tx * (3.0 - 2.0 * tx)
    ty = ty * ty * (3.0 - 2.0 * ty)

    def lattice(ix, iy):
        raw = math.sin((ix + seed) * 127.1 + (iy + seed * 3) * 311.7) * 43758.5453
        return (raw - math.floor(raw)) * 2.0 - 1.0

    a = lattice(x0 % cells, y0 % cells)
    b = lattice((x0 + 1) % cells, y0 % cells)
    c = lattice(x0 % cells, (y0 + 1) % cells)
    d = lattice((x0 + 1) % cells, (y0 + 1) % cells)
    upper = a + (b - a) * tx
    lower = c + (d - c) * tx
    return upper + (lower - upper) * ty


def image_texture(name, family, base):
    size = 256 if family in ("plaster", "painted") else 128
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    values = array("f")
    for y in range(size):
        for x in range(size):
            if family == "plaster":
                # Keep plaster grain tight: broad albedo noise read as cloudy patches at room scale.
                grain = (0.002 * value_noise(x, y, size, 71, 11)
                         + 0.004 * value_noise(x, y, size, 143, 23)
                         + 0.006 * value_noise(x, y, size, 223, 31))
            elif family == "painted":
                # Painted timber has a quiet, close grain with no large repeating ripple.
                grain = (0.003 * value_noise(x, y, size, 83, 41)
                         + 0.004 * value_noise(x, y, size, 157, 47)
                         + 0.004 * value_noise(x, y, size, 223, 53))
            elif family == "walnut":
                grain = 0.065 * math.sin(y * 0.11 + math.sin(x * 0.035) * 1.1) + 0.025 * math.sin(y * 0.42 + x * 0.013)
            elif family == "oak":
                grain = 0.045 * math.sin(y * 0.34 + math.sin(x * 0.11) * 1.6) + 0.018 * math.sin(y * 1.3 + x * 0.025)
            elif family in ("linen", "woven"):
                grain = 0.022 * math.sin(x * 1.82) + 0.02 * math.sin(y * 1.82) + 0.008 * math.sin((x + y) * 0.91)
            else:
                grain = 0.008 * math.sin(x * 0.4 + y * 0.27)
            for channel in range(3):
                values.append(max(0.0, min(1.0, base[channel] * (1.0 + grain))))
            values.append(1.0)
    image.pixels.foreach_set(values)
    image.pack()
    return image


def surface_height(family, x, y, size):
    if family == "plaster":
        return (0.5 + 0.0001 * value_noise(x, y, size, 67, 59)
                + 0.00025 * value_noise(x, y, size, 137, 61)
                + 0.00075 * value_noise(x, y, size, 217, 63))
    if family == "painted":
        return 0.5 + 0.001 * value_noise(x, y, size, 73, 67) + 0.003 * value_noise(x, y, size, 157, 71)
    if family == "walnut":
        return 0.5 + 0.012 * math.sin(y * 0.1 + math.sin(x * 0.03)) + 0.004 * math.sin(y * 0.39 + x * 0.015)
    if family == "woven":
        return 0.5 + 0.0015 * (math.sin(x * 1.82) + math.sin(y * 1.82)) + 0.0005 * math.sin((x + y) * 0.91)
    return 0.5


def detail_texture(name, family, roughness, normal_strength, component):
    size = 256 if family in ("plaster", "painted", "woven") else 128
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    values = array("f")
    for y in range(size):
        for x in range(size):
            if component == "roughness":
                height = surface_height(family, x, y, size)
                broad = value_noise(x, y, size, 67, 83)
                fine = value_noise(x, y, size, 139, 89)
                micro = value_noise(x, y, size, 219, 97)
                spread = {"plaster": 0.006, "painted": 0.008, "walnut": 0.06, "woven": 0.08}.get(family, 0.04)
                fine_spread = 0.018 if family == "plaster" else 0.022
                micro_spread = 0.022 if family == "plaster" else 0.012
                value = max(0.04, min(1.0, roughness + (height - 0.5) * 1.4 + broad * spread + fine * fine_spread + micro * micro_spread))
                values.extend((value, value, value, 1.0))
                continue
            left = surface_height(family, (x - 1) % size, y, size)
            right = surface_height(family, (x + 1) % size, y, size)
            down = surface_height(family, x, (y - 1) % size, size)
            up = surface_height(family, x, (y + 1) % size, size)
            nx = -(right - left) * size * 0.5 * normal_strength
            ny = -(up - down) * size * 0.5 * normal_strength
            length = math.sqrt(nx * nx + ny * ny + 1.0)
            values.extend((0.5 + 0.5 * nx / length, 0.5 + 0.5 * ny / length, 0.5 + 0.5 / length, 1.0))
    image.pixels.foreach_set(values)
    image.pack()
    return image


def surface_textures(name, family, base, roughness, normal_strength):
    return (
        image_texture(f"{name} albedo", family, base),
        detail_texture(f"{name} roughness", family, roughness, normal_strength, "roughness"),
        detail_texture(f"{name} normal", family, roughness, normal_strength, "normal"),
    )


def material(name, color, roughness=0.7, metallic=0.0, texture=None, alpha=1.0, emission=None, emission_strength=0.0,
             roughness_texture=None, normal_texture=None):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, alpha)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    shader = nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Alpha"].default_value = alpha
        emission_socket = shader.inputs.get("Emission Color")
        if emission_socket is None:
            emission_socket = shader.inputs.get("Emission")
        strength_socket = shader.inputs.get("Emission Strength")
        if emission_socket is not None and emission is not None:
            emission_socket.default_value = (*emission, 1.0)
        if strength_socket is not None:
            strength_socket.default_value = emission_strength
        coordinates = None
        if texture:
            image_node = nodes.new("ShaderNodeTexImage")
            image_node.image = texture
            image_node.interpolation = "Linear"
            coordinates = nodes.new("ShaderNodeTexCoord")
            links.new(coordinates.outputs["UV"], image_node.inputs["Vector"])
            links.new(image_node.outputs["Color"], shader.inputs["Base Color"])
            nodes.active = image_node
        if coordinates is None and (roughness_texture or normal_texture):
            coordinates = nodes.new("ShaderNodeTexCoord")
        if roughness_texture:
            roughness_node = nodes.new("ShaderNodeTexImage")
            roughness_node.image = roughness_texture
            roughness_node.interpolation = "Linear"
            links.new(coordinates.outputs["UV"], roughness_node.inputs["Vector"])
            links.new(roughness_node.outputs["Color"], shader.inputs["Roughness"])
        if normal_texture:
            normal_image = nodes.new("ShaderNodeTexImage")
            normal_image.image = normal_texture
            normal_image.interpolation = "Linear"
            normal_map = nodes.new("ShaderNodeNormalMap")
            links.new(coordinates.outputs["UV"], normal_image.inputs["Vector"])
            links.new(normal_image.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return result


def uv_cube(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, clip_to_bounds=False, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def attach(obj, parent, stage=False):
    if parent:
        obj.parent = parent
    if stage:
        obj["stageSurface"] = "structure"
    return obj


def finish_mesh(obj, mat, parent=None, stage=False, bevel=0.0, bevel_segments=3, soft_edges=False):
    obj.data.materials.append(mat)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft hand-finished edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = bevel_segments
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        if soft_edges:
            for polygon in obj.data.polygons:
                normal = polygon.normal
                # Keep the cushion's broad faces readable while smoothing the rounded roll at its edges.
                if max(abs(normal.x), abs(normal.y), abs(normal.z)) < 0.999:
                    polygon.use_smooth = True
    if obj.data.uv_layers is None or len(obj.data.uv_layers) == 0:
        uv_cube(obj)
    return attach(obj, parent, stage)


def box(name, location, dimensions, mat, parent=None, stage=False, bevel=0.012, rotation=0.0, bevel_segments=3, soft_edges=False):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=room_point(*location))
    obj = bpy.context.object
    obj.name = name
    # Room dimensions use width, height, depth; Blender stores width, depth, height.
    obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
    obj.rotation_euler[2] = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish_mesh(obj, mat, parent, stage, min(bevel, min(dimensions) * 0.42) if bevel else 0.0, bevel_segments, soft_edges)


def cabinet_edge_frame(name, front_x, height, depth, centre_y, centre_depth, mat):
    """Fine painted wear on cabinet door edges, kept shallow and matte."""
    face_x = front_x + 0.002
    inset = 0.014
    stroke = 0.009
    for side in (-1, 1):
        box(f"{name} stile {side}", (face_x, centre_y, centre_depth + side * (depth * 0.5 - inset)),
            (0.008, height - 0.022, stroke), mat, stage=True, bevel=0.001)
    for side in (-1, 1):
        box(f"{name} rail {side}", (face_x, centre_y + side * (height * 0.5 - inset), centre_depth),
            (0.008, stroke, depth - 0.022), mat, stage=True, bevel=0.001)


def recessed_basin(name, centre_x, centre_depth, top_height, bottom_height, top_width, top_depth, bottom_width, bottom_depth, mat):
    """A single sloped stainless bowl, with a smaller floor visibly below the worktop."""
    def rounded_loop(width, depth):
        radius = min(width, depth) * 0.16
        corners = (
            (width / 2 - radius, depth / 2 - radius, 0),
            (-width / 2 + radius, depth / 2 - radius, 90),
            (-width / 2 + radius, -depth / 2 + radius, 180),
            (width / 2 - radius, -depth / 2 + radius, 270),
        )
        return [
            (x + math.cos(math.radians(start + step * 22.5)) * radius,
             z + math.sin(math.radians(start + step * 22.5)) * radius)
            for x, z, start in corners
            for step in range(5)
        ]

    top = rounded_loop(top_width, top_depth)
    bottom = rounded_loop(bottom_width, bottom_depth)
    vertices = [room_point(centre_x + x, top_height, centre_depth + depth) for x, depth in top]
    vertices += [room_point(centre_x + x, bottom_height, centre_depth + depth) for x, depth in bottom]
    faces = []
    loop_size = len(top)
    for index in range(loop_size):
        next_index = (index + 1) % loop_size
        # Face the bowl interior so its brushed metal catches the task light.
        faces.append((index, index + loop_size, next_index + loop_size, next_index))
    faces.append(tuple(reversed(range(loop_size, loop_size * 2))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = index < loop_size
    return finish_mesh(obj, mat, stage=True)


def compressed_cushion(name, centre, dimensions, base_height, mat, parent):
    """A thin loose cushion with a depressed centre and a gently raised perimeter."""
    width, height, depth = dimensions
    divisions = 8
    vertices = []
    top_indices = []
    for row in range(divisions + 1):
        row_indices = []
        v = row / divisions
        for column in range(divisions + 1):
            u = column / divisions
            x = (u - 0.5) * width
            z = (v - 0.5) * depth
            edge = min(u, 1 - u, v, 1 - v) * 4
            crown = 0.30 + 0.70 * math.sin(min(1.0, edge) * math.pi / 2)
            centre_dent = math.exp(-(((u - 0.5) / 0.42) ** 2 + ((v - 0.5) / 0.42) ** 2) * 1.6)
            top_y = height * (0.30 + crown * 0.70) - height * 0.40 * centre_dent
            row_indices.append(len(vertices))
            vertices.append(room_point(centre[0] + x, base_height + top_y, centre[1] + z))
        top_indices.append(row_indices)

    faces = []
    for row in range(divisions):
        for column in range(divisions):
            a = top_indices[row][column]
            b = top_indices[row + 1][column]
            c = top_indices[row + 1][column + 1]
            d = top_indices[row][column + 1]
            faces.append((a, b, c, d))

    perimeter = []
    perimeter.extend(top_indices[0])
    perimeter.extend(top_indices[row][-1] for row in range(1, divisions + 1))
    perimeter.extend(reversed(top_indices[-1][:-1]))
    perimeter.extend(top_indices[row][0] for row in range(divisions - 1, 0, -1))
    lower = []
    for index in perimeter:
        x, blender_y, _ = vertices[index]
        lower.append(len(vertices))
        vertices.append((x, blender_y, base_height))
    for index, top_index in enumerate(perimeter):
        next_index = (index + 1) % len(perimeter)
        faces.append((top_index, perimeter[next_index], lower[next_index], lower[index]))
    faces.append(tuple(reversed(lower)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return finish_mesh(obj, mat, parent=parent)


def upholstered_seat(name, centre, dimensions, base_height, mat, parent):
    """A shallow sagging seat pad with lifted piping edges and compression at the back seam."""
    width, height, depth = dimensions
    columns, rows = 16, 24
    vertices = []
    grid = []
    for row in range(rows + 1):
        row_indices = []
        v = row / rows
        for column in range(columns + 1):
            u = column / columns
            x = (u - 0.5) * width
            z = (v - 0.5) * depth
            edge = min(u, 1 - u, v, 1 - v) * 4
            crown = math.sin(min(1.0, edge) * math.pi / 2)
            sag = math.exp(-(((u - 0.52) / 0.38) ** 2 + ((v - 0.52) / 0.48) ** 2) * 1.7)
            back_press = math.exp(-(((u - 0.94) / 0.075) ** 2 + ((v - 0.5) / 0.55) ** 2) * 1.5)
            top = height * (0.72 + 0.28 * crown - 0.10 * sag - 0.12 * back_press)
            row_indices.append(len(vertices))
            vertices.append(room_point(centre[0] + x, base_height + top, centre[1] + z))
        grid.append(row_indices)

    faces = []
    for row in range(rows):
        for column in range(columns):
            a = grid[row][column]
            b = grid[row + 1][column]
            c = grid[row + 1][column + 1]
            d = grid[row][column + 1]
            faces.append((a, b, c, d))

    perimeter = []
    perimeter.extend(grid[0])
    perimeter.extend(grid[row][-1] for row in range(1, rows + 1))
    perimeter.extend(reversed(grid[-1][:-1]))
    perimeter.extend(grid[row][0] for row in range(rows - 1, 0, -1))
    lower = []
    for index in perimeter:
        x, blender_y, _ = vertices[index]
        lower.append(len(vertices))
        vertices.append((x, blender_y, base_height))
    for index, top_index in enumerate(perimeter):
        next_index = (index + 1) % len(perimeter)
        faces.append((top_index, perimeter[next_index], lower[next_index], lower[index]))
    faces.append(tuple(reversed(lower)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return finish_mesh(obj, mat, parent=parent, stage=True, bevel=0.032, bevel_segments=5, soft_edges=True)


def upholstered_back_pad(name, centre, dimensions, mat, parent):
    """A bowed back cushion that relaxes at the seat seam and softens toward its piping."""
    thickness, height, width = dimensions
    columns, rows = 12, 16
    vertices = []
    front = []
    back = []
    base_height = centre[1] - height / 2
    for row in range(rows + 1):
        front_row = []
        back_row = []
        v = row / rows
        y = base_height + v * height
        for column in range(columns + 1):
            u = column / columns
            z = centre[2] + (u - 0.5) * width
            dome = math.sin(math.pi * u) ** 0.8 * math.sin(math.pi * v) ** 0.75
            lower_release = 0.58 + 0.42 * min(1.0, v * 3.2)
            bulge = 0.058 * dome * lower_release
            front_row.append(len(vertices))
            vertices.append(room_point(centre[0] - thickness / 2 - bulge, y, z))
            back_row.append(len(vertices))
            vertices.append(room_point(centre[0] + thickness / 2 + bulge * 0.24, y, z))
        front.append(front_row)
        back.append(back_row)

    faces = []
    for row in range(rows):
        for column in range(columns):
            faces.append((front[row][column], front[row + 1][column], front[row + 1][column + 1], front[row][column + 1]))
            faces.append((back[row][column + 1], back[row + 1][column + 1], back[row + 1][column], back[row][column]))
    boundary = []
    boundary.extend((front[0][column], back[0][column]) for column in range(columns + 1))
    boundary.extend((front[row][-1], back[row][-1]) for row in range(1, rows + 1))
    boundary.extend((front[-1][column], back[-1][column]) for column in range(columns - 1, -1, -1))
    boundary.extend((front[row][0], back[row][0]) for row in range(rows - 1, 0, -1))
    for index, pair in enumerate(boundary):
        next_pair = boundary[(index + 1) % len(boundary)]
        faces.append((pair[0], next_pair[0], next_pair[1], pair[1]))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return finish_mesh(obj, mat, parent=parent, stage=True, bevel=0.032, bevel_segments=5, soft_edges=True)


def cylinder(name, location, radius, depth, mat, parent=None, stage=False, vertices=32, rotation=(0.0, 0.0, 0.0), bevel=0.004):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=room_point(*location))
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    result = finish_mesh(obj, mat, parent, stage, min(bevel, radius * 0.35) if bevel else 0.0)
    for polygon in obj.data.polygons:
        if len(polygon.vertices) == 4:
            polygon.use_smooth = True
    return result


def tube_along_path(name, points, radius, mat, parent=None, sides=12, samples_per_segment=5):
    """Sweep a small circular section along a smoothed room-space path."""
    control = [Vector(room_point(*point)) for point in points]
    path = []
    for index in range(len(control) - 1):
        p0 = control[max(0, index - 1)]
        p1 = control[index]
        p2 = control[index + 1]
        p3 = control[min(len(control) - 1, index + 2)]
        for sample in range(samples_per_segment):
            t = sample / samples_per_segment
            t2 = t * t
            t3 = t2 * t
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                               + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                               + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    path.append(control[-1])

    vertices = []
    for index, point in enumerate(path):
        tangent = (path[min(index + 1, len(path) - 1)] - path[max(0, index - 1)]).normalized()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.9:
            reference = Vector((0.0, 1.0, 0.0))
        axis_a = tangent.cross(reference).normalized()
        axis_b = tangent.cross(axis_a).normalized()
        for side in range(sides):
            angle = math.tau * side / sides
            vertices.append(point + radius * (math.cos(angle) * axis_a + math.sin(angle) * axis_b))

    faces = []
    for ring in range(len(path) - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + next_side,
                          (ring + 1) * sides + next_side, (ring + 1) * sides + side))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(path) - 1) * sides + side for side in range(sides)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return finish_mesh(obj, mat, parent=parent)


def sphere(name, location, scale, mat, parent=None, stage=False, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=room_point(*location))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    result = finish_mesh(obj, mat, parent, stage)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return result


def torus(name, location, major, minor, mat, parent=None, rotation=(math.pi / 2, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=28, minor_segments=8, location=room_point(*location), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    result = finish_mesh(obj, mat, parent)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return result


def lathe(name, location, profile, mat, parent=None, segments=64):
    """Revolve a measured vessel profile so the kettle and cups have real rims and interiors."""
    x, y, z = location
    vertices = []
    for radius, height in profile:
        for index in range(segments):
            angle = 2 * math.pi * index / segments
            vertices.append(room_point(x + math.cos(angle) * radius, y + height, z + math.sin(angle) * radius))
    faces = []
    for ring in range(len(profile)):
        next_ring = (ring + 1) % len(profile)
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append((ring * segments + index, next_ring * segments + index,
                          next_ring * segments + next_index, ring * segments + next_index))
    mesh = bpy.data.meshes.new(name + " turned shell")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return attach(obj, parent)


def text_mesh(name, value, location, size, mat, rotation=(math.pi / 2, 0.0, 0.0)):
    bpy.ops.object.text_add(location=room_point(*location), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = value
    obj.data.size = size
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.extrude = 0.0005
    obj.data.bevel_depth = 0.0002
    obj.data.bevel_resolution = 1
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


def group(name, action=None, dynamic=False):
    node = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(node)
    node.empty_display_type = "PLAIN_AXES"
    node.empty_display_size = 0.08
    if action:
        node["actionTarget"] = action
    if dynamic:
        node["bake"] = "dynamic"
    return node


def join_meshes(objects, name):
    if not objects:
        return
    if len(objects) == 1:
        objects[0].name = name
        return
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name


def join_group_meshes():
    by_parent_and_material = defaultdict(list)
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is None:
            continue
        mat_name = obj.data.materials[0].name if obj.data.materials else "unassigned"
        by_parent_and_material[(obj.parent.name, mat_name)].append(obj)
    for (parent_name, mat_name), objects in by_parent_and_material.items():
        join_meshes(objects, f"{parent_name}_{mat_name}")


def join_static_meshes():
    by_material = defaultdict(list)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.parent is None:
            mat_name = obj.data.materials[0].name if obj.data.materials else "unassigned"
            by_material[mat_name].append(obj)
    for mat_name, objects in by_material.items():
        join_meshes(objects, f"Stage_{mat_name}")
        objects[0]["stageSurface"] = "structure"


def make_key(name, x, y, z, mat, parent, bent=False):
    ring = torus(f"{name}_ring", (x, y + 0.008, z - 0.018), 0.014, 0.0035, mat, parent, rotation=(0.0, math.pi / 2, 0.0))
    shaft = box(f"{name}_shaft", (x, y, z + 0.015), (0.009, 0.012, 0.07), mat, parent, bevel=0.002, rotation=0.0)
    tooth_z = z + (0.039 if bent else 0.04)
    box(f"{name}_tooth", (x + (0.012 if bent else -0.01), y, tooth_z), (0.028, 0.012, 0.009), mat, parent, bevel=0.002, rotation=0.0)
    if bent:
        box(f"{name}_bend", (x + 0.018, y, z + 0.061), (0.022, 0.012, 0.012), mat, parent, bevel=0.003, rotation=-0.35)
    return ring, shaft


def build_room():
    clear_scene()
    plaster_base = (0.66, 0.65, 0.61)
    plaster_image, plaster_roughness, plaster_normal = surface_textures("Matte putty plaster", "plaster", plaster_base, 0.88, 1.2)
    plaster_light_image = image_texture("Window reveal putty albedo", "plaster", (0.69, 0.68, 0.64))
    oak_image = image_texture("Natural oak trim - close straight grain", "oak", (0.36, 0.28, 0.19))
    oak_dark_image = image_texture("Dark oak - close straight grain", "oak", (0.11, 0.075, 0.045))
    floor_oak_image = image_texture("Floor oak - close straight grain", "oak", (0.22, 0.135, 0.075))
    cabinet_image, cabinet_roughness, cabinet_normal = surface_textures("Muted painted timber", "painted", (0.72, 0.75, 0.65), 0.84, 0.18)
    cabinet_shadow_image, cabinet_shadow_roughness, cabinet_shadow_normal = surface_textures("Painted timber in shadow", "painted", (0.64, 0.68, 0.58), 0.88, 0.16)
    cabinet_wear_image = image_texture("Worn painted timber edge", "painted", (0.78, 0.79, 0.71))
    walnut_image, walnut_roughness, walnut_normal = surface_textures("Dark walnut", "walnut", (0.18, 0.10, 0.055), 0.42, 0.34)
    linen_image, linen_roughness, linen_normal = surface_textures("Olive woven upholstery", "woven", (0.43, 0.49, 0.33), 0.96, 0.28)
    cream_linen_image = image_texture("White-grey woven throw", "linen", (0.86, 0.87, 0.83))
    sofa_fabric_image, sofa_roughness, sofa_normal = surface_textures("Olive sofa weave", "woven", (0.68, 0.72, 0.53), 0.97, 0.34)
    plaster = material("Matte putty plaster", plaster_base, 0.88, texture=plaster_image,
                       roughness_texture=plaster_roughness, normal_texture=plaster_normal)
    plaster_light = material("Putty window reveal", (0.69, 0.68, 0.64), 0.90, texture=plaster_light_image,
                             roughness_texture=plaster_roughness, normal_texture=plaster_normal)
    oak = material("Natural oak trim", (0.36, 0.28, 0.19), 0.67, texture=oak_image)
    oak_dark = material("Dark timber shadow", (0.11, 0.075, 0.045), 0.56, texture=oak_dark_image)
    floor_oak = material("Polished oak boards", (0.22, 0.135, 0.075), 0.3, texture=floor_oak_image)
    cabinet_paint = material("Muted painted timber", (0.72, 0.75, 0.65), 0.84, texture=cabinet_image,
                             roughness_texture=cabinet_roughness, normal_texture=cabinet_normal)
    cabinet_paint_shadow = material("Painted timber shadow", (0.64, 0.68, 0.58), 0.88,
                                     texture=cabinet_shadow_image, roughness_texture=cabinet_shadow_roughness,
                                     normal_texture=cabinet_shadow_normal)
    cabinet_edge_wear = material("Worn painted timber edge", (0.78, 0.79, 0.71), 0.94, texture=cabinet_wear_image)
    walnut = material("Dark walnut", (0.18, 0.10, 0.055), 0.42, texture=walnut_image,
                      roughness_texture=walnut_roughness, normal_texture=walnut_normal)
    linen = material("Olive woven upholstery", (0.43, 0.49, 0.33), 0.96, texture=linen_image,
                     roughness_texture=linen_roughness, normal_texture=linen_normal)
    cream_linen = material("White-grey woven throw", (0.86, 0.87, 0.83), 0.97, texture=cream_linen_image)
    sofa_fabric = material("Olive woven sofa fabric", (0.68, 0.72, 0.53), 0.97, texture=sofa_fabric_image,
                           roughness_texture=sofa_roughness, normal_texture=sofa_normal)
    enamel = material("Cream enamel", (0.75, 0.69, 0.56), 0.3, 0.0)
    enamel_green = material("Muted sage painted timber", (0.24, 0.29, 0.23), 0.64, 0.0)
    ceramic = material("Quiet blue-grey ceramic", (0.82, 0.88, 0.88), 0.27, 0.0)
    ceramic_warm = material("Warm ivory ceramic", (0.88, 0.85, 0.76), 0.28, 0.0)
    brass = material("Finger-polished brass", (0.42, 0.29, 0.12), 0.31, 0.32)
    brass_worn = material("Worn brass edges", (0.31, 0.23, 0.12), 0.46, 0.24)
    chrome = material("Soft chrome", (0.68, 0.70, 0.68), 0.34, 0.18)
    glass = material("Window glass, cool subdued daylight", (0.31, 0.39, 0.42), 0.3, 0.03, alpha=0.22)
    daylight_sky = material("Subdued morning sky", (0.28, 0.35, 0.38), 0.88, emission=(0.34, 0.41, 0.44), emission_strength=0.16)
    phone_glass = material("Quiet phone glass", (0.045, 0.052, 0.05), 0.24, 0.04)
    tea = material("Tea in the cups", (0.075, 0.036, 0.014), 0.18, 0.0)
    outside_stone = material("Neighbouring stone in morning air", (0.28, 0.32, 0.33), 0.9)
    outside_roof = material("Distant roof in soft light", (0.19, 0.23, 0.24), 0.86)
    outside_tree = material("Tree beyond the window", (0.16, 0.23, 0.20), 0.92)
    outside_leaf = material("Distant leaves", (0.21, 0.28, 0.22), 0.94)
    amber_glass = material("Amber practical glass", (0.68, 0.45, 0.22), 0.24, 0.04, emission=(0.76, 0.42, 0.18), emission_strength=0.08)
    paper = material("Cream paper", (0.79, 0.72, 0.59), 0.88)
    paper_shadow = material("Paper edge", (0.56, 0.48, 0.37), 0.8)
    clay = material("Muted clay", (0.57, 0.34, 0.24), 0.82)
    leaf = material("Leaf green, dusted", (0.23, 0.34, 0.24), 0.87)
    water = material("Water in the sink", (0.44, 0.54, 0.55), 0.2, 0.08)
    sink_steel = material("Light enamel sink basin", (0.80, 0.84, 0.82), 0.40, 0.0)
    counter_stone = material("Muted cool stone counter", (0.43, 0.44, 0.41), 0.50)
    wall_paint_old = material("Older cupboard paint", (0.35, 0.37, 0.29), 0.78)
    emissive_amber = material("Practical amber core", (0.94, 0.55, 0.24), 0.18)
    kettle_smoke = material("White-grey kettle smoke", (0.76, 0.78, 0.75), 0.96, alpha=0.38)

    target_phone = group("Interact_Phone", "phone")
    target_kettle = group("Interact_Kettle", "kettle")
    kettle_smoke_group = group("Kettle_Smoke", dynamic=True)
    kettle_smoke_group.parent = target_kettle
    target_faucet = group("Interact_Faucet", "faucet")
    target_keys = group("Interact_Keys", "keys")
    target_chair = group("Interact_Chair", "chair")
    target_bill = group("Interact_Bill", "bill")
    target_cup = group("Interact_Cup", "cup")
    target_magnet = group("Interact_Magnet", "magnet")
    target_window = group("Interact_Window", "window")
    target_cushion = group("Interact_Cushion", "cushion")
    target_platform = group("Interact_Platform", "platform")
    target_underside = group("Interact_Underside", "underside")

    moving_keys = group("Moving_Keys", dynamic=True)
    moving_keys.parent = target_keys
    moving_chair = group("Moving_Chair", dynamic=True)
    moving_chair.parent = target_chair
    moving_cup = group("Moving_Cup", dynamic=True)
    moving_cup.parent = target_cup
    saucer = group("Saucer_Turntable", dynamic=True)
    saucer.parent = target_cup
    moving_magnet = group("Moving_Magnet", dynamic=True)
    moving_magnet.parent = target_magnet
    moving_sash = group("Moving_Window_Sash", dynamic=True)
    moving_sash.parent = target_window
    moving_cushion = group("Moving_Cushion", dynamic=True)
    moving_cushion.parent = target_cushion
    platform_gate = group("Platform_Gate", dynamic=True)
    platform_gate.parent = target_platform
    kettle_switch = group("Kettle_Switch", dynamic=True)
    kettle_switch.parent = target_kettle
    faucet_handle = group("Faucet_Handle", dynamic=True)
    faucet_handle.parent = target_faucet
    water_flow = group("Water_Flow", dynamic=True)
    water_flow.parent = target_faucet

    # Stage shell: four framed walls, ceiling and a continuous floor contain every bounded view.
    box("Stage_Floor", (0, -0.06, 2.7), (6.2, 0.12, 5.4), floor_oak, stage=True, bevel=0.01)
    # Fine seams break the broad floor into wide, polished oak boards without extra draw calls.
    board_centres = [-2.57 + index * 0.86 for index in range(7)]
    for x in (-2.14, -1.28, -0.42, 0.44, 1.30, 2.16, 3.02):
        box(f"Floor board joint {x}", (x, 0.002, 2.7), (0.0025, 0.003, 5.28), oak_dark, stage=True, bevel=0)
    for index, x in enumerate(board_centres):
        for joint in range(4):
            depth = 0.65 + joint * 1.32 + (0.55 if index % 2 else 0.0)
            if depth < 5.25:
                box(f"Staggered oak end joint {index} {joint}", (x, 0.002, depth), (0.85, 0.003, 0.0025), oak_dark, stage=True, bevel=0)
    box("West plaster wall", (-3.06, 1.32, 2.7), (0.12, 2.65, 5.4), plaster, stage=True, bevel=0.006)
    box("East plaster wall", (3.06, 1.32, 2.7), (0.12, 2.65, 5.4), plaster, stage=True, bevel=0.006)
    box("North window wall left", (-2.08, 1.32, 5.34), (2.04, 2.65, 0.12), plaster, stage=True, bevel=0)
    box("North window wall right", (2.08, 1.32, 5.34), (2.04, 2.65, 0.12), plaster, stage=True, bevel=0)
    box("North window wall sill", (0.0, 0.43, 5.34), (2.12, 0.86, 0.12), plaster, stage=True, bevel=0)
    box("North window wall header", (0.0, 2.42, 5.34), (2.12, 0.46, 0.12), plaster, stage=True, bevel=0)
    box("South wall west pier", (-1.77, 1.32, 0.06), (2.66, 2.65, 0.12), plaster, stage=True, bevel=0.006)
    box("South wall east pier", (1.77, 1.32, 0.06), (2.66, 2.65, 0.12), plaster, stage=True, bevel=0.006)
    box("South wall door header", (0.0, 2.38, 0.06), (0.94, 0.54, 0.12), plaster, stage=True, bevel=0.006)
    box("Ceiling plaster", (0.0, 2.68, 2.7), (6.2, 0.12, 5.4), plaster_light, stage=True, bevel=0.01)

    # Warm oak skirting and a narrow ceiling cornice keep the wall joins composed at the view edges.
    for side in (-1, 1):
        box(f"Skirting {side}", (side * 2.97, 0.09, 2.7), (0.11, 0.18, 5.28), oak, stage=True, bevel=0.015)
        box(f"Cornice {side}", (side * 2.96, 2.55, 2.7), (0.12, 0.19, 5.28), oak, stage=True, bevel=0.018)
    box("North skirting", (0, 0.09, 5.25), (5.94, 0.18, 0.11), oak, stage=True, bevel=0.015)
    box("South skirting left", (-1.77, 0.09, 0.13), (2.55, 0.18, 0.11), oak, stage=True, bevel=0.015)
    box("South skirting right", (1.77, 0.09, 0.13), (2.55, 0.18, 0.11), oak, stage=True, bevel=0.015)

    # The corridor door is already part of the spine; this open leaf and shallow lit return complete the room-side frame.
    box("Room-side open door leaf", (-0.46, 1.05, 0.42), (0.9, 2.1, 0.055), enamel_green, stage=True, bevel=0.026, rotation=1.28)
    box("Door inset upper panel", (-0.46, 1.54, 0.43), (0.65, 0.67, 0.018), wall_paint_old, stage=True, bevel=0.01, rotation=1.28)
    box("Door inset lower panel", (-0.46, 0.54, 0.43), (0.65, 0.75, 0.018), wall_paint_old, stage=True, bevel=0.01, rotation=1.28)
    cylinder("Door brass knob", (-0.45, 1.02, 0.9), 0.038, 0.035, brass, vertices=20, rotation=(math.pi / 2, 0, math.pi / 2))
    box("Oak door jamb left", (-0.52, 1.05, 0.03), (0.11, 2.1, 0.14), oak, stage=True, bevel=0.02)
    box("Oak door jamb right", (0.52, 1.05, 0.03), (0.11, 2.1, 0.14), oak, stage=True, bevel=0.02)
    box("Oak door lintel", (0, 2.16, 0.03), (1.12, 0.15, 0.14), oak, stage=True, bevel=0.02)
    box("Threshold brass strip", (0, 0.01, 0.2), (0.91, 0.025, 0.1), brass_worn, stage=True, bevel=0.006)
    box("Threshold passage floor", (0, -0.03, -0.8), (1.32, 0.11, 3.0), oak_dark, stage=True, bevel=0.008)
    box("Threshold warm side return", (-0.74, 1.28, -1.45), (0.12, 1.8, 1.6), plaster, stage=True, bevel=0.01)
    box("Threshold far return", (0.74, 1.28, -1.45), (0.12, 1.8, 1.6), plaster, stage=True, bevel=0.01)
    box("Threshold end wall", (0, 1.28, -2.22), (1.6, 2.65, 0.12), plaster_light, stage=True, bevel=0.01)
    box("Small makers plate", (-1.08, 1.37, 0.16), (0.52, 0.15, 0.025), brass_worn, stage=True, bevel=0.008)
    text_mesh("Small makers mark", "MACHINE-MADE", (-1.08, 1.405, 0.179), 0.026, paper)
    text_mesh("Small makers credit", "CODEX / OPENAI", (-1.08, 1.345, 0.179), 0.022, paper)

    # Window: the visible morning source has a deep painted reveal, two sashes, six panes and soft curtains.
    box("Window sill oak", (0, 1.02, 5.21), (2.12, 0.11, 0.26), oak, stage=True, bevel=0.024)
    box("Window lintel oak", (0, 2.03, 5.21), (2.12, 0.1, 0.24), oak, stage=True, bevel=0.024)
    for x in (-0.98, 0.0, 0.98):
        box(f"Window mullion {x}", (x, 1.53, 5.20), (0.075, 0.94, 0.12), oak, stage=True, bevel=0.014)
    for y in (1.30, 1.76):
        box(f"Window crossbar {y}", (0, y, 5.20), (1.9, 0.055, 0.1), oak, stage=True, bevel=0.01)
    for x in (-0.49, 0.49):
        for y in (1.30, 1.76):
            box(f"Window pane {x} {y}", (x, y, 5.28), (0.85, 0.39, 0.018), glass, stage=True, bevel=0.003)
    # The sash slides six centimetres against the framed opening, exposing the modeled morning exterior.
    box("Window latch plate", (0.82, 1.08, 5.11), (0.13, 0.14, 0.05), brass_worn, parent=target_window, bevel=0.018)
    box("Window latch lever", (0.82, 1.12, 5.07), (0.025, 0.11, 0.19), brass, parent=target_window, bevel=0.012)
    # A pale fixed pane behind the sash keeps the glass visible at both turn limits.
    box("Cool outside sky", (0, 1.55, 5.92), (3.8, 2.5, 0.025), daylight_sky, stage=True, bevel=0.002)
    # Only the small exterior seen through this sash is built: two softened rooflines and one tree crown.
    box("Outside west building", (-0.73, 1.05, 5.72), (0.68, 0.72, 0.045), outside_stone, stage=True, bevel=0.025)
    box("Outside west roof", (-0.73, 1.43, 5.72), (0.78, 0.075, 0.07), outside_roof, stage=True, bevel=0.025)
    box("Outside chimney", (-0.89, 1.57, 5.72), (0.14, 0.22, 0.09), outside_stone, stage=True, bevel=0.014)
    box("Outside east building", (0.15, 0.99, 5.75), (0.52, 0.62, 0.04), outside_stone, stage=True, bevel=0.02)
    box("Outside east roof", (0.15, 1.32, 5.75), (0.61, 0.07, 0.06), outside_roof, stage=True, bevel=0.02)
    cylinder("Outside tree trunk", (0.83, 1.28, 5.77), 0.026, 0.68, outside_tree, stage=True, vertices=12, bevel=0.004)
    for index, (x, y, z) in enumerate(((0.72, 1.44, 5.78), (0.90, 1.50, 5.78), (0.78, 1.66, 5.78), (0.95, 1.34, 5.78))):
        sphere(f"Outside tree leaf {index + 1}", (x, y, z), (0.13, 0.16, 0.08), outside_leaf, stage=True, segments=12, rings=8)
    sash_group = moving_sash
    for x in (-0.49, 0.49):
        for y in (1.30, 1.76):
            box(f"Sash pane {x} {y}", (x, y, 5.16), (0.84, 0.39, 0.018), glass, parent=sash_group, bevel=0.002)
    for x in (-0.98, 0.0, 0.98):
        box(f"Sash upright {x}", (x, 1.53, 5.13), (0.065, 0.92, 0.07), oak, parent=sash_group, bevel=0.009)
    for y in (1.30, 1.76):
        box(f"Sash rail {y}", (0, y, 5.13), (1.95, 0.05, 0.07), oak, parent=sash_group, bevel=0.008)
    box("Left curtain panel", (-1.12, 1.48, 4.98), (0.32, 1.34, 0.08), cream_linen, stage=True, bevel=0.07)
    box("Right curtain panel", (1.12, 1.48, 4.98), (0.32, 1.34, 0.08), linen, stage=True, bevel=0.07)
    for side in (-1, 1):
        for fold in range(5):
            x = side * (1.02 + fold * 0.047)
            box(f"Curtain pleat {side} {fold}", (x, 1.48, 4.91), (0.028, 1.22, 0.12), cream_linen if side < 0 else linen, stage=True, bevel=0.014)
        cylinder(f"Curtain tieback {side}", (side * 1.12, 1.43, 4.85), 0.022, 0.12, brass_worn, stage=True, vertices=16, rotation=(math.pi / 2, 0, 0), bevel=0.004)
    box("Curtain rail", (0, 2.21, 5.0), (2.65, 0.035, 0.035), brass_worn, stage=True, bevel=0.012)
    # Soft physical bars on the oak floor echo the mullion pattern without using shadow maps.
    sunlit_board = material("Subdued window light", (0.34, 0.29, 0.22), 0.42)
    for x in (-0.58, -0.12, 0.34, 0.8):
        box(f"Window light bar {x}", (x, 0.005, 4.28), (0.13, 0.009, 1.22), sunlit_board, stage=True, bevel=0.002)

    # Repaired west-wall kitchen: one cabinet door keeps the earlier paint at its edge.
    box("Lower kitchen cabinet carcass", (-2.69, 0.37, 3.06), (0.70, 0.74, 2.48), cabinet_paint_shadow, stage=True, bevel=0.008)
    for z in (1.92, 2.48, 3.08, 3.68, 4.24):
        panel_height = 0.58 if z == 2.48 else 0.78
        if z == 2.48:
            box(f"Lower sink cabinet door {z}", (-2.49, 0.31, z), (0.35, panel_height, 0.53), cabinet_paint, stage=True, bevel=0.006)
        else:
            box(f"Lower cabinet door {z}", (-2.49, 0.50, z), (0.35, panel_height, 0.53), cabinet_paint, stage=True, bevel=0.006)
        cabinet_edge_frame(f"Lower cabinet edge wear {z}", -2.315, panel_height, 0.53,
                           0.31 if z == 2.48 else 0.50, z, cabinet_edge_wear)
        cylinder(f"Cabinet pull {z}", (-2.29, 0.54, z), 0.022, 0.045, brass_worn, vertices=16, rotation=(math.pi / 2, 0, math.pi / 2))
    box("Repainted cupboard front", (-2.48, 0.5, 3.68), (0.35, 0.77, 0.5), cabinet_paint_shadow, stage=True, bevel=0.006)
    box("Repaired cupboard latch", (-2.27, 0.54, 3.68), (0.045, 0.06, 0.07), brass_worn, stage=True, bevel=0.006)
    box("Upper cabinet body", (-2.82, 1.88, 3.56), (0.48, 0.72, 1.62), cabinet_paint_shadow, stage=True, bevel=0.008)
    for z in (2.84, 3.6, 4.32):
        box(f"Upper cabinet inset {z}", (-2.55, 1.90, z), (0.06, 0.62, 0.66), cabinet_paint, stage=True, bevel=0.006)
        cabinet_edge_frame(f"Upper cabinet edge wear {z}", -2.52, 0.62, 0.66, 1.90, z, cabinet_edge_wear)
        sphere(f"Upper cabinet brass knob {z}", (-2.50, 1.88, z), (0.024, 0.024, 0.024), brass_worn, stage=True, segments=16, rings=10)
    # Four counter pieces leave a real opening; the basin walls and drain sit below the metal rim.
    box("Counter left of sink", (-2.83, 0.94, 3.06), (0.18, 0.12, 2.55), counter_stone, stage=True, bevel=0.012)
    box("Counter right of sink", (-2.13, 0.94, 3.06), (0.18, 0.12, 2.55), counter_stone, stage=True, bevel=0.012)
    for z in (1.68, 3.34):
        box(f"Counter behind sink opening {z}", (-2.48, 0.94, z), (0.52, 0.12, 0.91), counter_stone, stage=True, bevel=0.012)
    recessed_basin("Recessed stainless sink", -2.48, 2.5, 0.966, 0.762, 0.49, 0.68, 0.34, 0.48, sink_steel)
    for x in (-2.745, -2.215):
        box(f"Sink rim side {x}", (x, 1.002, 2.5), (0.018, 0.018, 0.72), chrome, stage=True, bevel=0.003)
    for z in (2.14, 2.86):
        box(f"Sink rim end {z}", (-2.48, 1.002, z), (0.54, 0.018, 0.018), chrome, stage=True, bevel=0.003)
    cylinder("Sink drain bezel", (-2.48, 0.767, 2.68), 0.055, 0.008, chrome, stage=True, vertices=40, bevel=0.001)
    cylinder("Sink drain opening", (-2.48, 0.771, 2.68), 0.035, 0.004, oak_dark, stage=True, vertices=32, bevel=0.0)
    box("Sink drain crossbar", (-2.48, 0.773, 2.68), (0.052, 0.002, 0.006), chrome, stage=True, bevel=0.001)
    box("Sink drain second crossbar", (-2.48, 0.774, 2.68), (0.006, 0.002, 0.052), chrome, stage=True, bevel=0.001)
    box("Refrigerator body", (-2.72, 0.99, 4.72), (0.56, 1.98, 0.74), enamel, stage=True, bevel=0.018)
    box("Refrigerator door", (-2.39, 0.99, 4.72), (0.065, 1.83, 0.68), enamel, stage=True, bevel=0.012)
    box("Refrigerator handle", (-2.34, 1.05, 4.55), (0.035, 0.64, 0.055), chrome, stage=True, bevel=0.016)
    box("Blank shopping list", (-2.33, 1.44, 4.72), (0.025, 0.28, 0.20), paper, parent=target_magnet, bevel=0.006)
    box("Magnet painted face", (-2.31, 1.44, 4.72), (0.035, 0.075, 0.075), enamel_green, parent=moving_magnet, bevel=0.018)
    box("Magnet painted edge", (-2.287, 1.44, 4.72), (0.012, 0.058, 0.058), brass_worn, parent=moving_magnet, bevel=0.007)

    # The gooseneck gives the basin a legible, continuous tap silhouette from the threshold.
    cylinder("Faucet base", (-2.86, 1.03, 2.5), 0.031, 0.042, chrome, parent=target_faucet, vertices=32)
    tube_along_path("Faucet gooseneck", [
        (-2.86, 1.045, 2.5), (-2.86, 1.28, 2.5), (-2.83, 1.38, 2.5),
        (-2.76, 1.44, 2.5), (-2.65, 1.45, 2.5), (-2.56, 1.41, 2.5),
        (-2.50, 1.33, 2.5), (-2.50, 1.12, 2.5),
    ], 0.014, chrome, parent=target_faucet, sides=16, samples_per_segment=6)
    cylinder("Faucet aerator", (-2.50, 1.105, 2.5), 0.016, 0.04, chrome, parent=target_faucet, vertices=24)
    cylinder("Faucet valve pin", (-2.86, 1.22, 2.40), 0.012, 0.09, brass, parent=faucet_handle, vertices=16)
    sphere("Faucet valve cap", (-2.86, 1.265, 2.40), (0.020, 0.018, 0.020), chrome, parent=faucet_handle, segments=16, rings=8)
    box("Faucet valve handle", (-2.86, 1.30, 2.40), (0.13, 0.018, 0.03), chrome, parent=faucet_handle, bevel=0.007)
    cylinder("Water stream", (-2.50, 0.91, 2.5), 0.009, 0.20, water, parent=water_flow, vertices=12, bevel=0.001)

    # Kettle with a broad enamel body, finger-polished switch and a visible warm practical on the wall.
    cylinder("Kettle foot", (-2.66, 1.01, 3.53), 0.14, 0.035, brass_worn, parent=target_kettle, vertices=32)
    lathe("Kettle enamel body", (-2.66, 1.01, 3.53), [
        (0.0, 0.004), (0.13, 0.004), (0.13, 0.022), (0.108, 0.21),
        (0.096, 0.23), (0.09, 0.23), (0.087, 0.214), (0.101, 0.025), (0.0, 0.025),
    ], enamel, target_kettle, segments=72)
    torus("Kettle neck trim", (-2.66, 1.235, 3.53), 0.091, 0.004, brass_worn, target_kettle, rotation=(0, 0, 0))
    cylinder("Kettle lid", (-2.66, 1.27, 3.53), 0.085, 0.028, chrome, parent=target_kettle, vertices=28)
    torus("Kettle lid rolled rim", (-2.66, 1.285, 3.53), 0.082, 0.004, brass, target_kettle, rotation=(0, 0, 0))
    sphere("Kettle lid knob", (-2.66, 1.30, 3.53), (0.035, 0.028, 0.035), brass, target_kettle, 16, 10)
    cylinder("Kettle spout collar", (-2.52, 1.19, 3.53), 0.04, 0.08, chrome, parent=target_kettle, vertices=20, rotation=(0, 0, math.pi / 2))
    box("Kettle spout", (-2.44, 1.24, 3.53), (0.16, 0.045, 0.07), enamel, parent=target_kettle, bevel=0.024, rotation=-0.2)
    torus("Kettle handle", (-2.80, 1.17, 3.53), 0.085, 0.012, oak_dark, target_kettle, rotation=(math.pi / 2, 0, 0))
    cylinder("Kettle switch seat", (-2.66, 1.30, 3.53), 0.023, 0.018, brass, parent=target_kettle, vertices=16)
    box("Kettle switch tab", (-2.66, 1.325, 3.53), (0.055, 0.018, 0.024), brass, parent=kettle_switch, bevel=0.008)
    for index, (x, height, depth, scale) in enumerate((
        (-2.43, 1.40, 3.53, (0.040, 0.085, 0.042)),
        (-2.40, 1.51, 3.55, (0.052, 0.095, 0.050)),
        (-2.44, 1.63, 3.52, (0.036, 0.080, 0.038)),
    )):
        sphere(f"Kettle smoke wisp {index + 1}", (x, height, depth), scale, kettle_smoke, parent=kettle_smoke_group, segments=16, rings=10)
    sphere("Kettle indicator", (-2.66, 1.31, 3.60), (0.012, 0.008, 0.012), emissive_amber, target_kettle, 12, 8)
    box("Kitchen practical backplate", (-2.54, 1.50, 3.52), (0.04, 0.13, 0.30), brass_worn, stage=True, bevel=0.032)
    sphere("Kitchen practical amber glass", (-2.48, 1.49, 3.52), (0.095, 0.07, 0.13), amber_glass, segments=24, rings=14)
    box("Practical shade lip", (-2.37, 1.47, 3.52), (0.18, 0.035, 0.23), enamel_green, stage=True, bevel=0.025)

    # A narrow entrance shelf gives the keys their own light and separates them from the table scene.
    box("Entry shelf top", (-1.9, 0.79, 0.8), (0.74, 0.06, 0.32), oak, stage=True, bevel=0.022)
    for x in (-2.16, -1.64):
        box(f"Entry shelf leg {x}", (x, 0.4, 0.8), (0.045, 0.74, 0.045), oak_dark, stage=True, bevel=0.012)
    for index, (x, z) in enumerate(((-2.08, 0.77), (-1.91, 0.8), (-1.74, 0.83))):
        key_node = group(("Key_A", "Key_B", "Key_C")[index])
        key_node.parent = moving_keys
        make_key(key_node.name, x, 0.84, z, brass if index != 1 else brass_worn, key_node, bent=index == 1)
    box("Repaired latch sample plate", (-0.95, 1.02, 0.34), (0.34, 0.23, 0.045), oak_dark, parent=target_keys, bevel=0.025)
    box("Repaired latch sample", (-0.95, 1.03, 0.31), (0.12, 0.1, 0.032), brass_worn, parent=target_keys, bevel=0.018)

    # The table is dark walnut, with square joinery kept legible beneath its thinner top.
    table_x, table_z = -0.7, 2.7
    box("Dining table top", (table_x, 0.77, table_z), (1.3, 0.075, 0.78), walnut, stage=True, bevel=0.018)
    box("Table apron long", (table_x, 0.69, table_z), (1.12, 0.13, 0.62), walnut, stage=True, bevel=0.009)
    for x in (-1.22, -0.18):
        for z in (2.42, 2.98):
            box(f"Table leg {x} {z}", (x, 0.38, z), (0.07, 0.74, 0.07), oak_dark, stage=True, bevel=0.008)
    box("Table underside note backing", (-0.7, 0.68, 2.7), (0.24, 0.015, 0.15), paper_shadow, parent=target_underside, bevel=0.003)
    box("Table underside pencil note", (-0.7, 0.671, 2.7), (0.21, 0.007, 0.12), paper, parent=target_underside, bevel=0.002)
    box("Table pencil", (-0.84, 0.813, 2.48), (0.007, 0.012, 0.14), oak_dark, stage=True, bevel=0.002, rotation=0.32)

    # Phone: a quiet dark-glass slab, never an emissive target marker.
    phone_x, phone_z = -0.73, 2.68
    box("Phone lower case", (phone_x, 0.808, phone_z), (0.082, 0.014, 0.158), oak_dark, parent=target_phone, bevel=0.012, rotation=0.08)
    box("Phone rim", (phone_x, 0.817, phone_z), (0.075, 0.004, 0.15), brass_worn, parent=target_phone, bevel=0.009, rotation=0.08)
    box("Phone screen", (phone_x, 0.820, phone_z), (0.067, 0.003, 0.137), phone_glass, parent=target_phone, bevel=0.007, rotation=0.08)
    box("Phone speaker slot", (phone_x, 0.822, phone_z + 0.052), (0.025, 0.002, 0.003), brass_worn, parent=target_phone, bevel=0.001, rotation=0.08)
    for button_z in (phone_z - 0.018, phone_z + 0.008):
        box(f"Phone side key {button_z}", (phone_x + 0.041, 0.816, button_z), (0.008, 0.006, 0.018), brass_worn, parent=target_phone, bevel=0.003, rotation=0.08)
    cylinder("Phone home button", (phone_x, 0.823, phone_z - 0.064), 0.006, 0.002, brass, parent=target_phone, vertices=12)

    # Cream A5 bill with a folded corner; it carries no printed personal data.
    box("Unpaid bill sheet", (-1.16, 0.817, 2.82), (0.21, 0.008, 0.148), paper, parent=target_bill, bevel=0.002, rotation=-0.07)
    box("Bill folded corner", (-1.245, 0.824, 2.87), (0.028, 0.004, 0.028), paper_shadow, parent=target_bill, bevel=0.001, rotation=0.14)
    for i in range(3):
        box(f"Bill print rule {i}", (-1.16, 0.823, 2.79 + i * 0.026), (0.13 - i * 0.014, 0.001, 0.003), paper_shadow, parent=target_bill, bevel=0.001)

    # A blank folded letter and a closed notebook give the two table seats separate, quiet traces of use.
    letter_cover = material("Unmarked letter paper", (0.62, 0.57, 0.47), 0.92)
    notebook_cover = material("Olive canvas notebook", (0.22, 0.27, 0.20), 0.88)
    box("Folded letter", (-1.01, 0.813, 2.48), (0.19, 0.01, 0.13), letter_cover, stage=True, bevel=0.002, rotation=-0.06)
    box("Letter folded flap", (-1.01, 0.819, 2.48), (0.16, 0.003, 0.045), paper_shadow, stage=True, bevel=0.001, rotation=-0.06)

    notebook_x, notebook_z = -0.35, 2.86
    notebook_rotation = 0.92
    box("Notebook lower cover", (notebook_x, 0.817, notebook_z), (0.34, 0.018, 0.24), notebook_cover, stage=True, bevel=0.004, rotation=notebook_rotation)
    box("Notebook page block", (notebook_x, 0.829, notebook_z), (0.315, 0.012, 0.218), paper, stage=True, bevel=0.002, rotation=notebook_rotation)
    box("Notebook upper cover", (notebook_x, 0.838, notebook_z), (0.34, 0.012, 0.24), notebook_cover, stage=True, bevel=0.003, rotation=notebook_rotation)
    box("Notebook cloth spine", (notebook_x - 0.15, 0.84, notebook_z), (0.035, 0.014, 0.246), oak_dark, stage=True, bevel=0.002, rotation=notebook_rotation)

    # Two unmatched cups and a saucer; a replacement handle is slightly warmer than its cup.
    cylinder("Saucer base", (-0.38, 0.812, 2.48), 0.082, 0.012, ceramic_warm, parent=saucer, vertices=40, bevel=0.003)
    cylinder("Saucer inner ring", (-0.38, 0.821, 2.48), 0.047, 0.005, brass_worn, parent=saucer, vertices=36, bevel=0.001)
    lathe("Blue cup", (-0.38, 0.821, 2.48), [
        (0.0, 0.004), (0.05, 0.004), (0.055, 0.012), (0.055, 0.076),
        (0.052, 0.082), (0.047, 0.082), (0.045, 0.075), (0.035, 0.02), (0.0, 0.02),
    ], ceramic, moving_cup, segments=56)
    cylinder("Tea in blue cup", (-0.38, 0.894, 2.48), 0.041, 0.004, tea, parent=moving_cup, vertices=56, bevel=0.001)
    torus("Blue cup rolled lip", (-0.38, 0.899, 2.48), 0.051, 0.003, ceramic_warm, moving_cup, rotation=(0, 0, 0))
    torus("Blue cup replacement handle", (-0.32, 0.86, 2.48), 0.028, 0.006, brass_worn, moving_cup, rotation=(math.pi / 2, 0, 0))
    cylinder("Second saucer base", (-1.1, 0.812, 2.93), 0.082, 0.012, ceramic_warm, parent=target_cup, vertices=40, bevel=0.003)
    cylinder("Second saucer inner ring", (-1.1, 0.821, 2.93), 0.047, 0.005, brass_worn, parent=target_cup, vertices=36, bevel=0.001)
    cylinder("Second cup foot", (-1.1, 0.827, 2.93), 0.052, 0.012, ceramic_warm, parent=target_cup, vertices=32, bevel=0.002)
    lathe("Ivory cup", (-1.1, 0.821, 2.93), [
        (0.0, 0.004), (0.05, 0.004), (0.055, 0.012), (0.055, 0.076),
        (0.052, 0.082), (0.047, 0.082), (0.045, 0.075), (0.035, 0.02), (0.0, 0.02),
    ], ceramic_warm, target_cup, segments=56)
    cylinder("Tea in ivory cup", (-1.1, 0.894, 2.93), 0.041, 0.004, tea, parent=target_cup, vertices=56, bevel=0.001)
    torus("Ivory cup rolled lip", (-1.1, 0.899, 2.93), 0.051, 0.003, ceramic_warm, target_cup, rotation=(0, 0, 0))
    torus("Ivory cup handle", (-1.04, 0.86, 2.93), 0.028, 0.006, ceramic_warm, target_cup, rotation=(math.pi / 2, 0, 0))

    # The chair starts tucked under its cup; its action slides it back by 18 cm.
    chair_x, chair_z = -0.58, 2.32
    box("Chair seat", (chair_x, 0.47, chair_z), (0.43, 0.065, 0.42), oak, parent=moving_chair, bevel=0.012)
    box("Chair cushion", (chair_x, 0.51, chair_z), (0.36, 0.045, 0.35), linen, parent=moving_chair, bevel=0.012)
    box("Chair back rail", (chair_x, 0.78, chair_z - 0.19), (0.43, 0.48, 0.06), oak, parent=moving_chair, bevel=0.015, rotation=-0.08)
    box("Chair back inset", (chair_x, 0.78, chair_z - 0.155), (0.31, 0.29, 0.025), wall_paint_old, parent=moving_chair, bevel=0.008, rotation=-0.08)
    for x in (chair_x - 0.16, chair_x + 0.16):
        for z in (chair_z - 0.15, chair_z + 0.15):
            box(f"Chair leg {x} {z}", (x, 0.235, z), (0.045, 0.47, 0.045), oak_dark, parent=moving_chair, bevel=0.006)
    for x in (chair_x - 0.16, chair_x + 0.16):
        box(f"Chair stretcher {x}", (x, 0.21, chair_z), (0.028, 0.028, 0.30), oak, parent=moving_chair, bevel=0.009)

    # Sofa set along the east wall, with one removable cushion and a small mended patch underneath.
    box("Sofa plinth", (2.55, 0.32, 3.17), (1.04, 0.44, 1.9), oak_dark, stage=True, bevel=0.025)
    for index, z in enumerate((2.62, 3.17, 3.72), start=1):
        upholstered_seat(f"Sofa seat pad {index}", (2.30, z), (0.72, 0.30, 0.52), 0.39, sofa_fabric, None)
    box("Sofa back", (2.88, 0.82, 3.17), (0.30, 0.92, 1.85), sofa_fabric, stage=True, bevel=0.052, bevel_segments=6, soft_edges=True)
    for z in (2.36, 3.98):
        box(f"Sofa arm {z}", (2.51, 0.70, z), (0.92, 0.54, 0.22), sofa_fabric, stage=True, bevel=0.052, bevel_segments=6, soft_edges=True)
    for z in (2.66, 3.17, 3.68):
        upholstered_back_pad(f"Sofa back pillow {z}", (2.76, 0.98, z), (0.34, 0.62, 0.48), sofa_fabric, None)
    for z in (2.91, 3.43):
        box(f"Sofa seat seam {z}", (2.30, 0.608, z), (0.61, 0.008, 0.018), oak_dark, stage=True, bevel=0.004)
    for z in (2.66, 3.17, 3.68):
        sphere(f"Sofa back tuft {z}", (2.704, 1.0, z), (0.018, 0.024, 0.024), oak_dark, stage=True, segments=12, rings=8)
    for z in (2.45, 3.17, 3.89):
        box(f"Sofa seam {z}", (2.64, 0.57, z), (0.03, 0.012, 0.52), linen, stage=True, bevel=0.006)
    box("Patch under cushion", (2.18, 0.68, 3.0), (0.18, 0.012, 0.13), clay, parent=target_cushion, bevel=0.012, rotation=0.16)
    for x in (2.11, 2.25):
        box(f"Patch seam {x}", (x, 0.69, 3.0), (0.006, 0.004, 0.12), cream_linen, parent=target_cushion, bevel=0.002)
    compressed_cushion("Removable sofa cushion", (2.19, 3.0), (0.46, 0.045, 0.52), 0.70, sofa_fabric, moving_cushion)
    for x in (1.99, 2.39):
        box(f"Loose cushion side seam {x}", (x, 0.722, 3.0), (0.005, 0.003, 0.43), cream_linen, parent=moving_cushion, bevel=0.001)
    for z in (2.79, 3.21):
        box(f"Loose cushion end seam {z}", (2.19, 0.722, z), (0.40, 0.003, 0.005), cream_linen, parent=moving_cushion, bevel=0.001)
    for x in (2.12, 2.86):
        for z in (2.40, 3.94):
            cylinder(f"Turned sofa foot {x} {z}", (x, 0.11, z), 0.046, 0.22, oak_dark, stage=True, vertices=28, bevel=0.012)
            cylinder(f"Sofa foot ferrule {x} {z}", (x, 0.025, z), 0.047, 0.035, brass_worn, stage=True, vertices=28, bevel=0.006)

    # A framed back-edge book shelf, a small plant and quiet household clutter give the set a present-day welcome.
    box("Living room low shelf", (2.66, 0.76, 4.65), (0.44, 0.09, 0.92), oak, stage=True, bevel=0.035)
    for z in (4.35, 4.52, 4.72):
        box(f"Shelf book {z}", (2.42, 0.9, z), (0.22, 0.2, 0.1), paper_shadow if int(z * 100) % 2 else enamel_green, stage=True, bevel=0.008)
    cylinder("Plant pot", (2.48, 1.04, 4.04), 0.11, 0.18, clay, stage=False, vertices=28, bevel=0.012)
    for index, (x, y, z) in enumerate(((2.42, 1.22, 4.0), (2.52, 1.25, 4.02), (2.48, 1.31, 4.10), (2.43, 1.28, 3.94))):
        sphere(f"Plant leaf {index}", (x, y, z), (0.035, 0.11, 0.06), leaf, segments=14, rings=10)

    # The flush lift platform remains closed and solid. Its low brass gate rises before a selected departure.
    platform_x, platform_z = 0.8, 4.1
    box("Elevator platform oak inset", (platform_x, 0.01, platform_z), (1.5, 0.035, 1.5), oak, parent=target_platform, bevel=0.022)
    box("Elevator platform centre", (platform_x, 0.032, platform_z), (1.36, 0.018, 1.36), floor_oak, parent=target_platform, bevel=0.018)
    for x in (platform_x - 0.74, platform_x + 0.74):
        box(f"Elevator seam side {x}", (x, 0.045, platform_z), (0.025, 0.012, 1.45), brass_worn, parent=target_platform, bevel=0.006)
    for z in (platform_z - 0.74, platform_z + 0.74):
        box(f"Elevator seam end {z}", (platform_x, 0.045, z), (1.45, 0.012, 0.025), brass_worn, parent=target_platform, bevel=0.006)
    box("Platform Gate", (platform_x - 0.68, 0.18, platform_z), (0.06, 0.28, 1.26), oak, parent=platform_gate, bevel=0.025)
    box("Platform gate brass cap", (platform_x - 0.68, 0.33, platform_z), (0.08, 0.03, 1.3), brass_worn, parent=platform_gate, bevel=0.016)

    # A damped radiator, folded throw and a small glazed bowl provide texture without adding more actions.
    box("Radiator body", (-2.9, 0.56, 1.08), (0.08, 0.66, 0.78), enamel, stage=True, bevel=0.03)
    for z in (0.79, 0.95, 1.11, 1.27, 1.43):
        box(f"Radiator fin {z}", (-2.84, 0.56, z), (0.045, 0.58, 0.045), chrome, stage=True, bevel=0.018)
    sphere("Radiator valve", (-2.76, 0.38, 1.08), (0.04, 0.04, 0.04), brass_worn, segments=14, rings=8)
    box("Throw folded over sofa arm", (2.27, 0.982, 2.36), (0.46, 0.022, 0.26), cream_linen, stage=True, bevel=0.005, rotation=0.02)
    box("Throw folded top layer", (2.27, 0.997, 2.405), (0.34, 0.009, 0.15), cream_linen, stage=True, bevel=0.004, rotation=0.02)
    box("Throw fold seam", (2.27, 1.002, 2.33), (0.33, 0.003, 0.006), cream_linen, stage=True, bevel=0.001, rotation=0.02)
    box("Throw hanging over sofa arm", (2.045, 0.75, 2.36), (0.028, 0.44, 0.26), cream_linen, stage=True, bevel=0.005, rotation=0.02)
    box("Throw hem", (2.032, 0.676, 2.36), (0.004, 0.008, 0.21), cream_linen, stage=True, bevel=0.001, rotation=0.02)
    cylinder("Small glazed bowl", (2.41, 0.64, 4.62), 0.085, 0.055, ceramic, stage=False, vertices=28, bevel=0.012)

    join_group_meshes()
    join_static_meshes()

    # No active camera, remote resources, animation, shadow maps or executable extensions are exported.
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        export_apply=True,
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_yup=True,
        export_draco_mesh_compression_enable=False,
    )


def parse_output():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not args:
        raise SystemExit("Expected output GLB path after --")
    return os.path.abspath(args[0])


OUTPUT = parse_output()
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
build_room()
