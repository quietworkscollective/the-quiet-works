"""Render the actual optimized GLBs; captures stay in the requested scratch directory.

blender -b --factory-startup --python scripts/blender/rooms/office/architecture/preview.py \
  -- --out <scratch-directory>
Use --open to inspect the speaking flap's runtime rotation.
"""
import argparse
from pathlib import Path
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build import BUILDERS, kit, preview  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--only', choices=BUILDERS)
parser.add_argument('--open', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
args.out.mkdir(parents=True,exist_ok=True)
heroes = Path(__file__).resolve().parents[5] / 'apps/web/src/chambers/certification-office/scene/heroes'
for name in BUILDERS:
    if args.only and args.only!=name:
        continue
    kit.reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(heroes / f'{name}.glb'))
    root = bpy.data.objects[name]
    if args.open and name=='employee-window':
        # Blender X is glTF X, so this rotation preserves the authored hinge line.
        flap = bpy.data.objects['speaking-flap']
        flap.rotation_mode = 'XYZ'
        flap.rotation_euler = (-1.1,0,0)
    bpy.context.view_layer.update()
    preview(root,args.out)
