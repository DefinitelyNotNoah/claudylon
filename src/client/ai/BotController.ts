/**
 * Individual bot AI controller.
 * Handles navigation, target acquisition, aiming, and firing.
 * Uses a PhysicsCharacterController for movement (same as player).
 * @module client/ai/BotController
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    PhysicsCharacterController,
    CharacterSupportedState,
} from "@babylonjs/core/Physics/v2/characterController";
import { Ray } from "@babylonjs/core/Culling/ray";

import "@babylonjs/core/Culling/ray";

import { PLAYER_STATS } from "../../shared/constants/PlayerConstants";
import { WEAPON_STATS } from "../../shared/constants/WeaponConstants";
import { SHIPMENT_SPAWN_POINTS } from "../../shared/constants/MapConstants";
import type { BotDifficulty } from "../../shared/constants/BotConstants";
import type { WeaponId, FireEventData } from "../../shared/types";
import { PlayerStateEnum } from "../../shared/types";
import { Weapon } from "../weapons/Weapon";
import type { NavigationManager } from "./NavigationManager";

/** Gravity vector in cm/s². */
const GRAVITY_Y = -981;

/** Respawn delay after death in seconds. */
const RESPAWN_DELAY = 5.0;

/** How close to a waypoint before advancing to next (cm). */
const WAYPOINT_THRESHOLD = 80;

/** Path recomputation interval in seconds. */
const PATH_RECOMPUTE_INTERVAL = 1.5;

/** Patrol path recomputation interval in seconds. */
const PATROL_RECOMPUTE_INTERVAL = 5.0;

/** Maximum navmesh search radius for random point. */
const RANDOM_POINT_RADIUS = 2500;

/** How close to target before stopping (cm). */
const ENGAGE_STOP_DISTANCE = 200;

/** How often bots re-scan for targets (seconds). */
const TARGET_SCAN_INTERVAL = 0.2;

/** Aim lerp speed per second. */
const AIM_LERP_SPEED = 5.0;

/** Small downward velocity to keep grounded. */
const GROUND_STICK_VEL = -10;

// ─── Reusable temp vectors to avoid per-frame GC pressure ─────────
const _tmpDown = new Vector3(0, -1, 0);
const _tmpVel = new Vector3();
const _tmpEye = new Vector3();
const _tmpTargetEye = new Vector3();
const _tmpToTarget = new Vector3();
const _tmpForward = new Vector3();
const _tmpIntegrate = new Vector3(0, 0, 0);

/**
 * Represents a single bot with its own physics, weapon, and AI state.
 */
export class BotController {
    private _scene: Scene;
    private _navManager: NavigationManager;
    private _difficulty: BotDifficulty;
    private _botIndex: number;
    private _sessionId: string;
    private _displayName: string;

    // Physics
    private _characterController: PhysicsCharacterController;

    // Weapon
    private _weapon: Weapon;
    private _weaponId: WeaponId;

    // AI state
    private _isDead: boolean = false;
    private _respawnTimer: number = 0;
    private _health: number = PLAYER_STATS.health;
    private _yaw: number = 0;
    private _pitch: number = 0;
    private _state: PlayerStateEnum = PlayerStateEnum.Idle;

    // Pathfinding
    private _currentPath: Vector3[] = [];
    private _pathIndex: number = 0;
    private _pathTimer: number = 0;
    private _patrolTarget: Vector3 | null = null;

    // Combat
    private _targetPosition: Vector3 | null = null;
    private _targetAcquiredTime: number = 0;
    private _hasReacted: boolean = false;
    private _fireTimer: number = 0;
    private _targetScanTimer: number = 0;

    // Stats tracking
    private _kills: number = 0;
    private _deaths: number = 0;

    /** When true, the bot skips all AI logic (stands still, doesn't fire). */
    public frozen: boolean = false;

    /** Per-bot manual freeze set via ImGui. Separate from the global/cull freeze. */
    public manualFrozen: boolean = false;

    // Fire event data emitted this frame (consumed by BotManager)
    private _pendingFireEvent: FireEventData | null = null;

    // Death event emitted once on death (consumed by BotManager for weapon drops)
    private _deathEvent: { position: Vector3; weaponId: WeaponId; yaw: number } | null = null;

