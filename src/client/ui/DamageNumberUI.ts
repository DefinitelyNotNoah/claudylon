/**
 * Floating damage numbers that appear at hit points in 3D space.
 * Each hit spawns a TextBlock projected from world-space, drifting
 * upward and laterally before fading out.
 * @module client/ui/DamageNumberUI
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { createFullscreenUI } from "./uiUtils";

/** Total lifetime of a damage number in seconds. */
const LIFETIME = 0.8;

/** Upward float speed in cm/s. */
const FLOAT_SPEED = 120;

/** Lateral drift range in ±cm/s (randomised per number). */
const DRIFT_RANGE = 60;

/** Font size in pixels. */
const FONT_SIZE = 20;

/** Color for regular hits. */
const HIT_COLOR = "white";

/** Color for killing blows. */
const KILL_COLOR = "#FFD700";

/**
 * Tracks a single active floating damage number.
 */
interface ActiveDamageNumber {
    /** The GUI text control. */
    textBlock: TextBlock;
    /** Current world-space position (drifts each frame). */
    worldPos: Vector3;
    /** Lateral drift speed in cm/s. */
    driftX: number;
    /** Elapsed time since spawn (seconds). */
    lifetime: number;
}

/**
 * Manages floating damage numbers that appear at projectile hit points.
 */
export class DamageNumberUI {
    private _scene: Scene;
    private _advancedTexture: AdvancedDynamicTexture;
    private _activeNumbers: ActiveDamageNumber[] = [];
    private _observer: any = null;

    /**
     * Creates the damage number overlay.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
        this._advancedTexture = createFullscreenUI("damage_numbers_ui", scene);

        this._observer = scene.onBeforeRenderObservable.add(() => {
            this._update();
        });
    }

    /**
     * Spawns a floating damage number at the given world position.
     * @param position - World-space hit point (cm).
     * @param damage - Damage value to display.
     * @param isKill - Whether this hit was a killing blow (renders in gold).
     */
    public show(position: Vector3, damage: number, isKill: boolean): void {
        const textBlock = new TextBlock(`dmg_${Date.now()}_${Math.random()}`);
        textBlock.text = String(Math.round(damage));
        textBlock.fontSize = FONT_SIZE;
        textBlock.fontFamily = "monospace";
        textBlock.fontWeight = "bold";
        textBlock.color = isKill ? KILL_COLOR : HIT_COLOR;
        textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        textBlock.resizeToFit = true;

        this._advancedTexture.addControl(textBlock);

        this._activeNumbers.push({
            textBlock,
            worldPos: position.clone(),
            driftX: (Math.random() - 0.5) * 2 * DRIFT_RANGE,
            lifetime: 0,
        });
    }

    /**
     * Per-frame update: moves numbers upward, drifts laterally,
     * projects to screen, and fades out expired ones.
     */
    private _update(): void {
        const engine = this._scene.getEngine();
        const engineDt = engine.getDeltaTime();
        const dt = Math.min(engineDt / 1000, 0.05);
        const camera = this._scene.activeCamera;
        if (!camera) return;

        const renderWidth = engine.getRenderWidth();
        const renderHeight = engine.getRenderHeight();
        const viewMatrix = camera.getViewMatrix();
        const projMatrix = camera.getProjectionMatrix();
        const transformMatrix = viewMatrix.multiply(projMatrix);
        const viewport = camera.viewport.toGlobal(renderWidth, renderHeight);

        for (let i = this._activeNumbers.length - 1; i >= 0; i--) {
            const num = this._activeNumbers[i];
            num.lifetime += dt;

            if (num.lifetime >= LIFETIME) {
                this._advancedTexture.removeControl(num.textBlock);
                num.textBlock.dispose();
                this._activeNumbers.splice(i, 1);
                continue;
            }

            // Drift the world position
            num.worldPos.y += FLOAT_SPEED * dt;
            num.worldPos.x += num.driftX * dt;

            // Project world position to screen coordinates
            const coords = Vector3.Project(
                num.worldPos,
                Matrix.Identity(),
                transformMatrix,
                viewport,
            );

            // Skip if behind camera
            if (coords.z > 1 || coords.z < 0) {
                num.textBlock.alpha = 0;
                continue;
            }

            num.textBlock.left = `${coords.x}px`;
            num.textBlock.top = `${coords.y}px`;

            // Fade opacity
            const alpha = 1 - (num.lifetime / LIFETIME);
            num.textBlock.alpha = alpha;
        }
    }

    /**
     * Disposes all damage numbers and the GUI texture.
     */
    public dispose(): void {
        if (this._observer) {
            this._scene.onBeforeRenderObservable.remove(this._observer);
        }
        for (const num of this._activeNumbers) {
            num.textBlock.dispose();
        }
        this._activeNumbers = [];
        this._advancedTexture.dispose();
    }
}
