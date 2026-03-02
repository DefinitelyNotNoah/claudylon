/**
 * Lobby room state schemas for pre-game player management.
 *
 * NOTE: All @type() fields use 'declare' to prevent class field initializers
 * from overwriting the getter/setter descriptors created by the decorator.
 * @module server/entities/LobbyState
 */

import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Represents a player in the lobby (pre-game).
 */
export class LobbyPlayerSchema extends Schema {
    /** Colyseus session ID. */
    @type("string") declare sessionId: string;

    /** Player display name. */
    @type("string") declare displayName: string;

    /** Whether the player has readied up. */
    @type("boolean") declare isReady: boolean;
}

/**
 * Root state for the lobby room. Tracks connected players
 * and game start status.
 */
export class LobbyState extends Schema {
    /** Connected players keyed by session ID. */
    @type({ map: LobbyPlayerSchema }) declare players: MapSchema<LobbyPlayerSchema>;

    /** Session ID of the host player. */
    @type("string") declare hostId: string;

    /** Current lobby status: "waiting", "starting", or "in-game". */
    @type("string") declare status: string;
}
