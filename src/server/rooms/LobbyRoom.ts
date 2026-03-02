/**
 * Lobby room for pre-game player gathering.
 * Players join the lobby, the host starts the game, and all
 * players transition to the match room.
 * @module server/rooms/LobbyRoom
 */

import { Room, type Client } from "colyseus";
import { MapSchema } from "@colyseus/schema";
import { LobbyState, LobbyPlayerSchema } from "../entities/LobbyState.js";

/**
 * Lobby room. Manages connected players before a match starts.
 * The first player to join becomes the host with start privileges.
 */
export class LobbyRoom extends Room<{ state: LobbyState }> {
    /** Maximum players in a lobby. */
    maxClients = 10;

    /**
     * Called once when the room is created.
     */
    onCreate(): void {
        const state = new LobbyState();
        state.players = new MapSchema<LobbyPlayerSchema>();
        state.hostId = "";
        state.status = "waiting";
        this.state = state;
        console.log("[LobbyRoom] Created");
    }

    /**
     * Called when a client joins the lobby.
     * @param client - The connecting client.
     * @param options - Join options containing displayName.
     */
    onJoin(client: Client, options?: { displayName?: string }): void {
        const player = new LobbyPlayerSchema();
        player.sessionId = client.sessionId;
        player.displayName = options?.displayName || `Player_${client.sessionId.substring(0, 4)}`;
        player.isReady = false;
        this.state.players.set(client.sessionId, player);

        // First player becomes host
        if (this.state.players.size === 1) {
            this.state.hostId = client.sessionId;
        }

        console.log(`[LobbyRoom] ${player.displayName} joined (${this.state.players.size} players)`);
    }

    /**
     * Called when a client leaves the lobby.
     * @param client - The disconnecting client.
     */
    onLeave(client: Client): void {
        const player = this.state.players.get(client.sessionId);
        const name = player?.displayName || client.sessionId;
        this.state.players.delete(client.sessionId);

        // Reassign host if the host left
        if (this.state.hostId === client.sessionId && this.state.players.size > 0) {
            const firstKey = this.state.players.keys().next().value;
            if (firstKey) {
                this.state.hostId = firstKey;
            }
        }

        console.log(`[LobbyRoom] ${name} left (${this.state.players.size} players)`);
    }

    /** Message handlers. */
    messages = {
        /**
         * Host starts the game. Broadcasts game_starting to all clients.
         */
        "start_game": (client: Client) => {
            if (client.sessionId !== this.state.hostId) return;
            if (this.state.status !== "waiting") return;

            this.state.status = "starting";
            this.broadcast("game_starting", {});
            console.log("[LobbyRoom] Game starting!");
        },

        /**
         * Player toggles their ready status.
         */
        "set_ready": (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.isReady = !player.isReady;
            }
        },
    };

    /**
     * Called when the room is disposed.
     */
    onDispose(): void {
        console.log("[LobbyRoom] Disposed");
    }
}
