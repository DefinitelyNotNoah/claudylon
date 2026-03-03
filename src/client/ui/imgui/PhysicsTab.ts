/**
 * Dear ImGui tab content for live physics debugging and tuning.
 * Provides gravity, player physics, noclip, and projectile controls.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/PhysicsTab
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read/write access to physics state.
 * MatchScene builds this with closures referencing PlayerController and WeaponManager.
 */
export interface PhysicsTabContext {
    getSpeed: () => number;
    setSpeed: (v: number) => void;
    getJumpHeight: () => number;
    setJumpHeight: (v: number) => void;
    getCapsuleHeight: () => number;
    getCapsuleRadius: () => number;
    isNoclip: () => boolean;
    toggleNoclip: () => void;
    getProjectileLifetime: () => number;
    setProjectileLifetime: (v: number) => void;
    getActiveProjectileCount: () => number;
    getVerticalVelocity: () => number;
    getPlayerState: () => string;
}

// Persistent mutable refs for ImGui widgets.
const _speed: [number] = [500];
const _jumpHeight: [number] = [250];
const _projLifetime: [number] = [3.0];
const _noclip: [boolean] = [false];

/**
 * Draws the Physics tab content.
 * @param ctx - Live bindings to physics state.
 */
export function drawPhysicsTab(ctx: PhysicsTabContext): void {
    // ─── Player Physics ─────────────────────────────────────
    ImGui.Text(`State: ${ctx.getPlayerState()}`);
    ImGui.Text(`Vertical Velocity: ${ctx.getVerticalVelocity().toFixed(1)} cm/s`);

    _speed[0] = ctx.getSpeed();
    if (ImGui.SliderFloat("Move Speed", _speed, 100, 5000, "%.0f cm/s")) {
        ctx.setSpeed(_speed[0]);
    }

    _jumpHeight[0] = ctx.getJumpHeight();
    if (ImGui.SliderFloat("Jump Height", _jumpHeight, 50, 1000, "%.0f cm")) {
        ctx.setJumpHeight(_jumpHeight[0]);
    }

    ImGui.Separator();

    // ─── Capsule Info (read-only) ───────────────────────────
    ImGui.Text(`Capsule Height: ${ctx.getCapsuleHeight()} cm`);
    ImGui.Text(`Capsule Radius: ${ctx.getCapsuleRadius()} cm`);

    ImGui.Separator();

    // ─── Noclip ─────────────────────────────────────────────
    _noclip[0] = ctx.isNoclip();
    if (ImGui.Checkbox("Noclip", _noclip)) {
        ctx.toggleNoclip();
    }

    ImGui.Separator();

    // ─── Projectiles ────────────────────────────────────────
    ImGui.Text(`Active Projectiles: ${ctx.getActiveProjectileCount()}`);

    _projLifetime[0] = ctx.getProjectileLifetime();
    if (ImGui.SliderFloat("Projectile Lifetime", _projLifetime, 0.5, 10, "%.1f s")) {
        ctx.setProjectileLifetime(_projLifetime[0]);
    }
}
