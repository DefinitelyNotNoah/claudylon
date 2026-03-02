/**
 * Loads and displays a weapon model as a first-person viewmodel.
 * The weapon is parented to a TransformNode attached to the camera,
 * so it moves with the player's view. Exposes a muzzle point for effects.
 * @module client/weapons/WeaponViewmodel
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";

import { WEAPON_STATS } from "../../shared/constants";
import type { WeaponId } from "../../shared/types";


/** How far below the view the weapon starts when drawn (local Y offset). */
const EQUIP_DROP_Y = -15;

/** How quickly the weapon rises into position (lerp speed per second). */
const EQUIP_LERP_SPEED = 8.0;

/** How far the weapon drops during reload (local Y offset). */
const RELOAD_DROP_Y = -8;

/** How much the weapon tilts forward during reload (radians). */
const RELOAD_TILT_X = 0.35;

/** How quickly the weapon tilts into/out of reload position (lerp speed per second). */
const RELOAD_LERP_SPEED = 6.0;

/**
 * Manages the first-person weapon model displayed in the viewport.
 * Uses rendering group 1 with depth clear so the weapon always
 * renders on top of world geometry.
 */
export class WeaponViewmodel {
    private _scene: Scene;
    private _anchor: TransformNode;
    private _meshes: AbstractMesh[] = [];
    private _currentWeaponId: WeaponId | null = null;
    private _muzzleNode: TransformNode;
    private _weaponRoot: TransformNode | null = null;
    /** Base model position from WeaponStats (resting position). */
    private _modelPosition: Vector3 = Vector3.Zero();
    /** Base model X rotation from WeaponStats (resting rotation). */
    private _modelRotationX: number = 0;

    /** Current equip animation offset (0 = fully raised, EQUIP_DROP_Y = fully lowered). */
    private _equipOffsetY: number = 0;
    /** Whether an equip animation is currently playing. */
    private _isEquipping: boolean = false;

    /** Whether the weapon is currently in the reload tilt animation. */
    private _isReloading: boolean = false;
    /** Current reload tilt progress (0 = resting, 1 = fully tilted down). */
    private _reloadTilt: number = 0;

    /**
     * Creates a new weapon viewmodel renderer.
     * @param scene - The Babylon.js scene.
     * @param anchor - TransformNode parented to the camera to attach the weapon to.
     */
    constructor(scene: Scene, anchor: TransformNode) {
        this._scene = scene;
        this._anchor = anchor;
        this._muzzleNode = new TransformNode("muzzle_point", scene);
        this._muzzleNode.parent = anchor;
    }

    /** The currently loaded weapon ID, or null if none. */
    public get currentWeaponId(): WeaponId | null {
        return this._currentWeaponId;
    }

    /** Whether the weapon is currently in the equip draw animation. */
    public get isEquipping(): boolean {
        return this._isEquipping;
    }

    /** Whether the weapon is currently in the reload tilt animation. */
    public get isReloading(): boolean {
        return this._isReloading;
    }

    /** The muzzle point in world space — use for spawning particles/effects. */
    public get muzzleNode(): TransformNode {
        return this._muzzleNode;
    }

    /**
     * Returns the muzzle world position.
     * @returns World-space position of the weapon muzzle.
     */
    public getMuzzleWorldPosition(): Vector3 {
        return this._muzzleNode.getAbsolutePosition();
    }

    /**
     * Hides all weapon meshes. Used when the player dies.
     */
    public hide(): void {
        for (const mesh of this._meshes) {
            mesh.isVisible = false;
        }
        this._isReloading = false;
        this._reloadTilt = 0;
        this._isEquipping = false;
        this._equipOffsetY = 0;
    }

    /**
     * Shows all weapon meshes with a fresh equip animation. Used on respawn.
     */
    public show(): void {
        for (const mesh of this._meshes) {
            mesh.isVisible = true;
        }
        this._equipOffsetY = EQUIP_DROP_Y;
        this._isEquipping = true;
    }

