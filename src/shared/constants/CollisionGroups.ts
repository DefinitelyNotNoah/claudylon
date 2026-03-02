/**
 * Collision filter bitmasks for Havok physics shapes.
 * Used to control which physics bodies collide with each other.
 *
 * Collision happens when BOTH checks pass:
 *   (A.membership & B.collideMask) !== 0
 *   (B.membership & A.collideMask) !== 0
 *
 * @module shared/constants/CollisionGroups
 */

/** World geometry: ground, walls, props. Collides with everything. */
export const COLLISION_GROUP_WORLD = 0x0001;

/** Player character controllers. */
export const COLLISION_GROUP_PLAYER = 0x0002;

/** Ragdoll physics bodies. Should only collide with world, not players. */
export const COLLISION_GROUP_RAGDOLL = 0x0004;

/** Default membership — all groups (backwards compatible with Havok default). */
export const COLLISION_MASK_ALL = 0xFFFFFFFF;

/** Ragdoll bodies collide with world only. */
export const COLLISION_MASK_RAGDOLL = COLLISION_GROUP_WORLD;

/** Player collides with world and other players, NOT ragdoll. */
export const COLLISION_MASK_PLAYER = COLLISION_MASK_ALL & ~COLLISION_GROUP_RAGDOLL;
