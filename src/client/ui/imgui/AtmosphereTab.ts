/**
 * Dear ImGui tab content for live atmosphere tuning.
 * Exposes fog, directional light, hemispheric light, sky clear-color,
 * and shadow generator parameters so the designer can tweak them at runtime.
 *
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/AtmosphereTab
 */

import { ImGui } from "@mori2003/jsimgui";

// ─── Fog Mode Constants ──────────────────────────────────────────────────────
/** Babylon FOGMODE_NONE = 0 */
const FOGMODE_NONE = 0;
/** Babylon FOGMODE_EXP = 1 */
const FOGMODE_EXP = 1;
/** Babylon FOGMODE_EXP2 = 3 */
const FOGMODE_EXP2 = 3;
/** Babylon FOGMODE_LINEAR = 2 */
const FOGMODE_LINEAR = 2;

const FOG_MODE_LABELS = ["None", "EXP", "Linear", "EXP2"];
/** Maps combo index → Babylon fog mode constant. */
const FOG_MODE_VALUES = [FOGMODE_NONE, FOGMODE_EXP, FOGMODE_LINEAR, FOGMODE_EXP2];

/**
 * Context object providing live read/write access to scene atmosphere state.
 * MatchScene builds this with closures referencing the active Babylon scene,
 * lights, and shadow generator.
 */
export interface AtmosphereTabContext {
    // ── Fog ─────────────────────────────────────────────────────────────────
    /** Current Babylon fog mode (0=none, 1=exp, 2=linear, 3=exp2). */
    getFogMode: () => number;
    setFogMode: (mode: number) => void;
    getFogDensity: () => number;
    setFogDensity: (v: number) => void;
    /** Linear fog start distance. */
    getFogStart: () => number;
    setFogStart: (v: number) => void;
    /** Linear fog end distance. */
    getFogEnd: () => number;
    setFogEnd: (v: number) => void;
    /** Fog color as [r, g, b] 0-1. */
    getFogColor: () => [number, number, number];
    setFogColor: (r: number, g: number, b: number) => void;

    // ── Directional Light ───────────────────────────────────────────────────
    getDirLightIntensity: () => number;
    setDirLightIntensity: (v: number) => void;
    getDirLightColor: () => [number, number, number];
    setDirLightColor: (r: number, g: number, b: number) => void;
    getDirLightDirection: () => [number, number, number];
    setDirLightDirection: (x: number, y: number, z: number) => void;

    // ── Hemispheric / Ambient Light ─────────────────────────────────────────
    getHemiIntensity: () => number;
    setHemiIntensity: (v: number) => void;
    getHemiDiffuse: () => [number, number, number];
    setHemiDiffuse: (r: number, g: number, b: number) => void;
    getHemiGroundColor: () => [number, number, number];
    setHemiGroundColor: (r: number, g: number, b: number) => void;

    // ── Sky (Clear Color) ───────────────────────────────────────────────────
    getClearColor: () => [number, number, number, number];
    setClearColor: (r: number, g: number, b: number, a: number) => void;

    // ── Shadows ─────────────────────────────────────────────────────────────
    getShadowDarkness: () => number;
    setShadowDarkness: (v: number) => void;
    getShadowBlurKernel: () => number;
    setShadowBlurKernel: (v: number) => void;
}

// ─── Persistent ImGui widget refs ────────────────────────────────────────────
// Fog
const _fogModeIdx: [number] = [0];
const _fogDensity: [number] = [0.000008];
const _fogStart: [number] = [0];
const _fogEnd: [number] = [10000];
const _fogColor: [number, number, number] = [0.70, 0.74, 0.80];

// Directional light
const _dirIntensity: [number] = [1.0];
const _dirColor: [number, number, number] = [1.0, 0.95, 0.80];
const _dirDir: [number] = [0]; // x
const _dirDirY: [number] = [0]; // y
const _dirDirZ: [number] = [0]; // z

// Hemispheric light
const _hemiIntensity: [number] = [0.55];
const _hemiDiffuse: [number, number, number] = [1.0, 0.97, 0.88];
const _hemiGround: [number, number, number] = [0.35, 0.30, 0.25];

// Clear color
const _clearColor: [number, number, number, number] = [0.62, 0.68, 0.75, 1.0];

// Shadows
const _shadowDarkness: [number] = [0.35];
const _shadowBlurKernel: [number] = [24];

/**
 * Converts a Babylon fog mode integer to the combo index used by this tab.
 */
function fogModeToIndex(mode: number): number {
    const idx = FOG_MODE_VALUES.indexOf(mode);
    return idx >= 0 ? idx : 0;
}

/**
 * Draws the Atmosphere tab content (no Begin/End window — caller manages that).
 * @param ctx - Live bindings to scene atmosphere state.
 */
