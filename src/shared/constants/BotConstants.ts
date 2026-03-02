/**
 * Bot AI constants: difficulty profiles, bot names, and localStorage keys.
 * @module shared/constants/BotConstants
 */

/**
 * Difficulty profile for bot AI behavior.
 */
export interface BotDifficulty {
    /** Difficulty display name. */
    name: string;
    /** Aim accuracy multiplier (0 = terrible, 1 = perfect). Controls spread offset. */
    aimAccuracy: number;
    /** Delay in ms before firing after first spotting a target. */
    reactionTimeMs: number;
    /** Half-angle field of view in radians for target detection. */
    fieldOfView: number;
    /** Maximum engagement range in cm. */
    engageRange: number;
    /** Minimum ms between fire attempts. */
    fireIntervalMs: number;
}

/** Bot difficulty presets. */
export const BOT_DIFFICULTIES: Record<string, BotDifficulty> = {
    easy: {
        name: "Easy",
        aimAccuracy: 0.3,
        reactionTimeMs: 800,
        fieldOfView: Math.PI / 3,
        engageRange: 2000,
        fireIntervalMs: 600,
    },
    medium: {
        name: "Medium",
        aimAccuracy: 0.6,
        reactionTimeMs: 400,
        fieldOfView: Math.PI / 2.5,
        engageRange: 3000,
        fireIntervalMs: 350,
    },
    hard: {
        name: "Hard",
        aimAccuracy: 0.9,
        reactionTimeMs: 150,
        fieldOfView: Math.PI / 2,
        engageRange: 5000,
        fireIntervalMs: 150,
    },
};

/** Display names for bots. Index matches bot number. */
export const BOT_NAMES: string[] = [
    "Alpha", "Bravo", "Charlie", "Delta",
    "Echo", "Foxtrot", "Golf", "Hotel",
];

/** localStorage key for bot count setting. */
export const BOT_COUNT_KEY = "fps_bot_count";

/** localStorage key for bot difficulty setting. */
export const BOT_DIFFICULTY_KEY = "fps_bot_difficulty";

/** Default number of bots in offline mode. */
export const DEFAULT_BOT_COUNT = 4;

/** Default bot difficulty. */
export const DEFAULT_BOT_DIFFICULTY = "medium";

/** localStorage key for the ragdoll enabled toggle. */
export const RAGDOLL_ENABLED_KEY = "fps_ragdoll_enabled";

/** Default ragdoll enabled state. */
export const DEFAULT_RAGDOLL_ENABLED = true;

/** Distance in cm beyond which entities (bots / remote players) become dormant. */
export const ENTITY_CULL_DISTANCE = 5000;
