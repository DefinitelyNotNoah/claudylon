/**
 * Manages equipped weapons, firing, reloading, weapon switching,
 * projectile lifecycle, muzzle flash, and impact marks.
 * @module client/weapons/WeaponManager
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";

import { WEAPON_STATS } from "../../shared/constants";
import type { WeaponId } from "../../shared/types";
import type { InputManager } from "../core/InputManager";
import type { AudioManager } from "../audio/AudioManager";
import { Weapon } from "./Weapon";
import { WeaponViewmodel } from "./WeaponViewmodel";
import { Projectile, type ProjectileHitInfo } from "./Projectile";
import { MuzzleFlash } from "./MuzzleFlash";
import { ImpactMarkManager } from "./ImpactMark";
import { BulletSparkEffect } from "../vfx/BulletSparkEffect";
import { BloodSplatterEffect } from "../vfx/BloodSplatterEffect";

/** Forward offset from camera for projectile spawn to avoid self-collision (cm). */
const PROJECTILE_SPAWN_OFFSET = 50;

/**
 * Orchestrates weapon slots, fire mode handling, reloading,
 * weapon switching, active projectile management, muzzle flash, and impact marks.
 */
export class WeaponManager {
    private _scene: Scene;
    private _viewmodel: WeaponViewmodel;
    private _audio: AudioManager;
    private _slot1: Weapon;
    private _slot2: Weapon;
    private _activeSlot: 1 | 2 = 1;
    private _projectiles: Projectile[] = [];
    private _fireHeldLastFrame: boolean = false;
    private _isSwitching: boolean = false;
    private _muzzleFlash: MuzzleFlash;
    private _impactMarks: ImpactMarkManager;
    private _bulletSpark: BulletSparkEffect;
    private _bloodSplatter: BloodSplatterEffect;
    /** Cooldown to prevent spamming the empty click sound (seconds). */
    private _emptyClickCooldown: number = 0;
    /** Pending sniper lever sound delay timer (-1 = inactive). */
    private _sniperLeverTimer: number = -1;
    /** Whether the weapon was reloading last frame (for detecting reload end). */
    private _wasReloading: boolean = false;

    /** Called when a shot is fired. Used by networking to relay fire events. */
    public onFire: ((origin: Vector3, direction: Vector3, weapon: Weapon) => void) | null = null;

    /** Called when a projectile hits something. Used by networking to send hit claims. */
    public onProjectileHit: ((hitInfo: ProjectileHitInfo, damage: number, weaponId: string) => void) | null = null;

    /**
     * Creates the weapon manager with two equipped weapons.
     * @param scene - The Babylon.js scene.
     * @param viewmodel - The viewmodel renderer.
     * @param audio - The audio manager for gunshot sounds.
     * @param slot1WeaponId - Weapon ID for slot 1.
     * @param slot2WeaponId - Weapon ID for slot 2.
     */
    constructor(
        scene: Scene,
        viewmodel: WeaponViewmodel,
        audio: AudioManager,
        slot1WeaponId: WeaponId,
        slot2WeaponId: WeaponId
    ) {
        this._scene = scene;
        this._viewmodel = viewmodel;
        this._audio = audio;
        this._slot1 = new Weapon(WEAPON_STATS[slot1WeaponId]);
        this._slot2 = new Weapon(WEAPON_STATS[slot2WeaponId]);
        this._muzzleFlash = new MuzzleFlash(scene, viewmodel.muzzleNode, WEAPON_STATS[slot1WeaponId].category);
        this._impactMarks = new ImpactMarkManager(scene);
        this._bulletSpark = new BulletSparkEffect(scene);
        this._bloodSplatter = new BloodSplatterEffect(scene);
    }

    /** The currently active weapon. */
    public get activeWeapon(): Weapon {
        return this._activeSlot === 1 ? this._slot1 : this._slot2;
    }

    /** The currently active slot number. */
    public get activeSlot(): 1 | 2 {
        return this._activeSlot;
    }

    /** Weapon ID in slot 1. */
    public get slot1WeaponId(): WeaponId {
        return this._slot1.id;
    }

    /** Weapon ID in slot 2. */
    public get slot2WeaponId(): WeaponId {
        return this._slot2.id;
    }

