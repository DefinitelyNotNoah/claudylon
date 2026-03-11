/**
 * Match room for active gameplay. Relays player state,
 * validates hit claims, and manages kills/respawns.
 * @module server/rooms/MatchRoom
 */

import { Room, type Client } from "colyseus";
import { MapSchema } from "@colyseus/schema";
import { MatchState } from "../entities/MatchState.js";
import { PlayerSchema } from "../entities/PlayerSchema.js";
import { SHIPMENT_SPAWN_POINTS, MATCH_DURATION_S, MATCH_RESET_DELAY_MS } from "../../shared/constants/MapConstants.js";
import { PLAYER_STATS } from "../../shared/constants/PlayerConstants.js";
import { WEAPON_STATS } from "../../shared/constants/WeaponConstants.js";
import type {
    PlayerUpdateData,
    FireEventData,
    HitClaimData,
    WeaponId,
} from "../../shared/types/index.js";

/** Respawn delay in milliseconds. */
const RESPAWN_DELAY_MS = 3000;

/** Maximum allowed damage per single hit (sanity check). */
const MAX_SINGLE_HIT_DAMAGE = 100;



/**
 * Match room. Handles active gameplay state relay,
 * hit validation, kill tracking, and respawning.
 */
export class MatchRoom extends Room<MatchState> {
    /** Maximum players in a match. */
    maxClients = 10;

    /** State sync frequency: 50ms = 20 updates per second. */
    patchRate = 50;

    /**
     * Called once when the room is created.
     */
    onCreate(): void {
        const state = new MatchState();
        state.players = new MapSchema<PlayerSchema>();
        state.status = "playing";
        state.timeRemaining = MATCH_DURATION_S;
        this.state = state;

        // Server-side game loop (16ms ≈ 60fps): counts down the match timer
        this.setSimulationInterval((deltaMs: number) => {
            if (this.state.status !== "playing") return;

            this.state.timeRemaining -= deltaMs / 1000;

            if (this.state.timeRemaining <= 0) {
                this.state.timeRemaining = 0;
                this._endMatch();
            }
        }, 16);

        console.log("[MatchRoom] Created");
    }

    /**
     * Called when a client joins the match.
     * @param client - The connecting client.
     * @param options - Join options containing displayName and weaponId.
     */
    onJoin(client: Client, options?: { displayName?: string; weaponId?: string }): void {
        const spawnIndex = Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length);
        const spawn = SHIPMENT_SPAWN_POINTS[spawnIndex];

        const player = new PlayerSchema();
        player.sessionId = client.sessionId;
        player.displayName = options?.displayName || `Player_${client.sessionId.substring(0, 4)}`;
        player.x = spawn.x;
        player.y = spawn.y;
        player.z = spawn.z;
        player.yaw = 0;
        player.pitch = 0;
        player.health = PLAYER_STATS.health;
        player.state = "Idle";
        player.weaponId = options?.weaponId || "usp";
        player.kills = 0;
        player.deaths = 0;
        player.leanAmount = 0;

        const weaponStats = WEAPON_STATS[player.weaponId as WeaponId];
        if (weaponStats) {
            player.currentAmmo = weaponStats.magazineSize;
            player.reserveAmmo = weaponStats.magazineSize * weaponStats.magazineCount;
        } else {
            player.currentAmmo = 12;
            player.reserveAmmo = 48;
        }

        this.state.players.set(client.sessionId, player);

        // Tell the joining client their spawn position
        client.send("spawn", {
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            sessionId: client.sessionId,
        });

