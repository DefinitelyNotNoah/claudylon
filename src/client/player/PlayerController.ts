/**
 * First-person player controller.
 * Owns the Havok PhysicsCharacterController, camera, and viewmodel anchor.
 * Drives movement from InputManager and syncs camera to physics each frame.
 * @module client/player/PlayerController
 */

import { Scene } from "@babylonjs/core/scene";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
    PhysicsCharacterController,
    CharacterSupportedState,
} from "@babylonjs/core/Physics/v2/characterController";

import { PLAYER_STATS } from "../../shared/constants";
import { PlayerStateEnum } from "../../shared/types";
import { COLLISION_GROUP_PLAYER, COLLISION_MASK_PLAYER } from "../../shared/constants/CollisionGroups";
import type { InputManager } from "../core/InputManager";
import { PlayerStateMachine } from "./PlayerStateMachine";

/** Gravity vector in cm/s². Full realistic gravity for snappy falls. */
const GRAVITY = new Vector3(0, -981, 0);

/** How quickly horizontal velocity changes while airborne (0-1 per second). */
const AIR_CONTROL_FACTOR = 0.3;

/**
 * The core FPS player. Creates a capsule physics body, a manually-driven
 * FreeCamera, and a viewmodel anchor for weapon rendering.
 */
export class PlayerController {
    private _scene: Scene;
    private _inputManager: InputManager;
    private _characterController!: PhysicsCharacterController;
    private _camera!: FreeCamera;
    private _stateMachine: PlayerStateMachine;
    private _viewmodelAnchor!: TransformNode;

    private _spawnPosition: Vector3;
    private _yaw: number = 0;
    private _pitch: number = 0;

    /** Buffered jump request — survives for several frames until grounded. */
    private _jumpBufferFrames: number = 0;
    /** Frames after jumping where isSupported is ignored (prevents instant re-ground). */
    private _jumpCooldownFrames: number = 0;
    /** Last frame timestamp for manual delta time calculation. */
    private _lastTime: number = 0;
    /** When true, input processing is skipped (game is paused). */
    private _paused: boolean = false;
    /** Current health points. */
    private _currentHealth: number = PLAYER_STATS.health;
    /** Whether noclip (free-fly) mode is active. */
    private _noclip: boolean = false;
    /** Current lean amount: -1 = full left, 0 = upright, +1 = full right. */
    private _leanAmount: number = 0;
    /** Maximum lean angle in radians (default 10 degrees for POV). */
    private _maxLeanAngle: number = 0.1745;
    /** How fast leaning interpolates (per second). */
    private _leanSpeed: number = 8.0;
    /** Horizontal camera offset when fully leaned (cm). */
    private _leanOffset: number = 50;
    /** Noclip fly speed in cm/s. */
    private static readonly NOCLIP_SPEED = 2000;

    /**
     * Creates a new player controller.
     * @param scene - The Babylon.js scene this player belongs to.
     * @param inputManager - The input manager providing keyboard/mouse state.
     * @param spawnPosition - World-space position to spawn the player at.
     */
    constructor(scene: Scene, inputManager: InputManager, spawnPosition: Vector3) {
        this._scene = scene;
        this._inputManager = inputManager;
        this._spawnPosition = spawnPosition;
        this._stateMachine = new PlayerStateMachine();
    }

    /** The first-person camera. */
    public get camera(): FreeCamera {
        return this._camera;
    }

    /** Anchor node for attaching the weapon viewmodel. Parented to the camera. */
    public get viewmodelAnchor(): TransformNode {
        return this._viewmodelAnchor;
    }

    /** The character controller's current position. */
    public get position(): Vector3 {
        return this._characterController.getPosition();
    }

    /** The current player state. */
    public get state(): PlayerStateEnum {
        return this._stateMachine.currentState;
    }

    /** The character controller's current vertical velocity in cm/s. */
    public get verticalVelocity(): number {
        return this._characterController.getVelocity().y;
    }

    /** Current health points. */
    public get currentHealth(): number {
        return this._currentHealth;
    }

    /** Whether noclip mode is currently active. */
    public get isNoclip(): boolean {
        return this._noclip;
    }

    /** Current yaw rotation in radians. */
    public get yaw(): number {
        return this._yaw;
    }

