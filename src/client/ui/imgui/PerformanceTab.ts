/**
 * Dear ImGui tab content for live performance monitoring.
 * Displays FPS, frame time, draw calls, mesh counts, and engine info.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/PerformanceTab
 */

import { ImGui } from "@mori2003/jsimgui";

/**
 * Context object providing live read access to engine performance metrics.
 * MatchScene builds this with closures referencing the Babylon.js engine and scene.
 */
export interface PerformanceTabContext {
    getFPS: () => number;
    getFrameTimeMs: () => number;
    getDrawCalls: () => number;
    getActiveMeshes: () => number;
    getActiveParticles: () => number;
    getTotalVertices: () => number;
    getTotalFaces: () => number;
    getResolution: () => string;
}

/** Rolling FPS stats. */
let _fpsMin = Infinity;
let _fpsMax = 0;
let _fpsSum = 0;
let _fpsCount = 0;

/**
 * Draws the Performance tab content.
 * @param ctx - Live bindings to engine performance metrics.
 */
export function drawPerformanceTab(ctx: PerformanceTabContext): void {
    const fps = ctx.getFPS();

    // Update rolling stats
    if (fps > 0) {
        if (fps < _fpsMin) _fpsMin = fps;
        if (fps > _fpsMax) _fpsMax = fps;
        _fpsSum += fps;
        _fpsCount++;
    }
    const fpsAvg = _fpsCount > 0 ? _fpsSum / _fpsCount : 0;

    // ─── FPS ────────────────────────────────────────────────
    ImGui.Text(`FPS: ${fps.toFixed(0)}`);
    ImGui.Text(`Avg: ${fpsAvg.toFixed(0)}  Min: ${_fpsMin === Infinity ? 0 : _fpsMin.toFixed(0)}  Max: ${_fpsMax.toFixed(0)}`);
    ImGui.Text(`Frame Time: ${ctx.getFrameTimeMs().toFixed(2)} ms`);

    if (ImGui.Button("Reset Stats")) {
        _fpsMin = Infinity;
        _fpsMax = 0;
        _fpsSum = 0;
        _fpsCount = 0;
    }

    ImGui.Separator();

    // ─── Scene Stats ────────────────────────────────────────
    ImGui.Text(`Draw Calls: ${ctx.getDrawCalls()}`);
    ImGui.Text(`Active Meshes: ${ctx.getActiveMeshes()}`);
    ImGui.Text(`Active Particles: ${ctx.getActiveParticles()}`);
    ImGui.Text(`Total Vertices: ${ctx.getTotalVertices().toLocaleString()}`);
    ImGui.Text(`Total Faces: ${ctx.getTotalFaces().toLocaleString()}`);

    ImGui.Separator();

    // ─── Resolution ─────────────────────────────────────────
    ImGui.Text(`Resolution: ${ctx.getResolution()}`);
}
