/**
 * Dear ImGui tab content for live progression debugging.
 * Provides level/XP display, set level, add XP, and weapon unlock info.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/ProgressionTab
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read/write access to progression state.
 * MatchScene builds this with closures referencing ProgressionManager.
 */
export interface ProgressionTabContext {
    getLevel: () => number;
    setLevel: (v: number) => void;
    getXP: () => number;
    getXPForLevel: () => number;
    getXPProgress: () => number;
    addXP: (amount: number) => void;
    unlockAll: () => void;
    getUnlockedWeapons: () => string[];
    getAllWeaponUnlocks: () => Array<{ name: string; level: number; unlocked: boolean }>;
}

// Persistent mutable refs for ImGui widgets.
const _level: [number] = [1];
const _xpAmount: [number] = [100];

/**
 * Draws the Progression tab content.
 * @param ctx - Live bindings to progression state.
 */
export function drawProgressionTab(ctx: ProgressionTabContext): void {
    // ─── Current State ──────────────────────────────────────
    const level = ctx.getLevel();
    const xp = ctx.getXP();
    const xpNeeded = ctx.getXPForLevel();
    const progress = ctx.getXPProgress();

    ImGui.Text(`Level: ${level}`);
    if (xpNeeded === Infinity) {
        ImGui.Text("XP: MAX LEVEL");
    } else {
        ImGui.Text(`XP: ${xp} / ${xpNeeded}`);
    }
    ImGui.ProgressBar(progress, { x: -1, y: 0 }, `${(progress * 100).toFixed(1)}%`);

    ImGui.Separator();

    // ─── Set Level ──────────────────────────────────────────
    _level[0] = level;
    if (ImGui.SliderInt("Set Level", _level, 1, 30)) {
        ctx.setLevel(_level[0]);
    }

    // ─── Add XP ─────────────────────────────────────────────
    ImGui.InputInt("XP Amount", _xpAmount, 50, 500);
    ImGui.SameLine();
    if (ImGui.Button("Add XP")) {
        ctx.addXP(_xpAmount[0]);
    }

    // ─── Unlock All ─────────────────────────────────────────
    if (ImGui.Button("Unlock All Weapons")) {
        ctx.unlockAll();
    }

    ImGui.Separator();

    // ─── Weapon Unlocks ─────────────────────────────────────
    if (ImGui.CollapsingHeader("Weapon Unlocks")) {
        const unlocks = ctx.getAllWeaponUnlocks();
        for (const w of unlocks) {
            const status = w.unlocked ? "[UNLOCKED]" : `[Lv.${w.level}]`;
            ImGui.BulletText(`${w.name} ${status}`);
        }
    }
}