    /** Current pitch rotation in radians. */
    public get pitch(): number {
        return this._pitch;
    }

    /** Current lean amount: -1 = full left, 0 = upright, +1 = full right. */
    public get leanAmount(): number {
        return this._leanAmount;
    }

    /** Maximum lean angle in radians. */
    public get maxLeanAngle(): number {
        return this._maxLeanAngle;
    }

    public set maxLeanAngle(value: number) {
        this._maxLeanAngle = value;
    }

    /** Lean interpolation speed. */
    public get leanSpeed(): number {
        return this._leanSpeed;
    }

    public set leanSpeed(value: number) {
        this._leanSpeed = value;
    }

    /** Horizontal camera offset when fully leaned (cm). */
    public get leanOffset(): number {
        return this._leanOffset;
    }

    public set leanOffset(value: number) {
        this._leanOffset = value;
    }

    /**
     * Reduces health by the given amount, clamped to 0.
     * @param amount - Damage to apply.
     */
    public takeDamage(amount: number): void {
        this._currentHealth = Math.max(0, this._currentHealth - amount);
    }

    /**
     * Restores health by the given amount, clamped to max.
     * @param amount - Health to restore.
     */
    public heal(amount: number): void {
        this._currentHealth = Math.min(PLAYER_STATS.health, this._currentHealth + amount);
    }

    /**
     * Sets health to an exact value. Only clamped to 0 minimum.
     * Used by the developer console — allows values above max for debugging.
     * @param value - Health value to set.
     */
    public setHealth(value: number): void {
        this._currentHealth = Math.max(0, value);
    }

    /**
     * Toggles noclip (free-fly) mode on or off.
     * Used by the developer console.
     */
    public toggleNoclip(): void {
        this._noclip = !this._noclip;
    }

    /**
     * Pauses or unpauses the player controller.
     * While paused, input processing is skipped but physics keeps running.
     * @param value - True to pause, false to resume.
     */
    public set paused(value: boolean) {
        this._paused = value;
    }

    /**
     * Initializes the physics character controller, camera, and viewmodel anchor.
     * Registers per-frame update observers.
     */
    public async initialize(): Promise<void> {
        this._characterController = new PhysicsCharacterController(
            this._spawnPosition,
            {
                capsuleHeight: PLAYER_STATS.capsuleHeight,
                capsuleRadius: PLAYER_STATS.capsuleRadius,
            },
            this._scene
        );

        // Exclude ragdoll bodies from player collision so we don't step on corpses
        this._characterController.shape.filterMembershipMask = COLLISION_GROUP_PLAYER;
        this._characterController.shape.filterCollideMask = COLLISION_MASK_PLAYER;

        const eyePosition = this._spawnPosition.add(
            new Vector3(0, PLAYER_STATS.capsuleHeight / 2 - 5, 0)
        );

        this._camera = new FreeCamera("camera_main", eyePosition, this._scene);
        this._camera.inputs.clear();
        this._camera.minZ = 1;
        this._camera.maxZ = 100000;
        this._camera.fov = 1.22;

        this._viewmodelAnchor = new TransformNode("viewmodel_anchor", this._scene);
        this._viewmodelAnchor.parent = this._camera;
        this._viewmodelAnchor.position = new Vector3(8, -10, 12);

        this._scene.onBeforeRenderObservable.add(() => {
            this._update();
            this._syncCamera();
        });
    }

