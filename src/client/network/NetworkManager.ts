/**
 * Singleton networking layer wrapping the Colyseus client.
 * Manages server connection, room lifecycle, and message sending/receiving.
 * @module client/network/NetworkManager
 */

import { Client, Room, Callbacks } from "@colyseus/sdk";
import type {
    PlayerUpdateData,
    FireEventData,
    HitClaimData,
} from "../../shared/types/index.js";

/** Default Colyseus server port. */
const DEFAULT_PORT = 2567;

/** Throttle interval for player_update messages (ms). */
const POSITION_UPDATE_INTERVAL_MS = 50;

/**
 * Manages all Colyseus networking: server connection, room
 * lifecycle, and message sending/receiving. Scenes register
 * callbacks to react to network events.
 */
export class NetworkManager {
    private static _instance: NetworkManager;

    private _client: Client | null = null;
    private _lobbyRoom: Room | null = null;
    private _matchRoom: Room | null = null;
    private _matchCallbacks: any = null;
    private _lastPositionUpdate: number = 0;
    private _sessionId: string = "";

    // ─── Lobby Callbacks ──────────────────────────────────────────

    /** Called when the lobby state changes. */
    public onLobbyStateChange: ((state: any) => void) | null = null;

    /** Called when the host starts the game. */
    public onGameStarting: (() => void) | null = null;

    // ─── Match Callbacks ──────────────────────────────────────────

    /** Called when the match state changes. */
    public onMatchStateChange: ((state: any) => void) | null = null;

    /** Called when a remote player is added to the match. */
    public onPlayerAdded: ((sessionId: string, player: any) => void) | null = null;

    /** Called when a remote player leaves the match. */
    public onPlayerRemoved: ((sessionId: string) => void) | null = null;

    /** Called when a remote player fires a projectile. */
    public onRemoteFire: ((data: any) => void) | null = null;

    /** Called when the server confirms a hit. */
    public onHitConfirmed: ((data: any) => void) | null = null;

    /** Called when any player is killed. */
    public onPlayerKilled: ((data: any) => void) | null = null;

    /** Called when the local player is hit by another player. */
    public onPlayerHit: ((data: any) => void) | null = null;

    /** Called when the server assigns a spawn position. */
    public onSpawn: ((data: any) => void) | null = null;

    /** Called when the local player respawns after death. */
    public onRespawn: ((data: any) => void) | null = null;

    /** Called when the match timer expires and the match ends. */
    public onMatchEnded: ((data: any) => void) | null = null;

    /** Called when the match resets after the end-of-round period. */
    public onMatchReset: (() => void) | null = null;

    private constructor() {}

    /** Returns the singleton instance. */
    public static getInstance(): NetworkManager {
        if (!NetworkManager._instance) {
            NetworkManager._instance = new NetworkManager();
        }
        return NetworkManager._instance;
    }

    /** The local client's session ID. */
    public get sessionId(): string {
        return this._sessionId;
    }

    /** Whether currently connected to a match room. */
    public get isInMatch(): boolean {
        return this._matchRoom !== null;
    }

    /** The current lobby room, if connected. */
    public get lobbyRoom(): Room | null {
        return this._lobbyRoom;
    }

    /** The current match room, if connected. */
    public get matchRoom(): Room | null {
        return this._matchRoom;
    }

    /** The Callbacks API instance for the match room, if connected. */
    public get matchCallbacks(): any {
        return this._matchCallbacks;
    }

    /**
     * Fires onPlayerAdded for all existing players already in the match room.
     * Must be called after the scene has registered its onPlayerAdded callback,
     * since Callbacks.onAdd skips immediate invocation to avoid timing issues.
     */
    public triggerExistingPlayers(): void {
        if (!this._matchRoom) return;
        const state = this._matchRoom.state as any;
        if (!state?.players) return;

        state.players.forEach((player: any, sessionId: string) => {
            if (sessionId !== this._sessionId) {
                this.onPlayerAdded?.(sessionId, player);
            }
        });
    }

    /**
     * Connects to the Colyseus server.
     * @param host - Server hostname or IP (e.g. "localhost" or Radmin VPN IP).
     * @param port - Server port (default 2567).
     */
    public connect(host: string, port: number = DEFAULT_PORT): void {
        this._client = new Client(`ws://${host}:${port}`);
    }

    /**
     * Creates a new lobby room (host flow).
     * @param displayName - The player's display name.
     */
    public async createLobby(displayName: string): Promise<void> {
        if (!this._client) throw new Error("Not connected to server");
        this._lobbyRoom = await this._client.create("lobby", { displayName });
        this._sessionId = this._lobbyRoom.sessionId;
        this._setupLobbyListeners();
    }

    /**
     * Joins an existing lobby room (join flow).
     * @param displayName - The player's display name.
     */
    public async joinLobby(displayName: string): Promise<void> {
        if (!this._client) throw new Error("Not connected to server");
        this._lobbyRoom = await this._client.joinOrCreate("lobby", { displayName });
        this._sessionId = this._lobbyRoom.sessionId;
        this._setupLobbyListeners();
    }

