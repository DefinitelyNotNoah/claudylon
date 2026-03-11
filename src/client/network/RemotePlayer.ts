/**
 * Visual representation of a remote (networked) player.
 * Renders an animated character model with interpolated position/rotation
 * and a third-person weapon model attached to the right hand.
 * Falls back to a visible red capsule if the character model fails to load.
 * @module client/network/RemotePlayer
 */

import { Scene } from "@babylonjs/core/scene";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { PLAYER_STATS } from "../../shared/constants/PlayerConstants.js";
import { WEAPON_STATS } from "../../shared/constants/WeaponConstants.js";
import type { WeaponId } from "../../shared/types/index.js";
import { CharacterModel } from "../characters/CharacterModel.js";
import { getCharacterGlb, DEFAULT_CHARACTER_ID } from "../../shared/constants/CharacterConstants.js";
import { RAGDOLL_ENABLED_KEY } from "../../shared/constants/BotConstants.js";

/** How quickly positions interpolate toward server state. */
const INTERPOLATION_SPEED = 12.0;

/** Third-person weapon scale when parented to root (fallback capsule). */
const WEAPON_SCALE = 20;


/**
 * Fallback weapon anchor position relative to capsule base (cm).
 * Used only when character model fails to load.
 */
const WEAPON_ANCHOR_OFFSET = new Vector3(40, 100, 25);

/**
 * Recoil kick backward offset (bone-local units, negative = toward player).
 * When parented to a bone inside the 100x-scaled character model,
 * these values are in model space (meters), so keep them very small.
 */
const RECOIL_KICK_Z = -0.03;

/** Recoil kick upward offset (bone-local units). */
const RECOIL_KICK_Y = 0.015;

/** How quickly recoil recovers (lerp speed per second). */
const RECOIL_RECOVERY_SPEED = 15.0;

/** Time in seconds to let ragdoll settle before hiding the body. */
const RAGDOLL_SETTLE_TIME = 3.0;


/** Time in seconds to hide body after death animation (fallback, no ragdoll). */
const DEATH_ANIM_HIDE_TIME = 2.0;

/** Spine bones to distribute lean across (Mixamo naming). */
const LEAN_BONES = ["mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2"];

/** Maximum torso lean angle in radians (30°). */
const MODEL_MAX_LEAN_ANGLE = 0.524;

/** Torso lean ratio: scales the received lean amount for visual tuning. */
const TORSO_LEAN_RATIO = 1.45;

/**
 * Renders a remote player with an animated character model and a
 * third-person weapon attached to the right hand bone.
 * An invisible capsule mesh named `remote_body_{sessionId}` is kept
 * for hit detection, preserving the existing raycast contract.
 */
export class RemotePlayer {
    private _scene: Scene;
    private _sessionId: string;
    private _displayName: string;
    private _root: TransformNode;
    private _bodyMesh: Mesh;

    // Character model
    private _characterModel: CharacterModel | null = null;
    private _characterGlb: string;
    private _useFallback: boolean = false;

    // Weapon rendering
    private _weaponAnchor: TransformNode;
    private _weaponMeshes: AbstractMesh[] = [];
    private _currentWeaponId: string = "";
    private _isLoadingWeapon: boolean = false;
    private _isLoadingModel: boolean = false;

    // Weapon recoil animation
    private _recoilZ: number = 0;
    private _recoilY: number = 0;

    private _playerState: string = "Idle";

    // Server state targets
    private _targetX: number = 0;
    private _targetY: number = 0;
    private _targetZ: number = 0;
    private _targetYaw: number = 0;

    // Current interpolated values
    private _currentX: number = 0;
    private _currentY: number = 0;
    private _currentZ: number = 0;
    private _currentYaw: number = 0;

    private _health: number = 100;
    private _isDead: boolean = false;
    private _deathHideTimer: number = -1;
    private _isDormant: boolean = false;

