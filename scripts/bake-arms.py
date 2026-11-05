"""Bake first-person athlete arms from a rigged base character.

Source models (CC0, no login): Grab3D "Man Base Mesh" and "Woman Base Mesh", rigged GLB.
  https://grab3d.com/dl/man-base-character-rigged/man-base-character-rigged.glb
  https://grab3d.com/dl/woman-base-character-rigged/woman-base-character-rigged.glb

Usage:
  blender -b --python scripts/bake-arms.py -- <in.glb> <out.glb> [triangles] [texture px]

Keeps only the vertices driven by the arm bones, decimates them to the triangle budget,
shrinks the textures and exports a skinned GLB in the rest (A) pose without animations.
"""

import sys

import bpy

ARGS = sys.argv[sys.argv.index('--') + 1 :]
SOURCE, TARGET = ARGS[0], ARGS[1]
TRIANGLES = int(ARGS[2]) if len(ARGS) > 2 else 6000
TEXTURE = int(ARGS[3]) if len(ARGS) > 3 else 1024
ARM_BONES = {f'{side}{part}' for side in ('Left', 'Right') for part in ('Arm', 'ForeArm', 'Hand')}

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
