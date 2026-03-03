/**
 * Manages all bots in an offline match.
 * Creates navigation mesh, spawns bots, syncs visuals via RemotePlayer,
 * handles projectile lifecycle, and provides scoreboard data.
 * @module client/ai/BotManager
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { BotDifficulty } from "../../shared/constants/BotConstants";
import {
    BOT_DIFFICULTIES,
    BOT_NAMES,
    ENTITY_CULL_DISTANCE,
} from "../../shared/constants/BotConstants";
import { PLAYER_STATS } from "../../shared/constants/PlayerConstants";
import { SHIPMENT_SPAWN_POINTS } from "../../shared/constants/MapConstants";
import { WEAPON_STATS } from "../../shared/constants/WeaponConstants";
import type { WeaponId } from "../../shared/types";
import { RemotePlayer } from "../network/RemotePlayer";
import { Projectile } from "../weapons/Projectile";
import { AudioManager } from "../audio/AudioManager";
import type { ScoreboardEntry } from "../ui/ScoreboardUI";
import type { WeaponDropManager } from "../weapons/WeaponDropManager";
import { CharacterModel } from "../characters/CharacterModel";
import {
    CHARACTER_MODELS,
    BOT_CHARACTER_KEY,
    DEFAULT_BOT_CHARACTER,
} from "../../shared/constants/CharacterConstants";
import { NavigationManager } from "./NavigationManager";
import { BotController } from "./BotController";

/** Weapons bots can spawn with (randomly selected). */
const BOT_WEAPONS: WeaponId[] = [
    "usp", "m9", "eagle",
    "ak47", "m4a1", "scar",
    "intervention", "50cal", "svd",
];

/**
 * Event emitted when a bot hits the local player.
 */
export interface BotHitPlayerEvent {
    /** Damage dealt. */
    damage: number;
    /** Weapon used. */
    weaponId: WeaponId;
    /** Bot's display name. */
    botName: string;
    /** Bot's position (for hit indicator direction). */
    botPosition: Vector3;
}

/**
 * Event emitted when a bot kills the local player.
 */
export interface BotKillPlayerEvent {
    /** Bot's display name. */
    botName: string;
    /** Weapon used. */
    weaponId: WeaponId;
}

/**
 * Result of a player hitting a bot.
 */
export interface PlayerHitBotResult {
    /** Whether the bot was killed. */
    killed: boolean;
    /** Bot's display name. */
    botName: string;
    /** Bot's kill count. */
    botKills: number;
    /** Bot's death count. */
    botDeaths: number;
}

/**
 * Orchestrates all bot AI, visuals, and projectiles in offline mode.
 */
export class BotManager {
    private _scene: Scene;
    private _difficulty: BotDifficulty;
    private _navManager: NavigationManager;
    private _bots: BotController[] = [];
    private _botMap: Map<string, BotController> = new Map();
    private _remotes: Map<string, RemotePlayer> = new Map();
    private _botProjectiles: Projectile[] = [];
    private _audioManager: AudioManager | null = null;
    private _weaponDropManager: WeaponDropManager | null = null;
    private _manualFreezeAll: boolean = false;
    private _ragdollFreezeAll: boolean = false;

    /**
     * Creates a new BotManager.
     * @param scene - The Babylon.js scene.
     * @param difficultyKey - Difficulty key ("easy", "medium", "hard").
     * @param audioManager - Audio manager for bot gunshot sounds.
     */
    /** The navigation manager used for navmesh pathfinding. */
    public get navigationManager(): NavigationManager {
        return this._navManager;
    }

    /** Returns the array of bot controllers for external reads (e.g., minimap). */
    public get bots(): readonly BotController[] {
        return this._bots;
    }

    /** Whether all bots are manually frozen via console command. */
    public get manualFreezeAll(): boolean {
        return this._manualFreezeAll;
    }

    /** Whether all bots are frozen due to ragdoll toggle. */
    public get ragdollFreezeAll(): boolean {
        return this._ragdollFreezeAll;
    }
    public set ragdollFreezeAll(value: boolean) {
        this._ragdollFreezeAll = value;
    }

