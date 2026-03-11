/**
 * Mirror Clone — a debug RemotePlayer that copies the local player's
 * position, rotation, weapon, and firing in real-time.
 * Used for testing leaning animations and third-person visuals.
 * @module client/debug/MirrorClone
 */

import { Scene } from "@babylonjs/core/scene";
import { Observer } from "@babylonjs/core/Misc/observable";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
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
    private _torsoLeanRatio: number = 1.45;

    /** Model's own max lean angle in radians (default 30 degrees). */
    private _modelMaxLeanAngle: number = 0.524;

    /** Model's lean speed (per second). */
    private _modelLeanSpeed: number = 8.0;

    /** Model's horizontal lean offset (cm) — currently visual only via torso bones. */
    private _modelLeanOffset: number = 30;

    /** Cached spine bone TransformNodes for lean rotation. */
    private _spineBoneNodes: TransformNode[] = [];

    /** Cached Head bone TransformNode to derive lean axis from look direction. */
    private _headBoneNode: TransformNode | null = null;

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

    /** How much of the camera lean angle to apply to the torso (0-2). */
    public get torsoLeanRatio(): number {
        return this._torsoLeanRatio;
    }

    public set torsoLeanRatio(value: number) {
        this._torsoLeanRatio = Math.max(0, Math.min(2, value));
    }

    /** Model's own max lean angle in radians (separate from POV). */
    public get modelMaxLeanAngle(): number {
        return this._modelMaxLeanAngle;
    }

    public set modelMaxLeanAngle(value: number) {
        this._modelMaxLeanAngle = value;
    }

    /** Model's lean speed (per second). */
    public get modelLeanSpeed(): number {
        return this._modelLeanSpeed;
    }

    public set modelLeanSpeed(value: number) {
        this._modelLeanSpeed = value;
    }

    /** Model's horizontal lean offset (cm). */
    public get modelLeanOffset(): number {
        return this._modelLeanOffset;
    }

    public set modelLeanOffset(value: number) {
        this._modelLeanOffset = value;
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
        this._headBoneNode = null;
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
        // Use the model's own maxLeanAngle (independent from POV camera lean)
        // and scale by torsoLeanRatio for tuning.
        const leanAmount = this._playerController.leanAmount;
        const maxAngle = this._modelMaxLeanAngle * this._torsoLeanRatio;
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
     *
     * The lean axis is derived from the Head bone's world-space forward
     * direction projected onto the horizontal plane, so the lean is always
     * relative to the direction the character is actually looking — not a
     * hardcoded axis that ignores the animation pose.
     */
    private _applyLeanToBone(): void {
        if (!this._remote || Math.abs(this._pendingLeanAngle) < 0.001) return;

        const charModel = this._remote.characterModel;
        if (!charModel || !charModel.skeleton) return;

        // Lazily find and cache spine + head bone TransformNodes
        if (this._spineBoneNodes.length === 0) {
            for (const boneName of LEAN_BONES) {
                for (const bone of charModel.skeleton.bones) {
                    if (bone.name === boneName) {
                        const tn = bone.getTransformNode();
                        if (tn) this._spineBoneNodes.push(tn);
                        break;
                    }
                }
            }
            for (const bone of charModel.skeleton.bones) {
                if (bone.name === "mixamorig:Head") {
                    this._headBoneNode = bone.getTransformNode() ?? null;
                    break;
                }
            }
            if (this._spineBoneNodes.length === 0) return;
        }

        // Get the head's world-space forward direction from its world matrix.
        // Row 2 (index 8-10) of the world matrix is the local Z (forward) axis.
        const headNode = this._headBoneNode ?? this._spineBoneNodes[this._spineBoneNodes.length - 1];
        headNode.computeWorldMatrix(true);
        const world = headNode.getWorldMatrix();
        const m = world.m;
        // Extract forward (Z-axis row) and project onto horizontal plane
        const headFwd = new Vector3(m[8], 0, m[10]);
        if (headFwd.lengthSquared() < 0.001) {
            headFwd.set(0, 0, 1);
        }
        headFwd.normalize();

        // For each spine bone, convert the head-forward axis into the bone's
        // parent local space and rotate around it.
        const perBoneAngle = this._pendingLeanAngle / this._spineBoneNodes.length;

        for (const tn of this._spineBoneNodes) {
            const q = tn.rotationQuaternion;
            if (!q) continue;

            // Get parent's inverse world matrix to transform axis into local space
            const parent = tn.parent as TransformNode | null;
            let leanAxis = headFwd;
            if (parent) {
                parent.computeWorldMatrix(true);
                const parentInv = Matrix.Invert(parent.getWorldMatrix());
                leanAxis = Vector3.TransformNormal(headFwd, parentInv);
                leanAxis.normalize();
            }

            const leanQ = Quaternion.RotationAxis(leanAxis, perBoneAngle);
            tn.rotationQuaternion = leanQ.multiply(q);
        }
    }

    /**
     * Disposes the clone and cleans up.
     */
    public dispose(): void {
        this.despawn();
    }
}
