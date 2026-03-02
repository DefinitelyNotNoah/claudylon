/**
 * Manages player XP and level progression with localStorage persistence.
 * Pure TypeScript singleton — no Babylon.js dependency.
 * @module client/progression/ProgressionManager
 */

import {
    XP_PER_LEVEL,
    XP_PER_KILL,
    WEAPON_UNLOCK_REQUIREMENTS,
} from "../../shared/constants/WeaponConstants";
import type { WeaponId } from "../../shared/types";

/** localStorage key for current XP within the level. */
const XP_KEY = "fps_player_xp";

/** localStorage key for current level. */
const LEVEL_KEY = "fps_player_level";

/** Maximum achievable level. */
const MAX_LEVEL = 30;

/**
 * Result returned by `addXP()`.
 */
export interface XPAddResult {
    /** XP within the current level after addition. */
    newXP: number;
    /** Player's level after addition. */
    newLevel: number;
    /** Whether at least one level-up occurred. */
    leveledUp: boolean;
    /** Level before the XP was added. */
    previousLevel: number;
    /** Weapons unlocked at the new level(s). */
    unlockedWeapons: WeaponId[];
}

/**
 * Singleton that tracks player XP and level, persisted via localStorage.
 * Uses `XP_PER_LEVEL`, `XP_PER_KILL`, and `WEAPON_UNLOCK_REQUIREMENTS`
 * from WeaponConstants.
 */
export class ProgressionManager {
    private static _instance: ProgressionManager | null = null;
    private _xp: number;
    private _level: number;

    /**
     * Private constructor — loads state from localStorage.
     */
    private constructor() {
        this._xp = parseInt(localStorage.getItem(XP_KEY) ?? "0", 10) || 0;
        this._level = parseInt(localStorage.getItem(LEVEL_KEY) ?? "1", 10) || 1;
        this._level = Math.max(1, Math.min(MAX_LEVEL, this._level));
        this._xp = Math.max(0, this._xp);
    }

    /**
     * Returns the singleton instance.
     */
    public static getInstance(): ProgressionManager {
        if (!ProgressionManager._instance) {
            ProgressionManager._instance = new ProgressionManager();
        }
        return ProgressionManager._instance;
    }

    /** Current XP within the current level. */
    public get currentXP(): number {
        return this._xp;
    }

    /** Current player level (1-based). */
    public get currentLevel(): number {
        return this._level;
    }

    /** XP required to reach the next level. Infinity at max level. */
    public get xpForCurrentLevel(): number {
        if (this._level >= MAX_LEVEL) return Infinity;
        return XP_PER_LEVEL[this._level - 1];
    }

    /** XP progress within the current level as a 0..1 float. */
    public get xpProgressInLevel(): number {
        if (this._level >= MAX_LEVEL) return 1;
        const threshold = XP_PER_LEVEL[this._level - 1];
        if (threshold <= 0) return 1;
        return Math.min(1, this._xp / threshold);
    }

    /** XP awarded per kill. */
    public get xpPerKill(): number {
        return XP_PER_KILL;
    }

    /**
     * Adds XP and handles level-up(s). Saves to localStorage.
     * @param amount - XP to add.
     * @returns Result with new state and any unlocked weapons.
     */
    public addXP(amount: number): XPAddResult {
        const previousLevel = this._level;
        this._xp += amount;
        let leveledUp = false;
        const unlockedWeapons: WeaponId[] = [];

        while (this._level < MAX_LEVEL) {
            const threshold = XP_PER_LEVEL[this._level - 1];
            if (this._xp >= threshold) {
                this._xp -= threshold;
                this._level++;
                leveledUp = true;

                // Check for weapon unlocks at this new level
                for (const req of WEAPON_UNLOCK_REQUIREMENTS) {
                    if (req.unlockLevel === this._level) {
                        unlockedWeapons.push(req.weaponId);
                    }
                }
            } else {
                break;
            }
        }

        // Clamp XP at max level
        if (this._level >= MAX_LEVEL) {
            this._xp = 0;
        }

        this._save();

        return {
            newXP: this._xp,
            newLevel: this._level,
            leveledUp,
            previousLevel,
            unlockedWeapons,
        };
    }

    /**
     * Checks whether a weapon is unlocked at the current level.
     * @param weaponId - The weapon to check.
     * @returns True if the weapon is unlocked.
     */
    public isWeaponUnlocked(weaponId: WeaponId): boolean {
        const req = WEAPON_UNLOCK_REQUIREMENTS.find(r => r.weaponId === weaponId);
        if (!req) return true; // No requirement = always unlocked
        return this._level >= req.unlockLevel;
    }

    /**
     * Returns all weapon IDs unlocked at or below the given level.
     * @param level - The level to check against.
     * @returns Array of unlocked weapon IDs.
     */
    public getUnlockedWeapons(level: number): WeaponId[] {
        return WEAPON_UNLOCK_REQUIREMENTS
            .filter(r => r.unlockLevel <= level)
            .map(r => r.weaponId);
    }

    /**
     * Persists current state to localStorage.
     */
    private _save(): void {
        localStorage.setItem(XP_KEY, String(this._xp));
        localStorage.setItem(LEVEL_KEY, String(this._level));
    }
}