    /**
     * Creates a new bot controller.
     * @param scene - The Babylon.js scene.
     * @param navManager - The navigation manager for pathfinding.
     * @param difficulty - The difficulty profile for this bot.
     * @param botIndex - Index of this bot (0-based).
     * @param displayName - Display name for scoreboard.
     * @param spawnPosition - Initial spawn position.
     * @param weaponId - The weapon this bot uses.
     */
    constructor(
        scene: Scene,
        navManager: NavigationManager,
        difficulty: BotDifficulty,
        botIndex: number,
        displayName: string,
        spawnPosition: Vector3,
        weaponId: WeaponId,
    ) {
        this._scene = scene;
        this._navManager = navManager;
        this._difficulty = difficulty;
        this._botIndex = botIndex;
        this._sessionId = `bot_${botIndex}`;
        this._displayName = displayName;
        this._weaponId = weaponId;

        this._characterController = new PhysicsCharacterController(
            spawnPosition,
            {
                capsuleHeight: PLAYER_STATS.capsuleHeight,
                capsuleRadius: PLAYER_STATS.capsuleRadius,
            },
            scene,
        );

        this._weapon = new Weapon(WEAPON_STATS[weaponId]);
        this._yaw = Math.random() * Math.PI * 2;
    }

    /** Unique session ID for this bot (e.g. "bot_0"). */
    public get sessionId(): string {
        return this._sessionId;
    }

    /** Display name for scoreboard. */
    public get displayName(): string {
        return this._displayName;
    }

    /** Whether the bot is dead. */
    public get isDead(): boolean {
        return this._isDead;
    }

    /** Current health. */
    public get health(): number {
        return this._health;
    }

    /** Current yaw rotation. */
    public get yaw(): number {
        return this._yaw;
    }

    /** Current player state. */
    public get state(): PlayerStateEnum {
        return this._state;
    }

    /** Currently equipped weapon ID. */
    public get weaponId(): WeaponId {
        return this._weaponId;
    }

    /** Current world position. */
    public get position(): Vector3 {
        return this._characterController.getPosition();
    }

    /** Kill count. */
    public get kills(): number {
        return this._kills;
    }

    /** Death count. */
    public get deaths(): number {
        return this._deaths;
    }

    /** Increments kill count. */
    public addKill(): void {
        this._kills++;
    }

    /**
     * Consumes and returns any pending fire event from this frame.
     * @returns Fire event data if the bot fired, or null.
     */
    public consumeFireEvent(): FireEventData | null {
        const event = this._pendingFireEvent;
        this._pendingFireEvent = null;
        return event;
    }

    /**
     * Consumes and returns the death event (position, weapon, yaw) if the bot
     * died since the last call. Used by BotManager to spawn weapon drops.
     * @returns Death event data, or null if none pending.
     */
    public consumeDeathEvent(): { position: Vector3; weaponId: WeaponId; yaw: number } | null {
        const event = this._deathEvent;
        this._deathEvent = null;
        return event;
    }

    /**
     * Sets the bot's health to an exact value.
     * Used by the developer console.
     * @param value - Health value to set.
     */
    public setHealth(value: number): void {
        this._health = Math.max(0, Math.min(PLAYER_STATS.health, value));
    }

    /**
     * Applies damage to this bot.
     * @param amount - Damage to apply.
     * @returns True if the bot died from this damage.
     */
    public takeDamage(amount: number): boolean {
        if (this._isDead) return false;
        this._health = Math.max(0, this._health - amount);
        if (this._health <= 0) {
            this._die();
            return true;
        }
        return false;
    }

