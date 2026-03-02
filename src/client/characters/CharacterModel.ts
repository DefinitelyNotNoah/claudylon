/**
 * Loads and manages an animated Mixamo character model.
 * Each instance loads the character GLB via ImportMeshAsync (browser-cached after preload).
 * Animations are loaded per-instance via LoadAssetContainerAsync and retargeted
 * by directly reassigning animation targets to this instance's bone TransformNodes.
 * @module client/characters/CharacterModel
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ImportMeshAsync, LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { Ragdoll, RagdollBoneProperties } from "@babylonjs/core/Physics/v2/ragdoll";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { RAGDOLL_BONE_CONFIG, RAGDOLL_UPWARD_BIAS } from "./RagdollConfig";
import { COLLISION_GROUP_RAGDOLL, COLLISION_MASK_RAGDOLL } from "../../shared/constants/CollisionGroups";
import { CHARACTER_MODELS, DEFAULT_CHARACTER_ID, getCharacterGlb } from "../../shared/constants/CharacterConstants";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";

/** Default character GLB path (used when no glbPath is provided). */
const DEFAULT_CHARACTER_GLB = getCharacterGlb(DEFAULT_CHARACTER_ID);

/** Base path for animation GLB files. */
const ANIMATION_DIR = "assets/characters/animations";

/** Scale factor: character GLB is in meters, game is in centimeters. */
const MODEL_SCALE = 100;

/** Crossfade duration in seconds. */
const CROSSFADE_DURATION = 0.3;

/** Minimum time a state must be held before allowing another transition (seconds). */
const MIN_STATE_HOLD_TIME = 0.15;

/** Name of the Hips bone (Mixamo convention). */
const HIPS_BONE_NAME = "mixamorig:Hips";

/** Name of the right-hand bone for weapon attachment. */
const RIGHT_HAND_BONE_NAME = "mixamorig:RightHand";

/**
 * Animation definition: maps a key to a file and loop setting.
 */
interface AnimationDef {
    /** GLB filename (without path). */
    file: string;
    /** Whether the animation should loop. */
    loop: boolean;
}

/**
 * State-to-animation mapping.
 * Keys match PlayerStateEnum string values.
 */
const STATE_ANIMATIONS: Record<string, AnimationDef> = {
    Idle:    { file: "idle.glb",                   loop: true  },
    Walking: { file: "run_forward.glb",            loop: true  },
    Jumping: { file: "jump_up.glb",                loop: false },
    Falling: { file: "jump_loop.glb",              loop: true  },
    Dead:    { file: "death_from_the_front.glb",   loop: false },
};

/**
 * Manages a single animated character instance.
 * Call `CharacterModel.preload(scene)` once before creating instances.
 */
export class CharacterModel {
    // ─── Static cache (keyed by GLB path) ─────────────────────────────
    private static _containers: Map<string, AssetContainer> = new Map();
    private static _preloadPromises: Map<string, Promise<void>> = new Map();
    /** Queue to serialize create() calls and avoid concurrent XHR storms. */
    private static _createQueue: Promise<CharacterModel | null> = Promise.resolve(null);

    // ─── Instance ────────────────────────────────────────────────────
    private _scene: Scene;
    private _root: TransformNode;
    private _meshes: AbstractMesh[] = [];
    private _skeleton: Skeleton | null = null;
    private _rightHandBone: Bone | null = null;
    private _rightHandNode: TransformNode | null = null;

    // Animation state
    private _animGroups: Map<string, AnimationGroup> = new Map();
    private _animContainers: AssetContainer[] = [];
    private _currentState: string = "";
    private _currentGroup: AnimationGroup | null = null;
    private _crossfadeFrom: AnimationGroup | null = null;
    private _crossfadeElapsed: number = 0;
    private _isCrossfading: boolean = false;
    private _stateHoldTimer: number = 0;

    // Ragdoll state
    private _ragdoll: Ragdoll | null = null;
    private _isRagdolling: boolean = false;
    private _ragdollTrackObserver: any = null;
    private _boneLinks: Map<Bone, TransformNode> = new Map();
    private _ragdollInitialized: boolean = false;

    // Debug collider visualization
    private _debugBoneBoxes: Mesh[] = [];
    private _debugMeshBoxes: Mesh[] = [];
    private _debugSkeletonSpheres: Mesh[] = [];
    private _debugEnabled: boolean = false;
    private _debugObserver: any = null;

    private _disposed: boolean = false;

    /**
     * Private constructor — use `CharacterModel.create()` to instantiate.
     */
    private constructor(scene: Scene, root: TransformNode) {
        this._scene = scene;
        this._root = root;
    }

    // ─── Static Methods ──────────────────────────────────────────────

