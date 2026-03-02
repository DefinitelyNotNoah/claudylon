/**
 * Kill feed overlay displayed in the top-right corner.
 * Shows recent kills with killer, weapon, and victim names.
 * Each entry has a semi-transparent background and auto-fades.
 * @module client/ui/KillFeedUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { WEAPON_STATS } from "../../shared/constants/WeaponConstants";
import type { WeaponId } from "../../shared/types";

/** Maximum visible entries at once. */
const MAX_ENTRIES = 5;

/** How long an entry stays fully visible (seconds). */
const HOLD_DURATION = 4.0;

/** How long the fade-out takes (seconds). */
const FADE_DURATION = 1.0;

/** Total lifetime before removal. */
const TOTAL_LIFETIME = HOLD_DURATION + FADE_DURATION;

/**
 * Internal tracking for a single kill feed entry.
 */
interface KillFeedEntry {
    /** The container rectangle (for fade + removal). */
    container: Rectangle;
    /** Time in seconds since this entry was added. */
    elapsed: number;
}

/**
 * Renders a kill feed in the top-right corner of the screen.
 * Each entry shows "killer [weapon] victim" with a dimmed background
 * and fades out after 5 seconds.
 */
export class KillFeedUI {
    private _texture: AdvancedDynamicTexture;
    private _stack: StackPanel;
    private _entries: KillFeedEntry[] = [];
    private _observer: Observer<Scene>;

    /**
     * Creates the kill feed UI.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._texture = createFullscreenUI("kill_feed_ui", scene);

        this._stack = new StackPanel("kill_feed_stack");
        this._stack.isVertical = true;
        this._stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._stack.paddingTopInPixels = 30;
        this._stack.paddingRightInPixels = 30;
        this._stack.widthInPixels = 400;
        this._texture.addControl(this._stack);

        this._observer = scene.onBeforeRenderObservable.add(() => {
            const dt = scene.getEngine().getDeltaTime() / 1000;
            this._tick(dt);
        })!;
    }

    /**
     * Adds a kill entry to the feed.
     * @param killerName - Display name of the killer.
     * @param victimName - Display name of the victim.
     * @param weaponId - Weapon ID used for the kill.
     * @param isLocalKiller - Whether the local player is the killer.
     * @param isLocalVictim - Whether the local player is the victim.
     */
    public addKill(
        killerName: string,
        victimName: string,
        weaponId: string,
        isLocalKiller: boolean,
        isLocalVictim: boolean,
    ): void {
        const weaponName = WEAPON_STATS[weaponId as WeaponId]?.name ?? weaponId;

        // Container with dimmed background
        const container = new Rectangle();
        container.heightInPixels = 28;
        container.thickness = 0;
        container.cornerRadius = 4;
        container.background = "rgba(0,0,0,0.5)";
        container.paddingBottomInPixels = 4;
        container.adaptWidthToChildren = true;
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;

        // Text inside container
        const text = new TextBlock();
        text.fontFamily = "monospace";
        text.fontSize = 14;
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        text.resizeToFit = true;
        text.paddingLeftInPixels = 10;
        text.paddingRightInPixels = 10;
        text.text = `${killerName}  [${weaponName}]  ${victimName}`;

        if (isLocalKiller) {
            text.color = "#00CC00";
        } else if (isLocalVictim) {
            text.color = "#FF6666";
        } else {
            text.color = "white";
        }

        container.addControl(text);

        // Remove oldest if at capacity
        if (this._entries.length >= MAX_ENTRIES) {
            const oldest = this._entries.shift()!;
            this._stack.removeControl(oldest.container);
        }

        this._stack.addControl(container);
        this._entries.push({ container, elapsed: 0 });
    }

    /**
     * Per-frame update. Fades and removes expired entries.
     * @param dt - Delta time in seconds.
     */
    private _tick(dt: number): void {
        for (let i = this._entries.length - 1; i >= 0; i--) {
            const entry = this._entries[i];
            entry.elapsed += dt;

            if (entry.elapsed >= TOTAL_LIFETIME) {
                this._stack.removeControl(entry.container);
                this._entries.splice(i, 1);
            } else if (entry.elapsed > HOLD_DURATION) {
                const fadeProgress = (entry.elapsed - HOLD_DURATION) / FADE_DURATION;
                entry.container.alpha = 1 - fadeProgress;
            }
        }
    }

    /**
     * Shows the kill feed UI.
     */
    public show(): void {
        this._stack.isVisible = true;
    }

    /**
     * Hides the kill feed UI.
     */
    public hide(): void {
        this._stack.isVisible = false;
    }

    /**
     * Disposes the kill feed UI and removes the render observer.
     */
    public dispose(): void {
        this._observer?.remove();
        this._entries = [];
        this._texture.dispose();
    }
}