    /**
     * Toggles manual freeze on all bots (console command).
     * When frozen, bots go idle, stop pathfinding, and stop firing.
     * @returns The new freeze state.
     */
    public toggleFreezeAll(): boolean {
        this._manualFreezeAll = !this._manualFreezeAll;
        for (const bot of this._bots) {
            bot.frozen = this._manualFreezeAll;
        }
        // Force visuals to idle when freezing
        if (this._manualFreezeAll) {
            for (const bot of this._bots) {
                const remote = this._remotes.get(bot.sessionId);
                if (remote && !bot.isDead) {
                    const pos = bot.position;
                    const groundY = pos.y - PLAYER_STATS.capsuleHeight / 2;
                    remote.updateFromServer(
                        pos.x,
                        groundY,
                        pos.z,
                        bot.yaw,
                        bot.health,
                        "Idle",
                        bot.weaponId,
                    );
                }
            }
        }
        return this._manualFreezeAll;
    }

    /**
     * Sets the weapon drop manager so bot deaths can spawn weapon drops.
     * @param manager - The weapon drop manager instance.
     */
    public set weaponDropManager(manager: WeaponDropManager | null) {
        this._weaponDropManager = manager;
    }

    constructor(scene: Scene, difficultyKey: string, audioManager: AudioManager | null) {
        this._scene = scene;
        this._difficulty = BOT_DIFFICULTIES[difficultyKey] ?? BOT_DIFFICULTIES["medium"];
        this._navManager = new NavigationManager(scene);
        this._audioManager = audioManager;
    }

    /**
     * Initializes the navigation mesh and spawns bots.
     * @param botCount - Number of bots to spawn (1-8).
     */
    public async initialize(botCount: number): Promise<void> {
        await this._navManager.initialize();

        // Read bot character setting from localStorage
        const botCharSetting = localStorage.getItem(BOT_CHARACTER_KEY) ?? DEFAULT_BOT_CHARACTER;
        const isRandom = botCharSetting === "random";

        // Preload needed character models
        if (isRandom) {
            await CharacterModel.preloadAll(this._scene);
        } else {
            const model = CHARACTER_MODELS.find((m) => m.id === botCharSetting);
            const glb = model?.glb ?? CHARACTER_MODELS[0].glb;
            await CharacterModel.preload(this._scene, glb);
        }

        const count = Math.max(1, Math.min(8, botCount));

        for (let i = 0; i < count; i++) {
            const name = BOT_NAMES[i] ?? `Bot ${i + 1}`;
            const weaponId = BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)];

            // Pick a spawn point from the predefined list (offset by 1 to avoid player spawn)
            const sp = SHIPMENT_SPAWN_POINTS[(i + 1) % SHIPMENT_SPAWN_POINTS.length];
            const spawnPos = new Vector3(sp.x, sp.y, sp.z);

            // Resolve character GLB for this bot
            let charGlb: string;
            if (isRandom) {
                charGlb = CHARACTER_MODELS[Math.floor(Math.random() * CHARACTER_MODELS.length)].glb;
            } else {
                const model = CHARACTER_MODELS.find((m) => m.id === botCharSetting);
                charGlb = model?.glb ?? CHARACTER_MODELS[0].glb;
            }

            const bot = new BotController(
                this._scene,
                this._navManager,
                this._difficulty,
                i,
                name,
                spawnPos,
                weaponId,
            );
            this._bots.push(bot);
            this._botMap.set(bot.sessionId, bot);