    /**
     * Preloads a character GLB into an AssetContainer (browser-cached).
     * Call once per model before creating instances.
     * @param scene - The Babylon.js scene.
     * @param glbPath - GLB asset path (defaults to the default character).
     */
    public static async preload(scene: Scene, glbPath: string = DEFAULT_CHARACTER_GLB): Promise<void> {
        if (CharacterModel._containers.has(glbPath)) return;
        if (CharacterModel._preloadPromises.has(glbPath)) {
            await CharacterModel._preloadPromises.get(glbPath);
            return;
        }

        const promise = (async () => {
            console.log(`[CharacterModel] Preloading ${glbPath}...`);
            const container = await LoadAssetContainerAsync(glbPath, scene);
            CharacterModel._containers.set(glbPath, container);
            console.log(`[CharacterModel] ${glbPath} loaded.`);
        })();
        CharacterModel._preloadPromises.set(glbPath, promise);

        await promise;
    }

    /**
     * Preloads all registered character models.
     * @param scene - The Babylon.js scene.
     */
    public static async preloadAll(scene: Scene): Promise<void> {
        await Promise.all(
            CHARACTER_MODELS.map((m) => CharacterModel.preload(scene, m.glb)),
        );
    }

    /**
     * Creates a new character model instance via ImportMeshAsync.
     * Serialized through a queue so only one model loads at a time,
     * preventing concurrent XHR storms that cause load failures.
     * @param scene - The Babylon.js scene.
     * @param parent - Parent TransformNode to attach the character to.
     * @param glbPath - GLB asset path (defaults to the default character).
     * @returns The CharacterModel instance, or null on failure.
     */
    public static async create(scene: Scene, parent: TransformNode, glbPath: string = DEFAULT_CHARACTER_GLB): Promise<CharacterModel | null> {
        // Chain onto the queue so creates run one at a time
        const promise = CharacterModel._createQueue.then(
            () => CharacterModel._createInternal(scene, parent, glbPath),
            () => CharacterModel._createInternal(scene, parent, glbPath),
        );
        CharacterModel._createQueue = promise;
        return promise;
    }

    /**
     * Internal create implementation. Loads mesh, skeleton, and animations.
     * @param glbPath - GLB asset path to load.
     */
    private static async _createInternal(scene: Scene, parent: TransformNode, glbPath: string): Promise<CharacterModel | null> {
        const result = await ImportMeshAsync(glbPath, scene, {});

        const modelRoot = result.meshes[0] as unknown as TransformNode;
        if (!modelRoot) {
            console.warn("[CharacterModel] No root node from ImportMeshAsync.");
            return null;
        }

        modelRoot.name = `character_${parent.name}`;

        // Parent and scale
        modelRoot.parent = parent;
        modelRoot.position = Vector3.Zero();
        modelRoot.rotationQuaternion = null;
        modelRoot.rotation = Vector3.Zero();
        modelRoot.scaling = new Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        const model = new CharacterModel(scene, modelRoot);

        // Store skeleton
        if (result.skeletons.length > 0) {
            model._skeleton = result.skeletons[0];

            // Find right-hand bone and read Hips rest Y
            for (const bone of model._skeleton.bones) {
                if (bone.name === RIGHT_HAND_BONE_NAME) {
                    model._rightHandBone = bone;
                    model._rightHandNode = bone.getTransformNode() ?? null;
                }
                if (bone.name === HIPS_BONE_NAME) {
                    // Read rest-pose Hips Y (model space, meters) to offset model root.
                    // Root motion stripping zeros the Hips position, so we compensate
                    // by shifting the model root up by the rest-pose Hips height (in cm).
                    const hipsNode = bone.getTransformNode();
                    if (hipsNode) {
                        modelRoot.position.y = hipsNode.position.y * MODEL_SCALE;
                    }
                }
            }
        }

        // Collect all meshes — non-pickable, allow frustum culling
        const allMeshes = modelRoot.getChildMeshes(false);
        let totalVerts = 0;
        for (const mesh of allMeshes) {
            mesh.isPickable = false;
            totalVerts += mesh.getTotalVertices();
            model._meshes.push(mesh);
        }
        console.log(`[CharacterModel] ${modelRoot.name}: ${allMeshes.length} meshes, ${totalVerts} total vertices`);

        // Load and retarget all animations
        await model._loadAnimations();

        return model;
    }

    /**
     * Clears the static caches. Call when leaving the match scene.
     */
    public static clearCache(): void {
        for (const container of CharacterModel._containers.values()) {
            container.dispose();
        }
        CharacterModel._containers.clear();
        CharacterModel._preloadPromises.clear();
        CharacterModel._createQueue = Promise.resolve(null);
    }