    // Torso lean (synced from network)
    private _pendingLeanAngle: number = 0;
    private _spineBoneNodes: TransformNode[] = [];
    private _headBoneNode: TransformNode | null = null;
    private _afterAnimObserver: Observer<Scene> | null = null;

    /**
     * Creates a remote player visual.
     * @param scene - The Babylon.js scene.
     * @param sessionId - The player's Colyseus session ID.
     * @param displayName - The player's display name.
     * @param initialX - Initial X position (cm).
     * @param initialY - Initial Y position (cm).
     * @param initialZ - Initial Z position (cm).
     * @param characterGlb - Optional GLB asset path for the character model.
     */
    constructor(
        scene: Scene,
        sessionId: string,
        displayName: string,
        initialX: number,
        initialY: number,
        initialZ: number,
        characterGlb?: string,
    ) {
        this._scene = scene;
        this._sessionId = sessionId;
        this._displayName = displayName;
        this._characterGlb = characterGlb ?? getCharacterGlb(DEFAULT_CHARACTER_ID);

        this._targetX = initialX;
        this._targetY = initialY;
        this._targetZ = initialZ;
        this._currentX = initialX;
        this._currentY = initialY;
        this._currentZ = initialZ;

        // Root transform
        this._root = new TransformNode(`remote_player_${sessionId}`, scene);
        this._root.position = new Vector3(initialX, initialY, initialZ);

        // Invisible hitbox capsule (preserves hit detection contract)
        this._bodyMesh = MeshBuilder.CreateCapsule(
            `remote_body_${sessionId}`,
            {
                height: PLAYER_STATS.capsuleHeight,
                radius: PLAYER_STATS.capsuleRadius,
            },
            scene,
        );
        this._bodyMesh.parent = this._root;
        this._bodyMesh.position.y = PLAYER_STATS.capsuleHeight / 2;
        this._bodyMesh.metadata = { isRemoteBody: true };
        this._bodyMesh.isVisible = false;
        this._bodyMesh.isPickable = true;

        // Weapon anchor (temporary position until character model loads)
        this._weaponAnchor = new TransformNode(`remote_weapon_anchor_${sessionId}`, scene);
        this._weaponAnchor.parent = this._root;
        this._weaponAnchor.position = WEAPON_ANCHOR_OFFSET.clone();

        // Start loading the character model asynchronously
        this._initCharacterModel();
    }

    /** The remote player's session ID. */
    public get sessionId(): string {
        return this._sessionId;
    }

    /** The remote player's display name. */
    public get displayName(): string {
        return this._displayName;
    }

    /** Current interpolated position. */
    public get position(): Vector3 {
        return this._root.position;
    }

    /** Current health. */
    public get health(): number {
        return this._health;
    }

    /** Whether this player is currently dead. */
    public get isDead(): boolean {
        return this._isDead;
    }

    /** The underlying character model (for ragdoll impulse, etc.). */
    public get characterModel(): CharacterModel | null {
        return this._characterModel;
    }

    /** Whether this entity is distance-culled (dormant). */
    public get isDormant(): boolean {
        return this._isDormant;
    }

    /**
     * Toggles dormancy for distance culling. When dormant, the character model
     * is hidden, animations are paused, and the hitbox is non-pickable.
     * Position updates from the server still accumulate so the entity snaps
     * to the correct position when waking up.
     * @param dormant - Whether to enter dormant state.
     */
    public setDormant(dormant: boolean): void {
        if (dormant === this._isDormant) return;
        this._isDormant = dormant;
        if (dormant) {
            this._characterModel?.pauseAnimations();
            this._characterModel?.setVisible(false);
            this._setWeaponVisible(false);
            this._bodyMesh.isPickable = false;
        } else if (!this._isDead) {
            this._characterModel?.setVisible(true);
            this._setWeaponVisible(true);
            this._bodyMesh.isPickable = true;
            // Animation resume handled by frustum check in update()
        }
    }

