/**
 * XP progress bar displayed at the bottom of the screen.
 * Shows current level, XP fill bar, and next level.
 * Fill animates smoothly via lerp on XP gain.
 * @module client/ui/XPBarUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { ProgressionManager } from "../progression/ProgressionManager";

/** Bar height in pixels. */
const BAR_HEIGHT = 18;

/** Fill bar color. */
const FILL_COLOR = "#4488FF";

/** Background bar color. */
const BG_COLOR = "rgba(0,0,0,0.5)";

/** Lerp speed for fill animation (units per second). */
const LERP_SPEED = 3.0;

/** Maximum level. */
const MAX_LEVEL = 30;

/**
 * Thin XP progress bar anchored to the bottom of the screen.
 */
export class XPBarUI {
    private _scene: Scene;
    private _advancedTexture: AdvancedDynamicTexture;
    private _fillRect: Rectangle;
    private _levelText: TextBlock;
    private _nextLevelText: TextBlock;
    private _xpText: TextBlock;
    private _targetFill: number = 0;
    private _currentFill: number = 0;
    private _observer: any = null;

    /**
     * Creates the XP bar overlay.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
        this._advancedTexture = createFullscreenUI("xp_bar_ui", scene);

        // Background bar
        const bgRect = new Rectangle("xp_bar_bg");
        bgRect.width = 1;
        bgRect.height = `${BAR_HEIGHT}px`;
        bgRect.background = BG_COLOR;
        bgRect.color = "transparent";
        bgRect.thickness = 0;
        bgRect.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        bgRect.top = "0px";
        this._advancedTexture.addControl(bgRect);

        // Fill bar
        this._fillRect = new Rectangle("xp_bar_fill");
        this._fillRect.width = "0%";
        this._fillRect.height = `${BAR_HEIGHT}px`;
        this._fillRect.background = FILL_COLOR;
        this._fillRect.color = "transparent";
        this._fillRect.thickness = 0;
        this._fillRect.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._fillRect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._fillRect.top = "0px";
        this._advancedTexture.addControl(this._fillRect);

        // Level text (left side)
        this._levelText = new TextBlock("xp_level_text");
        this._levelText.text = "LVL 1";
        this._levelText.fontSize = 13;
        this._levelText.fontFamily = "monospace";
        this._levelText.color = "rgba(255,255,255,0.7)";
        this._levelText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._levelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._levelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._levelText.paddingLeft = "8px";
        this._levelText.paddingBottom = "1px";
        this._levelText.height = `${BAR_HEIGHT}px`;
        this._advancedTexture.addControl(this._levelText);

        // Next level text (right side)
        this._nextLevelText = new TextBlock("xp_next_level_text");
        this._nextLevelText.text = "LVL 2";
        this._nextLevelText.fontSize = 13;
        this._nextLevelText.fontFamily = "monospace";
        this._nextLevelText.color = "rgba(255,255,255,0.7)";
        this._nextLevelText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._nextLevelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._nextLevelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._nextLevelText.paddingRight = "8px";
        this._nextLevelText.paddingBottom = "1px";
        this._nextLevelText.height = `${BAR_HEIGHT}px`;
        this._advancedTexture.addControl(this._nextLevelText);

        // XP fraction text (center)
        this._xpText = new TextBlock("xp_fraction_text");
        this._xpText.text = "0 / 100 XP";
        this._xpText.fontSize = 12;
        this._xpText.fontFamily = "monospace";
        this._xpText.color = "rgba(255,255,255,0.5)";
        this._xpText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._xpText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._xpText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._xpText.paddingBottom = "1px";
        this._xpText.height = `${BAR_HEIGHT}px`;
        this._advancedTexture.addControl(this._xpText);

        // Register per-frame animation
        this._observer = scene.onBeforeRenderObservable.add(() => {
            this._animateFill();
        });

        // Set initial state
        this._syncFromManager();
    }

    /**
     * Updates the bar after XP is gained. Reads state from ProgressionManager.
     * @param leveledUp - Whether a level-up just occurred.
     */
    public onXPGained(leveledUp: boolean): void {
        const manager = ProgressionManager.getInstance();
        const level = manager.currentLevel;

        this._levelText.text = `LVL ${level}`;

        if (level >= MAX_LEVEL) {
            this._nextLevelText.text = "MAX";
            this._xpText.text = "MAX LEVEL";
            this._targetFill = 1;
        } else {
            this._nextLevelText.text = `LVL ${level + 1}`;
            this._xpText.text = `${manager.currentXP} / ${manager.xpForCurrentLevel} XP`;
            this._targetFill = manager.xpProgressInLevel;
        }

        // On level-up, flash fill to 100% then reset
        if (leveledUp) {
            this._currentFill = 0;
        }
    }

    /**
     * Sets initial state from ProgressionManager without animation.
     */
    private _syncFromManager(): void {
        const manager = ProgressionManager.getInstance();
        const level = manager.currentLevel;

        this._levelText.text = `LVL ${level}`;

        if (level >= MAX_LEVEL) {
            this._nextLevelText.text = "MAX";
            this._xpText.text = "MAX LEVEL";
            this._targetFill = 1;
            this._currentFill = 1;
        } else {
            this._nextLevelText.text = `LVL ${level + 1}`;
            this._xpText.text = `${manager.currentXP} / ${manager.xpForCurrentLevel} XP`;
            this._targetFill = manager.xpProgressInLevel;
            this._currentFill = this._targetFill;
        }

        this._fillRect.width = `${(this._currentFill * 100).toFixed(2)}%`;
    }

    /**
     * Per-frame lerp of fill bar toward target value.
     */
    private _animateFill(): void {
        if (Math.abs(this._currentFill - this._targetFill) < 0.001) return;

        const engineDt = this._scene.getEngine().getDeltaTime();
        const dt = Math.min(engineDt / 1000, 0.05);
        this._currentFill += (this._targetFill - this._currentFill) * Math.min(1, LERP_SPEED * dt);
        this._currentFill = Math.max(0, Math.min(1, this._currentFill));
        this._fillRect.width = `${(this._currentFill * 100).toFixed(2)}%`;
    }

    /**
     * Disposes the XP bar UI.
     */
    public dispose(): void {
        if (this._observer) {
            this._scene.onBeforeRenderObservable.remove(this._observer);
        }
        this._advancedTexture.dispose();
    }
}
