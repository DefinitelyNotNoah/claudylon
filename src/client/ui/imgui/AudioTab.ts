/**
 * Dear ImGui tab content for live audio debugging.
 * Provides master volume, per-sound controls, and ambient settings.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/AudioTab
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read/write access to audio state.
 * MatchScene builds this with closures referencing AudioManager.
 */
export interface AudioTabContext {
    getMasterVolume: () => number;
    setMasterVolume: (v: number) => void;
    isFootstepPlaying: () => boolean;
    isWindPlaying: () => boolean;
}

// Persistent mutable refs for ImGui widgets.
const _masterVol: [number] = [1.0];

/**
 * Draws the Audio tab content.
 * @param ctx - Live bindings to audio state.
 */
export function drawAudioTab(ctx: AudioTabContext): void {
    // ─── Master Volume ──────────────────────────────────────
    _masterVol[0] = ctx.getMasterVolume();
    if (ImGui.SliderFloat("Master Volume", _masterVol, 0, 1, "%.2f")) {
        ctx.setMasterVolume(_masterVol[0]);
    }

    ImGui.Separator();

    // ─── Status ─────────────────────────────────────────────
    ImGui.Text("Sound Status:");
    ImGui.BulletText(`Footsteps: ${ctx.isFootstepPlaying() ? "Playing" : "Stopped"}`);
    ImGui.BulletText(`Wind: ${ctx.isWindPlaying() ? "Playing" : "Stopped"}`);
}