    // ─── Instance Methods ────────────────────────────────────────────

    /**
     * Pre-creates ragdoll physics bodies and constraints once during model init.
     * Bodies start in ANIMATED (kinematic) mode, tracking the skeleton each frame.
     * On death, bodies toggle to DYNAMIC; on respawn, back to ANIMATED.
     * This avoids the expensive create/dispose cycle every death/respawn.
     */
    public initializeRagdoll(): void {
        if (this._ragdollInitialized || !this._skeleton) return;

        // Store bone→TransformNode mappings (needed to re-link after ragdoll)
        for (const bone of this._skeleton.bones) {
            const tn = bone.getTransformNode();
            if (tn) this._boneLinks.set(bone, tn);
        }

        // Force world matrix update so Ragdoll reads correct bone positions
        this._root.computeWorldMatrix(true);

        // Create Ragdoll (constructor creates aggregates in ANIMATED mode
        // and disabled constraints; its observer syncs bones→physics each frame)
        this._ragdoll = new Ragdoll(
            this._skeleton,
            this._root,
            RAGDOLL_BONE_CONFIG as RagdollBoneProperties[],
        );

        // Disable collisions while in ANIMATED mode — the bodies exist in the
        // physics world but must not interact with anything (especially the bot's
        // own PhysicsCharacterController). Collisions are re-enabled in activateRagdoll().
        const boneCount = RAGDOLL_BONE_CONFIG.length;
        for (let i = 0; i < boneCount; i++) {
            const agg = this._ragdoll.getAggregate(i);
            if (agg?.body?.shape) {
                agg.body.shape.filterMembershipMask = 0;
                agg.body.shape.filterCollideMask = 0;
            }
        }

        this._ragdollInitialized = true;
    }

    /** The root TransformNode of this character model. */
    public get root(): TransformNode {
        return this._root;
    }

    /** The right-hand bone TransformNode for weapon attachment. */
    public get rightHandNode(): TransformNode | null {
        return this._rightHandNode;
    }

    /** The skeleton instance (needed by Ragdoll constructor). */
    public get skeleton(): Skeleton | null {
        return this._skeleton;
    }

    /** Whether this character is currently in ragdoll mode. */
    public get isRagdolling(): boolean {
        return this._isRagdolling;
    }

    /** Whether ragdoll physics bodies have been created for this model. */
    public get isRagdollInitialized(): boolean {
        return this._ragdollInitialized;
    }

