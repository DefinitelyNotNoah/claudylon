/**
 * Runtime weapon instance. Wraps WeaponStats and tracks ammo, cooldown, and reload state.
 * @module client/weapons/Weapon
 */

import type { WeaponStats, WeaponId } from "../../shared/types";

/**
 * Represents a weapon the player is carrying. Manages ammo count,
 * fire rate cooldown, reload timer, and burst shot tracking.
 */
export class Weapon {
    private _stats: WeaponStats;
    private _currentAmmo: number;
    private _reserveAmmo: number;
    private _fireCooldown: number = 0;
    private _isReloading: boolean = false;
    private _reloadTimer: number = 0;
    private _burstShotsRemaining: number = 0;

    /**
     * Creates a weapon instance.
     * @param stats - The weapon's static stats definition.
     * @param currentAmmo - Magazine rounds (-1 = full magazine).
     * @param reserveAmmo - Reserve rounds (-1 = full reserves).
     */
    constructor(stats: WeaponStats, currentAmmo: number = -1, reserveAmmo: number = -1) {
        this._stats = stats;
        this._currentAmmo = currentAmmo >= 0 ? currentAmmo : stats.magazineSize;
        this._reserveAmmo = reserveAmmo >= 0 ? reserveAmmo : stats.magazineSize * stats.magazineCount;
    }

    /** The weapon's static stats. */
    public get stats(): WeaponStats {
        return this._stats;
    }

    /** Unique weapon identifier. */
    public get id(): WeaponId {
        return this._stats.id;
    }

    /** Display name. */
    public get name(): string {
        return this._stats.name;
    }

    /** Rounds remaining in the current magazine. */
    public get currentAmmo(): number {
        return this._currentAmmo;
    }

    /** Total rounds in reserve (not in the current magazine). */
    public get reserveAmmo(): number {
        return this._reserveAmmo;
    }

    /** Whether the weapon is currently reloading. */
    public get isReloading(): boolean {
        return this._isReloading;
    }

    /** Remaining shots in the current burst (burst fire mode only). */
    public get burstShotsRemaining(): number {
        return this._burstShotsRemaining;
    }

    /** Whether the weapon can fire right now. */
    public get canFire(): boolean {
        return this._currentAmmo > 0 && this._fireCooldown <= 0 && !this._isReloading;
    }

    /** Whether the weapon can start a reload. */
    public get canReload(): boolean {
        return !this._isReloading
            && this._reserveAmmo > 0
            && this._currentAmmo < this._stats.magazineSize;
    }

    /**
     * Updates cooldown and reload timers. Call once per frame.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        if (this._fireCooldown > 0) {
            this._fireCooldown -= dt;
        }

        if (this._isReloading) {
            this._reloadTimer -= dt;
            if (this._reloadTimer <= 0) {
                this._completeReload();
            }
        }
    }

    /**
     * Attempts to fire. Returns true if a round was consumed.
     * Sets the fire rate cooldown.
     */
    public tryFire(): boolean {
        if (!this.canFire) return false;

        this._currentAmmo--;
        this._fireCooldown = 1 / this._stats.fireRate;
        return true;
    }

    /**
     * Starts a burst sequence (for burst fire mode).
     * Sets burstShotsRemaining to 3.
     */
    public startBurst(): void {
        this._burstShotsRemaining = 3;
    }

    /**
     * Decrements the burst counter after a burst shot.
     */
    public consumeBurstShot(): void {
        if (this._burstShotsRemaining > 0) {
            this._burstShotsRemaining--;
        }
    }

    /**
     * Begins a reload if possible.
     * @returns Whether the reload was started.
     */
    public startReload(): boolean {
        if (!this.canReload) return false;

        this._isReloading = true;
        this._reloadTimer = this._stats.reloadTime;
        this._burstShotsRemaining = 0;
        return true;
    }

    /**
     * Completes the reload, filling the magazine from reserves.
     */
    private _completeReload(): void {
        const needed = this._stats.magazineSize - this._currentAmmo;
        const available = Math.min(needed, this._reserveAmmo);
        this._currentAmmo += available;
        this._reserveAmmo -= available;
        this._isReloading = false;
        this._reloadTimer = 0;
    }

    /**
     * Cancels an in-progress reload without completing it.
     * Used when the player dies mid-reload.
     */
    public cancelReload(): void {
        this._isReloading = false;
        this._reloadTimer = 0;
    }

    /**
     * Adds one magazine worth of reserve ammo, capped at max reserves.
     * Used when picking up a same-type weapon drop.
     */
    public addReserveAmmo(): void {
        const max = this._stats.magazineSize * this._stats.magazineCount;
        this._reserveAmmo = Math.min(max, this._reserveAmmo + this._stats.magazineSize);
    }

    /**
     * Refills the magazine and reserves to full capacity.
     * Used for bots that should never run out of ammo.
     */
    public refillAmmo(): void {
        this._currentAmmo = this._stats.magazineSize;
        this._reserveAmmo = this._stats.magazineSize * this._stats.magazineCount;
    }
}
