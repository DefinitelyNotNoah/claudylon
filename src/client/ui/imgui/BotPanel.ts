/**
 * Dear ImGui tab content for live bot AI debugging and tuning.
 * Provides bot info display, per-bot controls, AI difficulty sliders,
 * and bulk actions. Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/BotPanel
 */

import { ImGui } from "@mori2003/jsimgui";

/** Per-bot info for display and per-bot actions. */
export interface BotInfo {
    sessionId: string;
    name: string;
    health: number;
    state: string;
    weapon: string;
    weaponId: string;
    x: number;
    y: number;
    z: number;
    isDead: boolean;
    isFrozen: boolean;
    kills: number;
    deaths: number;
}

/**
 * Context object providing live read/write access to bot state.
 * MatchScene builds this with closures referencing its private fields.
 */
export interface BotPanelContext {
    getBotCount: () => number;
    getBotInfos: () => BotInfo[];
    setBotHealth: (v: number) => void;
    killAllBots: () => void;
    respawnBots: () => void;
    isFrozen: () => boolean;
    toggleFreeze: () => void;
    isRagdolled: () => boolean;
    toggleRagdoll: () => void;
    addBot: () => void;
    removeBot: (sessionId: string) => void;
    removeLastBot: () => void;
    /** Live difficulty tuning — mutates the shared BotDifficulty object in memory. */
    getAimAccuracy: () => number;
    setAimAccuracy: (v: number) => void;
    getReactionTime: () => number;
    setReactionTime: (v: number) => void;
    getFieldOfView: () => number;
    setFieldOfView: (v: number) => void;
    getEngageRange: () => number;
    setEngageRange: (v: number) => void;
    getFireInterval: () => number;
    setFireInterval: (v: number) => void;
    /** Per-bot actions */
    setBotIndividualHealth: (sessionId: string, v: number) => void;
    killBot: (sessionId: string) => void;
    respawnBot: (sessionId: string) => void;
    freezeBot: (sessionId: string, manualFrozen: boolean) => void;
    teleportBot: (sessionId: string, x: number, y: number, z: number) => void;
    setBotWeapon: (sessionId: string, weaponId: string) => void;
    /** All available weapon IDs and names for the weapon combo. */
    allWeaponIds: string[];
    allWeaponNames: string[];
}

// Persistent mutable refs for ImGui widgets (global controls).
const _botHealth: [number] = [100];
const _frozen: [boolean] = [false];
const _ragdolled: [boolean] = [false];
const _aimAccuracy: [number] = [0.6];
const _reactionTime: [number] = [400];
const _fov: [number] = [1.26];
const _engageRange: [number] = [3000];
const _fireInterval: [number] = [350];

// Per-bot mutable refs (keyed by sessionId, lazily created).
const _perBotHealth: Map<string, [number]> = new Map();
const _perBotFrozen: Map<string, [boolean]> = new Map();
const _perBotWeapon: Map<string, [number]> = new Map();
const _perBotTeleportX: Map<string, [number]> = new Map();
const _perBotTeleportY: Map<string, [number]> = new Map();
const _perBotTeleportZ: Map<string, [number]> = new Map();

/** Gets or creates a persistent ref for a bot+type combination. */
function getRef<T>(map: Map<string, [T]>, key: string, defaultVal: T): [T] {
    let ref = map.get(key);
    if (!ref) {
        ref = [defaultVal];
        map.set(key, ref);
    }
    return ref;
}

/**
 * Draws the Bots tab content (no Begin/End window — caller manages that).
 * @param ctx - Live bindings to bot state.
 */
