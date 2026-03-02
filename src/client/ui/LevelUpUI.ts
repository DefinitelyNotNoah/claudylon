/**
 * Level-up popup overlay with scale-in animation.
 * Shows the new level number and any unlocked weapons,
 * then fades out automatically.
 * @module client/ui/LevelUpUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { WEAPON_STATS } from "../../shared/constants/WeaponConstants";
import type { WeaponId } from "../../shared/types";

/** Duration of the scale-in phase (seconds). */
const SCALE_IN_DURATION = 0.3;

/** Duration of the hold phase (seconds). */
const HOLD_DURATION = 2.0;

/** Duration of the fade-out phase (seconds). */
const FADE_OUT_DURATION = 0.5;

/** Gold color used for title and border. */
const GOLD = "#FFD700";

/**
 * Centered level-up popup with scale and fade animation.
 */
export class LevelUpUI {
    private _scene: Scene;
    private _advancedTexture: AdvancedDynamicTexture;
    private _container: Rectangle;
    private _levelText: TextBlock;
    private _unlockText: TextBlock;
    private _elapsed: number = 0;
    private _isAnimating: boolean = false;
    private _observer: any = null;

    /**
     * Creates the level-up popup (initially hidden).
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
        this._advancedTexture = createFullscreenUI("level_up_ui", scene);

        // Outer container
        this._container = new Rectangle("level_up_container");
        this._container.width = "500px";
        this._container.height = "220px";
        this._container.background = "rgba(0,0,0,0.75)";
        this._container.color = GOLD;
        this._container.thickness = 2;
        this._container.cornerRadius = 8;
        this._container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._container.top = "100px";
        this._container.isVisible = false;
        this._advancedTexture.addControl(this._container);

        // Stack panel for text lines
        const panel = new StackPanel("level_up_panel");
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._container.addControl(panel);

        // "LEVEL UP" title
        const titleText = new TextBlock("level_up_title");
        titleText.text = "LEVEL UP";
        titleText.fontSize = 48;
        titleText.fontFamily = "Orbitron, sans-serif";
        titleText.fontWeight = "bold";
        titleText.color = GOLD;
        titleText.height = "70px";
        titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.addControl(titleText);

        // Level number
        this._levelText = new TextBlock("level_up_level");
        this._levelText.text = "LEVEL 1";
        this._levelText.fontSize = 30;
        this._levelText.fontFamily = "monospace";
        this._levelText.color = "white";
        this._levelText.height = "45px";
        this._levelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.addControl(this._levelText);

        // Unlock line (hidden by default)
        this._unlockText = new TextBlock("level_up_unlock");
        this._unlockText.text = "";
        this._unlockText.fontSize = 16;
        this._unlockText.fontFamily = "monospace";
        this._unlockText.color = "rgba(255,220,100,0.8)";
        this._unlockText.height = "30px";
        this._unlockText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._unlockText.isVisible = false;
        panel.addControl(this._unlockText);

        // Register per-frame animation
        this._observer = scene.onBeforeRenderObservable.add(() => {
            this._tick();
        });
    }

    /**
     * Shows the level-up popup with animation.
     * @param newLevel - The level just reached.
     * @param unlockedWeapons - Weapon IDs unlocked at this level.
     */
    public show(newLevel: number, unlockedWeapons: WeaponId[]): void {
        this._levelText.text = `LEVEL ${newLevel}`;

        if (unlockedWeapons.length > 0) {
            const names = unlockedWeapons.map(id => WEAPON_STATS[id].name).join(", ");
            this._unlockText.text = `UNLOCKED: ${names}`;
            this._unlockText.isVisible = true;
        } else {
            this._unlockText.isVisible = false;
        }

        this._container.isVisible = true;
        this._container.alpha = 1;
        this._container.scaleX = 0.5;
        this._container.scaleY = 0.5;
        this._elapsed = 0;
        this._isAnimating = true;
    }

    /**
     * Per-frame animation tick.
     */
    private _tick(): void {
        if (!this._isAnimating) return;

        const engineDt = this._scene.getEngine().getDeltaTime();
        const dt = Math.min(engineDt / 1000, 0.05);
        this._elapsed += dt;

        const scaleEnd = SCALE_IN_DURATION;
        const holdEnd = scaleEnd + HOLD_DURATION;
        const fadeEnd = holdEnd + FADE_OUT_DURATION;

        if (this._elapsed <= scaleEnd) {
            // Scale in
            const t = this._elapsed / scaleEnd;
            const scale = 0.5 + 0.5 * t;
            this._container.scaleX = scale;
            this._container.scaleY = scale;
        } else if (this._elapsed <= holdEnd) {
            // Hold
            this._container.scaleX = 1.0;
            this._container.scaleY = 1.0;
        } else if (this._elapsed <= fadeEnd) {
            // Fade out
            const t = (this._elapsed - holdEnd) / FADE_OUT_DURATION;
            this._container.alpha = 1 - t;
        } else {
            // Done
            this._container.isVisible = false;
            this._isAnimating = false;
        }
    }

    /**
     * Disposes the level-up UI.
     */
    public dispose(): void {
        if (this._observer) {
            this._scene.onBeforeRenderObservable.remove(this._observer);
        }
        this._advancedTexture.dispose();
    }
}
