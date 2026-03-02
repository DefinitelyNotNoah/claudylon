/**
 * Displays a crosshair, ammo counter, and weapon name on the HUD.
 * @module client/ui/CrosshairHUD
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Image } from "@babylonjs/gui/2D/controls/image";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { createFullscreenUI } from "./uiUtils";

/** Default crosshair asset path (Kenney White crosshair #42). */
const CROSSHAIR_PATH = "assets/textures/crosshair/PNG/White/crosshair012.png";

/** Crosshair display size in pixels. */
const CROSSHAIR_SIZE = "24px";

/**
 * Renders the in-game HUD: crosshair, ammo counter, and weapon name.
 */
export class CrosshairHUD {
    private _advancedTexture: AdvancedDynamicTexture;
    private _crosshairImage: Image;
    private _ammoText: TextBlock;
    private _weaponNameText: TextBlock;
    private _healthText: TextBlock;
    private _healthLabel: TextBlock;

    /**
     * Creates the full HUD overlay.
     * @param scene - The Babylon.js scene to attach the GUI to.
     */
    constructor(scene: Scene) {
        this._advancedTexture = createFullscreenUI("hud_ui", scene);

        this._crosshairImage = new Image("crosshair", CROSSHAIR_PATH);
        this._crosshairImage.width = CROSSHAIR_SIZE;
        this._crosshairImage.height = CROSSHAIR_SIZE;
        this._crosshairImage.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._crosshairImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._advancedTexture.addControl(this._crosshairImage);

        this._ammoText = new TextBlock("ammo_text", "12 / 48");
        this._ammoText.color = "white";
        this._ammoText.fontSize = 28;
        this._ammoText.fontFamily = "monospace";
        this._ammoText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._ammoText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._ammoText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._ammoText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._ammoText.paddingRight = "30px";
        this._ammoText.paddingBottom = "30px";
        this._advancedTexture.addControl(this._ammoText);

        this._weaponNameText = new TextBlock("weapon_name_text", "USP-45");
        this._weaponNameText.color = "rgba(255,255,255,0.6)";
        this._weaponNameText.fontSize = 16;
        this._weaponNameText.fontFamily = "monospace";
        this._weaponNameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._weaponNameText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._weaponNameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._weaponNameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._weaponNameText.paddingRight = "30px";
        this._weaponNameText.paddingBottom = "60px";
        this._advancedTexture.addControl(this._weaponNameText);

        this._healthText = new TextBlock("health_text", "100");
        this._healthText.color = "white";
        this._healthText.fontSize = 28;
        this._healthText.fontFamily = "monospace";
        this._healthText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._healthText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._healthText.paddingLeft = "30px";
        this._healthText.paddingBottom = "30px";
        this._advancedTexture.addControl(this._healthText);

        this._healthLabel = new TextBlock("health_label", "HP");
        this._healthLabel.color = "rgba(255,255,255,0.6)";
        this._healthLabel.fontSize = 16;
        this._healthLabel.fontFamily = "monospace";
        this._healthLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._healthLabel.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._healthLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._healthLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._healthLabel.paddingLeft = "30px";
        this._healthLabel.paddingBottom = "60px";
        this._advancedTexture.addControl(this._healthLabel);
    }

    /**
     * Updates the ammo display.
     * @param current - Rounds in current magazine.
     * @param reserve - Total reserve rounds.
     */
    public updateAmmo(current: number, reserve: number): void {
        this._ammoText.text = `${current} / ${reserve}`;
    }

    /**
     * Updates the weapon name display.
     * @param name - The weapon's display name.
     */
    public updateWeaponName(name: string): void {
        this._weaponNameText.text = name;
    }

    /**
     * Updates the health display.
     * @param current - Current health points.
     */
    public updateHealth(current: number): void {
        this._healthText.text = `${current}`;
    }

    /**
     * Shows or hides the crosshair.
     * @param visible - Whether the crosshair should be visible.
     */
    public setVisible(visible: boolean): void {
        this._crosshairImage.isVisible = visible;
    }

    /**
     * Shows all HUD elements (crosshair, ammo, weapon name).
     */
    public show(): void {
        this._crosshairImage.isVisible = true;
        this._ammoText.isVisible = true;
        this._weaponNameText.isVisible = true;
        this._healthText.isVisible = true;
        this._healthLabel.isVisible = true;
    }

    /**
     * Hides all HUD elements (crosshair, ammo, weapon name, health).
     */
    public hide(): void {
        this._crosshairImage.isVisible = false;
        this._ammoText.isVisible = false;
        this._weaponNameText.isVisible = false;
        this._healthText.isVisible = false;
        this._healthLabel.isVisible = false;
    }

    /**
     * Disposes the GUI texture and all controls.
     */
    public dispose(): void {
        this._advancedTexture.dispose();
    }
}
