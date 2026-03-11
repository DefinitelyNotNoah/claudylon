/**
 * Procedural weapon sway that animates the viewmodel anchor based on player state.
 * Uses position offsets and rotation tilts driven by sine waves and spring physics.
 *
 * Motion layers applied in order:
 *   1. Idle breathing — slow, subtle drift
 *   2. Walk bob — horizontal swing + vertical figure-8 bounce
 *   3. Airborne dip — weapon drops when jumping/falling
 *   4. Recoil kick — instantaneous snap-back with spring recovery
 *   5. Lean shift/tilt — offset for Q/E lean input
 *   6. Mouse-lag drag — viewmodel trails behind camera rotation
 *
 * @module client/weapons/WeaponSway
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";

import { PlayerStateEnum } from "../../shared/types";

/* -------------------------------------------------------------------------
 * Tunable defaults
 * ---------------------------------------------------------------------- */

const DEFAULT_SWAY_LERP_SPEED = 8.0;
const DEFAULT_RECOIL_KICK_Z = -2.2;
const DEFAULT_RECOIL_KICK_Y = 1.0;
/** First-frame snap factor applied to the kick so recoil feels instant. */
const DEFAULT_RECOIL_KICK_SNAP = 0.35;
const DEFAULT_RECOIL_RECOVERY_SPEED = 14.0;
const DEFAULT_IDLE_SWAY_X = 0.05;
const DEFAULT_IDLE_SWAY_Y = 0.03;
const DEFAULT_IDLE_FREQ_X = 0.18;
const DEFAULT_IDLE_FREQ_Y = 0.28;
const DEFAULT_WALK_SWING_X = 0.40;
const DEFAULT_WALK_BOB_Y = 0.18;
const DEFAULT_WALK_FREQ = 2.0;
const DEFAULT_WALK_TILT_Z = 0.006;

/** How strongly the viewmodel drags behind camera yaw/pitch changes (0 = none). */
const DEFAULT_MOUSE_LAG_AMOUNT = 0.012;
/** How fast the mouse-lag offset returns to center (lerp speed per second). */
const DEFAULT_MOUSE_LAG_RECOVERY = 10.0;
/** Clamp on mouse-lag lateral offset in cm. */
const MOUSE_LAG_MAX_X = 1.8;
/** Clamp on mouse-lag vertical offset in cm. */
const MOUSE_LAG_MAX_Y = 1.2;

/* Airborne: weapon dips based on vertical velocity. */
const AIRBORNE_OFFSET_Y_MAX = -0.6;
const AIRBORNE_TILT_X_MAX = 0.12;
/* Falling: smaller dip that builds with fall speed. */
const FALL_OFFSET_Y_MAX = -0.35;
const FALL_TILT_X_MAX = 0.07;
/** Terminal fall speed used to normalise fall ratio (cm/s). */
const TERMINAL_FALL_SPEED = 800;

/**
 * Applies procedural sway motion to the weapon viewmodel anchor each frame.
 *
 * Motion layers:
 * - **Idle breathing** — slow sine waves giving a subtle "alive" feel
 * - **Walk bob** — horizontal pendulum swing + vertical figure-8 bounce
 * - **Airborne dip** — weapon drops/tilts when jumping or falling
 * - **Recoil kick** — instant snap-back on fire with spring recovery
 * - **Lean shift/tilt** — lateral offset + roll when the player leans
 * - **Mouse-lag drag** — viewmodel lags camera by a small amount, adds "weight"
 */
export class WeaponSway {
    private _anchor: TransformNode;
    private _basePosition: Vector3;
    private _elapsedTime: number = 0;

    /* Smoothed motion offsets. */
    private _currentOffsetX: number = 0;
    private _currentOffsetY: number = 0;
    private _currentTiltX: number = 0;
    private _currentTiltZ: number = 0;

    /* Recoil spring state. */
    private _recoilZ: number = 0;
    private _recoilY: number = 0;

    /* Mouse-lag drag state (tracks camera rotation delta). */
    private _lagOffsetX: number = 0;
    private _lagOffsetY: number = 0;
    private _prevCameraYaw: number = 0;
    private _prevCameraPitch: number = 0;
    private _cameraInitialised: boolean = false;

    /* -----------------------------------------------------------------------
     * Tunable parameters — all public so ImGui can edit them live.
     * -------------------------------------------------------------------- */

