/**
 * Dear ImGui tab content for the Mirror Clone debug tool.
 * Provides spawn/despawn, collision toggle, rotation lock, aim controls,
 * and leaning parameter tuning.
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
    getLeanAmount: () => number;
    /** POV (camera) lean parameters */
    getPovMaxLeanAngle: () => number;
    setPovMaxLeanAngle: (v: number) => void;
    getPovLeanSpeed: () => number;
    setPovLeanSpeed: (v: number) => void;
    getPovLeanOffset: () => number;
    setPovLeanOffset: (v: number) => void;
    /** Model (3rd-person) lean parameters */
    getModelMaxLeanAngle: () => number;
    setModelMaxLeanAngle: (v: number) => void;
    getModelLeanSpeed: () => number;
    setModelLeanSpeed: (v: number) => void;
    getModelLeanOffset: () => number;
    setModelLeanOffset: (v: number) => void;
    getTorsoLeanRatio: () => number;
    setTorsoLeanRatio: (v: number) => void;
}

// Persistent mutable refs for ImGui widgets
const _offsetDistance: [number] = [200];
const _collisionEnabled: [boolean] = [false];
const _rotationLocked: [boolean] = [false];
const _lockedYawDeg: [number] = [0];
const _lockedPitchDeg: [number] = [0];
// POV lean refs
const _povMaxLeanAngleDeg: [number] = [10];
const _povLeanSpeed: [number] = [8];
const _povLeanOffset: [number] = [50];
// Model lean refs
const _modelMaxLeanAngleDeg: [number] = [30];
const _modelLeanSpeed: [number] = [8];
const _modelLeanOffset: [number] = [30];
const _torsoLeanRatio: [number] = [1.45];

/**
 * Draws the Mirror tab content (no Begin/End window — caller manages that).
 * @param ctx - Live bindings to MirrorClone state.
 */
export function drawMirrorTab(ctx: MirrorTabContext): void {
    const spawned = ctx.isSpawned();

    // ─── Spawn / Despawn ──────────────────────────────────
    if (!spawned) {
        if (ImGui.Button("Spawn Clone")) {
            ctx.spawn();
        }
    } else {
        if (ImGui.Button("Despawn Clone")) {
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

    // ─── Leaning ──────────────────────────────────────────
    if (ImGui.CollapsingHeader("Leaning", ImGui.TreeNodeFlags.DefaultOpen)) {
        // Current lean amount (read-only display)
        const leanAmount = ctx.getLeanAmount();
        ImGui.Text(`Current Lean: ${leanAmount.toFixed(2)} (Q = left, E = right)`);
        ImGui.ProgressBar((leanAmount + 1) / 2, { x: -1, y: 0 }, `${(leanAmount * 100).toFixed(0)}%`);

        ImGui.Spacing();
        ImGui.TextDisabled("POV (Camera)");

        _povMaxLeanAngleDeg[0] = ctx.getPovMaxLeanAngle() * (180 / Math.PI);
        if (ImGui.SliderFloat("POV Max Angle (deg)", _povMaxLeanAngleDeg, 1, 45)) {
            ctx.setPovMaxLeanAngle(_povMaxLeanAngleDeg[0] * (Math.PI / 180));
        }

        _povLeanSpeed[0] = ctx.getPovLeanSpeed();
        if (ImGui.SliderFloat("POV Lean Speed", _povLeanSpeed, 1, 20)) {
            ctx.setPovLeanSpeed(_povLeanSpeed[0]);
        }

        _povLeanOffset[0] = ctx.getPovLeanOffset();
        if (ImGui.SliderFloat("POV Lean Offset (cm)", _povLeanOffset, 0, 80)) {
            ctx.setPovLeanOffset(_povLeanOffset[0]);
        }

        ImGui.Spacing();
        ImGui.TextDisabled("Model (3rd Person)");

        _modelMaxLeanAngleDeg[0] = ctx.getModelMaxLeanAngle() * (180 / Math.PI);
        if (ImGui.SliderFloat("Model Max Angle (deg)", _modelMaxLeanAngleDeg, 1, 45)) {
            ctx.setModelMaxLeanAngle(_modelMaxLeanAngleDeg[0] * (Math.PI / 180));
        }

        _modelLeanSpeed[0] = ctx.getModelLeanSpeed();
        if (ImGui.SliderFloat("Model Lean Speed", _modelLeanSpeed, 1, 20)) {
            ctx.setModelLeanSpeed(_modelLeanSpeed[0]);
        }

        _modelLeanOffset[0] = ctx.getModelLeanOffset();
        if (ImGui.SliderFloat("Model Lean Offset (cm)", _modelLeanOffset, 0, 80)) {
            ctx.setModelLeanOffset(_modelLeanOffset[0]);
        }

        ImGui.Spacing();

        _torsoLeanRatio[0] = ctx.getTorsoLeanRatio();
        if (ImGui.SliderFloat("Torso Lean Ratio", _torsoLeanRatio, 0, 2)) {
            ctx.setTorsoLeanRatio(_torsoLeanRatio[0]);
        }
        ImGui.SameLine();
        ImGui.TextDisabled("(?)");
        if (ImGui.IsItemHovered()) {
            ImGui.SetTooltip("Multiplier on model lean angle applied to spine bones");
        }
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

            if (ImGui.Button("Reset to Player Facing")) {
                ctx.setLockedYaw(0);
                ctx.setLockedPitch(0);
            }
        } else {
            ImGui.TextDisabled("Clone mirrors player rotation");
        }
    }
}
