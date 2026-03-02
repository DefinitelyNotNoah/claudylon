/**
 * Shared UI utility functions.
 * @module client/ui/uiUtils
 */

import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";

/**
 * Creates a fullscreen AdvancedDynamicTexture.
 * Centralised so every UI layer is created consistently.
 * @param name - Texture name.
 * @param scene - The Babylon.js scene.
 * @returns The configured AdvancedDynamicTexture.
 */
export function createFullscreenUI(name: string, scene: Scene): AdvancedDynamicTexture {
    const adt = AdvancedDynamicTexture.CreateFullscreenUI(name, true, scene);
    adt.idealWidth = 1920;
    return adt;
}
