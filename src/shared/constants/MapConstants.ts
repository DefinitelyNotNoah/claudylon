/**
 * Shared map constants used by both server and client.
 * @module shared/constants/MapConstants
 */

import type { SpawnPoint } from "../types/index.js";

/**
 * Spawn points for the Shipment map.
 * Matches the positions defined in MatchScene._createSpawnPoints().
 */
/** Match duration in seconds (5 minutes). */
export const MATCH_DURATION_S = 300;

/** Delay before resetting the match after it ends (ms). */
export const MATCH_RESET_DELAY_MS = 10000;

export const SHIPMENT_SPAWN_POINTS: SpawnPoint[] = [
    { x: -1285.4, y: 165.1, z: -1247.7 },
    { x: 142.6, y: 165, z: 176.8 },
    { x: 106.4, y: 165, z: -1338.7 },
    { x: -606, y: 165.1, z: 889 },
    { x: -805.9, y: 165.1, z: 606.8 },
    { x: 1221.6, y: 165, z: 1220 },
    { x: 623.4, y: 165, z: 421.1 },
    { x: 783, y: 165, z: -605.6 },
];