    /**
     * Per-physics-step update. Reads input, runs the state machine,
     * and applies velocity to the character controller.
     */
    private _update(): void {
        const now = performance.now();
        const dt = this._lastTime === 0 ? 1 / 60 : Math.min((now - this._lastTime) / 1000, 0.05);
        this._lastTime = now;

        const downDir = new Vector3(0, -1, 0);
        const support = this._characterController.checkSupport(dt, downDir);

        /* When paused, skip input processing but keep physics running
           so gravity/collisions still work (important for networking).
           In noclip mode, freeze in place — no gravity or movement. */
        if (this._paused) {
            if (this._noclip) return;
            const currentVelocity = this._characterController.getVelocity();
            const rawSupported = support.supportedState === CharacterSupportedState.SUPPORTED
                || support.supportedState === CharacterSupportedState.SLIDING;
            const yVel = rawSupported ? -10 : currentVelocity.y + GRAVITY.y * dt * 2.5;
            this._characterController.setVelocity(new Vector3(0, yVel, 0));
            this._characterController.integrate(dt, support, Vector3.Zero());
            return;
        }

        this._applyMouseLook();
        this._updateLean(dt);

        // Toggle noclip
        if (this._inputManager.noclip) {
            this._noclip = !this._noclip;
            console.log(`[Player] Noclip: ${this._noclip ? "ON" : "OFF"}`);
        }

        // Noclip fly mode — bypass physics entirely
        if (this._noclip) {
            this._updateNoclip(dt);
            return;
        }

        const desiredVelocity = this._getDesiredVelocity();

        const rawSupported = support.supportedState === CharacterSupportedState.SUPPORTED
            || support.supportedState === CharacterSupportedState.SLIDING;

        if (this._jumpCooldownFrames > 0) {
            this._jumpCooldownFrames--;
        }
        const isSupported = rawSupported && this._jumpCooldownFrames === 0;

        const currentVelocity = this._characterController.getVelocity();
        const isMoving = desiredVelocity.length() > 0.01;

        if (this._inputManager.jump) {
            this._jumpBufferFrames = 8;
        } else if (this._jumpBufferFrames > 0) {
            this._jumpBufferFrames--;
        }

        const wantsJump = this._jumpBufferFrames > 0;

        this._stateMachine.update(isSupported, isMoving, wantsJump && isSupported);

        let outputVelocity: Vector3;

        if (wantsJump && isSupported) {
            const jumpSpeed = Math.sqrt(2 * Math.abs(GRAVITY.y) * PLAYER_STATS.jumpHeight);
            outputVelocity = new Vector3(desiredVelocity.x, jumpSpeed, desiredVelocity.z);
            this._jumpBufferFrames = 0;
            this._jumpCooldownFrames = 6;
        } else if (isSupported) {
            outputVelocity = new Vector3(desiredVelocity.x, -10, desiredVelocity.z);
        } else {
            const newYVel = currentVelocity.y + GRAVITY.y * dt * 2.5;
            outputVelocity = new Vector3(
                desiredVelocity.x,
                newYVel,
                desiredVelocity.z
            );
        }

        this._characterController.setVelocity(outputVelocity);
        this._characterController.integrate(dt, support, Vector3.Zero());
    }

    /**
     * Applies mouse movement to yaw and pitch, clamping pitch to prevent
     * looking past straight up or down.
     */
    private _applyMouseLook(): void {
        if (!this._inputManager.isPointerLocked) return;

        const sensitivity = this._inputManager.sensitivity;
        this._yaw += this._inputManager.consumeMouseX() * sensitivity;
        this._pitch += this._inputManager.consumeMouseY() * sensitivity;
        this._pitch = Math.max(
            -Math.PI / 2 + 0.01,
            Math.min(Math.PI / 2 - 0.01, this._pitch)
        );
    }

    /**
     * Smoothly interpolates lean amount based on Q/E input.
     * @param dt - Delta time in seconds.
     */
    private _updateLean(dt: number): void {
        let targetLean = 0;
        if (this._inputManager.leanLeft) targetLean -= 1;
        if (this._inputManager.leanRight) targetLean += 1;

        const lerpFactor = Math.min(1, this._leanSpeed * dt);
        this._leanAmount += (targetLean - this._leanAmount) * lerpFactor;

        // Snap to zero when very close (avoids float drift)
        if (Math.abs(this._leanAmount) < 0.001) {
            this._leanAmount = 0;
        }
    }

    /**
     * Builds a movement vector from WASD input, relative to camera facing.
     * @returns Desired velocity in world space.
     */
    private _getDesiredVelocity(): Vector3 {
        let moveX = 0;
        let moveZ = 0;

        if (this._inputManager.forward) moveZ += 1;
        if (this._inputManager.backward) moveZ -= 1;
        if (this._inputManager.left) moveX -= 1;
        if (this._inputManager.right) moveX += 1;

        if (moveX === 0 && moveZ === 0) return Vector3.Zero();

        const forward = new Vector3(Math.sin(this._yaw), 0, Math.cos(this._yaw));
        const right = new Vector3(Math.cos(this._yaw), 0, -Math.sin(this._yaw));

        const direction = forward.scale(moveZ).add(right.scale(moveX));
        direction.normalize();
        return direction.scale(PLAYER_STATS.movementSpeed);
    }

