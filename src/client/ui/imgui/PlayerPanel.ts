/**
 * Dear ImGui tab content for live player debugging.
 * Provides sliders, checkboxes, and buttons for health, speed, god mode, etc.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/PlayerPanel
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read/write access to player state.
 * MatchScene builds this with closures referencing its private fields.
 */
export interface PlayerPanelContext {
    getHealth: () => number;
    setHealth: (v: number) => void;
    getPosition: () => { x: number; y: number; z: number };
    teleport: (x: number, y: number, z: number) => void;
    getSpeed: () => number;
    setSpeed: (v: number) => void;
    getJumpHeight: () => number;
    setJumpHeight: (v: number) => void;
    getGodMode: () => boolean;
    setGodMode: (v: boolean) => void;
    getNoclip: () => boolean;
    toggleNoclip: () => void;
    getInfiniteAmmo: () => boolean;
    setInfiniteAmmo: (v: boolean) => void;
    getFov: () => number;
    setFov: (v: number) => void;
    kill: () => void;
    respawn: () => void;
}

// Persistent single-element arrays used as mutable references for ImGui widgets.
// These are reused each frame — we read from context, write into the array,
// let ImGui mutate it, then write back if changed.
const _health: [number] = [100];
const _speed: [number] = [500];
const _jumpHeight: [number] = [250];
const _fov: [number] = [70];
const _godMode: [boolean] = [false];
const _noclip: [boolean] = [false];
const _infiniteAmmo: [boolean] = [false];
const _posX: [number] = [0];
const _posY: [number] = [0];
const _posZ: [number] = [0];

/**
 * Draws the Player tab content (no Begin/End window — caller manages that).
 * @param ctx - Live bindings to player state.
 */
export function drawPlayerTab(ctx: PlayerPanelContext): void {
    // ─── Health ────────────────────────────────────────────
    _health[0] = ctx.getHealth();
    if (ImGui.SliderInt("Health", _health, 0, 200)) {
        ctx.setHealth(_health[0]);
    }

    // ─── Toggles ──────────────────────────────────────────
    _godMode[0] = ctx.getGodMode();
    if (ImGui.Checkbox("God Mode", _godMode)) {
        ctx.setGodMode(_godMode[0]);
    }

    ImGui.SameLine();

    _noclip[0] = ctx.getNoclip();
    if (ImGui.Checkbox("Noclip", _noclip)) {
        ctx.toggleNoclip();
    }

    _infiniteAmmo[0] = ctx.getInfiniteAmmo();
    if (ImGui.Checkbox("Infinite Ammo", _infiniteAmmo)) {
        ctx.setInfiniteAmmo(_infiniteAmmo[0]);
    }

    ImGui.Separator();

    // ─── Movement ─────────────────────────────────────────
    _speed[0] = ctx.getSpeed();
    if (ImGui.SliderFloat("Speed", _speed, 100, 5000, "%.0f cm/s")) {
        ctx.setSpeed(_speed[0]);
    }

    _jumpHeight[0] = ctx.getJumpHeight();
    if (ImGui.SliderFloat("Jump Height", _jumpHeight, 50, 1000, "%.0f cm")) {
        ctx.setJumpHeight(_jumpHeight[0]);
    }

    _fov[0] = ctx.getFov();
    if (ImGui.SliderFloat("FOV", _fov, 40, 150, "%.0f°")) {
        ctx.setFov(_fov[0]);
    }

    ImGui.Separator();

    // ─── Position ─────────────────────────────────────────
    if (ImGui.CollapsingHeader("Position")) {
        const pos = ctx.getPosition();
        _posX[0] = pos.x;
        _posY[0] = pos.y;
        _posZ[0] = pos.z;

        ImGui.InputFloat("X", _posX, 10, 100, "%.0f");
        ImGui.InputFloat("Y", _posY, 10, 100, "%.0f");
        ImGui.InputFloat("Z", _posZ, 10, 100, "%.0f");

        if (ImGui.Button("Teleport")) {
            ctx.teleport(_posX[0], _posY[0], _posZ[0]);
        }
    }

    ImGui.Separator();

    // ─── Actions ──────────────────────────────────────────
    if (ImGui.Button("Kill")) {
        ctx.kill();
    }
    ImGui.SameLine();
    if (ImGui.Button("Respawn")) {
        ctx.respawn();
    }
}
