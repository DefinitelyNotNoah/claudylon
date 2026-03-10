/**
 * Dear ImGui tab content for the Mirror Clone debug tool.
 * Provides spawn/despawn, collision toggle, rotation lock, and aim controls.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/MirrorTab
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read/write access to MirrorClone state.
 * MatchScene builds this with closures referencing its private fields.
 */
export interface MirrorTabContext {
    isSpawned: () => boolean;
    spawn: () => void;
    despawn: () => void;
    getOffsetDistance: () => number;
    setOffsetDistance: (v: number) => void;
    getCollisionEnabled: () => boolean;
    setCollisionEnabled: (v: boolean) => void;
    getRotationLocked: () => boolean;
    setRotationLocked: (v: boolean) => void;
    getLockedYaw: () => number;
    setLockedYaw: (v: number) => void;
    getLockedPitch: () => number;
    setLockedPitch: (v: number) => void;
}

// Persistent mutable refs for ImGui widgets
const _offsetDistance: [number] = [200];
const _collisionEnabled: [boolean] = [false];
const _rotationLocked: [boolean] = [false];
const _lockedYawDeg: [number] = [0];
const _lockedPitchDeg: [number] = [0];

/**
 * Draws the Mirror tab content (no Begin/End window — caller manages that).
 * @param ctx - Live bindings to MirrorClone state.
 */
export function drawMirrorTab(ctx: MirrorTabContext): void {
    const spawned = ctx.isSpawned();

    // ─── Spawn / Despawn ──────────────────────────────────
    if (!spawned) {
        if (ImGui.Button("Spawn Clone", )) {
            ctx.spawn();
        }
    } else {
        if (ImGui.Button("Despawn Clone", )) {
            ctx.despawn();
        }
    }

    ImGui.Separator();

    // ─── Offset Distance ──────────────────────────────────
    _offsetDistance[0] = ctx.getOffsetDistance();
    if (ImGui.SliderFloat("Offset Distance (cm)", _offsetDistance, 50, 1000)) {
        ctx.setOffsetDistance(_offsetDistance[0]);
    }

    ImGui.Separator();

    // ─── Collision Toggle ─────────────────────────────────
    _collisionEnabled[0] = ctx.getCollisionEnabled();
    if (ImGui.Checkbox("Collision (Pickable)", _collisionEnabled)) {
        ctx.setCollisionEnabled(_collisionEnabled[0]);
    }
    ImGui.SameLine();
    ImGui.TextDisabled("(?)");
    if (ImGui.IsItemHovered()) {
        ImGui.SetTooltip("When enabled, projectiles can hit the clone's hitbox");
    }

    ImGui.Separator();

    // ─── Rotation Lock ────────────────────────────────────
    if (ImGui.CollapsingHeader("Rotation", ImGui.TreeNodeFlags.DefaultOpen)) {
        _rotationLocked[0] = ctx.getRotationLocked();
        if (ImGui.Checkbox("Lock Rotation", _rotationLocked)) {
            ctx.setRotationLocked(_rotationLocked[0]);
        }

        if (_rotationLocked[0]) {
            // Convert radians to degrees for display
            _lockedYawDeg[0] = ctx.getLockedYaw() * (180 / Math.PI);
            if (ImGui.SliderFloat("Yaw (deg)", _lockedYawDeg, -180, 180)) {
                ctx.setLockedYaw(_lockedYawDeg[0] * (Math.PI / 180));
            }

            _lockedPitchDeg[0] = ctx.getLockedPitch() * (180 / Math.PI);
            if (ImGui.SliderFloat("Pitch (deg)", _lockedPitchDeg, -90, 90)) {
                ctx.setLockedPitch(_lockedPitchDeg[0] * (Math.PI / 180));
            }

            if (ImGui.Button("Reset to Player Facing", )) {
                // Will be set to current player yaw + PI (facing player) via context
                ctx.setLockedYaw(0);
                ctx.setLockedPitch(0);
            }
        } else {
            ImGui.TextDisabled("Clone mirrors player rotation");
        }
    }
}
