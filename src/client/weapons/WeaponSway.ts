/**
 * Procedural weapon sway that animates the viewmodel anchor based on player state.
 * Uses position offsets and rotation tilts driven by sine waves.
 * @module client/weapons/WeaponSway
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { PlayerStateEnum } from "../../shared/types";

/** Default sway parameter values. */
const DEFAULT_SWAY_LERP_SPEED = 6.0;
const DEFAULT_RECOIL_KICK_Z = -1.5;
const DEFAULT_RECOIL_KICK_Y = 0.8;
const DEFAULT_RECOIL_RECOVERY_SPEED = 12.0;
const DEFAULT_IDLE_SWAY_X = 0.06;
const DEFAULT_IDLE_SWAY_Y = 0.04;
const DEFAULT_IDLE_FREQ_X = 0.2;
const DEFAULT_IDLE_FREQ_Y = 0.3;
const DEFAULT_WALK_SWING_X = 0.45;
const DEFAULT_WALK_BOB_Y = 0.15;
const DEFAULT_WALK_FREQ = 1.8;
const DEFAULT_WALK_TILT_Z = 0.005;

/** Airborne: weapon dips based on vertical velocity. */
const AIRBORNE_OFFSET_Y_MAX = -0.5;
const AIRBORNE_TILT_X_MAX = 0.1;
/** Falling: smaller dip that builds with fall speed. */
const FALL_OFFSET_Y_MAX = -0.3;
const FALL_TILT_X_MAX = 0.06;
/** Terminal fall speed used to normalize fall ratio (cm/s). */
const TERMINAL_FALL_SPEED = 800;

/**
 * Applies procedural sway motion to the weapon viewmodel anchor.
 * Idle: subtle breathing. Walking: pendulum swing.
 * Airborne (jump/fall): weapon dips down and tilts forward, lerps back on landing.
 */
export class WeaponSway {
    private _anchor: TransformNode;
    private _basePosition: Vector3;
    private _elapsedTime: number = 0;

    private _currentOffsetX: number = 0;
    private _currentOffsetY: number = 0;
    private _currentTiltX: number = 0;
    private _currentTiltZ: number = 0;

    private _recoilZ: number = 0;
    private _recoilY: number = 0;

    /** Tunable sway parameters — exposed for ImGui live editing. */
    public swayLerpSpeed: number = DEFAULT_SWAY_LERP_SPEED;
    public recoilKickZ: number = DEFAULT_RECOIL_KICK_Z;
    public recoilKickY: number = DEFAULT_RECOIL_KICK_Y;
    public recoilRecoverySpeed: number = DEFAULT_RECOIL_RECOVERY_SPEED;
    public idleSwayX: number = DEFAULT_IDLE_SWAY_X;
    public idleSwayY: number = DEFAULT_IDLE_SWAY_Y;
    public idleFreqX: number = DEFAULT_IDLE_FREQ_X;
    public idleFreqY: number = DEFAULT_IDLE_FREQ_Y;
    public walkSwingX: number = DEFAULT_WALK_SWING_X;
    public walkBobY: number = DEFAULT_WALK_BOB_Y;
    public walkFreq: number = DEFAULT_WALK_FREQ;
    public walkTiltZ: number = DEFAULT_WALK_TILT_Z;

    /**
     * Creates the weapon sway system.
     * @param anchor - The viewmodel anchor TransformNode parented to the camera.
     */
    constructor(anchor: TransformNode) {
        this._anchor = anchor;
        this._basePosition = anchor.position.clone();
        this._anchor.rotationQuaternion = null;
        this._anchor.rotation = Vector3.Zero();
    }

    /**
     * Updates sway position and rotation based on player state.
     * @param dt - Delta time in seconds.
     * @param playerState - The current player movement state.
     * @param verticalVelocity - The player's current vertical velocity in cm/s (positive = up).
     * @param leanAmount - Current lean amount (-1 left, 0 center, +1 right).
     */
    public update(dt: number, playerState: PlayerStateEnum, verticalVelocity: number = 0, leanAmount: number = 0): void {
        this._elapsedTime += dt;

        let targetX = 0;
        let targetY = 0;
        let targetTiltX = 0;
        let targetTiltZ = 0;

        const t = this._elapsedTime * Math.PI * 2;
        const isAirborne = playerState === PlayerStateEnum.Jumping
            || playerState === PlayerStateEnum.Falling;

        if (isAirborne) {
            if (verticalVelocity > 0) {
                /* Rising: weapon dips proportional to upward speed. */
                const jumpSpeed = 700;
                const ratio = Math.min(1, verticalVelocity / jumpSpeed);
                targetY = AIRBORNE_OFFSET_Y_MAX * ratio;
                targetTiltX = AIRBORNE_TILT_X_MAX * ratio;
            } else {
                /* Falling: weapon dips proportional to fall speed.
                 * Covers both post-jump descent and walking off ledges. */
                const ratio = Math.min(1, Math.abs(verticalVelocity) / TERMINAL_FALL_SPEED);
                targetY = FALL_OFFSET_Y_MAX * ratio;
                targetTiltX = FALL_TILT_X_MAX * ratio;
            }
            targetX = 0;
            targetTiltZ = 0;
        } else if (playerState === PlayerStateEnum.Walking) {
            targetX = Math.sin(t * this.walkFreq) * this.walkSwingX;
            targetY = Math.abs(Math.sin(t * this.walkFreq)) * this.walkBobY;
            targetTiltX = 0;
            targetTiltZ = -Math.sin(t * this.walkFreq) * this.walkTiltZ;
        } else {
            targetX = Math.sin(t * this.idleFreqX) * this.idleSwayX;
            targetY = Math.sin(t * this.idleFreqY) * this.idleSwayY;
            targetTiltX = 0;
            targetTiltZ = 0;
        }

        const lerpFactor = Math.min(1, this.swayLerpSpeed * dt);
        this._currentOffsetX += (targetX - this._currentOffsetX) * lerpFactor;
        this._currentOffsetY += (targetY - this._currentOffsetY) * lerpFactor;
        this._currentTiltX += (targetTiltX - this._currentTiltX) * lerpFactor;
        this._currentTiltZ += (targetTiltZ - this._currentTiltZ) * lerpFactor;

        this._recoilZ += (0 - this._recoilZ) * Math.min(1, this.recoilRecoverySpeed * dt);
        this._recoilY += (0 - this._recoilY) * Math.min(1, this.recoilRecoverySpeed * dt);

        // Lean shifts the viewmodel sideways and adds a slight tilt
        const leanViewmodelShift = leanAmount * 3.0;
        const leanViewmodelTilt = leanAmount * 0.08;

        this._anchor.position.set(
            this._basePosition.x + this._currentOffsetX + leanViewmodelShift,
            this._basePosition.y + this._currentOffsetY + this._recoilY,
            this._basePosition.z + this._recoilZ
        );

        this._anchor.rotation.set(
            this._currentTiltX,
            0,
            this._currentTiltZ + leanViewmodelTilt
        );
    }

    /**
     * Triggers a recoil kick when the weapon fires.
     */
    public triggerRecoil(): void {
        this._recoilZ += this.recoilKickZ;
        this._recoilY += this.recoilKickY;
    }

    /**
     * Resets the anchor to its base position and rotation.
     */
    public dispose(): void {
        this._anchor.position.copyFrom(this._basePosition);
        this._anchor.rotation.set(0, 0, 0);
    }
}
