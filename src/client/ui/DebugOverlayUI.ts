/**
 * Debug overlay displayed on the left side of the screen.
 * Shows player coordinates, scene stats, and raycast target info.
 * Toggled via a setting stored in localStorage.
 * @module client/ui/DebugOverlayUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";

/** localStorage key for debug mode toggle. */
export const DEBUG_MODE_KEY = "fps_debug_mode";

/** How often to update the raycast target info (seconds). */
const RAYCAST_UPDATE_INTERVAL = 0.1;

/** Max raycast distance in cm. */
const RAYCAST_DISTANCE = 50000;

/**
 * Data about a remote player, provided externally by MatchScene.
 */
export interface DebugRemotePlayerInfo {
    /** Player display name. */
    displayName: string;
    /** Current health. */
    health: number;
    /** Current weapon ID. */
    weaponId: string;
    /** World-space X. */
    x: number;
    /** World-space Y. */
    y: number;
    /** World-space Z. */
    z: number;
    /** Player state (Idle, Walking, etc.). */
    state: string;
}

/**
 * Debug overlay showing real-time game data on the left side of the screen.
 * Includes player position, scene statistics, and information about
 * whatever the player is looking at via center-screen raycast.
 */
export class DebugOverlayUI {
    private _texture: AdvancedDynamicTexture;
    private _root: Rectangle;
    private _debugText: TextBlock;
    private _scene: Scene;
    private _raycastTimer: number = 0;
    private _lastRaycastInfo: string = "None";

    /** Callback to resolve a mesh name to remote player info. */
    public getRemotePlayerInfo: ((meshName: string) => DebugRemotePlayerInfo | null) | null = null;

    /**
     * Creates the debug overlay UI.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
        this._texture = createFullscreenUI("debug_ui", scene);

        // Background container on the left
        this._root = new Rectangle("debug_root");
        this._root.widthInPixels = 360;
        this._root.adaptHeightToChildren = true;
        this._root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._root.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._root.leftInPixels = 10;
        this._root.topInPixels = 10;
        this._root.thickness = 0;
        this._root.background = "rgba(0,0,0,0.6)";
        this._root.cornerRadius = 4;
        this._root.paddingTopInPixels = 8;
        this._root.paddingBottomInPixels = 8;
        this._root.isVisible = false;
        this._texture.addControl(this._root);

        // Monospace text block
        this._debugText = new TextBlock("debug_text", "");
        this._debugText.fontFamily = "monospace";
        this._debugText.fontSize = 13;
        this._debugText.color = "#00FF00";
        this._debugText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._debugText.textWrapping = true;
        this._debugText.resizeToFit = true;
        this._debugText.paddingLeftInPixels = 10;
        this._debugText.paddingRightInPixels = 10;
        this._debugText.paddingTopInPixels = 4;
        this._debugText.paddingBottomInPixels = 4;
        this._root.addControl(this._debugText);
    }

    /** Whether the debug overlay is currently visible. */
    public get isVisible(): boolean {
        return this._root.isVisible;
    }

    /**
     * Shows the debug overlay.
     */
    public show(): void {
        this._root.isVisible = true;
    }

    /**
     * Hides the debug overlay.
     */
    public hide(): void {
        this._root.isVisible = false;
    }

    /**
     * Updates the debug overlay with current frame data.
     * @param dt - Delta time in seconds.
     * @param camera - The player's camera (for position and raycast).
     * @param playerState - Current player state string (e.g., "Idle", "Walking").
     * @param playerHealth - Current player health.
     * @param weaponName - Current weapon name.
     * @param currentAmmo - Current magazine ammo.
     * @param reserveAmmo - Reserve ammo.
     */
    public update(
        dt: number,
        camera: FreeCamera,
        playerState: string,
        playerHealth: number,
        weaponName: string,
        currentAmmo: number,
        reserveAmmo: number,
    ): void {
        if (!this._root.isVisible) return;

        const engine = this._scene.getEngine();
        const fps = engine.getFps().toFixed(0);
        const totalMeshes = this._scene.meshes.length;
        const activeMeshes = this._scene.getActiveMeshes().length;

        // Render resolution (actual GPU pixels)
        const renderW = engine.getRenderWidth(true);
        const renderH = engine.getRenderHeight(true);
        const dpr = window.devicePixelRatio.toFixed(2);
        const scale = engine.getHardwareScalingLevel().toFixed(2);

        // Player coordinates
        const pos = camera.position;
        const rot = camera.rotation;

        // Raycast info (throttled)
        this._raycastTimer += dt;
        if (this._raycastTimer >= RAYCAST_UPDATE_INTERVAL) {
            this._raycastTimer = 0;
            this._lastRaycastInfo = this._performRaycast(camera);
        }

        const apiName = engine.isWebGPU ? "WebGPU" : "WebGL" + (engine.version === 2 ? "2" : "");

        const lines: string[] = [
            `--- DEBUG ---`,
            `FPS: ${fps}`,
            `API: ${apiName}`,
            `Render: ${renderW}x${renderH}`,
            `DPR: ${dpr}  Scale: ${scale}`,
            `Meshes: ${activeMeshes} / ${totalMeshes}`,
            ``,
            `--- PLAYER ---`,
            `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
            `Rot: ${(rot.x * 180 / Math.PI).toFixed(1)}, ${(rot.y * 180 / Math.PI).toFixed(1)}`,
            `State: ${playerState}`,
            `Health: ${playerHealth}`,
            `Weapon: ${weaponName} (${currentAmmo}/${reserveAmmo})`,
            ``,
            `--- LOOKING AT ---`,
            this._lastRaycastInfo,
        ];

        this._debugText.text = lines.join("\n");
    }

    /**
     * Performs a center-screen raycast and returns a formatted info string.
     * @param camera - The player's camera.
     * @returns Formatted string describing the hit target.
     */
    private _performRaycast(camera: FreeCamera): string {
        const forward = camera.getForwardRay(RAYCAST_DISTANCE);
        const ray = new Ray(forward.origin, forward.direction, RAYCAST_DISTANCE);

        const hit = this._scene.pickWithRay(ray, (mesh) => {
            return mesh.isPickable && mesh.isEnabled();
        });

        if (!hit || !hit.hit || !hit.pickedMesh) {
            return "Nothing (sky)";
        }

        const mesh = hit.pickedMesh;
        const dist = hit.distance.toFixed(1);
        const hitPos = hit.pickedPoint;
        const posStr = hitPos
            ? `${hitPos.x.toFixed(1)}, ${hitPos.y.toFixed(1)}, ${hitPos.z.toFixed(1)}`
            : "N/A";

        let info = `Mesh: ${mesh.name}\nDist: ${dist} cm\nHit: ${posStr}`;

        // Check if it's a remote player
        if (mesh.name.startsWith("remote_body_") && this.getRemotePlayerInfo) {
            const playerInfo = this.getRemotePlayerInfo(mesh.name);
            if (playerInfo) {
                info += `\n\n--- TARGET PLAYER ---`;
                info += `\nName: ${playerInfo.displayName}`;
                info += `\nHealth: ${playerInfo.health}`;
                info += `\nWeapon: ${playerInfo.weaponId}`;
                info += `\nState: ${playerInfo.state}`;
                info += `\nPos: ${playerInfo.x.toFixed(1)}, ${playerInfo.y.toFixed(1)}, ${playerInfo.z.toFixed(1)}`;
            }
        }

        return info;
    }

    /**
     * Disposes the debug overlay UI.
     */
    public dispose(): void {
        this.getRemotePlayerInfo = null;
        this._texture.dispose();
    }
}
