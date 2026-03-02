/**
 * Right-center stacked kill notifications with slide-in, shift-down, and fade-out animations.
 * Shows "+XP Eliminated VictimName" entries when the local player gets a kill.
 * @module client/ui/KillNotificationUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Observer } from "@babylonjs/core/Misc/observable";

/** Maximum entries visible at once. */
const MAX_ENTRIES = 6;

/** Height of each entry in pixels. */
const ENTRY_HEIGHT = 36;

/** Gap between entries in pixels. */
const ENTRY_GAP = 4;

/** Width of each entry in pixels. */
const ENTRY_WIDTH = 420;

/** Duration of the slide-in animation in seconds. */
const SLIDE_IN_DURATION = 0.3;

/** Duration the entry stays fully visible in seconds. */
const HOLD_DURATION = 1.5;

/** Duration of the fade-out animation in seconds. */
const FADE_DURATION = 0.5;

/** Starting X offset in pixels (off-screen to the right). */
const SLIDE_IN_DISTANCE = 300;

/** Lerp speed for the downward shift animation. */
const SHIFT_LERP_SPEED = 10;

/** Left edge of entries starts this many px to the right of screen center. */
const CENTER_LEFT_OFFSET = 40;

/** Right edge of entries sits this many px to the right of screen center. */
const CENTER_UP_OFFSET = -20;

/** Font size for the text in pixels. */
const FONT_SIZE = 30;

/**
 * Internal state for a single notification entry.
 */
interface KillNotifyEntry {
    /** The entry container rectangle. */
    container: Rectangle;
    /** Target Y offset (shifts down as new entries push). */
    targetY: number;
    /** Current Y offset (lerps toward targetY). */
    currentY: number;
    /** Current X offset (starts at SLIDE_IN_DISTANCE, eases to 0). */
    currentX: number;
    /** Total time alive in seconds. */
    elapsed: number;
}

/**
 * Displays stacked kill notification entries on the right-center of the screen.
 * Entries slide in from the right, shift downward when new entries arrive,
 * and fade out after a hold duration.
 */
export class KillNotificationUI {
    private _texture: AdvancedDynamicTexture;
    private _entries: KillNotifyEntry[] = [];
    private _observer: Observer<Scene> | null = null;
    private _engine: { getRenderWidth(): number; getRenderHeight(): number; getDeltaTime(): number };

    /**
     * Creates the kill notification UI.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._engine = scene.getEngine();
        this._texture = createFullscreenUI("kill_notify_ui", scene);

        this._observer = scene.onBeforeRenderObservable.add(() => {
            const dt = this._engine.getDeltaTime() / 1000;
            this._update(dt);
        });
    }

    /**
     * Adds a kill notification entry.
     * @param xpAmount - XP gained (e.g., 100).
     * @param victimName - Name of the killed entity.
     */
    public addKill(xpAmount: number, victimName: string): void {
        // Remove oldest if at max
        if (this._entries.length >= MAX_ENTRIES) {
            const oldest = this._entries.pop()!;
            oldest.container.dispose();
        }

        // Shift target positions for all existing entries
        for (let i = 0; i < this._entries.length; i++) {
            this._entries[i].targetY = (i + 1) * (ENTRY_HEIGHT + ENTRY_GAP);
        }

        // Create the new entry container (transparent, no background)
        const container = new Rectangle(`kill_notify_${Date.now()}`);
        container.widthInPixels = ENTRY_WIDTH;
        container.heightInPixels = ENTRY_HEIGHT;
        container.background = "transparent";
        container.thickness = 0;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

        // Single text block with the full notification, right-aligned
        const text = new TextBlock(`kill_text_${Date.now()}`, `+${xpAmount} Eliminated ${victimName}`);
        text.color = "#FFD700";
        text.fontSize = FONT_SIZE;
        text.fontFamily = "monospace";
        text.fontWeight = "bold";
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        text.paddingLeftInPixels = 8;
        container.addControl(text);

        this._texture.addControl(container);

        // Insert at the front (newest entry is index 0)
        const entry: KillNotifyEntry = {
            container,
            targetY: 0,
            currentY: 0,
            currentX: SLIDE_IN_DISTANCE,
            elapsed: 0,
        };

        this._entries.unshift(entry);
    }

    /**
     * Per-frame update: animates positions and fading.
     * @param dt - Delta time in seconds.
     */
    private _update(dt: number): void {
        const screenW = this._engine.getRenderWidth();
        const screenH = this._engine.getRenderHeight();
        const entriesToRemove: number[] = [];

        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            entry.elapsed += dt;

            // Slide-in animation (X axis)
            if (entry.elapsed < SLIDE_IN_DURATION) {
                const t = entry.elapsed / SLIDE_IN_DURATION;
                const easeOut = 1 - Math.pow(1 - t, 3);
                entry.currentX = SLIDE_IN_DISTANCE * (1 - easeOut);
            } else {
                entry.currentX = 0;
            }

            // Shift-down animation (Y axis)
            entry.currentY += (entry.targetY - entry.currentY) * Math.min(1, SHIFT_LERP_SPEED * dt);

            // Fade-out
            const totalVisible = SLIDE_IN_DURATION + HOLD_DURATION;
            if (entry.elapsed > totalVisible) {
                const fadeElapsed = entry.elapsed - totalVisible;
                const fadeT = Math.min(1, fadeElapsed / FADE_DURATION);
                entry.container.alpha = 1 - fadeT;

                if (fadeT >= 1) {
                    entriesToRemove.push(i);
                }
            } else {
                entry.container.alpha = 1;
            }

            // Position: left edge sits to the right of screen center
            entry.container.leftInPixels = screenW / 2 + CENTER_LEFT_OFFSET + entry.currentX;
            entry.container.topInPixels = screenH / 2 + CENTER_UP_OFFSET + entry.currentY;
        }

        // Remove fully faded entries (iterate in reverse to keep indices valid)
        for (let i = entriesToRemove.length - 1; i >= 0; i--) {
            const idx = entriesToRemove[i];
            this._entries[idx].container.dispose();
            this._entries.splice(idx, 1);
        }
    }

    /**
     * Disposes the UI and all entries.
     */
    public dispose(): void {
        this._observer?.remove();
        for (const entry of this._entries) {
            entry.container.dispose();
        }
        this._entries = [];
        this._texture.dispose();
    }
}
