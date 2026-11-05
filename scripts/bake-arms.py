"""Bake first-person athlete arms from a rigged base character.

Source models (CC0, no login): Grab3D "Man Base Mesh" and "Woman Base Mesh", rigged GLB.
  https://grab3d.com/dl/man-base-character-rigged/man-base-character-rigged.glb
  https://grab3d.com/dl/woman-base-character-rigged/woman-base-character-rigged.glb

Usage:
  blender -b --python scripts/bake-arms.py -- <in.glb> <out.glb> [triangles] [texture px]

Keeps only the vertices driven by the arm bones, adds two finger bones per hand so the game
can close the fist (the source rig has none), decimates to the triangle budget, shrinks the
textures and exports a skinned GLB in the rest (A) pose without animations.
"""

import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1 :]
SOURCE, TARGET = ARGS[0], ARGS[1]
TRIANGLES = int(ARGS[2]) if len(ARGS) > 2 else 6000
TEXTURE = int(ARGS[3]) if len(ARGS) > 3 else 1024
ARM_BONES = {
    f'{side}{part}'
    for side in ('Left', 'Right')
    for part in ('Arm', 'ForeArm', 'Hand', 'Fingers', 'FingerTips')
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups)
for o in list(bpy.data.objects):
    if o not in (armature, mesh):
        bpy.data.objects.remove(o)
armature.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
for bone in armature.pose.bones:
    bone.matrix_basis.identity()

# Drop every vertex whose strongest bone is not an arm bone.
names = {g.index: g.name for g in mesh.vertex_groups}
drop = [
    v.index
    for v in mesh.data.vertices
    if not v.groups or names[max(v.groups, key=lambda g: g.weight).group] not in ARM_BONES
]
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for i in drop:
    mesh.data.vertices[i].select = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode='OBJECT')



def smooth(edge0, edge1, x):
    k = min(max((x - edge0) / (edge1 - edge0), 0), 1)
    return k * k * (3 - 2 * k)


def add_fingers(side, sign):
    """Two bones curl the four fingers together; the thumb stays on the hand bone.

    Hand frame: a runs from the wrist to the fingertips, n is the palm normal (the palms face
    the thighs in the A-pose) and s = a x n runs across the knuckles, thumb on the sign side.
    Needs the seams merged first so the mesh connectivity shows where the thumb splits off.
    """
    names = {g.index: g.name for g in mesh.vertex_groups}
    world = armature.matrix_world
    wrist = world @ armature.data.bones[side + 'Hand'].head_local
    points = {
        v.index: mesh.matrix_world @ v.co
        for v in mesh.data.vertices
        if v.groups and names[max(v.groups, key=lambda g: g.weight).group] == side + 'Hand'
    }
    centre = sum(points.values(), Vector()) / len(points)
    a = (centre - wrist).normalized()
    inward = Vector((sign, 0, 0))
    n = (inward - a * inward.dot(a)).normalized()
    s = a.cross(n)
    frame = {
        i: ((p - wrist).dot(a), sign * (p - wrist).dot(s), (p - wrist).dot(n))
        for i, p in points.items()
    }
    tip = max(f[0] for f in frame.values())
    links = {i: [] for i in points}
    for edge in mesh.data.edges:
        x, y = edge.vertices
        if x in links and y in links:
            links[x].append(y)
            links[y].append(x)

    def pieces(level):
        keep = {i for i, f in frame.items() if f[0] > level}
        seen, found = set(), []
        for i in keep:
            if i in seen:
                continue
            stack, piece = [i], []
            seen.add(i)
            while stack:
                j = stack.pop()
                piece.append(j)
                for k in links[j]:
                    if k in keep and k not in seen:
                        seen.add(k)
                        stack.append(k)
            found.append(piece)
        return sorted(found, key=len, reverse=True)

    # Cut the hand higher and higher until the thumb comes off as its own piece on the
    # thumb side of the palm; the fingers bend from that height.
    thumb, cut = set(), 0.5
    while cut < 0.75 and not thumb:
        for piece in pieces(cut * tip)[1:]:
            side_mean = sum(frame[j][1] for j in piece) / len(piece)
            palm_mean = sum(frame[j][2] for j in piece) / len(piece)
            if side_mean > 0.02 and palm_mean > 0:
                thumb = set(piece)
                break
        else:
            cut += 0.025
    if not thumb:
        raise SystemExit(f'No thumb found on the {side} hand')
    knuckle = cut * tip
    middle = knuckle + 0.5 * (tip - knuckle)

    def is_thumb(i):
        return i in thumb

    def centre_at(level):
        near = [points[i] for i, f in frame.items() if abs(f[0] - level) < 0.006 and not is_thumb(i)]
        return sum(near, Vector()) / len(near)

    to_local = world.inverted()
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    bones = armature.data.edit_bones
    base = bones.new(side + 'Fingers')
    base.head = to_local @ centre_at(knuckle)
    base.tail = to_local @ (centre_at(knuckle) + a * 0.03)
    base.parent = bones[side + 'Hand']
    tips = bones.new(side + 'FingerTips')
    tips.head = to_local @ centre_at(middle)
    tips.tail = to_local @ (centre_at(middle) + a * 0.02)
    tips.parent = base
    bpy.ops.object.mode_set(mode='OBJECT')

    hand = mesh.vertex_groups[side + 'Hand']
    first = mesh.vertex_groups.new(name=side + 'Fingers')
    second = mesh.vertex_groups.new(name=side + 'FingerTips')
    for i, (t, _, _) in frame.items():
        u = 0 if is_thumb(i) else smooth(knuckle - 0.012, knuckle + 0.012, t)
        if u <= 0:
            continue
        v = smooth(middle - 0.012, middle + 0.012, t)
        weight = hand.weight(i)
        hand.add([i], weight * (1 - u), 'REPLACE')
        first.add([i], weight * u * (1 - v), 'REPLACE')
        second.add([i], weight * u * v, 'REPLACE')
    print(f'FINGERS {side} tip={tip:.3f} knuckle={knuckle:.3f} thumb={len(thumb)}')


add_fingers('Left', -1)
add_fingers('Right', 1)
bpy.context.view_layer.objects.active = mesh

triangles = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
if triangles > TRIANGLES:
    decimate = mesh.modifiers.new('decimate', 'DECIMATE')
    decimate.ratio = TRIANGLES / triangles
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
for group in list(mesh.vertex_groups):
    if group.name not in ARM_BONES:
        mesh.vertex_groups.remove(group)

# The game lights the arms itself, so only the base colour texture ships.
for material in bpy.data.materials:
    if not material.node_tree:
        continue
    for link in list(material.node_tree.links):
        if link.to_node.type == 'BSDF_PRINCIPLED' and link.to_socket.name != 'Base Color':
            material.node_tree.links.remove(link)

for image in bpy.data.images:
    if image.size[0] > TEXTURE:
        image.scale(TEXTURE, TEXTURE)

bpy.ops.export_scene.gltf(
    filepath=TARGET,
    export_format='GLB',
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_tangents=False,
    export_image_format='JPEG',
    export_jpeg_quality=82,
    export_yup=True,
)
final = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
print(f'BAKED {TARGET} triangles={final} from={triangles} texture={TEXTURE}')