    /** Speed at which sway offsets lerp toward their targets. */
    public swayLerpSpeed: number = DEFAULT_SWAY_LERP_SPEED;

    /** Z-axis (forward/back) kick distance on fire (negative = kick back). */
    public recoilKickZ: number = DEFAULT_RECOIL_KICK_Z;

    /** Y-axis (up) kick on fire. */
    public recoilKickY: number = DEFAULT_RECOIL_KICK_Y;

    /**
     * Fraction of the recoil kick applied as an instant snap on the first frame.
     * Remaining fraction is applied via normal spring each frame.
     * Range 0..1; higher = snappier.
     */
    public recoilKickSnap: number = DEFAULT_RECOIL_KICK_SNAP;

    /** How fast recoil returns to rest (lerp speed per second). */
    public recoilRecoverySpeed: number = DEFAULT_RECOIL_RECOVERY_SPEED;

    /** Idle horizontal sway amplitude in cm. */
    public idleSwayX: number = DEFAULT_IDLE_SWAY_X;

    /** Idle vertical sway amplitude in cm. */
    public idleSwayY: number = DEFAULT_IDLE_SWAY_Y;

    /** Idle sway horizontal frequency (cycles per second). */
    public idleFreqX: number = DEFAULT_IDLE_FREQ_X;

    /** Idle sway vertical frequency (cycles per second). */
    public idleFreqY: number = DEFAULT_IDLE_FREQ_Y;

    /** Walk horizontal pendulum swing amplitude in cm. */
    public walkSwingX: number = DEFAULT_WALK_SWING_X;

    /** Walk vertical bob amplitude in cm. */
    public walkBobY: number = DEFAULT_WALK_BOB_Y;

    /** Walk bob frequency (steps per second; each full cycle = 2 steps). */
    public walkFreq: number = DEFAULT_WALK_FREQ;

    /** Walk tilt (roll) amplitude in radians. */
    public walkTiltZ: number = DEFAULT_WALK_TILT_Z;

    /** Mouse-lag drag strength — how far the weapon lags behind camera rotation. */
    public mouseLagAmount: number = DEFAULT_MOUSE_LAG_AMOUNT;

