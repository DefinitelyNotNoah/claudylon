/**
 * Cartoon smoke puff effect that plays at a character's feet when they jump.
 * Uses Babylon.js ParticleSystem with a burst of expanding, fading gray puffs.
 * @module client/vfx/JumpSmokeEffect
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

/** Number of particles per burst. */
const BURST_COUNT = 12;

/** Particle minimum lifetime in seconds. */
const MIN_LIFETIME = 0.25;

/** Particle maximum lifetime in seconds. */
const MAX_LIFETIME = 0.45;

/** Starting particle radius in cm. */
const START_SIZE_MIN = 8;

/** Ending particle radius in cm (expands outward). */
const START_SIZE_MAX = 18;

/** Particles expand to this size at end of lifetime. */
const END_SIZE = 48;

/** Radial outward emit speed (cm/s). */
const EMIT_POWER_MIN = 40;

/** Radial outward emit speed max (cm/s). */
const EMIT_POWER_MAX = 90;

/** Slight upward drift (cm/s). */
const GRAVITY_Y = 20;

/**
 * Lightweight cartoon smoke puff particle effect.
 * Create one instance per character and call {@link play} whenever they jump.
 */
export class JumpSmokeEffect {
    private _particleSystem: ParticleSystem;

    /**
     * Creates the smoke particle system attached to the scene.
     * The emitter position is updated before each burst via {@link play}.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._particleSystem = new ParticleSystem("jump_smoke", 30, scene);

        // Use Babylon's built-in flare texture as a soft circle proxy.
        // It's already cached in the scene from MuzzleFlash — no extra network request.
        this._particleSystem.particleTexture = new Texture(
            "https://assets.babylonjs.com/textures/flare.png",
            scene
        );

        // Start slightly above ground to avoid z-fighting with floor.
        this._particleSystem.createSphereEmitter(5, 1);

        // Emit disabled by default; activated via manualEmitCount on play().
        this._particleSystem.emitRate = 0;

        // Lifetime
        this._particleSystem.minLifeTime = MIN_LIFETIME;
        this._particleSystem.maxLifeTime = MAX_LIFETIME;

        // Size — small start, expand to large puff
        this._particleSystem.minSize = START_SIZE_MIN;
        this._particleSystem.maxSize = START_SIZE_MAX;
        this._particleSystem.minScaleX = 1;
        this._particleSystem.maxScaleX = 1;
        this._particleSystem.minScaleY = 1;
        this._particleSystem.maxScaleY = 1;

        // Expand particle size over lifetime (start→end scale factor)
        this._particleSystem.addSizeGradient(0, 0.6);
        this._particleSystem.addSizeGradient(0.4, 1.0);
        this._particleSystem.addSizeGradient(1.0, END_SIZE / START_SIZE_MAX);

        // Speed — radial burst outward + slight upward drift
        this._particleSystem.minEmitPower = EMIT_POWER_MIN;
        this._particleSystem.maxEmitPower = EMIT_POWER_MAX;
        this._particleSystem.gravity = new Vector3(0, GRAVITY_Y, 0);
        this._particleSystem.updateSpeed = 0.016;

        // Light gray / white cartoon smoke color, fades to transparent
        const smokeColor = new Color4(0.9, 0.9, 0.9, 1.0);
        const smokeMid   = new Color4(0.85, 0.85, 0.85, 0.55);
        const smokeDead  = new Color4(0.8, 0.8, 0.8, 0.0);
        this._particleSystem.color1 = smokeColor;
        this._particleSystem.color2 = smokeColor;
        this._particleSystem.colorDead = smokeDead;

        // Fade alpha gracefully mid-life
        this._particleSystem.addColorGradient(0,   smokeColor);
        this._particleSystem.addColorGradient(0.3, smokeMid);
        this._particleSystem.addColorGradient(1.0, smokeDead);

        // Alpha blending gives the soft, overlapping puff look
        this._particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;

        // Render behind the viewmodel (group 0 = default world layer)
        this._particleSystem.renderingGroupId = 0;

        // Start system running (it emits nothing until manualEmitCount is set)
        this._particleSystem.start();
    }

    /**
     * Triggers a smoke burst at the given world position (character feet).
     * @param position - World-space position at the character's feet.
     */
    public play(position: Vector3): void {
        this._particleSystem.emitter = position.clone();
        this._particleSystem.manualEmitCount = BURST_COUNT;
    }

    /**
     * Disposes the particle system and frees GPU resources.
     */
    public dispose(): void {
        this._particleSystem.dispose();
    }
}
