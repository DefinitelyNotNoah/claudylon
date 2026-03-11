/**
 * Bullet impact spark effect for hard surface hits (walls, props, floors).
 * Plays a burst of bright, fast sparks that scatter away from the surface normal.
 * @module client/vfx/BulletSparkEffect
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

/** Number of spark particles per burst. */
const BURST_COUNT = 14;

/** Spark particle minimum lifetime in seconds. */
const MIN_LIFETIME = 0.08;

/** Spark particle maximum lifetime in seconds. */
const MAX_LIFETIME = 0.22;

/** Minimum spark size in cm. */
const SIZE_MIN = 0.6;

/** Maximum spark size in cm. */
const SIZE_MAX = 1.8;

/** Minimum emit speed in cm/s — sparks scatter fast. */
const EMIT_POWER_MIN = 80;

/** Maximum emit speed in cm/s. */
const EMIT_POWER_MAX = 250;

/** Gravity pulling sparks downward (cm/s²). */
const GRAVITY_Y = -400;

/**
 * A one-shot spark burst at a bullet impact point on hard surfaces.
 * A single instance is created per WeaponManager and reused for all wall hits.
 * Call {@link play} with the hit position and surface normal each time a projectile hits.
 */
export class BulletSparkEffect {
    private _particleSystem: ParticleSystem;

    /**
     * Creates the spark particle system.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._particleSystem = new ParticleSystem("bullet_spark", 30, scene);

        this._particleSystem.particleTexture = new Texture(
            "https://assets.babylonjs.com/textures/flare.png",
            scene
        );

        /* Emitter is repositioned per-play via Vector3. */
        this._particleSystem.emitter = Vector3.Zero();

        /* Hemisphere emitter: sparks scatter in a dome away from the surface. */
        this._particleSystem.createHemisphericEmitter(2, 0);

        this._particleSystem.emitRate = 0;

        this._particleSystem.minLifeTime = MIN_LIFETIME;
        this._particleSystem.maxLifeTime = MAX_LIFETIME;

        this._particleSystem.minSize = SIZE_MIN;
        this._particleSystem.maxSize = SIZE_MAX;

        this._particleSystem.minEmitPower = EMIT_POWER_MIN;
        this._particleSystem.maxEmitPower = EMIT_POWER_MAX;

        this._particleSystem.gravity = new Vector3(0, GRAVITY_Y, 0);

        /* Bright yellow-white at birth, fade to transparent orange. */
        this._particleSystem.color1 = new Color4(1.0, 1.0, 0.8, 1.0);
        this._particleSystem.color2 = new Color4(1.0, 0.7, 0.2, 1.0);
        this._particleSystem.colorDead = new Color4(0.6, 0.2, 0.0, 0.0);

        /* Size shrinks to nothing so sparks look like fading streaks. */
        this._particleSystem.addSizeGradient(0.0, 1.0);
        this._particleSystem.addSizeGradient(0.6, 0.5);
        this._particleSystem.addSizeGradient(1.0, 0.0);

        this._particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
        this._particleSystem.renderingGroupId = 0;

        this._particleSystem.start();
    }

    /**
     * Triggers a spark burst at the given surface hit point.
     * The particle system is oriented so sparks fly in the hemisphere facing the surface normal.
     * @param position - World-space hit position.
     * @param normal - Surface normal at the hit point (used to orient the hemisphere).
     */
    public play(position: Vector3, normal: Vector3): void {
        /* Place the emitter slightly off the surface to avoid z-fighting clipping. */
        this._particleSystem.emitter = position.add(normal.scale(1.5)) as unknown as Vector3;

        /* Rotate the hemisphere so it opens in the direction of the surface normal.
         * ParticleSystem.worldOffset is not available; instead we reuse the
         * system's direction vectors to bias emission toward the normal. */
        this._particleSystem.direction1 = normal.scale(EMIT_POWER_MIN)
            .add(new Vector3(
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 60
            ));
        this._particleSystem.direction2 = normal.scale(EMIT_POWER_MAX)
            .add(new Vector3(
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100
            ));

        this._particleSystem.manualEmitCount = BURST_COUNT;
    }

    /**
     * Disposes the particle system and frees GPU resources.
     */
    public dispose(): void {
        this._particleSystem.dispose();
    }
}