export function drawBotTab(ctx: BotPanelContext): void {
    const count = ctx.getBotCount();
    ImGui.Text(`Bot Count: ${count}`);

    // ─── Actions ──────────────────────────────────────────
    if (ImGui.Button("Add Bot")) {
        ctx.addBot();
    }
    ImGui.SameLine();
    if (ImGui.Button("Remove Bot")) {
        ctx.removeLastBot();
    }
    ImGui.SameLine();
    if (ImGui.Button("Kill All")) {
        ctx.killAllBots();
    }
    ImGui.SameLine();
    if (ImGui.Button("Respawn All")) {
        ctx.respawnBots();
    }

    // ─── Health (all) ─────────────────────────────────────
    if (ImGui.SliderInt("Health (All)", _botHealth, 1, 200)) {
        ctx.setBotHealth(_botHealth[0]);
    }

    // ─── Toggles ──────────────────────────────────────────
    _frozen[0] = ctx.isFrozen();
    if (ImGui.Checkbox("Freeze All", _frozen)) {
        ctx.toggleFreeze();
    }

    ImGui.SameLine();

    _ragdolled[0] = ctx.isRagdolled();
    if (ImGui.Checkbox("Ragdoll All", _ragdolled)) {
        ctx.toggleRagdoll();
    }

    ImGui.Separator();

    // ─── AI Tuning ────────────────────────────────────────
    if (ImGui.CollapsingHeader("AI Difficulty (Live)")) {
        _aimAccuracy[0] = ctx.getAimAccuracy();
        if (ImGui.SliderFloat("Aim Accuracy", _aimAccuracy, 0, 1, "%.2f")) {
            ctx.setAimAccuracy(_aimAccuracy[0]);
        }

        _reactionTime[0] = ctx.getReactionTime();
        if (ImGui.SliderFloat("Reaction Time", _reactionTime, 50, 2000, "%.0f ms")) {
            ctx.setReactionTime(_reactionTime[0]);
        }

        _fov[0] = ctx.getFieldOfView();
        if (ImGui.SliderFloat("Field of View", _fov, 0.3, 3.14, "%.2f rad")) {
            ctx.setFieldOfView(_fov[0]);
        }
        ImGui.SameLine();
        ImGui.TextDisabled(`(${(_fov[0] * 180 / Math.PI).toFixed(0)}°)`);

        _engageRange[0] = ctx.getEngageRange();
        if (ImGui.SliderFloat("Engage Range", _engageRange, 500, 10000, "%.0f cm")) {
            ctx.setEngageRange(_engageRange[0]);
        }

        _fireInterval[0] = ctx.getFireInterval();
        if (ImGui.SliderFloat("Fire Interval", _fireInterval, 50, 2000, "%.0f ms")) {
            ctx.setFireInterval(_fireInterval[0]);
        }
    }

    ImGui.Separator();

    // ─── Bot Details (per-bot controls) ──────────────────
    if (ImGui.CollapsingHeader("Bot Details")) {
        const infos = ctx.getBotInfos();
        const weaponComboStr = ctx.allWeaponNames.join("\0") + "\0";

        for (const info of infos) {
            const sid = info.sessionId;

            // Color-coded header: red if dead, green if alive
            const label = info.isDead
                ? `${info.name} [DEAD]  K:${info.kills} D:${info.deaths}`
                : `${info.name} - HP:${info.health} ${info.state}  K:${info.kills} D:${info.deaths}`;

            if (ImGui.TreeNode(`${label}##${sid}`)) {
                // ─── Info ──────────────────────────────────
                ImGui.Text(`Weapon: ${info.weapon} (${info.weaponId})`);
                ImGui.Text(`Position: (${info.x.toFixed(0)}, ${info.y.toFixed(0)}, ${info.z.toFixed(0)})`);

                ImGui.Separator();

                // ─── Health ────────────────────────────────
                const hRef = getRef(_perBotHealth, sid, info.health);
                if (ImGui.SliderInt(`Health##${sid}`, hRef, 0, 200)) {
                    ctx.setBotIndividualHealth(sid, hRef[0]);
                }

                // ─── Freeze toggle ─────────────────────────
                const fRef = getRef(_perBotFrozen, sid, info.isFrozen);
                fRef[0] = info.isFrozen;
                if (ImGui.Checkbox(`Frozen##${sid}`, fRef)) {
                    ctx.freezeBot(sid, fRef[0]);
                }

                // ─── Weapon switch ─────────────────────────
                const wRef = getRef(_perBotWeapon, sid, 0);
                // Sync combo index to current weapon
                const curIdx = ctx.allWeaponIds.indexOf(info.weaponId);
                if (curIdx >= 0) wRef[0] = curIdx;
                if (ImGui.Combo(`Weapon##${sid}`, wRef, weaponComboStr)) {
                    ctx.setBotWeapon(sid, ctx.allWeaponIds[wRef[0]]);
                }

                // ─── Teleport ──────────────────────────────
                const txRef = getRef(_perBotTeleportX, sid, info.x);
                const tyRef = getRef(_perBotTeleportY, sid, info.y);
                const tzRef = getRef(_perBotTeleportZ, sid, info.z);
                ImGui.InputFloat(`X##tp_${sid}`, txRef, 50, 500, "%.0f");
                ImGui.InputFloat(`Y##tp_${sid}`, tyRef, 50, 500, "%.0f");
                ImGui.InputFloat(`Z##tp_${sid}`, tzRef, 50, 500, "%.0f");
                if (ImGui.Button(`Teleport##${sid}`)) {
                    ctx.teleportBot(sid, txRef[0], tyRef[0], tzRef[0]);
                }

                ImGui.Separator();

                // ─── Action buttons ────────────────────────
                if (!info.isDead) {
                    if (ImGui.Button(`Kill##${sid}`)) {
                        ctx.killBot(sid);
                    }
                    ImGui.SameLine();
                }
                if (info.isDead) {
                    if (ImGui.Button(`Respawn##${sid}`)) {
                        ctx.respawnBot(sid);
                    }
                    ImGui.SameLine();
                }
                if (ImGui.Button(`Remove##${sid}`)) {
                    ctx.removeBot(sid);
                    ImGui.TreePop();
                    break; // Array changed — stop iterating this frame
                }

                ImGui.TreePop();
            }
        }
    }
}