export function drawAtmosphereTab(ctx: AtmosphereTabContext): void {

    // ─── Fog ─────────────────────────────────────────────────────────────────
    if (ImGui.CollapsingHeader("Fog", ImGui.TreeNodeFlags.DefaultOpen)) {
        // Fog mode combo — jsimgui Combo expects a null-separated string
        _fogModeIdx[0] = fogModeToIndex(ctx.getFogMode());
        if (ImGui.Combo("Mode", _fogModeIdx, FOG_MODE_LABELS.join("\0") + "\0")) {
            ctx.setFogMode(FOG_MODE_VALUES[_fogModeIdx[0]]);
        }

        const mode = FOG_MODE_VALUES[_fogModeIdx[0]];

        if (mode === FOGMODE_EXP || mode === FOGMODE_EXP2) {
            _fogDensity[0] = ctx.getFogDensity();
            if (ImGui.DragFloat("Density", _fogDensity, 0.0000001, 0, 0.001, "%.7f")) {
                ctx.setFogDensity(_fogDensity[0]);
            }
        }

        if (mode === FOGMODE_LINEAR) {
            _fogStart[0] = ctx.getFogStart();
            if (ImGui.DragFloat("Start (cm)", _fogStart, 10, 0, 100000)) {
                ctx.setFogStart(_fogStart[0]);
            }

            _fogEnd[0] = ctx.getFogEnd();
            if (ImGui.DragFloat("End (cm)", _fogEnd, 10, 0, 100000)) {
                ctx.setFogEnd(_fogEnd[0]);
            }
        }

        if (mode !== FOGMODE_NONE) {
            const fc = ctx.getFogColor();
            _fogColor[0] = fc[0];
            _fogColor[1] = fc[1];
            _fogColor[2] = fc[2];
            if (ImGui.ColorEdit3("Fog Color", _fogColor)) {
                ctx.setFogColor(_fogColor[0], _fogColor[1], _fogColor[2]);
            }
        }
    }

    // ─── Directional Light ────────────────────────────────────────────────────
    if (ImGui.CollapsingHeader("Directional Light", ImGui.TreeNodeFlags.DefaultOpen)) {
        _dirIntensity[0] = ctx.getDirLightIntensity();
        if (ImGui.SliderFloat("Intensity##dir", _dirIntensity, 0, 5)) {
            ctx.setDirLightIntensity(_dirIntensity[0]);
        }

        const dc = ctx.getDirLightColor();
        _dirColor[0] = dc[0];
        _dirColor[1] = dc[1];
        _dirColor[2] = dc[2];
        if (ImGui.ColorEdit3("Color##dir", _dirColor)) {
            ctx.setDirLightColor(_dirColor[0], _dirColor[1], _dirColor[2]);
        }

        const dd = ctx.getDirLightDirection();
        _dirDir[0] = dd[0];
        _dirDirY[0] = dd[1];
        _dirDirZ[0] = dd[2];
        let dirChanged = false;
        if (ImGui.DragFloat("Dir X", _dirDir, 0.01, -1, 1)) dirChanged = true;
        if (ImGui.DragFloat("Dir Y", _dirDirY, 0.01, -1, 1)) dirChanged = true;
        if (ImGui.DragFloat("Dir Z", _dirDirZ, 0.01, -1, 1)) dirChanged = true;
        if (dirChanged) {
            ctx.setDirLightDirection(_dirDir[0], _dirDirY[0], _dirDirZ[0]);
        }
    }

    // ─── Hemispheric / Ambient Light ──────────────────────────────────────────
    if (ImGui.CollapsingHeader("Hemispheric Light", ImGui.TreeNodeFlags.DefaultOpen)) {
        _hemiIntensity[0] = ctx.getHemiIntensity();
        if (ImGui.SliderFloat("Intensity##hemi", _hemiIntensity, 0, 5)) {
            ctx.setHemiIntensity(_hemiIntensity[0]);
        }

        const hd = ctx.getHemiDiffuse();
        _hemiDiffuse[0] = hd[0];
        _hemiDiffuse[1] = hd[1];
        _hemiDiffuse[2] = hd[2];
        if (ImGui.ColorEdit3("Sky Color##hemi", _hemiDiffuse)) {
            ctx.setHemiDiffuse(_hemiDiffuse[0], _hemiDiffuse[1], _hemiDiffuse[2]);
        }

        const hg = ctx.getHemiGroundColor();
        _hemiGround[0] = hg[0];
        _hemiGround[1] = hg[1];
        _hemiGround[2] = hg[2];
        if (ImGui.ColorEdit3("Ground Color##hemi", _hemiGround)) {
            ctx.setHemiGroundColor(_hemiGround[0], _hemiGround[1], _hemiGround[2]);
        }
    }

    // ─── Sky / Clear Color ────────────────────────────────────────────────────
    if (ImGui.CollapsingHeader("Sky (Clear Color)", ImGui.TreeNodeFlags.DefaultOpen)) {
        const cc = ctx.getClearColor();
        _clearColor[0] = cc[0];
        _clearColor[1] = cc[1];
        _clearColor[2] = cc[2];
        _clearColor[3] = cc[3];
        if (ImGui.ColorEdit4("Clear Color", _clearColor)) {
            ctx.setClearColor(_clearColor[0], _clearColor[1], _clearColor[2], _clearColor[3]);
        }
    }

    // ─── Shadows ─────────────────────────────────────────────────────────────
    if (ImGui.CollapsingHeader("Shadows", ImGui.TreeNodeFlags.DefaultOpen)) {
        _shadowDarkness[0] = ctx.getShadowDarkness();
        if (ImGui.SliderFloat("Darkness", _shadowDarkness, 0, 1)) {
            ctx.setShadowDarkness(_shadowDarkness[0]);
        }
        ImGui.SameLine();
        ImGui.TextDisabled("(?)");
        if (ImGui.IsItemHovered()) {
            ImGui.SetTooltip("0 = fully opaque black shadows, 1 = no shadows visible");
        }

        _shadowBlurKernel[0] = ctx.getShadowBlurKernel();
        if (ImGui.SliderFloat("Blur Kernel", _shadowBlurKernel, 1, 128)) {
            ctx.setShadowBlurKernel(Math.round(_shadowBlurKernel[0]));
        }
    }
}
