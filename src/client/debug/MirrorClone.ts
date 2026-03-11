/**
 * Mirror Clone — a debug RemotePlayer that copies the local player's
 * position, rotation, weapon, and firing in real-time.
 * Used for testing leaning animations and third-person visuals.
 * @module client/debug/MirrorClone
 */

import { Scene } from "@babylonjs/core/scene";
import { Observer } from "@babylonjs/core/Misc/observable";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PLAYER_STATS } from "../../shared/constants/PlayerConstants";
import { RemotePlayer } from "../network/RemotePlayer";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponManager } from "../weapons/WeaponManager";
import type { AudioManager } from "../audio/AudioManager";

/** Default distance (cm) in front of the player where the clone spawns. */
const DEFAULT_OFFSET_DISTANCE = 200;

/**
 * Manages a mirror clone RemotePlayer that tracks the local player.
 */
export class MirrorClone {
    private _scene: Scene;
    private _remote: RemotePlayer | null = null;
    private _playerController: PlayerController;
    private _weaponManager: WeaponManager;
    private _audioManager: AudioManager | null;

    /** Distance in front of the player to place the clone (cm). */
    private _offsetDistance: number = DEFAULT_OFFSET_DISTANCE;

    /** Whether the clone's hitbox capsule is pickable (collision). */
    private _collisionEnabled: boolean = false;

    /** Whether the clone's rotation is locked to manual values. */
    private _rotationLocked: boolean = false;

    /** Locked yaw in radians. */
    private _lockedYaw: number = 0;

    /** Locked pitch in radians (used for future upper-body tilt). */
    private _lockedPitch: number = 0;

    /** The last weapon ID synced, to detect changes. */
    private _lastWeaponId: string = "";

    /** Cached Spine1 bone TransformNode for lean rotation. */
    private _spineBoneNode: TransformNode | null = null;

    /** Observer that applies lean rotation after skeleton animation evaluates. */
    private _afterAnimObserver: Observer<Scene> | null = null;

    /** Current lean angle to apply (set during update, applied after animations). */
    private _pendingLeanAngle: number = 0;

    /**
     * Creates a MirrorClone manager.
     * @param scene - The active Babylon.js scene.
     * @param playerController - The local player controller.
     * @param weaponManager - The local weapon manager.
     * @param audioManager - The audio manager (for spatial fire sounds).
     */
    constructor(
        scene: Scene,
        playerController: PlayerController,
        weaponManager: WeaponManager,
        audioManager: AudioManager | null,
    ) {
        this._scene = scene;
        this._playerController = playerController;
        this._weaponManager = weaponManager;
        this._audioManager = audioManager;
    }

    /** Whether the clone is currently spawned. */
    public get isSpawned(): boolean {
        return this._remote !== null;
    }

    /** The offset distance in cm. */
    public get offsetDistance(): number {
        return this._offsetDistance;
    }

    public set offsetDistance(value: number) {
        this._offsetDistance = Math.max(50, Math.min(1000, value));
    }

    /** Whether the clone's hitbox is pickable. */
    public get collisionEnabled(): boolean {
        return this._collisionEnabled;
    }

    public set collisionEnabled(value: boolean) {
        this._collisionEnabled = value;
        if (this._remote) {
            // Access the body mesh via the root's children
            const bodyMesh = this._scene.getMeshByName("remote_body_mirror_clone");
            if (bodyMesh) {
                bodyMesh.isPickable = value;
            }
        }
    }

    /** Whether rotation is locked to manual values. */
    public get rotationLocked(): boolean {
        return this._rotationLocked;
    }

    public set rotationLocked(value: boolean) {
        if (value && !this._rotationLocked) {
            // Snapshot current player rotation when locking
            this._lockedYaw = this._playerController.yaw;
            this._lockedPitch = this._playerController.pitch;
        }
        this._rotationLocked = value;
    }

    /** Locked yaw in radians. */
    public get lockedYaw(): number {
        return this._lockedYaw;
    }

    public set lockedYaw(value: number) {
        this._lockedYaw = value;
    }

    /** Locked pitch in radians. */
    public get lockedPitch(): number {
        return this._lockedPitch;
    }

    public set lockedPitch(value: number) {
        this._lockedPitch = value;
    }

