"""Build the compact, authored Tomorrow Engine station stage."""
import math
import os
import sys

import bpy
from mathutils import Vector


def p(x, y, z):
    return (x, -z, y)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def mat(name, colour, roughness=0.65, metallic=0.0, emission=None, strength=0.0, image=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*colour, 1.0)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*colour, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    emission_socket = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
    if emission is not None and emission_socket is not None:
        emission_socket.default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    if image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material


def group(name, action):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj["actionTarget"] = action
    return obj


def parent(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_parent_inverse = root.matrix_world.inverted()
    obj.matrix_world = world
    return obj


def bevel(obj, width=0.008):
    if width <= 0:
        return
    modifier = obj.modifiers.new("Soft milled edges", "BEVEL")
    modifier.width = width
    # A single softened bevel keeps the close fittings legible while cutting the
    # repeated edge geometry across the room's many supported parts.
    modifier.segments = 1
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(24)


def box(name, point, size, material, root=None, edge=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p(*point), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material is not None:
        obj.data.materials.append(material)
    bevel(obj, edge)
    if root is not None:
        parent(obj, root)
    return obj


def cylinder(name, point, radius, depth, material, root=None, vertices=24, front=False):
    rotation = (math.pi / 2, 0, 0) if front else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=p(*point), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if material is not None:
        obj.data.materials.append(material)
    bevel(obj, min(0.008, radius * 0.12))
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    if root is not None:
        parent(obj, root)
    return obj


def torus(name, point, major, minor, material, root=None, segments=28):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=6, major_radius=major, minor_radius=minor,
                                     location=p(*point), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    if material is not None:
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if root is not None:
        parent(obj, root)
    return obj


def rod(name, a, b, radius, material, root=None, vertices=12):
    first = Vector(p(*a))
    second = Vector(p(*b))
    direction = second - first
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length,
                                       location=(first + second) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    if material is not None:
        obj.data.materials.append(material)
    if root is not None:
        parent(obj, root)
    return obj


def text(name, body, size, point, material, root=None, rotation=(math.pi / 2, 0, math.pi), align="CENTER"):
    bpy.ops.object.text_add(location=p(*point), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.size = size
    obj.data.align_x = align
    obj.data.align_y = "CENTER"
    obj.data.extrude = 0.0005
    obj.data.bevel_depth = 0.0002
    obj.data.bevel_resolution = 1
    obj.data.materials.append(material)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    return parent(obj, root) if root is not None else obj


FONT = {
    "1": ("010", "110", "010", "010", "010", "010", "111"),
    "4": ("101", "101", "101", "111", "001", "001", "001"),
    "5": ("111", "100", "100", "110", "001", "001", "110"),
}


def make_date_atlas(path):
    image = bpy.data.images.new("Paper and lettering atlas", width=128, height=64, alpha=True)
    paper = (0.84, 0.79, 0.69, 1.0)
    ink = (0.13, 0.09, 0.06, 1.0)
    pixels = list(paper) * (128 * 64)
    for face, digits in enumerate(("14", "15")):
        left = face * 64 + 14
        for char_index, digit in enumerate(digits):
            glyph = FONT[digit]
            base_x = left + char_index * 20
            for row, line in enumerate(glyph):
                for column, mark in enumerate(line):
                    if mark != "1":
                        continue
                    for py in range(3):
                        for px in range(3):
                            x = base_x + column * 4 + px
                            y = 9 + (6 - row) * 6 + py
                            offset = (y * 128 + x) * 4
                            pixels[offset:offset + 4] = ink
    image.pixels = pixels
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    image.pack()
    image.colorspace_settings.name = "sRGB"
    return image


def date_quad(material, root):
    # The paper face and date numerals sit in front of the escapement hub. Keep
    # the atlas quad just proud of the paper so the 14/15 glyphs cannot be
    # hidden by the gear at the centre of the dial.
    bpy.ops.mesh.primitive_plane_add(size=1, location=p(0, 1.70, 4.325), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = "Date_Numeral_Quad"
    obj.scale = (0.30, 0.21, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    layer = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            # Station cameras look along +Y here, so -X is the right of the screen.
            layer.data[loop_index].uv = (0.0 if vertex.x > 0 else 1.0, 1.0 if vertex.y > 0 else 0.0)
    return parent(obj, root)


def add_bolt(root, name, point, brass):
    cylinder(name, point, 0.018, 0.018, brass, root, vertices=12, front=True)


def build(output):
    clear()
    near_black = mat("Near black iron", (0.035, 0.027, 0.019), 0.82, 0.24)
    wall = mat("Unlit warm plaster", (0.045, 0.034, 0.023), 0.95)
    steel = mat("Blackened steel", (0.11, 0.13, 0.12), 0.38, 0.75)
    steel_edge = mat("Warm steel edges", (0.34, 0.31, 0.25), 0.28, 0.75)
    bronze = mat("Aged bronze", (0.34, 0.23, 0.11), 0.34, 0.72)
    brass = mat("Polished bronze contact", (0.66, 0.42, 0.19), 0.26, 0.78)
    wood = mat("Worn wooden grip", (0.24, 0.13, 0.07), 0.78, 0.02)
    paper = mat("Warm paper", (0.68, 0.58, 0.43), 0.93)
    ink = mat("Paper ink", (0.16, 0.105, 0.06), 0.83)
    lit_lettering = mat("Enamel lettering", (0.68, 0.58, 0.43), 0.9, 0.0, (0.68, 0.58, 0.43), 0.45)
    lamp_glass = mat("Practical lamp glass", (0.5, 0.32, 0.16), 0.28, 0.05, (0.72, 0.39, 0.15), 0.35)
    atlas_path = output + ".date-atlas.png"
    atlas = make_date_atlas(atlas_path)
    numeral = mat("Paper and lettering atlas material", (1, 1, 1), 0.9, image=atlas)

    # The enclosed shell sits behind the fixed views and stays almost unlit.
    structure = group("Interact_Structure", "Interact_Structure")
    box("Stage floor", (0, -0.06, 4.2), (12.0, 0.12, 9.8), near_black, structure, 0.02)
    box("Rear wall", (0, 3.9, 5.65), (12.0, 8.0, 0.12), wall, structure, 0.025)
    box("West return wall", (-5.95, 3.9, 4.2), (0.12, 8.0, 9.8), wall, structure, 0.02)
    box("East return wall", (5.95, 3.9, 4.2), (0.12, 8.0, 9.8), wall, structure, 0.02)
    box("Stage lintel", (0, 7.85, 4.2), (11.8, 0.14, 9.6), near_black, structure, 0.02)
    # Retained door shell is placed behind every authored camera and has no room interaction.
    box("Door shell west return", (-1.18, 1.45, 0.03), (2.2, 2.9, 0.12), wall, structure, 0.015)
    box("Door shell east return", (1.18, 1.45, 0.03), (2.2, 2.9, 0.12), wall, structure, 0.015)
    box("Door shell head", (0, 2.75, 0.03), (0.34, 0.32, 0.12), wall, structure, 0.015)
    clerestory = group("Interact_Clerestory", "Interact_Clerestory")
    box("Clerestory dark glass", (0, 2.75, 5.56), (1.25, 0.35, 0.025), steel, clerestory, 0.008)
    for x in (-0.66, 0.66): box("Clerestory frame", (x, 2.75, 5.54), (0.05, 0.42, 0.05), steel_edge, clerestory, 0.008)

    casing = group("Interact_Casing", "Interact_Casing")
    box("Engine mounting plate", (0, 1.02, 4.48), (2.55, 1.55, 0.16), near_black, casing, 0.045)
    box("Engine lower plinth", (0, 0.37, 4.26), (2.9, 0.28, 0.62), steel, casing, 0.04)
    for x in (-1.28, 1.28):
        box("Foot plate", (x, 0.22, 4.24), (0.25, 0.06, 0.58), bronze, casing, 0.012)

    gearing = group("Interact_Gearing", "Interact_Gearing")
    # Keep the central hub and the gear's front edge behind the date paper.
    # The rim remains visible around the housing while the two numeral faces stay clear.
    cylinder("Date escapement hub", (0, 1.68, 4.50), 0.16, 0.11, steel_edge, gearing, 28, True)
    torus("Date gear rim", (0, 1.68, 4.40), 0.49, 0.035, brass, gearing, 32)
    for index in range(16):
        angle = 2 * math.pi * index / 16
        x = math.cos(angle) * 0.51
        y = 1.68 + math.sin(angle) * 0.51
        box("Date gear tooth", (x, y, 4.40), (0.08, 0.045, 0.07), bronze, gearing, 0.006, (0, 0, -angle))

    flywheel = group("Interact_Flywheel", "Interact_Flywheel")
    torus("Flywheel rim", (-0.45, 1.1, 4.13), 0.42, 0.032, steel_edge, flywheel, 36)
    rotor = group("Flywheel_Rotor", "wind")
    rotor["bake"] = "dynamic"
    rotor.location = p(-0.45, 1.1, 4.08)
    rotor.matrix_world.translation = Vector(p(-0.45, 1.1, 4.08))
    parent(rotor, flywheel)
    cylinder("Flywheel centre", (-0.45, 1.1, 4.11), 0.075, 0.09, brass, rotor, 24, True)
    rod("Flywheel spoke", (-0.45, 1.1, 4.08), (-0.45, 1.47, 4.08), 0.022, steel_edge, rotor)
    rod("Flywheel spoke", (-0.45, 1.1, 4.08), (-0.78, 0.91, 4.08), 0.022, steel_edge, rotor)
    rod("Flywheel spoke", (-0.45, 1.1, 4.08), (-0.12, 0.91, 4.08), 0.022, steel_edge, rotor)
    cylinder("Worn wooden handle", (-0.45, 1.48, 4.08), 0.05, 0.18, wood, rotor, 18, True)

    brake = group("Interact_Brake", "Interact_Brake")
    cylinder("Brake pivot", (0.45, 1.08, 4.12), 0.08, 0.12, brass, brake, 20, True)
    lever = box("Brake_Lever", (0.45, 1.27, 4.08), (0.075, 0.48, 0.07), steel_edge, brake, 0.012)
    box("Brake leather grip", (0.45, 1.51, 4.07), (0.13, 0.12, 0.10), wood, brake, 0.02)
    box("Brake catch", (0.45, 1.03, 4.32), (0.18, 0.08, 0.09), bronze, brake, 0.01)

    date_face = group("Interact_DateFace", "Interact_DateFace")
    box("Date housing", (0, 1.70, 4.43), (0.86, 0.52, 0.15), steel, date_face, 0.035)
    box("Date paper face", (0, 1.70, 4.34), (0.68, 0.36, 0.018), paper, date_face, 0.008)
    text("Schedule date lettering", "SCHEDULE DATE:", 0.066, (0, 1.83, 4.325), ink, date_face)
    date_quad(numeral, date_face)
    for x in (-0.37, 0.37): add_bolt(date_face, "Date fastener", (x, 1.51, 4.32), brass)
    inscription = group("Interact_PreparationInscription", "Interact_PreparationInscription")
    parent(inscription, gearing)
    # Beside the brake, clear of the flywheel and lever in every station view.
    for x in (0.60, 0.96):
        rod("Inscription plate mounting arm", (x, 1.32, 4.42), (x, 1.32, 4.30), 0.018, steel_edge, inscription)
    box("Preparation inscription plate", (0.78, 1.32, 4.30), (0.50, 0.15, 0.035), near_black, inscription, 0.008)
    text("Date gear inscription", "PREPARATION\nFOR PREPARATION.", 0.045, (0.78, 1.32, 4.275), paper, inscription)

    record = group("Interact_RecordGuard", "Interact_RecordGuard")
    record_contents = group("Record_Contents", "Interact_RecordGuard")
    record_contents["bake"] = "dynamic"
    parent(record_contents, record)
    box("Movement record backing", (0, 1.98, 4.66), (0.86, 0.45, 0.08), bronze, record_contents, 0.02)
    box("Movement record paper", (0, 2.02, 4.59), (0.77, 0.32, 0.025), paper, record_contents, 0.01)
    text("Movement record date line", "Date advanced one day.", 0.038, (0, 2.08, 4.56), ink, record_contents)
    text("Movement record carriage line", "Carriage displacement: zero.", 0.038, (0, 1.97, 4.56), ink, record_contents)
    guard = box("Record_Guard", (0, 2.13, 4.49), (0.91, 0.20, 0.035), steel_edge, record, 0.018)
    guard["bake"] = "dynamic"
    hinge = cylinder("Record guard hinge", (0, 2.03, 4.43), 0.045, 0.90, brass, record, 20)
    catch_mesh = box("Record_Catch", (0.47, 1.99, 4.42), (0.09, 0.10, 0.08), bronze, record, 0.01)
    catch_mesh["bake"] = "dynamic"
    instruction_card = group("Instruction_Card", "Interact_Flywheel")
    instruction_card["bake"] = "dynamic"
    instruction_card.location = p(-0.45, 1.34, 4.06)
    instruction_card.matrix_world.translation = Vector(p(-0.45, 1.34, 4.06))
    parent(instruction_card, flywheel)
    box("Fixed instruction card", (-0.45, 1.34, 4.06), (0.56, 0.22, 0.025), paper, instruction_card, 0.005)
    text("Fixed instruction lettering", "One turn advances the date display.", 0.03, (-0.45, 1.34, 4.04), ink, instruction_card)

    carriage = group("Interact_Carriage", "Interact_Carriage")
    box("Carriage frame", (0, 0.82, 4.22), (1.98, 0.30, 0.52), steel, carriage, 0.025)
    box("Carriage face", (0, 0.84, 3.94), (1.78, 0.23, 0.035), bronze, carriage, 0.01)
    starting_mark = group("Interact_StartingMark", "Interact_StartingMark")
    parent(starting_mark, carriage)
    box("Carriage pencil mark", (0.30, 0.84, 3.915), (0.26, 0.008, 0.006), ink, starting_mark)
    work_label = group("Interact_WorkLabel", "Interact_WorkLabel")
    parent(work_label, carriage)
    box("Carriage work label plate", (0, 1.04, 3.91), (0.88, 0.13, 0.04), near_black, work_label, 0.006)
    text("Carriage work label", "WORK COMPLETED", 0.048, (0, 1.04, 3.88), lit_lettering, work_label)
    box("Carriage left rail", (-0.62, 0.62, 4.37), (0.06, 0.08, 1.38), steel_edge, carriage, 0.01)
    box("Carriage right rail", (0.62, 0.62, 4.37), (0.06, 0.08, 1.38), steel_edge, carriage, 0.01)
    box("Starting mark", (0.62, 0.72, 3.98), (0.025, 0.03, 0.04), brass, carriage, 0.004)

    sleeve = group("Interact_HourSleeve", "Interact_HourSleeve")
    box("Hour sleeve back", (-0.32, 0.87, 3.90), (0.24, 0.14, 0.035), bronze, sleeve, 0.01)
    box("Hour sleeve face", (-0.32, 0.88, 3.875), (0.21, 0.12, 0.018), steel_edge, sleeve, 0.006)
    box("Hour sleeve retaining lip", (-0.32, 0.81, 3.86), (0.24, 0.018, 0.045), bronze, sleeve, 0.004)
    for x in (-0.40, -0.24): add_bolt(sleeve, "Hour sleeve screw", (x, 0.91, 3.86), brass)
    card = box("Hour_Sleeve_Card", (-0.32, 0.87, 3.85), (0.16, 0.09, 0.012), paper, sleeve, 0.004)
    text("Unused hour face", "UNUSED HOUR", 0.024, (-0.32, 0.87, 3.84), ink, card)

    stop = group("Interact_StopTab", "Interact_StopTab")
    box("Bronze stop plate", (0.30, 0.82, 3.90), (0.18, 0.16, 0.035), bronze, stop, 0.012)
    cylinder("Stop tab hinge", (0.30, 0.90, 3.88), 0.016, 0.14, brass, stop, 16, True)
    tab = box("Stop_Tab", (0.30, 0.85, 3.86), (0.12, 0.10, 0.025), brass, stop, 0.008)
    rubbing = group("Stop_Rubbing", "Interact_StopTab")
    rubbing["bake"] = "dynamic"
    parent(rubbing, stop)
    box("Stop rubbing", (0.30, 0.74, 3.86), (0.11, 0.045, 0.008), paper, rubbing, 0.003)
    text("Rubbing label", "STARTING-STOP RUBBING", 0.01, (0.30, 0.74, 3.85), ink, rubbing)

    dispatch = group("Interact_DispatchHatch", "Interact_DispatchHatch")
    box("Dispatch housing", (0.83, 1.02, 4.28), (0.52, 0.43, 0.16), steel, dispatch, 0.025)
    hatch = box("Dispatch_Hatch_Lip", (0.83, 0.84, 4.16), (0.54, 0.06, 0.20), bronze, dispatch, 0.012)
    hatch["bake"] = "dynamic"
    ticket_edge = box("Ticket_Edge", (0.83, 0.95, 4.17), (0.34, 0.025, 0.018), paper, dispatch, 0.003)
    ticket_edge["bake"] = "dynamic"
    box("Ticket ledge", (0.83, 0.70, 4.06), (0.62, 0.05, 0.32), steel_edge, dispatch, 0.012)
    box("Ticket lower clip", (0.83, 0.735, 3.99), (0.35, 0.035, 0.045), brass, dispatch, 0.008)
    ticket = box("Dispatch_Ticket", (0.83, 0.731, 4.40), (0.42, 0.012, 0.26), paper, dispatch, 0.004)
    ticket["bake"] = "dynamic"
    text("Ticket face heading", "DELIVERY", 0.045, (0.83, 0.738, 4.40), ink, ticket, rotation=(0, 0, 0))

    links = group("Interact_InspectionLinkage", "Interact_InspectionLinkage")
    brake_release = group("Brake_Release_Linkage", "Interact_InspectionLinkage")
    brake_release["bake"] = "dynamic"
    parent(brake_release, links)
    rod("Brake release rod", (0.47, 1.01, 4.34), (0.47, 1.97, 4.34), 0.012, brass, brake_release)
    rod("Brake release linkage", (0.47, 1.01, 4.29), (0.83, 1.0, 4.29), 0.018, brass, links)
    box("Hatch latch", (0.67, 1.08, 4.30), (0.07, 0.10, 0.06), steel_edge, links, 0.008)

    support = group("Interact_PaperSupport", "Interact_PaperSupport")
    box("Paper record shelf", (0, 1.76, 4.55), (0.96, 0.045, 0.10), bronze, support, 0.01)
    box("Ticket support bracket", (0.83, 0.65, 4.08), (0.46, 0.045, 0.04), bronze, support, 0.008)

    title = group("Interact_TitlePlaque", "Interact_TitlePlaque")
    for x in (-0.78, 0.78):
        box("Title plaque support", (x, 1.91, 4.18), (0.055, 0.20, 0.08), steel_edge, title, 0.008)
    box("Title plaque", (0, 2.10, 4.08), (1.78, 0.18, 0.055), near_black, title, 0.018)
    text("Title plaque lettering", "THE TOMORROW ENGINE", 0.078, (0, 2.10, 4.04), paper, title)
    lamp_group = group("Interact_WorkLamp", "Interact_WorkLamp")
    for x in (-1.04, 1.04):
        box("Supported practical lamp upright", (x, 2.12, 4.12), (0.08, 0.54, 0.10), steel, lamp_group, 0.01)
    box("Supported practical lamp rail", (0, 2.37, 4.12), (2.16, 0.08, 0.10), steel, lamp_group, 0.01)
    for x in (-0.92, 0, 0.92):
        box("Supported lamp arm", (x, 2.33, 3.96), (0.10, 0.06, 0.28), steel, lamp_group, 0.01)
        cylinder("Practical lamp shade", (x, 2.28, 3.84), 0.11, 0.08, brass, lamp_group, 20)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.065, location=p(x, 2.22, 3.82))
        bulb = bpy.context.object
        bulb.name = "Supported practical lamp"
        bulb.data.materials.append(lamp_glass)
        parent(bulb, lamp_group)

    # Keep only targetable authored forms; combine static pieces by material while preserving
    # their named response parents and the moving pivots used by the browser state machine.
    dynamic = {"Brake_Lever", "Record_Guard", "Record_Catch", "Dispatch_Hatch_Lip", "Ticket_Edge", "Dispatch_Ticket", "Hour_Sleeve_Card", "Stop_Tab", "Date_Numeral_Quad"}
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 8
    bpy.context.scene.world.color = (0.012, 0.009, 0.006)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.name in dynamic:
            obj["bake"] = "dynamic"
    join_groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.name in dynamic or obj.parent is None or obj.get("bake") == "dynamic":
            continue
        if len(obj.data.materials) != 1 or obj.data.materials[0] is None:
            continue
        join_groups.setdefault((obj.parent, obj.data.materials[0].name), []).append(obj)
    for members in join_groups.values():
        if len(members) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in members:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        bpy.ops.object.join()
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    bpy.ops.export_scene.gltf(
        filepath=output, export_format="GLB", export_apply=True, export_image_format="AUTO",
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_cameras=False, export_lights=False, export_extras=True, export_yup=True,
        export_draco_mesh_compression_enable=False,
    )
    if os.path.exists(atlas_path):
        os.remove(atlas_path)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    build(args[0])
