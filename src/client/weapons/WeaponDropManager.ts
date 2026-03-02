/**
 * Manages weapon drop pool, proximity detection, pickup prompt UI,
 * and pickup callbacks (same-weapon ammo vs different-weapon swap).
 * @module client/weapons/WeaponDropManager
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { WEAPON_STATS } from "../../shared/constants";
import type { WeaponId } from "../../shared/types";
import { WeaponDrop } from "./WeaponDrop";
import { createFullscreenUI } from "../ui/uiUtils";

/** Maximum number of weapon drops allowed on the map at once. */
const MAX_DROPS = 12;

/** Radius in cm within which a same-weapon drop is auto-picked up. */
const PICKUP_RADIUS = 120;

/** Radius in cm within which the "Press E" prompt appears for different weapons. */
const PROMPT_RADIUS = 200;

/** Minimum age in seconds before a drop can be picked up (prevents instant re-grab). */
const MIN_PICKUP_AGE = 0.5;

/**
 * Orchestrates weapon drops: spawning, pooling, expiry, proximity pickup,
 * and floating "Press E to pickup" prompt text.
 */
export class WeaponDropManager {
    private _scene: Scene;
    private _drops: WeaponDrop[] = [];
    private _promptTextBlock: TextBlock | null = null;
    private _advancedTexture: AdvancedDynamicTexture;

    /** When false, spawnDrop() is a no-op (drops from deaths are suppressed). */
    public enabled: boolean = true;

    /** Called when the player walks over a drop that matches a weapon they already have. */
    public onSameWeaponPickup: ((weaponId: WeaponId) => void) | null = null;

    /** Called when the player picks up a different weapon (after tossing their current one). */
    public onDifferentWeaponPickup: ((newWeaponId: WeaponId, currentAmmo: number, reserveAmmo: number) => void) | null = null;

    /** Returns the active weapon's ammo state before it gets tossed during a swap. */
    public _tossWeaponAmmo: (() => { currentAmmo: number; reserveAmmo: number }) | null = null;

    /**
     * Creates the weapon drop manager.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
        this._advancedTexture = createFullscreenUI("weapon_drop_ui", scene);
    }

    /**
     * Spawns a dropped weapon at the given position.
     * If the pool is full, the oldest drop is removed (FIFO).
     * @param weaponId - The weapon type to drop.
     * @param position - World-space spawn position.
     * @param yaw - Y rotation of the deceased entity.
     * @param currentAmmo - Rounds in magazine when dropped (-1 = full).
     * @param reserveAmmo - Reserve rounds when dropped (-1 = full).
     */
    public async spawnDrop(
        weaponId: WeaponId,
        position: Vector3,
        yaw: number,
        currentAmmo: number = -1,
        reserveAmmo: number = -1
    ): Promise<void> {
        if (!this.enabled) return;

        // Enforce pool limit — remove oldest
        if (this._drops.length >= MAX_DROPS) {
            const oldest = this._drops.shift()!;
            oldest.dispose();
        }

        const drop = await WeaponDrop.create(this._scene, weaponId, position, yaw, currentAmmo, reserveAmmo);
        this._drops.push(drop);
    }