    /**
     * Updates target state from server schema data.
     * @param x - New X position.
     * @param y - New Y position.
     * @param z - New Z position.
     * @param yaw - New yaw rotation.
     * @param health - Current health.
     * @param state - Player state string.
     * @param weaponId - Currently equipped weapon ID.
     * @param leanAmount - Lean amount (-1 full left, 0 upright, 1 full right).
     */
    public updateFromServer(
        x: number,
        y: number,
        z: number,
        yaw: number,
        health: number,
        state: string,
        weaponId: string,
        leanAmount: number = 0,
    ): void {
        this._targetX = x;
        this._targetY = y;
        this._targetZ = z;
        this._targetYaw = yaw;
        this._health = health;
        this._playerState = state;

        // Store pending lean angle — applied after animations via observer
        this._pendingLeanAngle = -leanAmount * MODEL_MAX_LEAN_ANGLE * TORSO_LEAN_RATIO;

        // Forward state to character model for animation
        if (this._characterModel) {
            this._characterModel.setState(state);
        }

        if (state === "Dead" && !this._isDead) {
            // Death is triggered externally via die() with hit direction.
            // If die() was not called before this update (e.g., networked path),
            // trigger it now without a hit direction (falls back to death anim).
            if (!this._isDead) {
                this.die();
            }
        } else if (state !== "Dead" && this._isDead) {
            this._respawn(x, y, z, yaw);
        }

        // Swap weapon model if changed
        if (weaponId && weaponId !== this._currentWeaponId) {
            this._loadWeapon(weaponId);
        }
    }

    /**
     * Per-frame interpolation update. Lerps toward target position/rotation,
     * updates character model animation crossfade, and animates weapon recoil.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        // Skip all per-frame work when distance-culled
        if (this._isDormant) return;

        // Tick death hide timer even while dead
        if (this._isDead) {
            if (this._deathHideTimer > 0) {
                this._deathHideTimer -= dt;
                // Only update animation crossfade if NOT ragdolling
                // (ragdoll physics runs via its own onBeforeRenderObservable)
                if (this._characterModel && !this._characterModel.isRagdolling) {
                    this._characterModel.update(dt);
                }
                if (this._deathHideTimer <= 0) {
                    // Deactivate ragdoll (toggle back to ANIMATED) and hide model.
                    // No physics bodies are destroyed — they'll be reused on next death.
                    const tHide0 = performance.now();
                    if (this._characterModel) {
                        if (this._characterModel.isRagdolling) {
                            this._characterModel.deactivateRagdoll();
                        }
                        const tHide1 = performance.now();
                        this._characterModel.setVisible(false);
                        const tHide2 = performance.now();
                        this._characterModel.setPickable(false);
                        const tHide3 = performance.now();
                        console.log(`[RemotePlayer:hide] ${this._sessionId} | deactivateRagdoll=${(tHide1 - tHide0).toFixed(2)}ms setVisible=${(tHide2 - tHide1).toFixed(2)}ms setPickable=${(tHide3 - tHide2).toFixed(2)}ms total=${(tHide3 - tHide0).toFixed(2)}ms`);
                    }
                }
            }
            return;
        }

        const lerpFactor = Math.min(1, INTERPOLATION_SPEED * dt);

        this._currentX += (this._targetX - this._currentX) * lerpFactor;
        this._currentY += (this._targetY - this._currentY) * lerpFactor;
        this._currentZ += (this._targetZ - this._currentZ) * lerpFactor;
        this._currentYaw += (this._targetYaw - this._currentYaw) * lerpFactor;

        this._root.position.set(this._currentX, this._currentY, this._currentZ);
        this._root.rotation.y = this._currentYaw;

        // Animation LOD: pause skeleton evaluation for bots not in camera view
        if (this._characterModel) {
            if (this._characterModel.isInFrustum) {
                this._characterModel.resumeAnimations();
            } else {
                this._characterModel.pauseAnimations();
            }
            this._characterModel.update(dt);
        }

        // Recoil recovery (applied to weapon anchor position)
        const recoilLerp = Math.min(1, RECOIL_RECOVERY_SPEED * dt);
        this._recoilZ += (0 - this._recoilZ) * recoilLerp;
        this._recoilY += (0 - this._recoilY) * recoilLerp;

        // Apply recoil offset to weapon anchor (only if using bone attachment)
        if (this._characterModel && this._characterModel.rightHandNode) {
            // Weapon anchor is parented to the bone, recoil is local offset
            this._weaponAnchor.position.set(0, this._recoilY, this._recoilZ);
        } else {
            // Fallback: weapon anchor at fixed offset with recoil
            this._weaponAnchor.position.set(
                WEAPON_ANCHOR_OFFSET.x,
                WEAPON_ANCHOR_OFFSET.y + this._recoilY,
                WEAPON_ANCHOR_OFFSET.z + this._recoilZ,
            );
        }
    }

    /**
     * Triggers a recoil kick on the weapon when the remote player fires.
     * Uses bone-local values when attached to character, cm values for fallback.
     */
    public triggerRecoil(): void {
        if (this._characterModel && this._characterModel.rightHandNode) {
            this._recoilZ += RECOIL_KICK_Z;
            this._recoilY += RECOIL_KICK_Y;
        } else {
            this._recoilZ += RECOIL_KICK_Z * 100;
            this._recoilY += RECOIL_KICK_Y * 100;
        }
    }