    /** How quickly the mouse-lag offset returns to center. */
    public mouseLagRecovery: number = DEFAULT_MOUSE_LAG_RECOVERY;

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
     * @param verticalVelocity - The player's vertical velocity in cm/s (positive = up).
     * @param leanAmount - Current lean amount (-1 left, 0 centre, +1 right).
     * @param camera - Optional player camera used for mouse-lag drag computation.
     */
    public update(
        dt: number,
        playerState: PlayerStateEnum,
        verticalVelocity: number = 0,
        leanAmount: number = 0,
        camera?: FreeCamera
    ): void {
        this._elapsedTime += dt;

        /* ---- 1. Compute target sway for current state ------------------- */
        let targetX = 0;
        let targetY = 0;
        let targetTiltX = 0;
        let targetTiltZ = 0;

        const t = this._elapsedTime * Math.PI * 2;
        const isAirborne = playerState === PlayerStateEnum.Jumping
            || playerState === PlayerStateEnum.Falling;

        if (isAirborne) {
            if (verticalVelocity > 0) {
                const jumpSpeed = 700;
                const ratio = Math.min(1, verticalVelocity / jumpSpeed);
                targetY = AIRBORNE_OFFSET_Y_MAX * ratio;
                targetTiltX = AIRBORNE_TILT_X_MAX * ratio;
            } else {
                const ratio = Math.min(1, Math.abs(verticalVelocity) / TERMINAL_FALL_SPEED);
                targetY = FALL_OFFSET_Y_MAX * ratio;
                targetTiltX = FALL_TILT_X_MAX * ratio;
            }
            targetX = 0;
            targetTiltZ = 0;
        } else if (playerState === PlayerStateEnum.Walking) {
            /* Horizontal pendulum + figure-8 vertical (double-frequency up stroke). */
            const walkPhase = t * this.walkFreq;
            targetX = Math.sin(walkPhase) * this.walkSwingX;
            /* Figure-8: positive bob on both peaks of the swing cycle. */
            targetY = Math.abs(Math.sin(walkPhase)) * this.walkBobY * 0.6
                    + Math.sin(walkPhase * 2) * this.walkBobY * 0.4;
            targetTiltX = 0;
            targetTiltZ = -Math.sin(walkPhase) * this.walkTiltZ;
        } else {
            /* Idle: asymmetric breathing — X and Y at different non-integer frequencies. */
            targetX = Math.sin(t * this.idleFreqX) * this.idleSwayX
                    + Math.sin(t * this.idleFreqX * 1.6) * this.idleSwayX * 0.3;
            targetY = Math.sin(t * this.idleFreqY) * this.idleSwayY
                    + Math.cos(t * this.idleFreqY * 0.7) * this.idleSwayY * 0.2;
            targetTiltX = 0;
            targetTiltZ = 0;
        }

        /* ---- 2. Lerp smoothed offsets toward targets -------------------- */
        const lerpFactor = Math.min(1, this.swayLerpSpeed * dt);
        this._currentOffsetX += (targetX - this._currentOffsetX) * lerpFactor;
        this._currentOffsetY += (targetY - this._currentOffsetY) * lerpFactor;
        this._currentTiltX   += (targetTiltX - this._currentTiltX) * lerpFactor;
        this._currentTiltZ   += (targetTiltZ - this._currentTiltZ) * lerpFactor;

        /* ---- 3. Recoil spring recovery --------------------------------- */
        const recoveryFactor = Math.min(1, this.recoilRecoverySpeed * dt);
        this._recoilZ += (0 - this._recoilZ) * recoveryFactor;
        this._recoilY += (0 - this._recoilY) * recoveryFactor;

        /* ---- 4. Mouse-lag drag ----------------------------------------- */
        if (camera) {
            if (!this._cameraInitialised) {
                this._prevCameraYaw   = camera.rotation.y;
                this._prevCameraPitch = camera.rotation.x;
                this._cameraInitialised = true;
            }
            const deltaYaw   = camera.rotation.y - this._prevCameraYaw;
            const deltaPitch = camera.rotation.x - this._prevCameraPitch;
            this._prevCameraYaw   = camera.rotation.y;
            this._prevCameraPitch = camera.rotation.x;

            /* Apply drag — camera moving right pulls weapon left (opposite sign). */
            this._lagOffsetX -= deltaYaw   * this.mouseLagAmount * 60;
            this._lagOffsetY += deltaPitch * this.mouseLagAmount * 60;

            /* Clamp so it doesn't fly off-screen on fast flicks. */
            this._lagOffsetX = Math.max(-MOUSE_LAG_MAX_X, Math.min(MOUSE_LAG_MAX_X, this._lagOffsetX));
            this._lagOffsetY = Math.max(-MOUSE_LAG_MAX_Y, Math.min(MOUSE_LAG_MAX_Y, this._lagOffsetY));

            /* Recover back to centre. */
            const lagRecovery = Math.min(1, this.mouseLagRecovery * dt);
            this._lagOffsetX += (0 - this._lagOffsetX) * lagRecovery;
            this._lagOffsetY += (0 - this._lagOffsetY) * lagRecovery;
        }

        /* ---- 5. Lean shift/tilt ---------------------------------------- */
        const leanViewmodelShift = leanAmount * 3.0;
        const leanViewmodelTilt  = leanAmount * 0.08;

        /* ---- 6. Apply final position and rotation ----------------------- */
        this._anchor.position.set(
            this._basePosition.x + this._currentOffsetX + leanViewmodelShift + this._lagOffsetX,
            this._basePosition.y + this._currentOffsetY + this._recoilY + this._lagOffsetY,
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
     * A fraction of the kick is applied instantly (snappy feel);
     * the rest is added to the spring so recovery is smooth.
     */
    public triggerRecoil(): void {
        /* Instant snap portion. */
        this._recoilZ += this.recoilKickZ * this.recoilKickSnap;
        this._recoilY += this.recoilKickY * this.recoilKickSnap;
        /* Remaining portion fed into spring for smooth recovery. */
        this._recoilZ += this.recoilKickZ * (1 - this.recoilKickSnap);
        this._recoilY += this.recoilKickY * (1 - this.recoilKickSnap);
    }

    /**
     * Resets the anchor to its base position and rotation.
     */
    public dispose(): void {
        this._anchor.position.copyFrom(this._basePosition);
        this._anchor.rotation.set(0, 0, 0);
    }
}
