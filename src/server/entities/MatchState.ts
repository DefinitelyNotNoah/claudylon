/**
 * Match room state schema. Contains all player states
 * synced to all connected clients.
 *
 * NOTE: All @type() fields use 'declare' to prevent class field initializers
 * from overwriting the getter/setter descriptors created by the decorator.
 * @module server/entities/MatchState
 */

import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema.js";

/**
 * Root state for the match room.
 */
export class MatchState extends Schema {
    /** All players in the match, keyed by session ID. */
    @type({ map: PlayerSchema }) declare players: MapSchema<PlayerSchema>;

    /** Current match status. */
    @type("string") declare status: string;

    /** Seconds remaining in the match. */
    @type("float32") declare timeRemaining: number;
}
