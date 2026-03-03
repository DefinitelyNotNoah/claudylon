/**
 * Dear ImGui tab content for live graphics pipeline tuning.
 * Auto-generates widgets from GRAPHICS_SETTINGS_DESCRIPTORS.
 * Drawn inside a TabItem — does NOT create its own window.
 * @module client/ui/imgui/GraphicsTab
 */

import { ImGui } from "@mori2003/jsimgui";
import {
    GRAPHICS_SETTINGS_DESCRIPTORS,
    GraphicsSettings,
} from "../GraphicsSettings";

// Pre-allocate persistent mutable refs for each setting.
const _numRefs: Map<string, [number]> = new Map();
const _boolRefs: Map<string, [boolean]> = new Map();
for (const desc of GRAPHICS_SETTINGS_DESCRIPTORS) {
    if (desc.type === "number") {
        _numRefs.set(desc.key, [desc.defaultValue as number]);
    } else {
        _boolRefs.set(desc.key, [desc.defaultValue as boolean]);
    }
}

/** Display labels for each settings category. */
const CATEGORY_LABELS: Record<string, string> = {
    rendering: "Rendering",
    antialiasing: "Anti-Aliasing",
    bloom: "Bloom",
    imageProcessing: "Image Processing",
    effects: "Effects",
};
const CATEGORY_ORDER = ["rendering", "antialiasing", "bloom", "imageProcessing", "effects"];

/**
 * Draws the Graphics tab content. No context needed — reads from GraphicsSettings singleton.
 */
export function drawGraphicsTab(): void {
    const gfx = GraphicsSettings.getInstance();

    for (const category of CATEGORY_ORDER) {
        const label = CATEGORY_LABELS[category] ?? category;
        if (ImGui.CollapsingHeader(label)) {
            const descs = GRAPHICS_SETTINGS_DESCRIPTORS.filter(d => d.category === category);
            for (const desc of descs) {
                if (desc.type === "boolean") {
                    const ref = _boolRefs.get(desc.key)!;
                    ref[0] = gfx.get(desc.key) as boolean;
                    if (ImGui.Checkbox(desc.label, ref)) {
                        gfx.set(desc.key, ref[0]);
                    }
                } else {
                    const ref = _numRefs.get(desc.key)!;
                    ref[0] = gfx.get(desc.key) as number;
                    const isInt = desc.step !== undefined && desc.step >= 1 && Number.isInteger(desc.step);
                    if (isInt) {
                        if (ImGui.SliderInt(desc.label, ref, desc.min!, desc.max!)) {
                            gfx.set(desc.key, ref[0]);
                        }
                    } else {
                        const fmt = (desc.step ?? 0.1) < 0.1 ? "%.2f" : "%.1f";
                        if (ImGui.SliderFloat(desc.label, ref, desc.min!, desc.max!, fmt)) {
                            gfx.set(desc.key, ref[0]);
                        }
                    }
                }
            }
        }
    }

    ImGui.Separator();
    if (ImGui.Button("Reset to Defaults")) {
        gfx.resetToDefaults();
    }
}
