"""
Batch-converts Mixamo FBX files to GLB using Blender's headless mode.

Usage:
    blender -b -P scripts/convert_fbx_to_glb.py

Converts:
  - soldier_1.fbx → character.glb (mesh + skeleton, no animation)
  - X Bot.fbx → xbot.glb (mesh + skeleton, no animation)
  - Y Bot.fbx → ybot.glb (mesh + skeleton, no animation)
  - Pro Rifle Pack/*.fbx → animations/*.glb (skeleton-only animation clips)

All output goes to public/assets/characters/
"""

import bpy
import os
import sys
import re

# ─── Configuration ──────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARACTERS_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "characters")
ANIMATIONS_DIR = os.path.join(CHARACTERS_DIR, "animations")
RIFLE_PACK_DIR = os.path.join(CHARACTERS_DIR, "Pro Rifle Pack")
CHARACTER_FBX = os.path.join(CHARACTERS_DIR, "soldier_1.fbx")

# Additional character model FBX files to convert (fbx_name → output_name)
EXTRA_CHARACTERS = [
    ("X Bot.fbx", "xbot.glb"),
    ("Y Bot.fbx", "ybot.glb"),
]

# Skip the character mesh file from the animation pack
SKIP_FILES = {"Ch15_nonPBR.fbx"}


def clean_scene():
    """Remove all objects, actions, and data from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def filename_to_snake_case(filename):
    """Convert 'run forward left.fbx' to 'run_forward_left'."""
    name = os.path.splitext(filename)[0]
    # Replace spaces and hyphens with underscores, lowercase
    name = re.sub(r'[\s\-]+', '_', name).lower()
    # Remove any non-alphanumeric characters except underscores
    name = re.sub(r'[^a-z0-9_]', '', name)
    return name


def convert_character():
    """Convert the character FBX (with skin) to GLB without animations."""
    if not os.path.exists(CHARACTER_FBX):
        print(f"[SKIP] Character FBX not found: {CHARACTER_FBX}")
        return

    print(f"\n{'='*60}")
    print(f"Converting character: soldier_1.fbx → character.glb")
    print(f"{'='*60}")

    clean_scene()

    # Import FBX
    bpy.ops.import_scene.fbx(filepath=CHARACTER_FBX)

    # Apply all transforms (bakes scale into vertices)
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Remove all animations (we want mesh + skeleton only)
    for action in bpy.data.actions:
        bpy.data.actions.remove(action)

    # Export as GLB
    output_path = os.path.join(CHARACTERS_DIR, "character.glb")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_animations=False,
        export_skins=True,
    )
    print(f"[OK] Exported: {output_path}")


def convert_extra_characters():
    """Convert additional character FBX files (X-Bot, Y-Bot, etc.) to GLB."""
    for fbx_name, output_name in EXTRA_CHARACTERS:
        fbx_path = os.path.join(CHARACTERS_DIR, fbx_name)
        if not os.path.exists(fbx_path):
            print(f"[SKIP] Not found: {fbx_path}")
            continue

        print(f"\n{'='*60}")
        print(f"Converting character: {fbx_name} → {output_name}")
        print(f"{'='*60}")

        clean_scene()

        # Import FBX
        bpy.ops.import_scene.fbx(filepath=fbx_path)

        # Apply all transforms (bakes scale into vertices)
        for obj in bpy.context.scene.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        # Remove all animations (we want mesh + skeleton only)
        for action in bpy.data.actions:
            bpy.data.actions.remove(action)

        # Export as GLB
        output_path = os.path.join(CHARACTERS_DIR, output_name)
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            export_animations=False,
            export_skins=True,
        )
        print(f"[OK] Exported: {output_path}")


def convert_animation(fbx_path, output_name):
    """Convert a single animation FBX to GLB (skeleton + animation only)."""
    print(f"  Converting: {os.path.basename(fbx_path)} → {output_name}.glb")

    clean_scene()

    # Import FBX
    bpy.ops.import_scene.fbx(filepath=fbx_path)

    # Apply all transforms
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Rename the action to match our naming convention
    for action in bpy.data.actions:
        action.name = output_name

    # Export as GLB with animation
    output_path = os.path.join(ANIMATIONS_DIR, f"{output_name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_nla_strips=False,
        export_current_frame=False,
    )
    print(f"  [OK] Exported: {output_path}")


def convert_all_animations():
    """Convert all animation FBX files from the Pro Rifle Pack."""
    if not os.path.exists(RIFLE_PACK_DIR):
        print(f"[SKIP] Rifle pack not found: {RIFLE_PACK_DIR}")
        return

    # Create output directory
    os.makedirs(ANIMATIONS_DIR, exist_ok=True)

    fbx_files = [f for f in os.listdir(RIFLE_PACK_DIR)
                 if f.lower().endswith('.fbx') and f not in SKIP_FILES]
    fbx_files.sort()

    print(f"\n{'='*60}")
    print(f"Converting {len(fbx_files)} animations from Pro Rifle Pack")
    print(f"{'='*60}")

    success = 0
    failed = 0

    for fbx_file in fbx_files:
        fbx_path = os.path.join(RIFLE_PACK_DIR, fbx_file)
        output_name = filename_to_snake_case(fbx_file)

        try:
            convert_animation(fbx_path, output_name)
            success += 1
        except Exception as e:
            print(f"  [FAIL] {fbx_file}: {e}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Done! {success} converted, {failed} failed.")
    print(f"Output: {ANIMATIONS_DIR}")
    print(f"{'='*60}")


if __name__ == "__main__":
    convert_character()
    convert_extra_characters()
    convert_all_animations()
    print("\nAll conversions complete!")
