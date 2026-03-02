/**
 * Circular minimap radar in the top-left corner.
 * Shows the local player at center (green dot) and enemies (red dots)
 * at relative positions, rotated so "up" = player's facing direction.
 * @module client/ui/MinimapUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Ellipse } from "@babylonjs/gui/2D/controls/ellipse";
import { createFullscreenUI } from "./uiUtils";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";

/** Minimap circle diameter in pixels. */
const MINIMAP_SIZE = 160;

/** Margin from screen edges in pixels. */
const MINIMAP_MARGIN = 15;

/** How much world space (cm) the minimap covers as a radius. */
const WORLD_RADIUS = 1800;

/** Scale factor: minimap pixels per world cm. */
const SCALE = (MINIMAP_SIZE / 2) / WORLD_RADIUS;

/** Player dot diameter in pixels. */
const PLAYER_DOT_SIZE = 8;

/** Enemy dot diameter in pixels. */
const ENEMY_DOT_SIZE = 6;

/** Player dot color. */
const PLAYER_DOT_COLOR = "#00FF00";

/** Enemy dot color. */
const ENEMY_DOT_COLOR = "#FF3333";

/** Minimap background color. */
const BG_COLOR = "rgba(0,0,0,0.5)";

/** Minimap border color. */
const BORDER_COLOR = "rgba(255,255,255,0.3)";

/** Minimap border thickness. */
const BORDER_THICKNESS = 2;

/**
 * Entity data passed to the minimap each frame.
 */
export interface MinimapEntity {
    /** Unique identifier for this entity. */
    id: string;
    /** World X position in cm. */
    x: number;
    /** World Z position in cm. */
    z: number;
    /** Whether the entity is currently dead. */
    isDead: boolean;
}

/**
 * Circular minimap radar showing player and enemy positions.
 */
export class MinimapUI {
    private _texture: AdvancedDynamicTexture;
    private _container: Ellipse;
    private _dotPool: Ellipse[] = [];
    private _minimapRadius: number;

    /**
     * Creates the minimap UI.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._minimapRadius = MINIMAP_SIZE / 2;
        this._texture = createFullscreenUI("minimap_ui", scene);

        // Circular container
        this._container = new Ellipse("minimap_bg");
        this._container.widthInPixels = MINIMAP_SIZE;
        this._container.heightInPixels = MINIMAP_SIZE;
        this._container.background = BG_COLOR;
        this._container.color = BORDER_COLOR;
        this._container.thickness = BORDER_THICKNESS;
        this._container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._container.leftInPixels = MINIMAP_MARGIN;
        this._container.topInPixels = MINIMAP_MARGIN;
        this._texture.addControl(this._container);

        // Direction indicator (small rectangle pointing "up" from center)
        const dirIndicator = new Rectangle("minimap_dir");
        dirIndicator.widthInPixels = 4;
        dirIndicator.heightInPixels = 14;
        dirIndicator.background = "white";
        dirIndicator.thickness = 0;
        dirIndicator.topInPixels = -14;
        this._container.addControl(dirIndicator);

        // Player dot (always at center)
        const playerDot = new Ellipse("minimap_player");
        playerDot.widthInPixels = PLAYER_DOT_SIZE;
        playerDot.heightInPixels = PLAYER_DOT_SIZE;
        playerDot.background = PLAYER_DOT_COLOR;
        playerDot.thickness = 0;
        this._container.addControl(playerDot);
    }

    /**
     * Updates all enemy dot positions on the minimap.
     * @param playerX - Player world X in cm.
     * @param playerZ - Player world Z in cm.
     * @param playerYaw - Player yaw in radians.
     * @param entities - Array of entity positions (bots + remote players).
     */
    public update(
        playerX: number,
        playerZ: number,
        playerYaw: number,
        entities: MinimapEntity[],
    ): void {
        // Ensure enough dots in pool
        while (this._dotPool.length < entities.length) {
            const dot = new Ellipse(`minimap_dot_${this._dotPool.length}`);
            dot.widthInPixels = ENEMY_DOT_SIZE;
            dot.heightInPixels = ENEMY_DOT_SIZE;
            dot.background = ENEMY_DOT_COLOR;
            dot.thickness = 0;
            dot.isVisible = false;
            this._container.addControl(dot);
            this._dotPool.push(dot);
        }

        // Player's forward = (sin(yaw), cos(yaw)), right = (cos(yaw), -sin(yaw))
        const fwdX = Math.sin(playerYaw);
        const fwdZ = Math.cos(playerYaw);
        const rightX = Math.cos(playerYaw);
        const rightZ = -Math.sin(playerYaw);

        for (let i = 0; i < this._dotPool.length; i++) {
            const dot = this._dotPool[i];

            if (i >= entities.length) {
                dot.isVisible = false;
                continue;
            }

            const entity = entities[i];

            if (entity.isDead) {
                dot.isVisible = false;
                continue;
            }

            // Delta from player in world space
            const dx = entity.x - playerX;
            const dz = entity.z - playerZ;

            // Project onto player's right/forward axes
            // Right component → minimap +X, forward component → minimap -Y (up on screen)
            const dotX = (dx * rightX + dz * rightZ) * SCALE;
            const dotY = -(dx * fwdX + dz * fwdZ) * SCALE;

            // Check if within minimap circle
            const dist = Math.sqrt(dotX * dotX + dotY * dotY);
            if (dist > this._minimapRadius - ENEMY_DOT_SIZE / 2) {
                dot.isVisible = false;
                continue;
            }

            dot.leftInPixels = dotX;
            dot.topInPixels = dotY;
            dot.isVisible = true;
        }
    }

    /**
     * Shows the minimap.
     */
    public show(): void {
        this._container.isVisible = true;
    }

    /**
     * Hides the minimap.
     */
    public hide(): void {
        this._container.isVisible = false;
    }

    /**
     * Disposes the minimap UI.
     */
    public dispose(): void {
        this._texture.dispose();
    }
}