    /**
     * Per-frame update. Expires old drops, checks proximity for pickup/prompt,
     * and handles swap-toss logic for different-weapon pickups.
     * @param dt - Delta time in seconds.
     * @param playerPosition - The local player's world position.
     * @param activeWeaponId - The player's currently equipped weapon ID.
     * @param slot1WeaponId - Weapon ID in slot 1.
     * @param slot2WeaponId - Weapon ID in slot 2.
     * @param interactPressed - Whether the interact key (E) was just pressed.
     * @param camera - The player camera (for projecting prompt text + toss direction).
     */
    public update(
        dt: number,
        playerPosition: Vector3,
        activeWeaponId: WeaponId,
        slot1WeaponId: WeaponId,
        slot2WeaponId: WeaponId,
        interactPressed: boolean,
        camera: FreeCamera
    ): void {
        // Expire old drops
        for (let i = this._drops.length - 1; i >= 0; i--) {
            const drop = this._drops[i];
            if (drop.update(dt)) {
                drop.dispose();
                this._drops.splice(i, 1);
            }
        }

        // Find nearest eligible drop
        let nearestDrop: WeaponDrop | null = null;
        let nearestDist = Infinity;

        for (const drop of this._drops) {
            if (drop.age < MIN_PICKUP_AGE) continue;

            const dist = Vector3.Distance(playerPosition, drop.position);
            if (dist < PROMPT_RADIUS && dist < nearestDist) {
                nearestDist = dist;
                nearestDrop = drop;
            }
        }

        // Same weapon — auto-pickup on walk-over
        if (nearestDrop && nearestDist <= PICKUP_RADIUS) {
            const dropId = nearestDrop.weaponId;
            if (dropId === slot1WeaponId || dropId === slot2WeaponId) {
                this.onSameWeaponPickup?.(dropId);
                this._removeDrop(nearestDrop);
                this._hidePrompt();
                return;
            }
        }

        // Different weapon — show prompt and handle E press
        if (nearestDrop && nearestDrop.weaponId !== slot1WeaponId && nearestDrop.weaponId !== slot2WeaponId) {
            const dropId = nearestDrop.weaponId;
            const weaponName = WEAPON_STATS[dropId].name;
            this._showPrompt(nearestDrop.position, `Press E to pickup ${weaponName}`, camera);

            if (interactPressed && nearestDist <= PICKUP_RADIUS) {
                // Capture the drop's ammo before disposing it
                const pickupAmmo = nearestDrop.currentAmmo;
                const pickupReserve = nearestDrop.reserveAmmo;

                // Toss the current weapon from the player's hands
                // (activeAmmo/reserve are passed via the tossWeaponAmmo callback)
                const tossPos = camera.position.clone();
                tossPos.y -= 20;
                // Fire-and-forget — don't await
                if (this._tossWeaponAmmo) {
                    const tossAmmo = this._tossWeaponAmmo();
                    this.spawnDrop(activeWeaponId, tossPos, camera.rotation.y, tossAmmo.currentAmmo, tossAmmo.reserveAmmo);
                } else {
                    this.spawnDrop(activeWeaponId, tossPos, camera.rotation.y);
                }

                // Pick up the new weapon with its stored ammo
                this.onDifferentWeaponPickup?.(dropId, pickupAmmo, pickupReserve);
                this._removeDrop(nearestDrop);
                this._hidePrompt();
                return;
            }
        } else {
            this._hidePrompt();
        }
    }

    /**
     * Removes a specific drop from the pool and disposes it.
     * @param drop - The drop to remove.
     */
    private _removeDrop(drop: WeaponDrop): void {
        const idx = this._drops.indexOf(drop);
        if (idx >= 0) {
            this._drops.splice(idx, 1);
        }
        drop.dispose();
    }

    /**
     * Shows or updates the floating "Press E to pickup" text above a drop.
     * @param worldPos - World-space position of the weapon drop.
     * @param text - The prompt text to display.
     * @param camera - The active camera for projection.
     */
    private _showPrompt(worldPos: Vector3, text: string, camera: FreeCamera): void {
        if (!this._promptTextBlock) {
            this._promptTextBlock = new TextBlock("weapon_pickup_prompt");
            this._promptTextBlock.fontSize = 18;
            this._promptTextBlock.fontFamily = "monospace";
            this._promptTextBlock.fontWeight = "bold";
            this._promptTextBlock.color = "white";
            this._promptTextBlock.outlineColor = "black";
            this._promptTextBlock.outlineWidth = 3;
            this._promptTextBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            this._promptTextBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this._promptTextBlock.resizeToFit = true;
            this._advancedTexture.addControl(this._promptTextBlock);
        }

        this._promptTextBlock.text = text;
        this._promptTextBlock.isVisible = true;

        // Project world position to screen
        const engine = this._scene.getEngine();
        const renderWidth = engine.getRenderWidth();
        const renderHeight = engine.getRenderHeight();
        const viewMatrix = camera.getViewMatrix();
        const projMatrix = camera.getProjectionMatrix();
        const transformMatrix = viewMatrix.multiply(projMatrix);
        const viewport = camera.viewport.toGlobal(renderWidth, renderHeight);

        // Offset text above the weapon
        const textWorldPos = worldPos.add(new Vector3(0, 40, 0));

        const coords = Vector3.Project(
            textWorldPos,
            Matrix.Identity(),
            transformMatrix,
            viewport
        );

        // Hide if behind camera
        if (coords.z > 1 || coords.z < 0) {
            this._promptTextBlock.isVisible = false;
            return;
        }

        this._promptTextBlock.left = `${coords.x}px`;
        this._promptTextBlock.top = `${coords.y}px`;
    }

    /**
     * Hides the pickup prompt text.
     */
    private _hidePrompt(): void {
        if (this._promptTextBlock) {
            this._promptTextBlock.isVisible = false;
        }
    }

    /**
     * Disposes all drops, prompt text, and the GUI texture.
     */
    public dispose(): void {
        for (const drop of this._drops) {
            drop.dispose();
        }
        this._drops = [];
        if (this._promptTextBlock) {
            this._promptTextBlock.dispose();
            this._promptTextBlock = null;
        }
        this._advancedTexture.dispose();
    }
}
