/**
 * Character model definitions, registry, and localStorage keys.
 * All Mixamo-based models share the same skeleton (mixamorig:* bones),
 * so animations, ragdoll, and weapon attachment work across all models.
 * @module shared/constants/CharacterConstants
 */

/**
 * Definition for a selectable character model.
 */
export interface CharacterModelDef {
    /** Unique identifier (e.g., "xbot", "ybot", "soldier"). */
    id: string;
    /** Human-readable display name (e.g., "X-Bot"). */
    name: string;
    /** Asset path relative to public/ (e.g., "assets/characters/xbot.glb"). */
    glb: string;
}

/** All available character models. */
export const CHARACTER_MODELS: CharacterModelDef[] = [
    { id: "xbot", name: "X-Bot", glb: "assets/characters/xbot.glb" },
    { id: "ybot", name: "Y-Bot", glb: "assets/characters/ybot.glb" },
    { id: "soldier", name: "Soldier", glb: "assets/characters/character.glb" },
];

/** Default character model ID. */
export const DEFAULT_CHARACTER_ID = "xbot";

/** localStorage key for the player's selected character model. */
export const CHARACTER_MODEL_KEY = "fps_loadout_character";

/** localStorage key for the bot character model setting. */
export const BOT_CHARACTER_KEY = "fps_bot_character";

/** Default bot character setting (random picks from all models). */
export const DEFAULT_BOT_CHARACTER = "random";

/**
 * Resolves a character ID to its GLB asset path.
 * Falls back to the default character if the ID is not found.
 * @param id - Character model ID.
 * @returns The GLB asset path.
 */
export function getCharacterGlb(id: string): string {
    const model = CHARACTER_MODELS.find((m) => m.id === id);
    if (model) return model.glb;
    const fallback = CHARACTER_MODELS.find((m) => m.id === DEFAULT_CHARACTER_ID);
    return fallback?.glb ?? CHARACTER_MODELS[0].glb;
}