    /**
     * Main per-frame update. Handles respawn, target acquisition,
     * pathfinding, movement, aiming, and firing.
     * @param dt - Delta time in seconds.
     * @param playerPosition - The local player's position.
     * @param playerHealth - The local player's health.
     * @param allBots - All bot controllers (for bot-vs-bot awareness).
     */
    public update(
        dt: number,
        playerPosition: Vector3,
        playerHealth: number,
        allBots: BotController[],
    ): void {
        this._pendingFireEvent = null;

        // Skip AI when frozen (console command)
        if (this.frozen && !this._isDead) return;

        if (this._isDead) {
            this._respawnTimer -= dt;
            if (this._respawnTimer <= 0) {
                this._respawn();
            }
            return;
        }

        this._weapon.update(dt);

        // Find target (player or other bot)
        this._acquireTarget(playerPosition, playerHealth, allBots);

        // Pathfinding
        this._updatePathfinding(dt, playerPosition);

        // Movement
        this._updateMovement(dt);

        // Aiming & firing
        if (this._targetPosition) {
            this._updateAiming(dt);
            this._updateFiring(dt);
        }
    }

    /**
     * Acquires the nearest visible target within engage range and FOV.
     * Checks the player first, then other bots.
     * Runs on a cooldown timer to avoid expensive raycasts every frame.
     */
    private _acquireTarget(
        playerPosition: Vector3,
        playerHealth: number,
        allBots: BotController[],
    ): void {
        // Only re-scan periodically (not every frame) to reduce raycast load
        this._targetScanTimer -= this._scene.getEngine().getDeltaTime() / 1000;
        if (this._targetScanTimer > 0 && this._targetPosition !== null) return;
        this._targetScanTimer = TARGET_SCAN_INTERVAL;

        const myPos = this._characterController.getPosition();
        const eyeY = myPos.y + PLAYER_STATS.capsuleHeight / 2 - 15;
        _tmpEye.set(myPos.x, eyeY, myPos.z);

        let bestTarget: Vector3 | null = null;
        let bestDist = Infinity;

        // Check player
        if (playerHealth > 0) {
            _tmpTargetEye.set(
                playerPosition.x,
                playerPosition.y + PLAYER_STATS.capsuleHeight / 2 - 15,
                playerPosition.z,
            );
            const dist = Vector3.Distance(_tmpEye, _tmpTargetEye);
            // Distance early-out before expensive FOV + LOS checks
            if (dist < this._difficulty.engageRange && this._isInFOV(_tmpEye, _tmpTargetEye) && this._hasLineOfSight(_tmpEye, _tmpTargetEye)) {
                // Store as new Vector3 only when we actually acquire a target (rare)
                bestTarget = _tmpTargetEye.clone();
                bestDist = dist;
            }
        }

        // Check other bots
        for (const bot of allBots) {
            if (bot === this || bot.isDead) continue;
            const botPos = bot.position;
            _tmpTargetEye.set(botPos.x, botPos.y + PLAYER_STATS.capsuleHeight / 2 - 15, botPos.z);
            const dist = Vector3.Distance(_tmpEye, _tmpTargetEye);
            // Distance early-out: skip if farther than best or beyond engage range
            if (dist >= bestDist || dist >= this._difficulty.engageRange) continue;
            if (this._isInFOV(_tmpEye, _tmpTargetEye) && this._hasLineOfSight(_tmpEye, _tmpTargetEye)) {
                bestTarget = _tmpTargetEye.clone();
                bestDist = dist;
            }
        }

        if (bestTarget && !this._targetPosition) {
            // New target acquired — start reaction timer
            this._targetAcquiredTime = 0;
            this._hasReacted = false;
            // Random initial fire delay so bots that acquire the same target don't fire in unison
            this._fireTimer = Math.random() * (this._difficulty.fireIntervalMs / 1000);
        }

        if (!bestTarget) {
            this._hasReacted = false;
            this._targetAcquiredTime = 0;
        }

        this._targetPosition = bestTarget;
    }

    /**
     * Checks whether a target position is within the bot's field of view.
     * Uses module-level temp vectors to avoid allocations.
     * @param eyePos - Bot's eye position.
     * @param targetPos - Target position.
     * @returns True if target is within FOV.
     */
    private _isInFOV(eyePos: Vector3, targetPos: Vector3): boolean {
        const dx = targetPos.x - eyePos.x;
        const dz = targetPos.z - eyePos.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 1) return true;
        const invLen = 1 / Math.sqrt(lenSq);
        const nx = dx * invLen;
        const nz = dz * invLen;