    /**
     * Noclip fly mode. Moves the camera freely through the world,
     * ignoring physics and collisions. WASD moves relative to look
     * direction (including pitch), Space goes up, Shift goes down.
     * @param dt - Delta time in seconds.
     */
    private _updateNoclip(dt: number): void {
        const speed = PlayerController.NOCLIP_SPEED;
        let moveX = 0;
        let moveZ = 0;
        let moveY = 0;

        if (this._inputManager.forward) moveZ += 1;
        if (this._inputManager.backward) moveZ -= 1;
        if (this._inputManager.left) moveX -= 1;
        if (this._inputManager.right) moveX += 1;

        // Space/Shift for vertical — read raw key state (bypass one-shot jump)
        const keys = (this._inputManager as any)._keys as Map<string, boolean>;
        if (keys?.get("Space")) moveY += 1;
        if (keys?.get("ShiftLeft")) moveY -= 1;

        if (moveX === 0 && moveZ === 0 && moveY === 0) return;

        // Forward/back follow full look direction (pitch + yaw)
        const forward = new Vector3(
            Math.sin(this._yaw) * Math.cos(this._pitch),
            -Math.sin(this._pitch),
            Math.cos(this._yaw) * Math.cos(this._pitch),
        );
        const right = new Vector3(Math.cos(this._yaw), 0, -Math.sin(this._yaw));
        const up = new Vector3(0, 1, 0);

        const direction = forward.scale(moveZ)
            .add(right.scale(moveX))
            .add(up.scale(moveY));
        if (direction.lengthSquared() > 0) {
            direction.normalize();
        }

        const displacement = direction.scale(speed * dt);
        const pos = this._characterController.getPosition();
        pos.addInPlace(displacement);
        this._characterController.setPosition(pos);
    }

    /**
     * Syncs camera position and rotation to the character controller.
     * Called once per frame before rendering.
     */
    private _syncCamera(): void {
        const pos = this._characterController.getPosition();
        const eyeHeight = PLAYER_STATS.capsuleHeight / 2 - 15;

        // Lean: horizontal camera offset perpendicular to facing direction
        const lateralOffset = this._leanAmount * this._leanOffset;
        const rightX = Math.cos(this._yaw);
        const rightZ = -Math.sin(this._yaw);

        this._camera.position.set(
            pos.x + rightX * lateralOffset,
            pos.y + eyeHeight,
            pos.z + rightZ * lateralOffset,
        );

        // Use quaternion rotation to avoid gimbal lock when lean roll is applied.
        // Compose: Yaw (Y-axis) * Pitch (X-axis) * Roll (Z-axis)
        const leanRoll = -this._leanAmount * this._maxLeanAngle;
        const qYaw = Quaternion.RotationAxis(Vector3.Up(), this._yaw);
        const qPitch = Quaternion.RotationAxis(Vector3.Right(), this._pitch);
        const qRoll = Quaternion.RotationAxis(Vector3.Forward(), leanRoll);
        this._camera.rotationQuaternion = qYaw.multiply(qPitch).multiply(qRoll);
    }

    /**
     * Teleports the player to a new position.
     * @param position - Target world-space position.
     */
    public teleport(position: Vector3): void {
        this._characterController.setPosition(position);
        this._syncCamera();
    }

    /**
     * Kills the player. Freezes movement and sets health to 0.
     */
    public die(): void {
        this._currentHealth = 0;
        this._paused = true;
    }

    /**
     * Respawns the player at a new position with full health.
     * @param position - Spawn position.
     */
    public respawn(position: Vector3): void {
        this._currentHealth = PLAYER_STATS.health;
        this._paused = false;
        this.teleport(position);
    }

    /**
     * Disposes the character controller, camera, and viewmodel anchor.
     */
    public dispose(): void {
        this._characterController.dispose();
        this._camera.dispose();
        this._viewmodelAnchor.dispose();
    }
}