    /**
     * Returns true if any of this character's meshes are inside the camera frustum.
     * Used for animation LOD — off-screen bots can skip skeleton evaluation.
     */
    public get isInFrustum(): boolean {
        const planes = this._scene.frustumPlanes;
        if (!planes || planes.length === 0) return true;
        for (const mesh of this._meshes) {
            if (mesh.isInFrustum(planes)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Sets the character's animation state. Triggers crossfade if the state changes.
     * @param state - PlayerStateEnum string value (e.g., "Idle", "Walking").
     */
    public setState(state: string): void {
        if (state === this._currentState || this._disposed) return;

        // Prevent rapid state oscillation (except for Dead which is always immediate)
        if (state !== "Dead" && this._stateHoldTimer > 0) return;

        const group = this._animGroups.get(state);
        if (!group) return;

        const def = STATE_ANIMATIONS[state];
        if (!def) return;

        // Start crossfade from current to new
        if (this._currentGroup) {
            this._crossfadeFrom = this._currentGroup;
            this._crossfadeElapsed = 0;
            this._isCrossfading = true;
        }

        this._currentState = state;
        this._currentGroup = group;
        this._stateHoldTimer = MIN_STATE_HOLD_TIME;

        // Start the new animation
        group.start(def.loop, 1.0);
        group.weight = this._crossfadeFrom ? 0 : 1;

        // For death animation: don't loop, hold last frame
        if (state === "Dead") {
            group.loopAnimation = false;
        }

        // If animations are paused (off-screen LOD), immediately pause the newly started group
        if (this._animsPaused) {
            group.pause();
        }
    }

    /**
     * Stops all running animations and resets crossfade state.
     * The character freezes in their current pose (bones retain last keyframe).
     * Used to freeze the character immediately on death before deferring
     * ragdoll physics creation to the next frame.
     */
    public stopAnimations(): void {
        for (const ag of this._animGroups.values()) {
            ag.stop();
            ag.weight = 0;
        }
        this._isCrossfading = false;
        this._crossfadeFrom = null;
        this._currentGroup = null;
        this._currentState = "";
    }

    /** Whether animations are currently paused for LOD purposes. */
    private _animsPaused: boolean = false;

    /**
     * Pauses all running animation groups to save CPU.
     * Used for off-screen or distant bots. Skeleton evaluation
     * is skipped by Babylon when no animation groups are playing.
     */
    public pauseAnimations(): void {
        if (this._animsPaused) return;
        this._animsPaused = true;
        for (const ag of this._animGroups.values()) {
            if (ag.isPlaying) {
                ag.pause();
            }
        }
    }

    /**
     * Resumes previously paused animation groups.
     */
    public resumeAnimations(): void {
        if (!this._animsPaused) return;
        this._animsPaused = false;
        // Resume the current animation (and crossfade source if active)
        if (this._currentGroup && !this._currentGroup.isPlaying) {
            this._currentGroup.play(this._currentGroup.loopAnimation);
        }
        if (this._crossfadeFrom && !this._crossfadeFrom.isPlaying) {
            this._crossfadeFrom.play(this._crossfadeFrom.loopAnimation);
        }
    }

    /** Whether animations are paused for LOD. */
    public get isAnimationPaused(): boolean {
        return this._animsPaused;
    }

    /**
     * Per-frame update. Handles crossfade weight blending.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        if (this._disposed) return;

        // Tick down state hold timer
        if (this._stateHoldTimer > 0) {
            this._stateHoldTimer -= dt;
        }

        if (!this._isCrossfading) return;

        this._crossfadeElapsed += dt;
        const t = Math.min(1, this._crossfadeElapsed / CROSSFADE_DURATION);

        if (this._currentGroup) {
            this._currentGroup.weight = t;
        }
        if (this._crossfadeFrom) {
            this._crossfadeFrom.weight = 1 - t;
        }

        if (t >= 1) {
            // Crossfade complete — stop old animation
            if (this._crossfadeFrom) {
                this._crossfadeFrom.stop();
                this._crossfadeFrom.weight = 0;
            }
            this._crossfadeFrom = null;
            this._isCrossfading = false;
        }
    }

    /**
     * Toggles the pre-created ragdoll from ANIMATED to DYNAMIC mode.
     * Stops animations, severs bone links, enables constraints, and
     * applies a launch impulse. No physics bodies are created — they
     * were pre-created in initializeRagdoll().
     * @param hitDirection - Normalized world-space direction the hit came from.
     * @param impulseStrength - Magnitude of the impulse to apply (cm/s).
     */
    public activateRagdoll(hitDirection: Vector3, impulseStrength: number): void {
        if (this._isRagdolling || this._disposed || !this._ragdoll) return;

        try {
            const tA0 = performance.now();
            const rootParent = this._root.parent as TransformNode | null;

            // Bake parent yaw into model root so Ragdoll sees correct orientation
            if (rootParent) {
                this._root.rotation.y += rootParent.rotation.y;
                rootParent.rotation.y = 0;
                this._root.computeWorldMatrix(true);
            }
            const tA1 = performance.now();

            // Stop animations — character freezes in current pose
            this.stopAnimations();
            const tA2 = performance.now();

            // ── TOGGLE TO DYNAMIC MODE ──
            // Sever all bone links so physics drives the mesh
            for (const bone of this._skeleton!.bones) {
                bone.linkTransformNode(null);
            }
            const tA3 = performance.now();

            // Enable constraints + set bodies DYNAMIC
            const ragdollAny = this._ragdoll as any;
            for (let i = 0; i < ragdollAny._constraints.length; i++) {
                ragdollAny._constraints[i].isEnabled = true;
            }
            const tA4 = performance.now();

            const boneCount = RAGDOLL_BONE_CONFIG.length;
            for (let i = 0; i < boneCount; i++) {
                const agg = this._ragdoll.getAggregate(i);
                if (agg?.body) {
                    agg.body.setMotionType(PhysicsMotionType.DYNAMIC);
                }
            }
            const tA5 = performance.now();

            // Enable collisions now that ragdoll is active
            for (let i = 0; i < boneCount; i++) {
                const agg = this._ragdoll.getAggregate(i);
                if (agg?.body?.shape) {
                    agg.body.shape.filterMembershipMask = COLLISION_GROUP_RAGDOLL;
                    agg.body.shape.filterCollideMask = COLLISION_MASK_RAGDOLL;
                }
            }

            // Switch Ragdoll's internal sync to physics→bones
            ragdollAny._ragdollMode = true;
            this._isRagdolling = true;

            console.log(`[CharacterModel:activate] bakeYaw=${(tA1 - tA0).toFixed(2)}ms stopAnims=${(tA2 - tA1).toFixed(2)}ms severBones=${(tA3 - tA2).toFixed(2)}ms enableConstraints=${(tA4 - tA3).toFixed(2)}ms setDynamic=${(tA5 - tA4).toFixed(2)}ms total=${(tA5 - tA0).toFixed(2)}ms`);

            // Track hips body delta to move parent root
            const hipsBody = this._ragdoll.getAggregate(0)?.body;
            const initialHipsPos = hipsBody
                ? hipsBody.transformNode.absolutePosition.clone()
                : null;
            const parentStartPos = rootParent?.position.clone() ?? null;

            this._ragdollTrackObserver = this._scene.onAfterRenderObservable.add(() => {
                if (!hipsBody || !initialHipsPos || !rootParent || !parentStartPos) return;
                if (this._disposed || !this._isRagdolling) return;
                const delta = hipsBody.transformNode.absolutePosition.subtract(initialHipsPos);
                rootParent.position.copyFrom(parentStartPos.add(delta));
            });

            // ── LAUNCH VELOCITY (deferred 2 frames for Havok transition) ──
            const launchDir = new Vector3(
                hitDirection.x,
                hitDirection.y + RAGDOLL_UPWARD_BIAS,
                hitDirection.z,
            ).normalize();
            const launchVelocity = launchDir.scale(impulseStrength);
            const ragdoll = this._ragdoll;
            let frameDelay = 2;
            const obs = this._scene.onBeforeRenderObservable.add(() => {
                frameDelay--;
                if (frameDelay > 0) return;
                this._scene.onBeforeRenderObservable.remove(obs);
                if (!ragdoll || this._disposed) return;

                for (let i = 0; i < boneCount; i++) {
                    const agg = ragdoll.getAggregate(i);
                    if (agg?.body) agg.body.setLinearVelocity(launchVelocity);
                }
                const LIMB_ANGULAR_SPEED = 8;
                for (let i = 6; i < boneCount; i++) {
                    const agg = ragdoll.getAggregate(i);
                    if (agg?.body) {
                        agg.body.setAngularVelocity(new Vector3(
                            (Math.random() - 0.5) * LIMB_ANGULAR_SPEED,
                            (Math.random() - 0.5) * LIMB_ANGULAR_SPEED,
                            (Math.random() - 0.5) * LIMB_ANGULAR_SPEED,
                        ));
                    }
                }
            });
        } catch (err) {
            console.warn("[CharacterModel] Failed to activate ragdoll:", err);
            this._isRagdolling = false;
        }
    }

    /**
     * Applies an impulse to the ragdoll bone nearest to a world-space point.
     * Uses skeleton bone positions (same space as the visible mesh) to find
     * the nearest bone, then applies velocity to the corresponding physics body.
     * @param worldPoint - The world-space hit position (on the character mesh).
     * @param direction - Normalized impulse direction.
     * @param strength - Impulse magnitude (cm/s velocity).
     * @returns The name of the bone that was hit, or null if ragdoll is inactive.
     */
    public applyImpulseAtPoint(worldPoint: Vector3, direction: Vector3, strength: number): string | null {
        if (!this._isRagdolling || !this._ragdoll) return null;

        const boneCount = RAGDOLL_BONE_CONFIG.length;
        let closestIndex = -1;
        let closestDistSq = Infinity;

        // Find nearest bone using RAGDOLL PHYSICS BODY positions.
        // After ragdoll() is called, bone.getTransformNode() returns null for
        // all bones (linkTransformNode(null) severs them), so we must use the
        // physics body transform nodes which DO have valid world positions.
        for (let i = 0; i < boneCount; i++) {
            const agg = this._ragdoll.getAggregate(i);
            if (!agg?.body) continue;

            const bodyWorldPos = agg.body.transformNode.absolutePosition;
            const distSq = Vector3.DistanceSquared(worldPoint, bodyWorldPos);
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestIndex = i;
            }
        }

        if (closestIndex < 0) return null;

        // Apply velocity to the closest bone's physics body.
        const velocityVec = direction.scale(strength);
        const closestAgg = this._ragdoll.getAggregate(closestIndex);
        if (closestAgg?.body) {
            closestAgg.body.setLinearVelocity(velocityVec);
        }

        return RAGDOLL_BONE_CONFIG[closestIndex].bone ?? `bone_${closestIndex}`;
    }

    /**
     * Makes all character meshes pickable or non-pickable.
     * Optionally tags them with metadata for hit identification.
     * @param pickable - Whether meshes should be pickable.
     * @param ownerId - Optional owner session ID to tag meshes with.
     */
    public setPickable(pickable: boolean, ownerId?: string): void {
        for (const mesh of this._meshes) {
            mesh.isPickable = pickable;
            if (ownerId) {
                mesh.metadata = { ...mesh.metadata, ragdollOwner: ownerId };
            }
        }
    }

    /**
     * Toggles the ragdoll from DYNAMIC back to ANIMATED mode.
     * Re-links bones so animations can drive the skeleton again.
     * Called on respawn — no physics bodies are destroyed.
     */
    public deactivateRagdoll(): void {
        if (!this._isRagdolling || !this._ragdoll) return;
        const tD0 = performance.now();

        // Remove root tracking observer
        if (this._ragdollTrackObserver) {
            this._scene.onAfterRenderObservable.remove(this._ragdollTrackObserver);
            this._ragdollTrackObserver = null;
        }

        const boneCount = RAGDOLL_BONE_CONFIG.length;

        // Zero all velocities so bodies don't carry momentum into next death
        for (let i = 0; i < boneCount; i++) {
            const agg = this._ragdoll.getAggregate(i);
            if (agg?.body) {
                agg.body.setLinearVelocity(Vector3.Zero());
                agg.body.setAngularVelocity(Vector3.Zero());
            }
        }
        const tD1 = performance.now();

        // Re-link bones to their original TransformNodes
        for (const [bone, tn] of this._boneLinks) {
            bone.linkTransformNode(tn);
        }
        const tD2 = performance.now();

        // Disable constraints + set bodies back to ANIMATED (kinematic)
        const ragdollAny = this._ragdoll as any;
        for (let i = 0; i < ragdollAny._constraints.length; i++) {
            ragdollAny._constraints[i].isEnabled = false;
        }
        const tD3 = performance.now();

        for (let i = 0; i < boneCount; i++) {
            const agg = this._ragdoll.getAggregate(i);
            if (agg?.body) {
                agg.body.setMotionType(PhysicsMotionType.ANIMATED);
            }
        }
        const tD4 = performance.now();

        // Disable collisions so ANIMATED bodies don't interfere with character controllers
        for (let i = 0; i < boneCount; i++) {
            const agg = this._ragdoll.getAggregate(i);
            if (agg?.body?.shape) {
                agg.body.shape.filterMembershipMask = 0;
                agg.body.shape.filterCollideMask = 0;
            }
        }

        // Switch Ragdoll's internal sync back to bones→physics
        ragdollAny._ragdollMode = false;

        // Reset model root rotation (parent handles yaw)
        this._root.rotation.y = 0;

        // Force world matrix update so skeleton and meshes snap to new position
        this._root.computeWorldMatrix(true);

        this._isRagdolling = false;
        console.log(`[CharacterModel:deactivate] zeroVelocities=${(tD1 - tD0).toFixed(2)}ms relinkBones=${(tD2 - tD1).toFixed(2)}ms disableConstraints=${(tD3 - tD2).toFixed(2)}ms setAnimated=${(tD4 - tD3).toFixed(2)}ms total=${(tD4 - tD0).toFixed(2)}ms`);
    }

    /**
     * Disposes the ragdoll physics bodies and constraints permanently.
     * Called during full model cleanup (dispose).
     */
    public disposeRagdoll(): void {
        if (this._ragdollTrackObserver) {
            this._scene.onAfterRenderObservable.remove(this._ragdollTrackObserver);
            this._ragdollTrackObserver = null;
        }
        if (this._ragdoll) {
            this._ragdoll.dispose();
            this._ragdoll = null;
        }
        this._isRagdolling = false;
        this._ragdollInitialized = false;
        this._boneLinks.clear();
    }

    /**
     * Toggles debug collider visualization. When enabled, renders:
     * - GREEN wireframe boxes at each ragdoll physics body position (the actual physics colliders)
     * - RED wireframe boxes around each character mesh bounding box (what projectiles hit)
     * Updated every frame so you can see them diverge in real time.
     * @param enabled - Whether to show or hide debug colliders.
     */
    public setDebugColliders(enabled: boolean): void {
        if (enabled === this._debugEnabled) return;
        this._debugEnabled = enabled;

        if (!enabled) {
            this._disposeDebugMeshes();
            return;
        }


        // Create shared materials
        const greenMat = new StandardMaterial("mat_debug_physics", this._scene);
        greenMat.emissiveColor = new Color3(0, 1, 0);
        greenMat.disableLighting = true;
        greenMat.wireframe = true;

        const redMat = new StandardMaterial("mat_debug_mesh", this._scene);
        redMat.emissiveColor = new Color3(1, 0, 0);
        redMat.disableLighting = true;
        redMat.wireframe = true;

        // Create GREEN boxes for each ragdoll physics body
        if (this._ragdoll) {
            for (let i = 0; i < RAGDOLL_BONE_CONFIG.length; i++) {
                const cfg = RAGDOLL_BONE_CONFIG[i];
                const box = MeshBuilder.CreateBox(
                    `debug_phys_${i}`,
                    { width: cfg.width, height: cfg.height, depth: cfg.depth },
                    this._scene,
                );
                box.material = greenMat;
                box.isPickable = false;
                box.renderingGroupId = 1;
                this._debugBoneBoxes.push(box);
            }
        }

        // Create RED boxes for each character mesh (world-space bounding boxes)
        // Note: extendSizeWorld accounts for the 100x model scaling
        for (let i = 0; i < this._meshes.length; i++) {
            const m = this._meshes[i];
            m.refreshBoundingInfo({ applySkeleton: true, applyMorph: false });
            const bb = m.getBoundingInfo().boundingBox;
            const ext = bb.extendSizeWorld;
            const w = ext.x * 2;
            const h = ext.y * 2;
            const d = ext.z * 2;
            if (w < 1 || h < 1 || d < 1) continue; // Skip degenerate
            const box = MeshBuilder.CreateBox(
                `debug_mesh_${i}`,
                { width: w, height: h, depth: d },
                this._scene,
            );
            box.material = redMat;
            box.isPickable = false;
            box.renderingGroupId = 1;
            this._debugMeshBoxes.push(box);
        }

        // Create YELLOW spheres at ragdoll physics body positions
        // (what applyImpulseAtPoint uses for nearest-bone lookup).
        // After ragdoll(), bone.getTransformNode() returns null for all bones
        // because linkTransformNode(null) severs them. Use physics body
        // transform nodes instead — they have valid world positions.
        if (this._ragdoll) {
            const yellowMat = new StandardMaterial("mat_debug_skeleton", this._scene);
            yellowMat.emissiveColor = new Color3(1, 1, 0);
            yellowMat.disableLighting = true;

            for (let i = 0; i < RAGDOLL_BONE_CONFIG.length; i++) {
                const agg = this._ragdoll.getAggregate(i);
                if (!agg?.body) continue;

                const sphere = MeshBuilder.CreateSphere(
                    `debug_skel_${i}`,
                    { diameter: 15 },
                    this._scene,
                );
                sphere.material = yellowMat;
                sphere.isPickable = false;
                this._debugSkeletonSpheres.push(sphere);
            }
        }

        // Per-frame update observer to sync positions
        this._debugObserver = this._scene.onAfterRenderObservable.add(() => {
            this._updateDebugMeshes();
        });
    }

    /** Whether debug colliders are currently shown. */
    public get debugCollidersEnabled(): boolean {
        return this._debugEnabled;
    }

    /**
     * Shows or hides the character model meshes.
     * @param visible - Whether meshes should be visible.
     */
    public setVisible(visible: boolean): void {
        for (const mesh of this._meshes) {
            mesh.isVisible = visible;
        }
    }

    /**
     * Disposes all instance resources (meshes, animations, skeleton).
     */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;

        // Dispose debug visualization
        this._disposeDebugMeshes();

        // Dispose ragdoll physics if active
        this.disposeRagdoll();

        // Stop and dispose instance animation groups
        for (const ag of this._animGroups.values()) {
            ag.stop();
            ag.dispose();
        }
        this._animGroups.clear();

        // Dispose animation containers (frees transform nodes used by retargeting)
        for (const container of this._animContainers) {
            container.dispose();
        }
        this._animContainers = [];

        // Dispose meshes
        for (const mesh of this._meshes) {
            mesh.dispose();
        }
        this._meshes = [];

        // Dispose skeleton
        if (this._skeleton) {
            this._skeleton.dispose();
            this._skeleton = null;
        }

        // Dispose root
        this._root.dispose();
    }

    // ─── Private Methods ─────────────────────────────────────────────

    /**
     * Loads all animations defined in STATE_ANIMATIONS and retargets
     * them to this instance's skeleton.
     */
    private async _loadAnimations(): Promise<void> {
        const loadPromises: Promise<void>[] = [];

        for (const [state, def] of Object.entries(STATE_ANIMATIONS)) {
            loadPromises.push(
                this._loadAndRetargetAnimation(state, def.file, def.loop),
            );
        }

        await Promise.all(loadPromises);
    }

    /**
     * Loads a single animation GLB into an AssetContainer (without adding
     * to scene), strips root motion, and retargets animation channels to
     * this instance's skeleton bone TransformNodes.
     *
     * Each instance gets its own container and animation group because
     * retargeting mutates the source animation's target references.
     *
     * @param state - State key (e.g., "Idle").
     * @param file - GLB filename.
     * @param loop - Whether the animation should loop.
     */
    private async _loadAndRetargetAnimation(state: string, file: string, loop: boolean): Promise<void> {
        if (!this._skeleton) return;

        try {
            const url = `${ANIMATION_DIR}/${file}`;
            const container = await LoadAssetContainerAsync(url, this._scene);

            if (container.animationGroups.length === 0) {
                console.warn(`[CharacterModel] No animation groups in ${file}`);
                container.dispose();
                return;
            }

            // Keep container alive — its transform nodes are the original targets
            // that we'll reassign. Disposing it would break the animation group.
            this._animContainers.push(container);

            const group = container.animationGroups[0];
            group.stop();

            // Strip root motion: zero out Hips X/Z position (keep Y for correct height)
            CharacterModel._stripRootMotion(group);

            // Build bone name → TransformNode map from this instance's skeleton
            const boneMap = new Map<string, TransformNode>();
            for (const bone of this._skeleton.bones) {
                const tn = bone.getTransformNode();
                if (tn) {
                    boneMap.set(bone.name, tn);
                }
            }

            // Retarget: reassign each animation channel's target to this skeleton's bones
            for (const ta of group.targetedAnimations) {
                const targetName = (ta.target as { name?: string })?.name;
                if (!targetName) continue;
                const tn = boneMap.get(targetName);
                if (tn) {
                    ta.target = tn;
                }
            }

            group.loopAnimation = loop;
            group.weight = 0;

            this._animGroups.set(state, group);
        } catch (err) {
            console.warn(`[CharacterModel] Failed to load animation ${file}:`, err);
        }
    }

    /**
     * Updates debug wireframe positions to match current physics body
     * and character mesh positions.
     */
    private _updateDebugMeshes(): void {
        // GREEN boxes → ragdoll physics body positions (only visible when ragdolling)
        if (this._ragdoll) {
            for (let i = 0; i < this._debugBoneBoxes.length; i++) {
                this._debugBoneBoxes[i].isVisible = this._isRagdolling;
                if (!this._isRagdolling) continue;
                const agg = this._ragdoll.getAggregate(i);
                if (agg?.body) {
                    const pos = agg.body.transformNode.absolutePosition;
                    this._debugBoneBoxes[i].position.copyFrom(pos);
                    // Copy rotation from the physics body transform
                    const rot = agg.body.transformNode.absoluteRotationQuaternion;
                    if (rot) {
                        this._debugBoneBoxes[i].rotationQuaternion = rot.clone();
                    }
                }
            }
        }

        // RED boxes → character mesh bounding box centers (what raycasts hit)
        for (let i = 0; i < this._debugMeshBoxes.length && i < this._meshes.length; i++) {
            const m = this._meshes[i];
            const center = m.getBoundingInfo().boundingBox.centerWorld;
            this._debugMeshBoxes[i].position.copyFrom(center);
        }

        // YELLOW spheres → ragdoll physics body positions (only visible when ragdolling)
        if (this._ragdoll) {
            let si = 0;
            for (let i = 0; i < RAGDOLL_BONE_CONFIG.length && si < this._debugSkeletonSpheres.length; i++) {
                const agg = this._ragdoll.getAggregate(i);
                if (!agg?.body) continue;
                this._debugSkeletonSpheres[si].isVisible = this._isRagdolling;
                if (this._isRagdolling) {
                    this._debugSkeletonSpheres[si].position.copyFrom(agg.body.transformNode.absolutePosition);
                }
                si++;
            }
        }
    }

    /**
     * Disposes all debug wireframe meshes and removes the update observer.
     */
    private _disposeDebugMeshes(): void {
        if (this._debugObserver) {
            this._scene.onAfterRenderObservable.remove(this._debugObserver);
            this._debugObserver = null;
        }
        for (const box of this._debugBoneBoxes) {
            box.material?.dispose();
            box.dispose();
        }
        this._debugBoneBoxes = [];
        for (const box of this._debugMeshBoxes) {
            box.material?.dispose();
            box.dispose();
        }
        this._debugMeshBoxes = [];
        for (const sphere of this._debugSkeletonSpheres) {
            sphere.material?.dispose();
            sphere.dispose();
        }
        this._debugSkeletonSpheres = [];
        this._debugEnabled = false;
    }

    /**
     * Strips root motion from an animation group by zeroing all position
     * keyframes on the Hips bone (X, Y, and Z). The character is offset
     * by the Hips rest position Y to compensate.
     * @param group - The animation group to modify.
     */
    private static _stripRootMotion(group: AnimationGroup): void {
        for (const ta of group.targetedAnimations) {
            const targetName = (ta.target as { name?: string })?.name;
            if (targetName !== HIPS_BONE_NAME) continue;

            // Only strip position animations (not rotation)
            if (ta.animation.targetProperty !== "position") continue;

            const keys = ta.animation.getKeys();
            if (keys.length === 0) continue;

            for (const key of keys) {
                key.value.x = 0;
                key.value.y = 0;
                key.value.z = 0;
            }

            ta.animation.setKeys(keys);
        }
    }
}
