/**
 * Directional hit indicator HUD overlay.
 * Shows red wedge-like markers around screen center indicating
 * the direction damage came from, then fades them out.
 * @module client/ui/HitIndicator
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { createFullscreenUI } from "./uiUtils";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";

/** Distance from screen center (pixels) for indicator placement. */
const INDICATOR_OFFSET = 80;

/** Indicator bar width (pixels) for side indicators. */
const INDICATOR_WIDTH = 6;

/** Indicator bar length (pixels). */
const INDICATOR_LENGTH = 50;

/** How long the indicator stays fully visible (seconds). */
const HOLD_DURATION = 0.15;

/** How long the fade-out takes (seconds). */
const FADE_DURATION = 0.6;

/**
 * A single active hit indicator with timing state.
 */
interface ActiveIndicator {
    /** The GUI rectangle control. */
    rect: Rectangle;
    /** Time remaining before fade starts (seconds). */
    holdTimer: number;
    /** Time remaining in fade-out (seconds). */
    fadeTimer: number;
}

/**
 * Renders directional hit indicators around the screen center.
 * When the player is hit, call `showHit()` with the attacker's
 * world position and the player's camera to display a red marker
 * in the direction the damage came from.
 */
export class HitIndicator {
    private _scene: Scene;
    private _advancedTexture: AdvancedDynamicTexture;
    private _activeIndicators: ActiveIndicator[] = [];
    private _observer: any = null;

    /**
     * Creates the hit indicator overlay.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
        this._advancedTexture = createFullscreenUI("hit_indicator_ui", scene);

        // Update fade timers each frame
        this._observer = scene.onBeforeRenderObservable.add(() => {
            this._update();
        });
    }

    /**
     * Shows a hit indicator pointing toward the attacker.
     * @param attackerX - Attacker's world X position (cm).
     * @param attackerY - Attacker's world Y position (cm).
     * @param attackerZ - Attacker's world Z position (cm).
     * @param camera - The local player's camera.
     */
    public showHit(
        attackerX: number,
        attackerY: number,
        attackerZ: number,
        camera: FreeCamera,
    ): void {
        const playerPos = camera.position;

        // Direction from player to attacker in world XZ plane
        const dx = attackerX - playerPos.x;
        const dz = attackerZ - playerPos.z;

        // Angle of attacker relative to world +Z axis
        const attackerAngle = Math.atan2(dx, dz);

        // Player's forward yaw (camera rotation.y)
        const playerYaw = camera.rotation.y;

        // Relative angle: 0 = directly ahead, PI = behind
        let relativeAngle = attackerAngle - playerYaw;

        // Normalize to [-PI, PI]
        while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

        // Create a single rotated indicator bar
        const rect = new Rectangle(`hit_ind_${Date.now()}`);
        rect.width = `${INDICATOR_WIDTH}px`;
        rect.height = `${INDICATOR_LENGTH}px`;
        rect.background = "rgba(255, 30, 30, 0.85)";
        rect.color = "transparent";
        rect.thickness = 0;
        rect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

        // Position the indicator at INDICATOR_OFFSET from center,
        // along the direction toward the attacker
        const offsetX = Math.sin(relativeAngle) * INDICATOR_OFFSET;
        const offsetY = -Math.cos(relativeAngle) * INDICATOR_OFFSET;
        rect.left = `${offsetX}px`;
        rect.top = `${offsetY}px`;

        // Rotate the bar to be tangent-ish — actually rotate to point outward
        rect.rotation = relativeAngle;

        this._advancedTexture.addControl(rect);
        this._activeIndicators.push({
            rect,
            holdTimer: HOLD_DURATION,
            fadeTimer: FADE_DURATION,
        });
    }

    /**
     * Per-frame update: counts down timers and fades out indicators.
     */
    private _update(): void {
        const engineDt = this._scene.getEngine().getDeltaTime();
        const dt = Math.min(engineDt / 1000, 0.05);

        for (let i = this._activeIndicators.length - 1; i >= 0; i--) {
            const ind = this._activeIndicators[i];

            if (ind.holdTimer > 0) {
                ind.holdTimer -= dt;
                continue;
            }

            ind.fadeTimer -= dt;
            if (ind.fadeTimer <= 0) {
                this._advancedTexture.removeControl(ind.rect);
                ind.rect.dispose();
                this._activeIndicators.splice(i, 1);
            } else {
                const alpha = ind.fadeTimer / FADE_DURATION;
                ind.rect.background = `rgba(255, 30, 30, ${(0.85 * alpha).toFixed(2)})`;
            }
        }
    }

    /**
     * Disposes all indicators and the GUI texture.
     */
    public dispose(): void {
        if (this._observer) {
            this._scene.onBeforeRenderObservable.remove(this._observer);
        }
        for (const ind of this._activeIndicators) {
            ind.rect.dispose();
        }
        this._activeIndicators = [];
        this._advancedTexture.dispose();
    }
}
