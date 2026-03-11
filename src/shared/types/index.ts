/**
 * Shared type definitions used across client and server.
 * @module shared/types
 */

/** Possible states for a player in the state machine. */
export enum PlayerStateEnum {
    Idle = "Idle",
    Walking = "Walking",
    Jumping = "Jumping",
    Falling = "Falling",
    Firing = "Firing",
    Reloading = "Reloading",
    Dead = "Dead",
}

/** Weapon firing modes. */
export type FireMode = "semi" | "burst" | "automatic";

/** Weapon categories. */
export type WeaponCategory = "pistol" | "rifle" | "sniper";

/** Unique identifiers for all weapons. */
export type WeaponId =
    | "usp"
    | "m9"
    | "eagle"
    | "ak47"
    | "m4a1"
    | "scar"
    | "intervention"
    | "50cal"
    | "svd";

/**
 * Stats defining a weapon's behavior and properties.
 */
export interface WeaponStats {
    /** Unique weapon identifier. */
    id: WeaponId;
    /** Display name. */
    name: string;
    /** Weapon class category. */
    category: WeaponCategory;
    /** Damage per projectile hit. */
    damage: number;
    /** Rounds fired per second. */
    fireRate: number;
    /** Projectile travel speed in units per second. */
    projectileSpeed: number;
    /** Projectile collision radius. */
    projectileSize: number;
    /** Rounds per magazine. */
    magazineSize: number;
    /** Total backup magazines. */
    magazineCount: number;
    /** Firing mode. */
    fireMode: FireMode;
    /** Time to reload in seconds. */
    reloadTime: number;
    /** GLB model filename in public/assets/weapons/. */
    modelFile: string;
    /** Audio filename in public/assets/audio/player/. */
    audioFile: string;
    /** Muzzle flash offset in weapon-root local space (x, y, z). */
    muzzleOffset: { x: number; y: number; z: number };
    /** Muzzle flash rotation in radians (x, y, z) applied to the muzzle node. */
    muzzleRotation: { x: number; y: number; z: number };
    /** Viewmodel rotation in radians (x, y, z) applied to the weapon root node. */
    modelRotation: { x: number; y: number; z: number };
    /** Viewmodel position offset in local space (x, y, z) relative to the camera anchor. */
    modelPosition: { x: number; y: number; z: number };
    /** Scale factor for dropped weapon model in world space. */
    dropScale: number;
    /** Third-person scale when attached to character bone (bone-local, compensates for 100x model scale). */
    tpScale: number;
    /** Third-person rotation in radians (x, y, z) when attached to character bone. */
    tpRotation: { x: number; y: number; z: number };
    /** Third-person position offset (bone-local units) when attached to character bone. */
    tpPosition: { x: number; y: number; z: number };
    /** Ragdoll launch velocity in cm/s applied on kill. Higher = stronger knockback. */
    ragdollImpulse: number;
}

/**
 * Base stats for a player entity.
 */
export interface PlayerStats {
    /** Maximum health points. */
    health: number;
    /** Movement speed in units per second. */
    movementSpeed: number;
    /** Jump height in units. */
    jumpHeight: number;
    /** Physics capsule total height. */
    capsuleHeight: number;
    /** Physics capsule radius. */
    capsuleRadius: number;
}

/**
 * Defines the level at which a weapon becomes available.
 */
export interface WeaponUnlockRequirement {
    /** The weapon to unlock. */
    weaponId: WeaponId;
    /** Minimum player level required. */
    unlockLevel: number;
}

// ─── Networking Types ─────────────────────────────────────────────────

/** Possible lobby statuses. */
export type LobbyStatus = "waiting" | "starting" | "in-game";

/** Possible match statuses. */
export type MatchStatus = "playing" | "ended";

/** A spawn point's world-space coordinates (centimeters). */
export interface SpawnPoint {
    /** X position. */
    x: number;
    /** Y position. */
    y: number;
    /** Z position. */
    z: number;
}

/** Data sent with a player_update message (client → server). */
export interface PlayerUpdateData {
    /** X position in centimeters. */
    x: number;
    /** Y position in centimeters. */
    y: number;
    /** Z position in centimeters. */
    z: number;
    /** Yaw rotation in radians. */
    yaw: number;
    /** Pitch rotation in radians. */
    pitch: number;
    /** Current player state. */
    state: PlayerStateEnum;
    /** Currently equipped weapon ID. */
    weaponId: WeaponId;
    /** Rounds in current magazine. */
    currentAmmo: number;
    /** Total reserve rounds. */
    reserveAmmo: number;
    /** Lean amount (-1 = full left, 0 = upright, 1 = full right). */
    leanAmount: number;
}

/** Data sent with a fire message (client → server). */
export interface FireEventData {
    /** Unique projectile identifier. */
    projectileId: string;
    /** Origin X position. */
    x: number;
    /** Origin Y position. */
    y: number;
    /** Origin Z position. */
    z: number;
    /** Direction X (normalized). */
    dirX: number;
    /** Direction Y (normalized). */
    dirY: number;
    /** Direction Z (normalized). */
    dirZ: number;
    /** Projectile travel speed in cm/s. */
    speed: number;
    /** Damage per hit. */
    damage: number;
    /** Projectile collision radius. */
    size: number;
    /** Weapon that fired the projectile. */
    weaponId: WeaponId;
}

/** Data sent with a hit_claim message (client → server). */
export interface HitClaimData {
    /** ID of the projectile that scored the hit. */
    projectileId: string;
    /** Session ID of the player that was hit. */
    targetSessionId: string;
    /** Damage dealt. */
    damage: number;
    /** Weapon that dealt the damage. */
    weaponId: WeaponId;
}