        console.log(`[MatchRoom] ${player.displayName} joined at spawn ${spawnIndex}`);
    }

    /**
     * Called when a client leaves the match.
     * @param client - The disconnecting client.
     */
    onLeave(client: Client): void {
        const player = this.state.players.get(client.sessionId);
        const name = player?.displayName || client.sessionId;
        this.state.players.delete(client.sessionId);
        console.log(`[MatchRoom] ${name} left`);
    }

    /** Message handlers. */
    messages = {
        /**
         * Client sends their position/rotation/state.
         * Server updates the schema so all other clients receive the delta.
         */
        "player_update": (client: Client, data: PlayerUpdateData) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.state === "Dead") return;

            player.x = data.x;
            player.y = data.y;
            player.z = data.z;
            player.yaw = data.yaw;
            player.pitch = data.pitch;
            player.state = data.state as string;
            player.weaponId = data.weaponId as string;
            player.currentAmmo = data.currentAmmo;
            player.reserveAmmo = data.reserveAmmo;
            player.leanAmount = data.leanAmount ?? 0;
        },

        /**
         * Client fired a projectile. Relay to all other clients
         * so they can render the projectile visually.
         */
        "fire": (client: Client, data: FireEventData) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.state === "Dead") return;

            this.broadcast("remote_fire", {
                ownerId: client.sessionId,
                ...data,
            }, { except: client });
        },

        /**
         * Client claims a hit. Validate and apply damage.
         * The firer detects hits locally via raycast and sends
         * a claim; the server validates basic sanity and applies damage.
         */
        "hit_claim": (client: Client, data: HitClaimData) => {
            const attacker = this.state.players.get(client.sessionId);
            const target = this.state.players.get(data.targetSessionId);

            if (!attacker || !target) return;
            if (attacker.state === "Dead" || target.state === "Dead") return;
            if (data.targetSessionId === client.sessionId) return;

            // Validate damage matches weapon stats
            const weaponStats = WEAPON_STATS[data.weaponId as WeaponId];
            if (!weaponStats) return;
            if (data.damage > MAX_SINGLE_HIT_DAMAGE) return;
            if (data.damage !== weaponStats.damage) return;

            // Apply damage
            target.health = Math.max(0, target.health - data.damage);
            console.log(`[MatchRoom] Hit: ${attacker.displayName} → ${target.displayName} for ${data.damage} dmg (health: ${target.health})`);

            // Notify the attacker of confirmed hit (for hitmarker)
            client.send("hit_confirmed", {
                targetId: data.targetSessionId,
                damage: data.damage,
            });

            // Notify the victim they were hit (for health update + hit indicator)
            this.broadcast("player_hit", {
                victimId: data.targetSessionId,
                attackerId: client.sessionId,
                attackerX: attacker.x,
                attackerY: attacker.y,
                attackerZ: attacker.z,
                damage: data.damage,
                newHealth: target.health,
            });

            // Check for kill
            if (target.health <= 0) {
                target.state = "Dead";
                attacker.kills += 1;
                target.deaths += 1;

                // Broadcast kill event to all clients
                this.broadcast("player_killed", {
                    killerId: client.sessionId,
                    killerName: attacker.displayName,
                    victimId: data.targetSessionId,
                    victimName: target.displayName,
                    weaponId: data.weaponId,
                });

                // Schedule respawn
                this.clock.setTimeout(() => {
                    const respawningPlayer = this.state.players.get(data.targetSessionId);
                    if (!respawningPlayer) return;

                    const spawnIndex = Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length);
                    const spawn = SHIPMENT_SPAWN_POINTS[spawnIndex];
                    respawningPlayer.x = spawn.x;
                    respawningPlayer.y = spawn.y;
                    respawningPlayer.z = spawn.z;
                    respawningPlayer.health = PLAYER_STATS.health;
                    respawningPlayer.state = "Idle";

                    // Notify the respawned client
                    const targetClient = this.clients.find(
                        (c: Client) => c.sessionId === data.targetSessionId
                    );
                    if (targetClient) {
                        targetClient.send("respawn", {
                            x: spawn.x,
                            y: spawn.y,
                            z: spawn.z,
                        });
                    }
                }, RESPAWN_DELAY_MS);
            }
        },
    };

    /**
     * Ends the match. Broadcasts final scoreboard and schedules reset.
     */
    private _endMatch(): void {
        this.state.status = "ended";

        // Build sorted scoreboard
        const scoreboard: { sessionId: string; displayName: string; kills: number; deaths: number }[] = [];
        this.state.players.forEach((player: PlayerSchema, sessionId: string) => {
            scoreboard.push({
                sessionId,
                displayName: player.displayName,
                kills: player.kills,
                deaths: player.deaths,
            });
        });
        scoreboard.sort((a, b) => b.kills - a.kills);

        this.broadcast("match_ended", { scoreboard });
        console.log("[MatchRoom] Match ended");

        // Schedule match reset
        this.clock.setTimeout(() => {
            this._resetMatch();
        }, MATCH_RESET_DELAY_MS);
    }

    /**
     * Resets the match: respawns all players, clears stats, restarts timer.
     */
    private _resetMatch(): void {
        this.state.players.forEach((player: PlayerSchema, sessionId: string) => {
            const spawnIndex = Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length);
            const spawn = SHIPMENT_SPAWN_POINTS[spawnIndex];

            player.x = spawn.x;
            player.y = spawn.y;
            player.z = spawn.z;
            player.health = PLAYER_STATS.health;
            player.state = "Idle";
            player.kills = 0;
            player.deaths = 0;

            const client = this.clients.find((c: Client) => c.sessionId === sessionId);
            if (client) {
                client.send("respawn", {
                    x: spawn.x,
                    y: spawn.y,
                    z: spawn.z,
                });
            }
        });

        this.state.timeRemaining = MATCH_DURATION_S;
        this.state.status = "playing";

        this.broadcast("match_reset", {});
        console.log("[MatchRoom] Match reset");
    }

    /**
     * Called when the room is disposed.
     */
    onDispose(): void {
        console.log("[MatchRoom] Disposed");
    }
}
