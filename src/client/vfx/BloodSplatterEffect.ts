/**
 * Blood splatter VFX for bullet hits on characters (players and bots).
 * Plays a small burst of dark-red particles at the hit location.
 * @module client/vfx/BloodSplatterEffect
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

/** Number of blood particles per burst. */
const BURST_COUNT = 10;

/** Minimum particle lifetime in seconds. */
const MIN_LIFETIME = 0.12;

/** Maximum particle lifetime in seconds. */
const MAX_LIFETIME = 0.30;

/** Minimum starting size in cm. */
const SIZE_MIN = 3;

/** Maximum starting size in cm. */
const SIZE_MAX = 8;

/** Minimum scatter speed in cm/s. */
const EMIT_POWER_MIN = 30;

/** Maximum scatter speed in cm/s. */
const EMIT_POWER_MAX = 120;

/** Gravity — blood droplets fall quickly. */
const GRAVITY_Y = -600;

/**
 * Blood splatter burst for character hit feedback.
 * Single instance per WeaponManager, reused across all character hits.
 * Call {@link play} with the world-space hit position each time a player/bot is hit.
 */
export class BloodSplatterEffect {
    private _particleSystem: ParticleSystem;

    /**
     * Creates the blood splatter particle system.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._particleSystem = new ParticleSystem("blood_splatter", 25, scene);

        this._particleSystem.particleTexture = new Texture(
            "https://assets.babylonjs.com/textures/flare.png",
            scene
        );

        this._particleSystem.emitter = Vector3.Zero();
        this._particleSystem.createSphereEmitter(4, 1);

        this._particleSystem.emitRate = 0;

        this._particleSystem.minLifeTime = MIN_LIFETIME;
        this._particleSystem.maxLifeTime = MAX_LIFETIME;

        this._particleSystem.minSize = SIZE_MIN;
        this._particleSystem.maxSize = SIZE_MAX;

        this._particleSystem.minEmitPower = EMIT_POWER_MIN;
        this._particleSystem.maxEmitPower = EMIT_POWER_MAX;

        this._particleSystem.gravity = new Vector3(0, GRAVITY_Y, 0);

        /* Deep red at birth, darkens and fades out. */
        this._particleSystem.color1 = new Color4(0.8, 0.04, 0.04, 1.0);
        this._particleSystem.color2 = new Color4(0.6, 0.02, 0.02, 0.9);
        this._particleSystem.colorDead = new Color4(0.2, 0.0, 0.0, 0.0);

        this._particleSystem.addColorGradient(0.0, new Color4(0.9, 0.05, 0.05, 1.0));
        this._particleSystem.addColorGradient(0.5, new Color4(0.5, 0.02, 0.02, 0.7));
        this._particleSystem.addColorGradient(1.0, new Color4(0.15, 0.0, 0.0, 0.0));

        /* Size shrinks as droplets disperse. */
        this._particleSystem.addSizeGradient(0.0, 1.0);
        this._particleSystem.addSizeGradient(0.5, 0.7);
        this._particleSystem.addSizeGradient(1.0, 0.1);

        /* Standard blend to avoid additive glowing on blood. */
        this._particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;
        this._particleSystem.renderingGroupId = 0;

        this._particleSystem.start();
    }

    /**
     * Triggers a blood burst at the given world-space position.
     * @param position - World-space hit position (on the character body).
     */
    public play(position: Vector3): void {
        this._particleSystem.emitter = position.clone() as unknown as Vector3;
        this._particleSystem.manualEmitCount = BURST_COUNT;
    }

    /**
     * Disposes the particle system and frees GPU resources.
     */
    public dispose(): void {
        this._particleSystem.dispose();
    }
}