        const fwdX = Math.sin(this._yaw);
        const fwdZ = Math.cos(this._yaw);
        const dot = fwdX * nx + fwdZ * nz;
        const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
        return angle <= this._difficulty.fieldOfView;
    }

    /**
     * Checks line-of-sight between two positions using a raycast.
     * Uses module-level temp vectors to avoid allocations.
     * @param from - Start position.
     * @param to - End position.
     * @returns True if there's a clear line of sight.
     */
    private _hasLineOfSight(from: Vector3, to: Vector3): boolean {
        _tmpToTarget.set(to.x - from.x, to.y - from.y, to.z - from.z);
        const distance = _tmpToTarget.length();
        if (distance < 1) return true;
        _tmpToTarget.normalize();

        const ray = new Ray(from, _tmpToTarget, distance);
        const hit = this._scene.pickWithRay(ray, (mesh) => {
            return mesh.isPickable
                && mesh.isEnabled()
                && !mesh.metadata?.isRemoteBody
                && !mesh.metadata?.isRemoteWeapon
                && !mesh.metadata?.isProjectile;
        });

        // No hit or hit beyond target = clear LOS
        if (!hit || !hit.hit) return true;
        return hit.distance >= distance - 10;
    }

    /**
     * Updates pathfinding: computes path to target or patrol point.
     */
    private _updatePathfinding(dt: number, playerPosition: Vector3): void {
        this._pathTimer += dt;

        if (this._targetPosition) {
            // Path toward target
            if (this._pathTimer >= PATH_RECOMPUTE_INTERVAL || this._currentPath.length === 0) {
                this._pathTimer = 0;
                const myPos = this._characterController.getPosition();
                const targetGround = new Vector3(
                    this._targetPosition.x,
                    this._targetPosition.y - PLAYER_STATS.capsuleHeight / 2 + 15,
                    this._targetPosition.z,
                );
                this._currentPath = this._navManager.computePath(myPos, targetGround);
                this._pathIndex = 0;
            }
        } else {
            // Patrol mode
            if (this._pathTimer >= PATROL_RECOMPUTE_INTERVAL || this._currentPath.length === 0) {
                this._pathTimer = 0;
                const myPos = this._characterController.getPosition();
                this._patrolTarget = this._navManager.getRandomPoint(myPos, RANDOM_POINT_RADIUS);
                this._currentPath = this._navManager.computePath(myPos, this._patrolTarget);
                this._pathIndex = 0;
            }
        }
    }

    /**
     * Moves the bot along its current path using the physics character controller.
     * Uses module-level temp vectors to avoid per-frame GC pressure.
     */
    private _updateMovement(dt: number): void {
        const myPos = this._characterController.getPosition();
        const support = this._characterController.checkSupport(dt, _tmpDown);
        const isSupported = support.supportedState === CharacterSupportedState.SUPPORTED
            || support.supportedState === CharacterSupportedState.SLIDING;

        // If engaged and close to target, stop moving
        if (this._targetPosition) {
            const dx = myPos.x - this._targetPosition.x;
            const dz = myPos.z - this._targetPosition.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < ENGAGE_STOP_DISTANCE) {
                const yVel = isSupported ? GROUND_STICK_VEL : this._characterController.getVelocity().y + GRAVITY_Y * dt * 2.5;
                _tmpVel.set(0, yVel, 0);
                this._characterController.setVelocity(_tmpVel);
                _tmpIntegrate.set(0, 0, 0);
                this._characterController.integrate(dt, support, _tmpIntegrate);
                this._state = PlayerStateEnum.Idle;
                return;
            }
        }

        // Follow path
        if (this._pathIndex < this._currentPath.length) {
            const waypoint = this._currentPath[this._pathIndex];
            const twX = waypoint.x - myPos.x;
            const twZ = waypoint.z - myPos.z;
            const distToWaypoint = Math.sqrt(twX * twX + twZ * twZ);

            if (distToWaypoint < WAYPOINT_THRESHOLD) {
                this._pathIndex++;
                if (this._pathIndex >= this._currentPath.length) {
                    // Reached end of path
                    const yVel = isSupported ? GROUND_STICK_VEL : this._characterController.getVelocity().y + GRAVITY_Y * dt * 2.5;
                    _tmpVel.set(0, yVel, 0);
                    this._characterController.setVelocity(_tmpVel);
                    _tmpIntegrate.set(0, 0, 0);
                    this._characterController.integrate(dt, support, _tmpIntegrate);
                    this._state = PlayerStateEnum.Idle;
                    return;
                }
            }

            if (distToWaypoint > 0.01) {
                const invDist = 1 / distToWaypoint;
                const normX = twX * invDist;
                const normZ = twZ * invDist;
                // Face movement direction when not engaged
                if (!this._targetPosition) {
                    this._yaw = Math.atan2(normX, normZ);
                }
                const yVel = isSupported ? GROUND_STICK_VEL : this._characterController.getVelocity().y + GRAVITY_Y * dt * 2.5;
                _tmpVel.set(normX * PLAYER_STATS.movementSpeed, yVel, normZ * PLAYER_STATS.movementSpeed);
                this._characterController.setVelocity(_tmpVel);
                _tmpIntegrate.set(0, 0, 0);
                this._characterController.integrate(dt, support, _tmpIntegrate);
                this._state = PlayerStateEnum.Walking;
                return;
            }
        }

        // No path or at end
        const yVel = isSupported ? GROUND_STICK_VEL : this._characterController.getVelocity().y + GRAVITY_Y * dt * 2.5;
        _tmpVel.set(0, yVel, 0);
        this._characterController.setVelocity(_tmpVel);
        _tmpIntegrate.set(0, 0, 0);
        this._characterController.integrate(dt, support, _tmpIntegrate);
        this._state = PlayerStateEnum.Idle;
    }

    /**
     * Lerps yaw/pitch toward the current target with accuracy-based spread.
     * Uses inline math to avoid per-frame Vector3 allocations.
     */
    private _updateAiming(dt: number): void {
        if (!this._targetPosition) return;

        const myPos = this._characterController.getPosition();
        const ttX = this._targetPosition.x - myPos.x;
        const ttY = this._targetPosition.y - (myPos.y + PLAYER_STATS.capsuleHeight / 2 - 15);
        const ttZ = this._targetPosition.z - myPos.z;
        const horizontalDist = Math.sqrt(ttX * ttX + ttZ * ttZ);

        const desiredYaw = Math.atan2(ttX, ttZ);
        const desiredPitch = -Math.atan2(ttY, horizontalDist);

        // Add random spread based on inaccuracy
        const spread = (1 - this._difficulty.aimAccuracy) * 0.15;
        const spreadYaw = (Math.random() - 0.5) * spread;
        const spreadPitch = (Math.random() - 0.5) * spread;

        const lerpFactor = Math.min(1, AIM_LERP_SPEED * dt);

        // Lerp yaw (handle wraparound)
        let yawDiff = desiredYaw + spreadYaw - this._yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this._yaw += yawDiff * lerpFactor;

        // Lerp pitch
        const pitchDiff = desiredPitch + spreadPitch - this._pitch;
        this._pitch += pitchDiff * lerpFactor;
        this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
    }

    /**
     * Handles firing after reaction delay.
     */
    private _updateFiring(dt: number): void {
        if (!this._targetPosition) return;

        this._targetAcquiredTime += dt * 1000; // Convert to ms
        this._fireTimer -= dt;

        // Wait for reaction time
        if (this._targetAcquiredTime < this._difficulty.reactionTimeMs) {
            return;
        }
        this._hasReacted = true;

        // Check fire interval
        if (this._fireTimer > 0) return;

        // Bots reload normally but have infinite reserves
        if (this._weapon.currentAmmo === 0) {
            this._weapon.refillAmmo(); // Replenish reserves so reload always succeeds
            this._weapon.startReload();
            return;
        }

        if (!this._weapon.canFire) return;

        // Fire!
        this._weapon.tryFire();
        const baseInterval = this._difficulty.fireIntervalMs / 1000;
        this._fireTimer = baseInterval * (0.5 + Math.random()); // 50–150% of base interval

        // Emit fire event
        const myPos = this._characterController.getPosition();
        _tmpEye.set(myPos.x, myPos.y + PLAYER_STATS.capsuleHeight / 2 - 15, myPos.z);

        const cosPitch = Math.cos(this._pitch);
        _tmpForward.set(
            Math.sin(this._yaw) * cosPitch,
            -Math.sin(this._pitch),
            Math.cos(this._yaw) * cosPitch,
        );
        _tmpForward.normalize();

        const originX = _tmpEye.x + _tmpForward.x * 50;
        const originY = _tmpEye.y + _tmpForward.y * 50;
        const originZ = _tmpEye.z + _tmpForward.z * 50;
        const stats = this._weapon.stats;

        this._pendingFireEvent = {
            projectileId: `${this._sessionId}_${Date.now()}`,
            x: originX,
            y: originY,
            z: originZ,
            dirX: _tmpForward.x,
            dirY: _tmpForward.y,
            dirZ: _tmpForward.z,
            speed: stats.projectileSpeed,
            damage: stats.damage,
            size: stats.projectileSize,
            weaponId: this._weaponId,
        };
    }

    /**
     * Kills this bot and starts the respawn timer.
     * Moves the physics body far underground to avoid blocking other entities.
     */
    private _die(): void {
        this._isDead = true;
        this._deaths++;
        this._respawnTimer = RESPAWN_DELAY;
        this._targetPosition = null;
        this._currentPath = [];
        this._pathIndex = 0;

        // Capture death position/weapon before moving underground (for weapon drops)
        const pos = this._characterController.getPosition();
        this._deathEvent = { position: pos.clone(), weaponId: this._weaponId, yaw: this._yaw };

        // Move physics capsule underground so it doesn't block players/bots
        this._characterController.setPosition(new Vector3(pos.x, -5000, pos.z));
        this._characterController.setVelocity(Vector3.Zero());
    }

    /**
     * Respawns the bot at a random predefined spawn point.
     */
    private _respawn(): void {
        this._isDead = false;
        this._health = PLAYER_STATS.health;

        // Pick a random spawn point from the predefined list
        const sp = SHIPMENT_SPAWN_POINTS[Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length)];
        const spawnPoint = new Vector3(sp.x, sp.y, sp.z);
        this._characterController.setPosition(spawnPoint);

        // Randomize weapon on respawn
        const allWeapons = Object.keys(WEAPON_STATS) as WeaponId[];
        this._weaponId = allWeapons[Math.floor(Math.random() * allWeapons.length)];
        this._weapon = new Weapon(WEAPON_STATS[this._weaponId]);
        this._targetPosition = null;
        this._currentPath = [];
        this._pathIndex = 0;
        this._hasReacted = false;
        this._targetAcquiredTime = 0;
        this._targetScanTimer = 0;
        this._yaw = Math.random() * Math.PI * 2;
    }

    /**
     * Forces immediate respawn at a random spawn point, regardless of death state.
     */
    public forceRespawn(): void {
        this._respawn();
    }

    /**
     * Forces the bot to die immediately (bypasses normal damage).
     * Calls _die() internally — increments death count, emits death event, and starts respawn timer.
     */
    public forceKill(): void {
        if (!this._isDead) {
            this._die();
        }
    }

    /**
     * Teleports the bot to a specific position.
     * @param x - World X coordinate.
     * @param y - World Y coordinate.
     * @param z - World Z coordinate.
     */
    public teleport(x: number, y: number, z: number): void {
        this._characterController.setPosition(new Vector3(x, y, z));
        this._characterController.setVelocity(Vector3.Zero());
        this._currentPath = [];
        this._pathIndex = 0;
        this._patrolTarget = null;
    }

    /**
     * Changes the bot's weapon to a new weapon ID.
     * @param weaponId - The weapon to equip.
     */
    public setWeapon(weaponId: WeaponId): void {
        this._weaponId = weaponId;
        this._weapon = new Weapon(WEAPON_STATS[weaponId]);
    }

    /**
     * Returns the bot's current difficulty profile (shared reference — mutations apply live).
     */
    public get difficulty(): BotDifficulty {
        return this._difficulty;
    }

    /**
     * Returns the bot index (0-based).
     */
    public get botIndex(): number {
        return this._botIndex;
    }

    /**
     * Disposes the physics character controller.
     */
    public dispose(): void {
        this._characterController.dispose();
    }
}
