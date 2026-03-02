/**
 * Networked player state. Synced to all clients via Colyseus delta encoding.
 * Positions and rotations use the game's centimeter world scale.
 *
 * NOTE: All @type() fields use 'declare' to prevent class field initializers
 * from overwriting the getter/setter descriptors created by the decorator.
 * Default values are set after construction instead.
 * @module server/entities/PlayerSchema
 */

import { Schema, type } from "@colyseus/schema";

/**
 * Schema representing a single player's networked state in a match.
 */
export class PlayerSchema extends Schema {
    /** Colyseus session ID. */
    @type("string") declare sessionId: string;

    /** Player display name. */
    @type("string") declare displayName: string;

    /** X position in centimeters. */
    @type("float32") declare x: number;

    /** Y position in centimeters. */
    @type("float32") declare y: number;

    /** Z position in centimeters. */
    @type("float32") declare z: number;

    /** Yaw rotation in radians. */
    @type("float32") declare yaw: number;

    /** Pitch rotation in radians. */
    @type("float32") declare pitch: number;

    /** Current health points. */
    @type("int16") declare health: number;

    /** Current player state (PlayerStateEnum value). */
    @type("string") declare state: string;

    /** Currently equipped weapon ID. */
    @type("string") declare weaponId: string;

    /** Rounds remaining in current magazine. */
    @type("int16") declare currentAmmo: number;

    /** Total reserve rounds. */
    @type("int16") declare reserveAmmo: number;

    /** Total kills this match. */
    @type("int16") declare kills: number;

    /** Total deaths this match. */
    @type("int16") declare deaths: number;
}
