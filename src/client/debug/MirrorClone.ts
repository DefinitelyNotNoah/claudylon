/**
 * Mirror Clone — a debug RemotePlayer that copies the local player's
 * position, rotation, weapon, and firing in real-time.
 * Used for testing leaning animations and third-person visuals.
 * @module client/debug/MirrorClone
 */

import { Scene } from "@babylonjs/core/scene";
import { Observer } from "@babylonjs/core/Misc/observable";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PLAYER_STATS } from "../../shared/constants/PlayerConstants";
import { RemotePlayer } from "../network/RemotePlayer";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponManager } from "../weapons/WeaponManager";
import type { AudioManager } from "../audio/AudioManager";

/** Default distance (cm) in front of the player where the clone spawns. */
const DEFAULT_OFFSET_DISTANCE = 200;

/** Spine bones to distribute lean across (top-down order). */
const LEAN_BONES = ["mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2"];

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

    /** How much of the camera lean angle to apply to the torso (0-2). */
    private _torsoLeanRatio: number = 1.0;

    /** Cached spine bone TransformNodes for lean rotation. */
    private _spineBoneNodes: TransformNode[] = [];

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

    /** How much of the camera lean angle to apply to the torso (0-1). */
    public get torsoLeanRatio(): number {
        return this._torsoLeanRatio;
    }

    public set torsoLeanRatio(value: number) {
        this._torsoLeanRatio = Math.max(0, Math.min(2, value));
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
        this._spineBoneNodes = [];
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

        // Store lean angle — applied after animation evaluation via observer.
        // Scale the camera lean by torsoLeanRatio for the third-person model.
        const leanAmount = this._playerController.leanAmount;
        const maxAngle = this._playerController.maxLeanAngle * this._torsoLeanRatio;
        this._pendingLeanAngle = -leanAmount * maxAngle;

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
     * Applies lean rotation distributed across spine bones after skeleton
     * animation evaluation. Distributing the angle across Spine, Spine1,
     * and Spine2 produces a natural curve instead of a single harsh joint.
     */
    private _applyLeanToBone(): void {
        if (!this._remote || Math.abs(this._pendingLeanAngle) < 0.001) return;

        // Lazily find and cache all spine bone TransformNodes
        if (this._spineBoneNodes.length === 0) {
            const charModel = this._remote.characterModel;
            if (!charModel || !charModel.skeleton) return;

            for (const boneName of LEAN_BONES) {
                for (const bone of charModel.skeleton.bones) {
                    if (bone.name === boneName) {
                        const tn = bone.getTransformNode();
                        if (tn) this._spineBoneNodes.push(tn);
                        break;
                    }
                }
            }
            if (this._spineBoneNodes.length === 0) return;
        }

        // Distribute the total lean angle evenly across the spine bones.
        // Pre-multiply (leanQ * animQ) to rotate in parent space, not bone-local.
        // In parent space, Forward (Z) is the character's chest direction,
        // so rotating around Z produces a side-lean.
        const perBoneAngle = this._pendingLeanAngle / this._spineBoneNodes.length;
        const leanQ = Quaternion.RotationAxis(Vector3.Forward(), perBoneAngle);

        for (const tn of this._spineBoneNodes) {
            const q = tn.rotationQuaternion;
            if (q) {
                tn.rotationQuaternion = leanQ.multiply(q);
            }
        }
    }

    /**
     * Disposes the clone and cleans up.
     */
    public dispose(): void {
        this.despawn();
    }
}