    /**
     * Refills ammo for all weapon slots to full capacity.
     * Called on player respawn.
     */
    public refillAllAmmo(): void {
        this._slot1.refillAmmo();
        this._slot2.refillAmmo();
    }

    /**
     * Adds one magazine worth of reserve ammo to any slot holding this weapon.
     * Used when auto-picking up a same-type weapon drop.
     * @param weaponId - The weapon type to add ammo for.
     */
    public addAmmoForWeapon(weaponId: WeaponId): void {
        if (this._slot1.id === weaponId) this._slot1.addReserveAmmo();
        if (this._slot2.id === weaponId) this._slot2.addReserveAmmo();
    }

    /**
     * Replaces the active slot's weapon with a new weapon and loads its viewmodel.
     * Used when picking up a different-type weapon drop.
     * @param weaponId - The new weapon to equip.
     * @param currentAmmo - Magazine rounds to set (-1 = full).
     * @param reserveAmmo - Reserve rounds to set (-1 = full).
     */
    public async replaceActiveWeapon(weaponId: WeaponId, currentAmmo: number = -1, reserveAmmo: number = -1): Promise<void> {
        const newWeapon = new Weapon(WEAPON_STATS[weaponId], currentAmmo, reserveAmmo);
        if (this._activeSlot === 1) this._slot1 = newWeapon;
        else this._slot2 = newWeapon;
        await this._viewmodel.loadWeapon(weaponId);
    }

    /**
     * Hides the viewmodel and cancels any in-progress animations.
     * Called when the player dies.
     */
    public onDeath(): void {
        this._viewmodel.hide();
        this._sniperLeverTimer = -1;
        this._emptyClickCooldown = 0;
    }

    /**
     * Shows the viewmodel, resets weapon state, and refills ammo.
     * Called when the player respawns.
     */
    public onRespawn(): void {
        this._slot1.cancelReload();
        this._slot2.cancelReload();
        this._slot1.refillAmmo();
        this._slot2.refillAmmo();
        this._viewmodel.show();
    }

    /**
     * Per-frame update. Handles input for firing, reloading, and switching.
     * Updates weapon timers, projectile lifecycle, and impact marks.
     * @param dt - Delta time in seconds.
     * @param input - The input manager.
     * @param camera - The player's FPS camera (for projectile direction).
     */
    public update(dt: number, input: InputManager, camera: FreeCamera): void {
        this._handleWeaponSwitch(input);

        this._muzzleFlash.update(dt);
        this._viewmodel.update(dt);

        const weapon = this.activeWeapon;
        weapon.update(dt);

        // Detect reload end — weapon just finished reloading
        if (this._wasReloading && !weapon.isReloading) {
            this._viewmodel.stopReload();
        }
        this._wasReloading = weapon.isReloading;

        // Empty click cooldown
        if (this._emptyClickCooldown > 0) {
            this._emptyClickCooldown -= dt;
        }

        // Sniper lever sound delay
        if (this._sniperLeverTimer > 0) {
            this._sniperLeverTimer -= dt;
            if (this._sniperLeverTimer <= 0) {
                this._audio.playSound("sniper_lever.mp3");
                this._sniperLeverTimer = -1;
            }
        }

        if (!this._viewmodel.isEquipping) {
            if (input.reload && !weapon.isReloading) {
                if (weapon.startReload()) {
                    this._audio.playSound("reload_rifle.mp3");
                    this._viewmodel.startReload();
                }
            }

            this._handleFiring(input, camera, weapon);
        }

        this._fireHeldLastFrame = input.fire;

        this._updateProjectiles(dt);
        this._impactMarks.update(dt);
    }

    /**
     * Handles weapon slot switching on 1/2 key press.
     * @param input - The input manager.
     */
    private _handleWeaponSwitch(input: InputManager): void {
        if (input.weapon1 && this._activeSlot !== 1) {
            this._switchToSlot(1);
        } else if (input.weapon2 && this._activeSlot !== 2) {
            this._switchToSlot(2);
        }
    }

    /**
     * Switches to the specified weapon slot and loads its viewmodel.
     * @param slot - The slot to switch to.
     */
    private async _switchToSlot(slot: 1 | 2): Promise<void> {
        if (this._isSwitching) return;

        this._isSwitching = true;
        this._activeSlot = slot;

        const weapon = this.activeWeapon;
        await this._viewmodel.loadWeapon(weapon.id);
        this._muzzleFlash.setCategory(weapon.stats.category);

        this._isSwitching = false;
    }