    /**
     * Begins the reload tilt animation — weapon drops and tilts forward.
     */
    public startReload(): void {
        this._isReloading = true;
    }

    /**
     * Ends the reload tilt animation — weapon returns to resting position.
     */
    public stopReload(): void {
        this._isReloading = false;
    }

    /**
     * Loads a weapon GLB model and attaches it to the viewmodel anchor.
     * Disposes any previously loaded weapon first.
     * @param weaponId - The weapon to load from WEAPON_STATS.
     */
    public async loadWeapon(weaponId: WeaponId): Promise<void> {
        this._disposeMeshes();

        const stats = WEAPON_STATS[weaponId];
        const url = `assets/weapons/${stats.modelFile}`;

        const result = await ImportMeshAsync(url, this._scene, {});

        this._meshes = result.meshes as AbstractMesh[];
        this._currentWeaponId = weaponId;

        const root = result.meshes[0] as unknown as TransformNode;
        root.parent = this._anchor;
        const mp = stats.modelPosition;
        this._modelPosition = new Vector3(mp.x, mp.y, mp.z);
        root.position = new Vector3(mp.x, mp.y + EQUIP_DROP_Y, mp.z);
        root.rotationQuaternion = null;
        const mr2 = stats.modelRotation;
        root.rotation = new Vector3(mr2.x, mr2.y, mr2.z);
        this._modelRotationX = mr2.x;
        root.scaling = new Vector3(8, 8, 8);

        this._weaponRoot = root;
        this._equipOffsetY = EQUIP_DROP_Y;
        this._isEquipping = true;
        this._isReloading = false;
        this._reloadTilt = 0;

        for (const mesh of this._meshes) {
            mesh.checkCollisions = false;
            mesh.renderingGroupId = 1;
        }

        this._muzzleNode.parent = root;
        const mo = stats.muzzleOffset;
        this._muzzleNode.position = new Vector3(mo.x, mo.y, mo.z);
        this._muzzleNode.rotationQuaternion = null;
        const mr = stats.muzzleRotation;
        this._muzzleNode.rotation = new Vector3(mr.x, mr.y, mr.z);
    }

    /**
     * Updates equip draw and reload tilt animations. Call once per frame.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        if (!this._weaponRoot) return;

        // Equip draw animation (weapon rises from below)
        if (this._isEquipping) {
            const lerpFactor = Math.min(1, EQUIP_LERP_SPEED * dt);
            this._equipOffsetY += (0 - this._equipOffsetY) * lerpFactor;

            if (Math.abs(this._equipOffsetY) < 0.01) {
                this._equipOffsetY = 0;
                this._isEquipping = false;
            }
        }

        // Reload tilt animation (weapon drops and tilts forward)
        const reloadTarget = this._isReloading ? 1 : 0;
        const reloadLerp = Math.min(1, RELOAD_LERP_SPEED * dt);
        this._reloadTilt += (reloadTarget - this._reloadTilt) * reloadLerp;
        if (Math.abs(this._reloadTilt - reloadTarget) < 0.005) {
            this._reloadTilt = reloadTarget;
        }

        // Apply combined offsets
        this._weaponRoot.position.y = this._modelPosition.y + this._equipOffsetY + this._reloadTilt * RELOAD_DROP_Y;
        this._weaponRoot.rotation.x = this._modelRotationX + this._reloadTilt * RELOAD_TILT_X;
    }

    /**
     * Disposes all meshes from the currently loaded weapon.
     */
    private _disposeMeshes(): void {
        for (const mesh of this._meshes) {
            mesh.dispose();
        }
        this._meshes = [];
        this._currentWeaponId = null;
        this._weaponRoot = null;
        this._isEquipping = false;
        this._equipOffsetY = 0;
        this._isReloading = false;
        this._reloadTilt = 0;
        this._muzzleNode.parent = this._anchor;
    }

    /**
     * Disposes the viewmodel and all loaded meshes.
     */
    public dispose(): void {
        this._disposeMeshes();
        this._muzzleNode.dispose();
    }
}