            // Create visual representation (reuse RemotePlayer)
            const remote = new RemotePlayer(
                this._scene,
                bot.sessionId,
                name,
                spawnPos.x,
                spawnPos.y - PLAYER_STATS.capsuleHeight / 2,
                spawnPos.z,
                charGlb,
            );
            this._remotes.set(bot.sessionId, remote);
        }

        console.log(`[BotManager] Spawned ${count} bots on ${this._difficulty.name} difficulty (character: ${botCharSetting}).`);
    }

    /**
     * Per-frame update for all bots.
     * @param dt - Delta time in seconds.
     * @param playerPosition - Local player's physics position.
     * @param playerHealth - Local player's current health.
     * @returns Object containing events that MatchScene should process.
     */
    public update(
        dt: number,
        playerPosition: Vector3,
        playerHealth: number,
    ): { hitPlayer: BotHitPlayerEvent[], killPlayer: BotKillPlayerEvent[] } {
        const hitPlayerEvents: BotHitPlayerEvent[] = [];
        const killPlayerEvents: BotKillPlayerEvent[] = [];

        // Update each bot's AI
        const cullDistSq = ENTITY_CULL_DISTANCE * ENTITY_CULL_DISTANCE;
        for (const bot of this._bots) {
            const remote = this._remotes.get(bot.sessionId);

            // Distance culling: freeze bots beyond cull distance (XZ plane)
            const dx = playerPosition.x - bot.position.x;
            const dz = playerPosition.z - bot.position.z;
            const distSq = dx * dx + dz * dz;
            const beyondCull = distSq > cullDistSq;
            bot.frozen = beyondCull || this._manualFreezeAll || this._ragdollFreezeAll || bot.manualFrozen;

            // Dormancy toggles based on distance (independent of frozen flag)
            if (remote && !bot.isDead) {
                if (beyondCull && !remote.isDormant) {
                    remote.setDormant(true);
                } else if (!beyondCull && remote.isDormant) {
                    remote.setDormant(false);
                }
            }

            if (bot.frozen) {
                // Always discard events from frozen bots (no projectiles, no weapon drops)
                bot.consumeFireEvent();
                bot.consumeDeathEvent();
                if (!bot.isDead) continue;
                // Dead frozen bots still need respawn timer ticked
                bot.update(dt, playerPosition, playerHealth, this._bots);
                continue;
            }

            bot.update(dt, playerPosition, playerHealth, this._bots);

            // Sync bot state to visual
            if (remote) {
                const pos = bot.position;
                const groundY = pos.y - PLAYER_STATS.capsuleHeight / 2;
                remote.updateFromServer(
                    pos.x,
                    groundY,
                    pos.z,
                    bot.yaw,
                    bot.health,
                    bot.isDead ? "Dead" : bot.state,
                    bot.weaponId,
                );
                remote.update(dt);
            }

            // Check for fire events
            const fireEvent = bot.consumeFireEvent();
            if (fireEvent) {
                // Spawn projectile
                const origin = new Vector3(fireEvent.x, fireEvent.y, fireEvent.z);
                const direction = new Vector3(fireEvent.dirX, fireEvent.dirY, fireEvent.dirZ);
                const projectile = new Projectile(
                    this._scene,
                    origin,
                    direction,
                    fireEvent.speed,
                    fireEvent.size,
                    fireEvent.damage,
                );
                (projectile as any)._ownerSessionId = bot.sessionId;
                (projectile as any)._weaponId = fireEvent.weaponId;
                this._botProjectiles.push(projectile);

                // Trigger recoil animation
                if (remote) {
                    remote.triggerRecoil();
                }

                // Play gunshot sound (spatial — attenuates with distance)
                if (this._audioManager) {
                    const audioFile = this._getAudioFile(bot.weaponId);
                    this._audioManager.playGunshotAt(audioFile, origin);
                }
            }

            // Check for death events — spawn weapon drops
            const deathEvent = bot.consumeDeathEvent();
            if (deathEvent && this._weaponDropManager) {
                const dropPos = new Vector3(
                    deathEvent.position.x + Math.sin(deathEvent.yaw) * 25,
                    deathEvent.position.y + 100,
                    deathEvent.position.z + Math.cos(deathEvent.yaw) * 25,
                );
                this._weaponDropManager.spawnDrop(deathEvent.weaponId, dropPos, deathEvent.yaw);
            }
        }

        // Update bot projectiles
        for (let i = this._botProjectiles.length - 1; i >= 0; i--) {
            const proj = this._botProjectiles[i];

            // Check proximity to player capsule BEFORE raycast update.
            // The player has no pickable mesh, so raycast-based hit detection
            // won't detect the player. We check capsule overlap first so that
            // a wall behind the player doesn't consume the projectile.
            // Use point-to-capsule distance (vertical line segment) instead of
            // a sphere check so shots at head/foot height register correctly.
            if (playerHealth > 0) {
                const projPos = proj.position;
                const halfHeight = PLAYER_STATS.capsuleHeight / 2;
                const capsuleBottom = playerPosition.y - halfHeight;
                const capsuleTop = playerPosition.y + halfHeight;
                // Clamp projectile Y to capsule segment to get nearest point
                const clampedY = Math.max(capsuleBottom, Math.min(capsuleTop, projPos.y));
                const dx = projPos.x - playerPosition.x;
                const dy = projPos.y - clampedY;
                const dz = projPos.z - playerPosition.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                const hitRadius = PLAYER_STATS.capsuleRadius + 10;
                if (distSq < hitRadius * hitRadius) {
                    const ownerSessionId = (proj as any)._ownerSessionId as string;
                    const weaponId = (proj as any)._weaponId as WeaponId;
                    const attackerBot = this._botMap.get(ownerSessionId);

                    hitPlayerEvents.push({
                        damage: proj.damage,
                        weaponId,
                        botName: attackerBot?.displayName ?? "Bot",
                        botPosition: attackerBot?.position.clone() ?? Vector3.Zero(),
                    });

                    // Check if player died
                    if (playerHealth - proj.damage <= 0) {
                        killPlayerEvents.push({
                            botName: attackerBot?.displayName ?? "Bot",
                            weaponId,
                        });
                        attackerBot?.addKill();
                    }

                    proj.dispose();
                    // Swap-and-pop: O(1) removal instead of O(n) splice
                    this._botProjectiles[i] = this._botProjectiles[this._botProjectiles.length - 1];
                    this._botProjectiles.pop();
                    continue;
                }
            }

            const expired = proj.update(dt);
            if (expired) {
                const hit = proj.hitInfo;
                if (hit) {
                    const meshName = hit.hitMeshName;
                    // Check if projectile hit another bot
                    if (meshName.startsWith("remote_body_bot_")) {
                        const targetSessionId = meshName.replace("remote_body_", "");
                        const targetBot = this._botMap.get(targetSessionId);
                        const ownerSessionId = (proj as any)._ownerSessionId as string;
                        if (targetBot && targetBot.sessionId !== ownerSessionId) {
                            const killed = targetBot.takeDamage(proj.damage);
                            if (killed) {
                                const attackerBot = this._botMap.get(ownerSessionId);
                                attackerBot?.addKill();

                                // Trigger ragdoll on the killed bot using projectile travel direction
                                const targetRemote = this._remotes.get(targetBot.sessionId);
                                if (targetRemote && hit.direction) {
                                    const botWeaponId = (proj as any)._weaponId as WeaponId;
                                    const impulse = WEAPON_STATS[botWeaponId]?.ragdollImpulse;
                                    targetRemote.die(hit.direction, impulse);
                                }
                            }
                        }
                    }
                }
                proj.dispose();
                // Swap-and-pop: O(1) removal instead of O(n) splice
                this._botProjectiles[i] = this._botProjectiles[this._botProjectiles.length - 1];
                this._botProjectiles.pop();
            }
        }

        return { hitPlayer: hitPlayerEvents, killPlayer: killPlayerEvents };
    }

    /**
     * Returns the RemotePlayer visual for a given bot session ID.
     * Used by MatchScene to trigger ragdoll with hit direction.
     * @param sessionId - The bot's session ID (e.g., "bot_0").
     * @returns The RemotePlayer instance, or undefined if not found.
     */
    public getRemotePlayer(sessionId: string): RemotePlayer | undefined {
        return this._remotes.get(sessionId);
    }

    /**
     * Handles a player's projectile hitting a bot.
     * @param botSessionId - The session ID of the hit bot (e.g. "bot_0").
     * @param damage - Damage dealt.
     * @returns Hit result, or null if bot not found.
     */
    public handlePlayerHitBot(botSessionId: string, damage: number): PlayerHitBotResult | null {
        const bot = this._botMap.get(botSessionId);
        if (!bot) return null;

        const killed = bot.takeDamage(damage);
        return {
            killed,
            botName: bot.displayName,
            botKills: bot.kills,
            botDeaths: bot.deaths,
        };
    }

    /**
     * Returns scoreboard entries for all bots.
     * @returns Array of scoreboard entries.
     */
    public getScoreboardEntries(): ScoreboardEntry[] {
        return this._bots.map(bot => ({
            sessionId: bot.sessionId,
            displayName: bot.displayName,
            kills: bot.kills,
            deaths: bot.deaths,
            isLocal: false,
        }));
    }

    /**
     * Returns debug info about a specific bot by session ID.
     * @param sessionId - The bot's session ID (e.g. "bot_0").
     * @returns Object with bot details, or null if not found.
     */
    public getBotInfo(sessionId: string): {
        displayName: string;
        health: number;
        weaponId: string;
        state: string;
        x: number;
        y: number;
        z: number;
    } | null {
        const bot = this._botMap.get(sessionId);
        if (!bot) return null;
        const pos = bot.position;
        return {
            displayName: bot.displayName,
            health: bot.health,
            weaponId: bot.weaponId,
            state: bot.isDead ? "Dead" : bot.state,
            x: pos.x,
            y: pos.y,
            z: pos.z,
        };
    }

    /**
     * Returns the audio file for a weapon.
     * @param weaponId - The weapon ID.
     * @returns Audio filename.
     */
    private _getAudioFile(weaponId: WeaponId): string {
        switch (weaponId) {
            case "intervention":
            case "50cal":
            case "svd":
                return "sniper.mp3";
            case "ak47":
            case "m4a1":
            case "scar":
                return "rifle.mp3";
            default:
                return "pistol.mp3";
        }
    }

    /**
     * Adds a single bot at runtime.
     * @param weaponId - Weapon for the new bot (random if omitted).
     * @returns The display name of the newly added bot.
     */
    public addBot(weaponId?: WeaponId): string {
        const index = this._bots.length;
        const name = BOT_NAMES[index] ?? `Bot ${index + 1}`;
        const weapon = weaponId ?? BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)];

        const sp = SHIPMENT_SPAWN_POINTS[(index + 1) % SHIPMENT_SPAWN_POINTS.length];
        const spawnPos = new Vector3(sp.x, sp.y, sp.z);

        // Resolve character GLB from current setting
        const botCharSetting = localStorage.getItem(BOT_CHARACTER_KEY) ?? DEFAULT_BOT_CHARACTER;
        let charGlb: string;
        if (botCharSetting === "random") {
            charGlb = CHARACTER_MODELS[Math.floor(Math.random() * CHARACTER_MODELS.length)].glb;
        } else {
            const model = CHARACTER_MODELS.find((m) => m.id === botCharSetting);
            charGlb = model?.glb ?? CHARACTER_MODELS[0].glb;
        }

        const bot = new BotController(
            this._scene,
            this._navManager,
            this._difficulty,
            index,
            name,
            spawnPos,
            weapon,
        );
        this._bots.push(bot);
        this._botMap.set(bot.sessionId, bot);

        const remote = new RemotePlayer(
            this._scene,
            bot.sessionId,
            name,
            spawnPos.x,
            spawnPos.y - PLAYER_STATS.capsuleHeight / 2,
            spawnPos.z,
            charGlb,
        );
        this._remotes.set(bot.sessionId, remote);

        return name;
    }

    /**
     * Removes a specific bot by session ID, disposing its controller and visual.
     * @param sessionId - The bot's session ID (e.g. "bot_0").
     * @returns The display name of the removed bot, or null if not found.
     */
    public removeBot(sessionId: string): string | null {
        const bot = this._botMap.get(sessionId);
        if (!bot) return null;

        const name = bot.displayName;

        // Dispose controller
        bot.dispose();
        this._botMap.delete(sessionId);
        const botIdx = this._bots.indexOf(bot);
        if (botIdx >= 0) this._bots.splice(botIdx, 1);

        // Dispose visual
        const remote = this._remotes.get(sessionId);
        if (remote) {
            remote.dispose();
            this._remotes.delete(sessionId);
        }

        // Remove any projectiles owned by this bot (swap-and-pop without decrement on match)
        let i = this._botProjectiles.length - 1;
        while (i >= 0) {
            if ((this._botProjectiles[i] as any)._ownerSessionId === sessionId) {
                this._botProjectiles[i].dispose();
                this._botProjectiles[i] = this._botProjectiles[this._botProjectiles.length - 1];
                this._botProjectiles.pop();
                // Don't decrement — re-check same index (swapped element may also match)
            } else {
                i--;
            }
        }

        return name;
    }

    /**
     * Disposes all bots, visuals, and projectiles.
     */
    public dispose(): void {
        for (const bot of this._bots) {
            bot.dispose();
        }
        this._bots = [];
        this._botMap.clear();

        for (const remote of this._remotes.values()) {
            remote.dispose();
        }
        this._remotes.clear();

        for (const proj of this._botProjectiles) {
            proj.dispose();
        }
        this._botProjectiles = [];

        this._navManager.dispose();

        CharacterModel.clearCache();
    }
}