    /**
     * Triggers death. Activates ragdoll if a hit direction is provided and
     * the character model is loaded, otherwise falls back to a death animation
     * or simply hiding the fallback capsule.
     * @param hitDirection - Optional normalized world-space direction of the killing shot.
     * @param impulseStrength - Ragdoll launch velocity in cm/s (from WeaponStats.ragdollImpulse).
     */
    public die(hitDirection?: Vector3, impulseStrength?: number): void {
        if (this._isDead) return;
        const t0 = performance.now();
        this._isDead = true;
        this._bodyMesh.isPickable = false;
        this._setWeaponVisible(false);
        const t1 = performance.now();

        if (this._characterModel && hitDirection && impulseStrength && this._characterModel.isRagdollInitialized) {
            // Toggle pre-created ragdoll to DYNAMIC mode (no physics body creation)
            this._characterModel.activateRagdoll(hitDirection, impulseStrength);
            const t2 = performance.now();
            this._characterModel.setPickable(true, this._sessionId);
            this._deathHideTimer = RAGDOLL_SETTLE_TIME;
            const t3 = performance.now();
            console.log(`[RemotePlayer:die] ${this._sessionId} | setup=${(t1 - t0).toFixed(2)}ms activateRagdoll=${(t2 - t1).toFixed(2)}ms setPickable=${(t3 - t2).toFixed(2)}ms total=${(t3 - t0).toFixed(2)}ms`);
        } else if (this._characterModel) {
            // No hit direction: play death animation
            this._characterModel.setState("Dead");
            this._deathHideTimer = DEATH_ANIM_HIDE_TIME;
            console.log(`[RemotePlayer:die] ${this._sessionId} | deathAnim total=${(performance.now() - t0).toFixed(2)}ms`);
        } else if (this._useFallback) {
            this._bodyMesh.isVisible = false;
            this._deathHideTimer = -1;
        }
    }

    /**
     * Activates ragdoll as a persistent test dummy. The body stays visible
     * and pickable indefinitely (no despawn timer). Character meshes are
     * made pickable so projectile raycasts can hit them.
     * @param hitDirection - Optional initial impulse direction.
     */
    public dieAsDummy(hitDirection?: Vector3): void {
        if (this._isDead) return;
        this._isDead = true;
        this._bodyMesh.isPickable = false;
        this._setWeaponVisible(false);

        if (this._characterModel && this._characterModel.isRagdollInitialized) {
            if (hitDirection) {
                this._characterModel.activateRagdoll(hitDirection, 1000);
            } else {
                // Activate ragdoll with zero impulse (just collapse)
                this._characterModel.activateRagdoll(Vector3.Down(), 0);
            }
            // Make character meshes pickable so projectiles can hit the ragdoll
            this._characterModel.setPickable(true, this._sessionId);
            // No hide timer — dummy stays forever
            this._deathHideTimer = -1;
        } else if (this._characterModel) {
            // Ragdoll not initialized — fall back to death animation
            this._characterModel.setState("Dead");
            this._deathHideTimer = -1;
        } else {
            console.warn(`[RemotePlayer] dieAsDummy: No character model loaded yet for ${this._sessionId}`);
        }
    }