    /**
     * Spawns the mirror clone at an offset in front of the player.
     * If already spawned, does nothing.
     */
    public spawn(): void {
        if (this._remote) return;

        const pos = this._playerController.position;
        const yaw = this._playerController.yaw;

        // Place clone in front of the player, facing back toward the player
        const offsetX = pos.x + Math.sin(yaw) * this._offsetDistance;
        const offsetZ = pos.z + Math.cos(yaw) * this._offsetDistance;
        const groundY = pos.y - PLAYER_STATS.capsuleHeight / 2;

        this._remote = new RemotePlayer(
            this._scene,
            "mirror_clone",
            "Mirror",
            offsetX,
            groundY,
            offsetZ,
        );

        // Face the clone back toward the player
        const facingYaw = yaw + Math.PI;
        this._lockedYaw = facingYaw;
        this._lockedPitch = 0;

        // Initial state sync
        const weaponId = this._weaponManager.activeWeapon.id;
        this._lastWeaponId = weaponId;
        this._remote.updateFromServer(
            offsetX, groundY, offsetZ,
            facingYaw,
            100,
            "Idle",
            weaponId,
        );

        // Apply collision setting
        this.collisionEnabled = this._collisionEnabled;

        // Register post-animation observer to apply lean after skeleton evaluation
        this._afterAnimObserver = this._scene.onAfterAnimationsObservable.add(() => {
            this._applyLeanToBone();
        });

        console.log("[MirrorClone] Spawned at offset", this._offsetDistance, "cm");
    }

    /**
     * Despawns and disposes the mirror clone.
     */
    public despawn(): void {
        if (!this._remote) return;

        if (this._afterAnimObserver) {
            this._scene.onAfterAnimationsObservable.remove(this._afterAnimObserver);
            this._afterAnimObserver = null;
        }
        this._spineBoneNode = null;
        this._pendingLeanAngle = 0;

        this._remote.dispose();
        this._remote = null;
        this._lastWeaponId = "";
        console.log("[MirrorClone] Despawned");
    }

    /**
     * Per-frame update. Syncs position, rotation, weapon, and state
     * from the local player to the clone.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        if (!this._remote) return;

        const pos = this._playerController.position;
        const yaw = this._playerController.yaw;
        const groundY = pos.y - PLAYER_STATS.capsuleHeight / 2;

        // Position: offset in front of player
        const offsetX = pos.x + Math.sin(yaw) * this._offsetDistance;
        const offsetZ = pos.z + Math.cos(yaw) * this._offsetDistance;

        // Rotation: copy player or use locked values
        const cloneYaw = this._rotationLocked ? this._lockedYaw : yaw + Math.PI;

        // State: mirror player state
        const state = this._playerController.state;

        // Weapon: mirror active weapon
        const weaponId = this._weaponManager.activeWeapon.id;

        this._remote.updateFromServer(
            offsetX, groundY, offsetZ,
            cloneYaw,
            100,
            state,
            weaponId,
        );
        this._remote.update(dt);

        // Store lean angle — applied after animation evaluation via observer
        const leanAmount = this._playerController.leanAmount;
        this._pendingLeanAngle = -leanAmount * this._playerController.maxLeanAngle;

        this._lastWeaponId = weaponId;
    }

    /**
     * Triggers fire animation and recoil on the clone.
     * Called from WeaponManager's onFire callback.
     * @param audioFile - Weapon audio file for spatial sound.
     */
    public triggerFire(audioFile: string): void {
        if (!this._remote) return;

        this._remote.triggerRecoil();

        // Play spatial gunshot at clone's position
        if (this._audioManager) {
            this._audioManager.playGunshotAt(audioFile, this._remote.position);
        }
    }

    /**
     * Applies lean rotation to the Spine1 bone after skeleton animation evaluation.
     * Called from onAfterAnimationsObservable so it runs after bone poses are set,
     * preventing animations from overwriting the lean tilt.
     */
    private _applyLeanToBone(): void {
        if (!this._remote || Math.abs(this._pendingLeanAngle) < 0.001) return;

        // Lazily find and cache the Spine1 bone TransformNode
        if (!this._spineBoneNode) {
            const charModel = this._remote.characterModel;
            if (!charModel || !charModel.skeleton) return;

            for (const bone of charModel.skeleton.bones) {
                if (bone.name === "mixamorig:Spine1") {
                    this._spineBoneNode = bone.getTransformNode() ?? null;
                    break;
                }
            }
            if (!this._spineBoneNode) return;
        }

        // Additively rotate the spine bone in its local Z axis (lean)
        this._spineBoneNode.rotation.z += this._pendingLeanAngle;
    }

    /**
     * Disposes the clone and cleans up.
     */
    public dispose(): void {
        this.despawn();
    }
}
