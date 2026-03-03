/**
 * Dear ImGui tab content for live weapon debugging and stat tuning.
 * Provides per-weapon stat editing, ammo state, weapon switching, and sway controls.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/WeaponsTab
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read/write access to weapon state.
 * MatchScene builds this with closures referencing its private fields.
 */
export interface WeaponsTabContext {
    getActiveWeaponName: () => string;
    getActiveWeaponId: () => string;
    getActiveSlot: () => 1 | 2;
    getSlot1Id: () => string;
    getSlot2Id: () => string;
    getCurrentAmmo: () => number;
    getReserveAmmo: () => number;
    getIsReloading: () => boolean;
    /** Live stat mutation (writes directly to weapon.stats object). */
    getDamage: () => number;
    setDamage: (v: number) => void;
    getFireRate: () => number;
    setFireRate: (v: number) => void;
    getProjectileSpeed: () => number;
    setProjectileSpeed: (v: number) => void;
    getMagSize: () => number;
    setMagSize: (v: number) => void;
    getReloadTime: () => number;
    setReloadTime: (v: number) => void;
    /** Actions */
    refillAmmo: () => void;
    switchWeapon: (id: string) => void;
    /** Sway parameters (live on WeaponSway instance fields). */
    getIdleSwayX: () => number;
    setIdleSwayX: (v: number) => void;
    getIdleSwayY: () => number;
    setIdleSwayY: (v: number) => void;
    getWalkSwingX: () => number;
    setWalkSwingX: (v: number) => void;
    getWalkBobY: () => number;
    setWalkBobY: (v: number) => void;
    getRecoilKickZ: () => number;
    setRecoilKickZ: (v: number) => void;
    getRecoilKickY: () => number;
    setRecoilKickY: (v: number) => void;
    getRecoilRecovery: () => number;
    setRecoilRecovery: (v: number) => void;
    /** All weapon IDs for the switch combo. */
    allWeaponIds: string[];
    allWeaponNames: string[];
}

// Persistent mutable refs for ImGui widgets.
const _damage: [number] = [0];
const _fireRate: [number] = [0];
const _projSpeed: [number] = [0];
const _magSize: [number] = [0];
const _reloadTime: [number] = [0];
const _idleSwayX: [number] = [0];
const _idleSwayY: [number] = [0];
const _walkSwingX: [number] = [0];
const _walkBobY: [number] = [0];
const _recoilKickZ: [number] = [0];
const _recoilKickY: [number] = [0];
const _recoilRecovery: [number] = [0];
const _selectedWeapon: [number] = [0];

/**
 * Draws the Weapons tab content.
 * @param ctx - Live bindings to weapon state.
 */
export function drawWeaponsTab(ctx: WeaponsTabContext): void {
    // ─── Current Weapon Info ────────────────────────────────
    ImGui.Text(`Active: ${ctx.getActiveWeaponName()} (Slot ${ctx.getActiveSlot()})`);
    ImGui.Text(`Ammo: ${ctx.getCurrentAmmo()} / ${ctx.getReserveAmmo()}${ctx.getIsReloading() ? "  [RELOADING]" : ""}`);
    ImGui.Text(`Slot 1: ${ctx.getSlot1Id()}  |  Slot 2: ${ctx.getSlot2Id()}`);

    ImGui.Separator();

    // ─── Weapon Switch ──────────────────────────────────────
    if (ImGui.CollapsingHeader("Weapon Switch")) {
        ImGui.Combo("Weapon", _selectedWeapon, ctx.allWeaponNames.join("\0") + "\0");
        ImGui.SameLine();
        if (ImGui.Button("Equip")) {
            ctx.switchWeapon(ctx.allWeaponIds[_selectedWeapon[0]]);
        }
    }

    // ─── Refill Ammo ────────────────────────────────────────
    if (ImGui.Button("Refill Ammo")) {
        ctx.refillAmmo();
    }

    ImGui.Separator();

    // ─── Live Stats ─────────────────────────────────────────
    if (ImGui.CollapsingHeader("Weapon Stats (Live)")) {
        _damage[0] = ctx.getDamage();
        if (ImGui.SliderFloat("Damage", _damage, 1, 200, "%.0f")) {
            ctx.setDamage(_damage[0]);
        }

        _fireRate[0] = ctx.getFireRate();
        if (ImGui.SliderFloat("Fire Rate", _fireRate, 0.5, 30, "%.1f RPS")) {
            ctx.setFireRate(_fireRate[0]);
        }

        _projSpeed[0] = ctx.getProjectileSpeed();
        if (ImGui.SliderFloat("Projectile Speed", _projSpeed, 10000, 200000, "%.0f cm/s")) {
            ctx.setProjectileSpeed(_projSpeed[0]);
        }

        _magSize[0] = ctx.getMagSize();
        if (ImGui.SliderInt("Magazine Size", _magSize, 1, 100)) {
            ctx.setMagSize(_magSize[0]);
        }

        _reloadTime[0] = ctx.getReloadTime();
        if (ImGui.SliderFloat("Reload Time", _reloadTime, 0.1, 5, "%.1f s")) {
            ctx.setReloadTime(_reloadTime[0]);
        }
    }

    // ─── Sway Parameters ────────────────────────────────────
    if (ImGui.CollapsingHeader("Sway & Recoil")) {
        _idleSwayX[0] = ctx.getIdleSwayX();
        if (ImGui.SliderFloat("Idle Sway X", _idleSwayX, 0, 0.5, "%.3f")) {
            ctx.setIdleSwayX(_idleSwayX[0]);
        }

        _idleSwayY[0] = ctx.getIdleSwayY();
        if (ImGui.SliderFloat("Idle Sway Y", _idleSwayY, 0, 0.5, "%.3f")) {
            ctx.setIdleSwayY(_idleSwayY[0]);
        }

        _walkSwingX[0] = ctx.getWalkSwingX();
        if (ImGui.SliderFloat("Walk Swing X", _walkSwingX, 0, 2, "%.2f")) {
            ctx.setWalkSwingX(_walkSwingX[0]);
        }

        _walkBobY[0] = ctx.getWalkBobY();
        if (ImGui.SliderFloat("Walk Bob Y", _walkBobY, 0, 1, "%.2f")) {
            ctx.setWalkBobY(_walkBobY[0]);
        }

        ImGui.Separator();

        _recoilKickZ[0] = ctx.getRecoilKickZ();
        if (ImGui.SliderFloat("Recoil Kick Z", _recoilKickZ, -5, 0, "%.1f cm")) {
            ctx.setRecoilKickZ(_recoilKickZ[0]);
        }

        _recoilKickY[0] = ctx.getRecoilKickY();
        if (ImGui.SliderFloat("Recoil Kick Y", _recoilKickY, 0, 3, "%.1f cm")) {
            ctx.setRecoilKickY(_recoilKickY[0]);
        }

        _recoilRecovery[0] = ctx.getRecoilRecovery();
        if (ImGui.SliderFloat("Recoil Recovery", _recoilRecovery, 1, 30, "%.1f /s")) {
            ctx.setRecoilRecovery(_recoilRecovery[0]);
        }
    }
}
