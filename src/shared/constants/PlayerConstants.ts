/**
 * Default player stats and movement constants.
 * World scale is centimeters (gravity = -981 cm/s²).
 * @module shared/constants/PlayerConstants
 */

import type { PlayerStats } from "../types";

/** Default player stats applied to all players and bots. */
export const PLAYER_STATS: PlayerStats = {
    health: 100,
    movementSpeed: 500,
    jumpHeight: 250,
    capsuleHeight: 180,
    capsuleRadius: 40,
};

/** Default mouse sensitivity (radians per pixel). */
export const DEFAULT_MOUSE_SENSITIVITY: number = 0.002;

/** Minimum allowed mouse sensitivity. */
export const MIN_MOUSE_SENSITIVITY: number = 0.0005;

/** Maximum allowed mouse sensitivity. */
export const MAX_MOUSE_SENSITIVITY: number = 0.01;

/** localStorage key for persisted mouse sensitivity. */
export const SENSITIVITY_STORAGE_KEY: string = "fps_mouse_sensitivity";

/** Default master volume (0–1). */
export const DEFAULT_MASTER_VOLUME: number = 1.0;

/** localStorage key for persisted master volume. */
export const MASTER_VOLUME_KEY: string = "fps_master_volume";
