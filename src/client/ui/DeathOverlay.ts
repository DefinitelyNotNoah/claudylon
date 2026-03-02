/**
 * Death screen overlay. Dims the screen and shows who killed the player
 * and with what weapon. Automatically hidden on respawn.
 * @module client/ui/DeathOverlay
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { createFullscreenUI } from "./uiUtils";

/**
 * Full-screen death overlay with dimmed background and kill info.
 */
export class DeathOverlay {
    private _advancedTexture: AdvancedDynamicTexture;
    private _container: Rectangle;
    private _killedByText: TextBlock;
    private _weaponText: TextBlock;

    /**
     * Creates the death overlay (initially hidden).
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._advancedTexture = createFullscreenUI("death_overlay_ui", scene);

        // Full-screen dim
        this._container = new Rectangle("death_bg");
        this._container.width = 1;
        this._container.height = 1;
        this._container.background = "rgba(80, 0, 0, 0.45)";
        this._container.color = "transparent";
        this._container.thickness = 0;
        this._container.isVisible = false;
        this._advancedTexture.addControl(this._container);

        // Center panel
        const panel = new StackPanel("death_panel");
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._container.addControl(panel);

        // "YOU WERE KILLED" title
        const title = new TextBlock("death_title", "YOU WERE KILLED");
        title.color = "rgba(255, 60, 60, 1)";
        title.fontSize = 36;
        title.fontFamily = "monospace";
        title.fontWeight = "bold";
        title.height = "50px";
        title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.addControl(title);

        // Killer name
        this._killedByText = new TextBlock("death_killer", "");
        this._killedByText.color = "white";
        this._killedByText.fontSize = 22;
        this._killedByText.fontFamily = "monospace";
        this._killedByText.height = "35px";
        this._killedByText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.addControl(this._killedByText);

        // Weapon info
        this._weaponText = new TextBlock("death_weapon", "");
        this._weaponText.color = "rgba(255, 255, 255, 0.6)";
        this._weaponText.fontSize = 16;
        this._weaponText.fontFamily = "monospace";
        this._weaponText.height = "30px";
        this._weaponText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.addControl(this._weaponText);
    }

    /**
     * Shows the death overlay with kill details.
     * @param killerName - Display name of the player who got the kill.
     * @param weaponId - ID of the weapon used.
     */
    public show(killerName: string, weaponId: string): void {
        this._killedByText.text = `by ${killerName}`;
        this._weaponText.text = weaponId.toUpperCase();
        this._container.isVisible = true;
    }

    /**
     * Hides the death overlay.
     */
    public hide(): void {
        this._container.isVisible = false;
    }

    /**
     * Disposes the GUI texture and all controls.
     */
    public dispose(): void {
        this._advancedTexture.dispose();
    }
}