    /**
     * Handles respawn: cleans up ragdoll, recreates the character model
     * (since ragdoll severs bone links), and snaps to spawn position.
     * @param x - Spawn X position.
     * @param y - Spawn Y position.
     * @param z - Spawn Z position.
     * @param yaw - Spawn yaw rotation.
     */
    private _respawn(x: number, y: number, z: number, yaw: number): void {
        const tR0 = performance.now();
        this._isDead = false;
        this._deathHideTimer = -1;

        // Snap position to spawn point
        this._currentX = x;
        this._currentY = y;
        this._currentZ = z;
        this._currentYaw = yaw;
        this._root.position.set(x, y, z);
        this._root.rotation.y = yaw;

        this._bodyMesh.isPickable = true;
        this._setWeaponVisible(true);
        const tR1 = performance.now();

        if (this._characterModel) {
            const wasRagdolling = this._characterModel.isRagdolling;
            // Deactivate ragdoll if still active (toggles back to ANIMATED mode,
            // no physics bodies destroyed — they stay in memory for reuse)
            if (wasRagdolling) {
                this._characterModel.deactivateRagdoll();
            }
            const tR2 = performance.now();
            this._characterModel.setPickable(false);
            const tR3 = performance.now();
            this._characterModel.setVisible(true);
            const tR4 = performance.now();
            this._characterModel.setState("Idle");
            const tR5 = performance.now();
            console.log(`[RemotePlayer:respawn] ${this._sessionId} | wasRagdolling=${wasRagdolling} setup=${(tR1 - tR0).toFixed(2)}ms deactivateRagdoll=${(tR2 - tR1).toFixed(2)}ms setPickable=${(tR3 - tR2).toFixed(2)}ms setVisible=${(tR4 - tR3).toFixed(2)}ms setState=${(tR5 - tR4).toFixed(2)}ms total=${(tR5 - tR0).toFixed(2)}ms`);
            console.log(`[RemotePlayer:respawn] rootPos=(${this._root.position.x.toFixed(0)}, ${this._root.position.y.toFixed(0)}, ${this._root.position.z.toFixed(0)}) modelRoot=(${this._characterModel.root.position.x.toFixed(1)}, ${this._characterModel.root.position.y.toFixed(1)}, ${this._characterModel.root.position.z.toFixed(1)}) modelRootRotY=${this._characterModel.root.rotation.y.toFixed(3)} isRagdolling=${this._characterModel.isRagdolling}`);
        } else if (this._useFallback) {
            this._bodyMesh.isVisible = true;
        }
    }

