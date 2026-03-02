/**
 * Enum-based state machine for player movement states.
 * Determines the current state based on ground support and input.
 * @module client/player/PlayerStateMachine
 */

import { PlayerStateEnum } from "../../shared/types";

/**
 * Manages player state transitions. Updated once per physics step.
 * Phase 1 covers: Idle, Walking, Jumping, Falling.
 */
export class PlayerStateMachine {
    private _currentState: PlayerStateEnum;

    /**
     * Creates the state machine in the Idle state.
     */
    constructor() {
        this._currentState = PlayerStateEnum.Idle;
    }

    /** The current player state. */
    public get currentState(): PlayerStateEnum {
        return this._currentState;
    }

    /**
     * Evaluates state transitions based on physics and input.
     * @param isSupported - Whether the character controller is on the ground.
     * @param isMoving - Whether WASD input is producing a nonzero velocity.
     * @param wantsJump - Whether the jump input was triggered this frame.
     */
    public update(isSupported: boolean, isMoving: boolean, wantsJump: boolean): void {
        switch (this._currentState) {
            case PlayerStateEnum.Idle:
                if (!isSupported) {
                    this._currentState = PlayerStateEnum.Falling;
                } else if (wantsJump) {
                    this._currentState = PlayerStateEnum.Jumping;
                } else if (isMoving) {
                    this._currentState = PlayerStateEnum.Walking;
                }
                break;

            case PlayerStateEnum.Walking:
                if (!isSupported) {
                    this._currentState = PlayerStateEnum.Falling;
                } else if (wantsJump) {
                    this._currentState = PlayerStateEnum.Jumping;
                } else if (!isMoving) {
                    this._currentState = PlayerStateEnum.Idle;
                }
                break;

            case PlayerStateEnum.Jumping:
                this._currentState = PlayerStateEnum.Falling;
                break;

            case PlayerStateEnum.Falling:
                if (isSupported) {
                    this._currentState = isMoving ? PlayerStateEnum.Walking : PlayerStateEnum.Idle;
                }
                break;

            default:
                break;
        }
    }

    /**
     * Forces the state machine into a specific state.
     * @param state - The state to force.
     */
    public forceState(state: PlayerStateEnum): void {
        this._currentState = state;
    }
}