    /**
     * Sends start_game message to the lobby (host only).
     */
    public startGame(): void {
        this._lobbyRoom?.send("start_game", {});
    }

    /**
     * Joins the match room. Called after receiving "game_starting".
     * Leaves the lobby room first.
     * @param displayName - The player's display name.
     * @param weaponId - Starting weapon ID.
     */
    public async joinMatch(displayName: string, weaponId: string = "usp"): Promise<void> {
        if (!this._client) throw new Error("Not connected to server");

        // Leave lobby (await to ensure clean disconnect)
        if (this._lobbyRoom) {
            await this._lobbyRoom.leave();
            this._lobbyRoom = null;
        }

        this._matchRoom = await this._client.joinOrCreate("match", { displayName, weaponId });
        this._sessionId = this._matchRoom.sessionId;
        this._setupMatchListeners();
    }

    /**
     * Sends a player position/state update to the server.
     * Throttled to POSITION_UPDATE_INTERVAL_MS.
     * @param data - Player position, rotation, and state.
     */
    public sendPlayerUpdate(data: PlayerUpdateData): void {
        if (!this._matchRoom) return;

        const now = performance.now();
        if (now - this._lastPositionUpdate < POSITION_UPDATE_INTERVAL_MS) return;
        this._lastPositionUpdate = now;

        this._matchRoom.send("player_update", data);
    }

    /**
     * Sends a fire event to the server.
     * @param data - Projectile spawn data.
     */
    public sendFire(data: FireEventData): void {
        this._matchRoom?.send("fire", data);
    }

    /**
     * Sends a hit claim to the server for validation.
     * @param data - Hit claim data.
     */
    public sendHitClaim(data: HitClaimData): void {
        this._matchRoom?.send("hit_claim", data);
    }

    /**
     * Leaves all rooms and disconnects from the server.
     */
    public disconnect(): void {
        this._lobbyRoom?.leave();
        this._matchRoom?.leave();
        this._lobbyRoom = null;
        this._matchRoom = null;
        this._matchCallbacks = null;
        this._client = null;
        this._sessionId = "";
    }

    /** Sets up event listeners for the lobby room. */
    private _setupLobbyListeners(): void {
        if (!this._lobbyRoom) return;

        this._lobbyRoom.onStateChange((state: any) => {
            this.onLobbyStateChange?.(state);
        });

        this._lobbyRoom.onMessage("game_starting", () => {
            this.onGameStarting?.();
        });

        this._lobbyRoom.onError((code: number, message?: string) => {
            console.error(`[Lobby] Error ${code}: ${message}`);
        });

        this._lobbyRoom.onLeave((code: number) => {
            console.log(`[Lobby] Left with code ${code}`);
        });
    }

    /** Sets up event listeners for the match room. */
    private _setupMatchListeners(): void {
        if (!this._matchRoom) return;

        // Register message handlers immediately (before state arrives)
        this._matchRoom.onMessage("remote_fire", (data: any) => {
            this.onRemoteFire?.(data);
        });

        this._matchRoom.onMessage("hit_confirmed", (data: any) => {
            this.onHitConfirmed?.(data);
        });

        this._matchRoom.onMessage("player_killed", (data: any) => {
            this.onPlayerKilled?.(data);
        });

        this._matchRoom.onMessage("player_hit", (data: any) => {
            this.onPlayerHit?.(data);
        });

        this._matchRoom.onMessage("spawn", (data: any) => {
            this.onSpawn?.(data);
        });

        this._matchRoom.onMessage("respawn", (data: any) => {
            this.onRespawn?.(data);
        });

        this._matchRoom.onMessage("match_ended", (data: any) => {
            this.onMatchEnded?.(data);
        });

        this._matchRoom.onMessage("match_reset", () => {
            this.onMatchReset?.();
        });

        this._matchRoom.onError((code: number, message?: string) => {
            console.error(`[Match] Error ${code}: ${message}`);
        });

        this._matchRoom.onLeave((code: number) => {
            console.log(`[Match] Left with code ${code}`);
            this._matchRoom = null;
            this._matchCallbacks = null;
        });

        // State change listener for general updates
        this._matchRoom.onStateChange((state: any) => {
            this.onMatchStateChange?.(state);
        });

        // Use Callbacks.get() API for MapSchema add/remove events
        this._matchCallbacks = Callbacks.get(this._matchRoom);

        // Pass false to skip immediate invocation for existing players.
        // MatchScene will call triggerExistingPlayers() after registering its callbacks.
        this._matchCallbacks.onAdd("players", (player: any, sessionId: string) => {
            if (sessionId !== this._sessionId) {
                this.onPlayerAdded?.(sessionId, player);
            }
        }, false);

        this._matchCallbacks.onRemove("players", (player: any, sessionId: string) => {
            this.onPlayerRemoved?.(sessionId);
        });
    }
}