    /**
     * Asynchronously loads and initializes the character model.
     * Retries on failure (e.g., concurrent XHR race condition) before
     * falling back to a visible red capsule.
     */
    private async _initCharacterModel(): Promise<void> {
        if (this._isLoadingModel) return;
        this._isLoadingModel = true;

        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 300;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const model = await CharacterModel.create(this._scene, this._root, this._characterGlb);
                if (!model) {
                    this._enableFallback();
                    this._isLoadingModel = false;
                    return;
                }

                this._characterModel = model;

                // Register post-animation observer for torso lean
                if (!this._afterAnimObserver) {
                    this._afterAnimObserver = this._scene.onAfterAnimationsObservable.add(() => {
                        this._applyTorsoLean();
                    });
                }

                // Attach weapon anchor to right-hand bone if available
                const handNode = model.rightHandNode;
                if (handNode) {
                    this._weaponAnchor.parent = handNode;
                    this._weaponAnchor.position = Vector3.Zero();

                    // Re-apply per-weapon transform if weapon was already loaded
                    if (this._weaponMeshes.length > 0 && this._currentWeaponId) {
                        const stats = WEAPON_STATS[this._currentWeaponId as WeaponId];
                        if (stats) {
                            const weaponRoot = this._weaponMeshes[0] as unknown as TransformNode;
                            const tp = stats.tpPosition;
                            weaponRoot.position = new Vector3(tp.x, tp.y, tp.z);
                            weaponRoot.rotationQuaternion = null;
                            const tr = stats.tpRotation;
                            weaponRoot.rotation = new Vector3(tr.x, tr.y, tr.z);
                            const s = stats.tpScale;
                            weaponRoot.scaling = new Vector3(s, s, s);
                        }
                    }
                }

                // Pre-create ragdoll physics bodies (ANIMATED mode, no perf cost on death)
                const ragdollEnabled = localStorage.getItem(RAGDOLL_ENABLED_KEY) !== "false";
                if (ragdollEnabled) {
                    model.initializeRagdoll();
                }

                // Forward current state to trigger animation
                if (this._playerState) {
                    model.setState(this._playerState);
                }

                // Hide model if already dead
                if (this._isDead) {
                    model.setVisible(false);
                }

                this._isLoadingModel = false;
                return;
            } catch (err) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
                } else {
                    console.warn(`[RemotePlayer] Character model failed for ${this._sessionId} after ${MAX_RETRIES + 1} attempts:`, err);
                    this._enableFallback();
                }
            }
        }

        this._isLoadingModel = false;
    }

    /**
     * Enables the fallback red capsule when character model fails.
     */
    private _enableFallback(): void {
        this._useFallback = true;
        this._bodyMesh.isVisible = true;

        const mat = new StandardMaterial(`mat_remote_${this._sessionId}`, this._scene);
        mat.diffuseColor = new Color3(0.8, 0.2, 0.2);
        this._bodyMesh.material = mat;

        // Reset weapon anchor to fixed offset (no bone attachment)
        this._weaponAnchor.parent = this._root;
        this._weaponAnchor.position = WEAPON_ANCHOR_OFFSET.clone();
    }

    /**
     * Loads and attaches a third-person weapon model.
     * @param weaponId - The weapon ID to load.
     */
    private async _loadWeapon(weaponId: string): Promise<void> {
        if (this._isLoadingWeapon) return;

        const stats = WEAPON_STATS[weaponId as WeaponId];
        if (!stats) return;

        this._isLoadingWeapon = true;
        this._currentWeaponId = weaponId;

        // Dispose old weapon meshes
        this._disposeWeaponMeshes();

        try {
            const url = `assets/weapons/${stats.modelFile}`;
            const result = await ImportMeshAsync(url, this._scene, {});

            // Verify we still want this weapon (may have changed during async load)
            if (this._currentWeaponId !== weaponId) {
                for (const mesh of result.meshes) {
                    mesh.dispose();
                }
                this._isLoadingWeapon = false;
                return;
            }

            this._weaponMeshes = result.meshes as AbstractMesh[];

            const root = result.meshes[0] as unknown as TransformNode;
            root.parent = this._weaponAnchor;
            root.rotationQuaternion = null;

            if (this._characterModel?.rightHandNode) {
                // Bone-attached: use per-weapon third-person transform
                const tp = stats.tpPosition;
                root.position = new Vector3(tp.x, tp.y, tp.z);
                const tr = stats.tpRotation;
                root.rotation = new Vector3(tr.x, tr.y, tr.z);
                const s = stats.tpScale;
                root.scaling = new Vector3(s, s, s);
            } else {
                // Fallback capsule: use generic transform
                root.position = Vector3.Zero();
                root.rotation = new Vector3(0, -Math.PI / 2, 0);
                root.scaling = new Vector3(WEAPON_SCALE, WEAPON_SCALE, WEAPON_SCALE);
            }

            // Make weapon meshes non-pickable and rename with prefix
            for (let mi = 0; mi < this._weaponMeshes.length; mi++) {
                const mesh = this._weaponMeshes[mi];
                mesh.isPickable = false;
                mesh.name = `remote_weapon_${this._sessionId}_${mi}`;
                mesh.metadata = { isRemoteWeapon: true };
            }

            // Hide if currently dead
            if (this._isDead) {
                this._setWeaponVisible(false);
            }
        } catch (err) {
            console.warn(`[RemotePlayer] Failed to load weapon ${weaponId}:`, err);
        }

        this._isLoadingWeapon = false;
    }

    /**
     * Shows or hides all weapon meshes.
     * @param visible - Whether weapon should be visible.
     */
    private _setWeaponVisible(visible: boolean): void {
        for (const mesh of this._weaponMeshes) {
            if (mesh instanceof AbstractMesh) {
                mesh.isVisible = visible;
            }
        }
    }

    /**
     * Disposes the currently loaded weapon meshes.
     */
    private _disposeWeaponMeshes(): void {
        for (const mesh of this._weaponMeshes) {
            mesh.dispose();
        }
        this._weaponMeshes = [];
    }

    /**
     * Applies torso lean rotation distributed across spine bones after skeleton
     * animation evaluation. Uses the same technique as MirrorClone._applyLeanToBone:
     * derives the lean axis from the Head bone's world-space forward direction and
     * distributes the angle across Spine, Spine1, Spine2 for a natural curve.
     */
    private _applyTorsoLean(): void {
        if (!this._characterModel || !this._characterModel.skeleton) return;
        if (Math.abs(this._pendingLeanAngle) < 0.001) return;

        // Lazily find and cache spine + head bone TransformNodes
        if (this._spineBoneNodes.length === 0) {
            for (const boneName of LEAN_BONES) {
                for (const bone of this._characterModel.skeleton.bones) {
                    if (bone.name === boneName) {
                        const tn = bone.getTransformNode();
                        if (tn) this._spineBoneNodes.push(tn);
                        break;
                    }
                }
            }
            for (const bone of this._characterModel.skeleton.bones) {
                if (bone.name === "mixamorig:Head") {
                    this._headBoneNode = bone.getTransformNode() ?? null;
                    break;
                }
            }
            if (this._spineBoneNodes.length === 0) return;
        }

        // Derive lean axis from Head bone world-space forward (row 2 of world matrix)
        const headNode = this._headBoneNode ?? this._spineBoneNodes[this._spineBoneNodes.length - 1];
        headNode.computeWorldMatrix(true);
        const world = headNode.getWorldMatrix();
        const m = world.m;
        const headFwd = new Vector3(m[8], 0, m[10]);
        if (headFwd.lengthSquared() < 0.001) {
            headFwd.set(0, 0, 1);
        }
        headFwd.normalize();

        const perBoneAngle = this._pendingLeanAngle / this._spineBoneNodes.length;

        for (const tn of this._spineBoneNodes) {
            const q = tn.rotationQuaternion;
            if (!q) continue;

            // Transform lean axis into this bone's parent local space
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
     * Disposes the remote player's meshes, character model, and nodes.
     */
    public dispose(): void {
        if (this._afterAnimObserver) {
            this._scene.onAfterAnimationsObservable.remove(this._afterAnimObserver);
            this._afterAnimObserver = null;
        }
        this._spineBoneNodes = [];
        this._headBoneNode = null;

        this._disposeWeaponMeshes();
        this._weaponAnchor.dispose();

        if (this._characterModel) {
            this._characterModel.dispose();
            this._characterModel = null;
        }

        this._bodyMesh.material?.dispose();
        this._bodyMesh.dispose();
        this._root.dispose();
    }
}
