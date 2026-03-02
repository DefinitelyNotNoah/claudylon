/**
 * Countdown timer displayed at top-center of the screen.
 * Shows remaining match time in MM:SS format with visual
 * warnings when time is running low.
 * @module client/ui/MatchTimerUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { createFullscreenUI } from "./uiUtils";
import { Control } from "@babylonjs/gui/2D/controls/control";

/** Seconds remaining when text turns red. */
const WARNING_THRESHOLD = 30;

/** Seconds remaining when text starts pulsing. */
const PULSE_THRESHOLD = 10;

/** Pulse speed (oscillations per second). */
const PULSE_SPEED = 3.0;

/**
 * Renders the match countdown timer at the top-center of the screen.
 */
export class MatchTimerUI {
    private _texture: AdvancedDynamicTexture;
    private _timerText: TextBlock;
    private _pulseElapsed: number = 0;

    /**
     * Creates the match timer UI.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._texture = createFullscreenUI("match_timer_ui", scene);

        this._timerText = new TextBlock("match_timer_text", "5:00");
        this._timerText.fontFamily = "monospace";
        this._timerText.fontSize = 28;
        this._timerText.color = "white";
        this._timerText.heightInPixels = 40;
        this._timerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._timerText.topInPixels = 30;
        this._timerText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._texture.addControl(this._timerText);
    }

    /**
     * Shows the timer text.
     */
    public show(): void {
        this._timerText.isVisible = true;
    }

    /**
     * Hides the timer text.
     */
    public hide(): void {
        this._timerText.isVisible = false;
    }

    /**
     * Updates the timer display with remaining seconds.
     * @param remainingSeconds - Seconds left in the match.
     * @param dt - Delta time in seconds (for pulse animation).
     */
    public updateTime(remainingSeconds: number, dt: number): void {
        const clamped = Math.max(0, Math.ceil(remainingSeconds));
        const minutes = Math.floor(clamped / 60);
        const seconds = clamped % 60;
        this._timerText.text = `${minutes}:${seconds.toString().padStart(2, "0")}`;

        // Color warning
        if (remainingSeconds <= WARNING_THRESHOLD) {
            this._timerText.color = "#FF4444";
        } else {
            this._timerText.color = "white";
        }

        // Pulse effect in final seconds
        if (remainingSeconds <= PULSE_THRESHOLD && remainingSeconds > 0) {
            this._pulseElapsed += dt;
            const pulse = 1.0 + 0.15 * Math.sin(this._pulseElapsed * Math.PI * 2 * PULSE_SPEED);
            this._timerText.scaleX = pulse;
            this._timerText.scaleY = pulse;
        } else {
            this._pulseElapsed = 0;
            this._timerText.scaleX = 1;
            this._timerText.scaleY = 1;
        }
    }

    /**
     * Disposes the match timer UI.
     */
    public dispose(): void {
        this._texture.dispose();
    }
}