    /**
     * Handles fire input based on the weapon's fire mode.
     * @param input - The input manager.
     * @param camera - The player camera for direction.
     * @param weapon - The active weapon.
     */
    private _handleFiring(input: InputManager, camera: FreeCamera, weapon: Weapon): void {
        const fireMode = weapon.stats.fireMode;

        // Empty click: player pulls trigger with no ammo
        if (input.fire && !this._fireHeldLastFrame && weapon.currentAmmo === 0
            && !weapon.isReloading && this._emptyClickCooldown <= 0) {
            this._audio.playSound("empty_click.mp3", 0.5);
            this._emptyClickCooldown = 0.4;

            // Auto-reload after empty click
            if (weapon.canReload) {
                if (weapon.startReload()) {
                    this._audio.playSound("reload_rifle.mp3");
                    this._viewmodel.startReload();
                }
            }
        }

        if (fireMode === "automatic") {
            if (input.fire && weapon.canFire) {
                this._fireShot(camera, weapon);
            }
        } else if (fireMode === "semi") {
            if (input.fire && !this._fireHeldLastFrame && weapon.canFire) {
                this._fireShot(camera, weapon);
            }
        } else if (fireMode === "burst") {
            if (input.fire && !this._fireHeldLastFrame && weapon.canFire) {
                weapon.startBurst();
            }

            if (weapon.burstShotsRemaining > 0 && weapon.canFire) {
                this._fireShot(camera, weapon);
                weapon.consumeBurstShot();
            }
        }
    }

    /**
     * Fires a single shot: consumes ammo, spawns projectile, plays sound, triggers muzzle flash.
     * @param camera - The player camera for spawn position and direction.
     * @param weapon - The weapon being fired.
     */
    private _fireShot(camera: FreeCamera, weapon: Weapon): void {
        if (!weapon.tryFire()) return;

        const direction = camera.getDirection(Vector3.Forward());
        const origin = camera.position.add(direction.scale(PROJECTILE_SPAWN_OFFSET));

        const projectile = new Projectile(
            this._scene,
            origin,
            direction,
            weapon.stats.projectileSpeed,
            weapon.stats.projectileSize,
            weapon.stats.damage
        );
        this._projectiles.push(projectile);

        this._audio.playGunshot(weapon.stats.audioFile);
        this._muzzleFlash.flash();
        this.onFire?.(origin, direction, weapon);

        // Sniper lever action sound after firing a sniper
        if (weapon.stats.category === "sniper" && weapon.currentAmmo > 0) {
            this._sniperLeverTimer = 0.4;
        }
    }

    /**
     * Updates all active projectiles and removes expired ones.
     * Creates impact marks at hit positions.
     * @param dt - Delta time in seconds.
     */
    private _updateProjectiles(dt: number): void {
        for (let i = this._projectiles.length - 1; i >= 0; i--) {
            const proj = this._projectiles[i];
            const expired = proj.update(dt);
            if (expired) {
                const hit = proj.hitInfo;
                if (hit) {
                    const isCharacterHit = hit.hitMeshName.startsWith("remote_body_");
                    if (isCharacterHit) {
                        /* Blood splatter on player/bot body hits. */
                        this._bloodSplatter.play(hit.position);
                    } else {
                        /* Sparks + decal on hard surface hits. */
                        this._bulletSpark.play(hit.position, hit.normal);
                        this._impactMarks.addMark(hit.position, hit.normal);
                    }
                    this.onProjectileHit?.(hit, proj.damage, this.activeWeapon.id);
                }
                proj.dispose();
                this._projectiles.splice(i, 1);
            }
        }
    }

    /** Number of currently active projectiles. */
    public get activeProjectileCount(): number {
        return this._projectiles.length;
    }

    /**
     * Disposes all projectiles, muzzle flash, and impact marks.
     */
    public dispose(): void {
        for (const proj of this._projectiles) {
            proj.dispose();
        }
        this._projectiles = [];
        this._muzzleFlash.dispose();
        this._impactMarks.dispose();
        this._bulletSpark.dispose();
        this._bloodSplatter.dispose();
    }
}
